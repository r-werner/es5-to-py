/**
 * Golden Test Runner
 *
 * Compares transpiled output against expected golden files.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseJS } from './parser.js';
import { Transformer } from './transformer.js';
import { ImportManager } from './import-manager.js';
import { generatePython } from './generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function runGoldenTests(): void {
  const goldenDir = path.join(__dirname, '..', 'tests', 'golden');
  const testDirs = fs.readdirSync(goldenDir);

  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const dir of testDirs) {
    const dirPath = path.join(goldenDir, dir);
    if (!fs.statSync(dirPath).isDirectory()) continue;

    const files = fs.readdirSync(dirPath);
    const jsFiles = files.filter(f => f.endsWith('.js'));

    for (const jsFile of jsFiles) {
      const jsPath = path.join(dirPath, jsFile);
      const pyPath = path.join(dirPath, jsFile.replace('.js', '.py'));

      if (!fs.existsSync(pyPath)) {
        console.log(`⚠️  No golden file for ${jsFile}`);
        continue;
      }

      try {
        const jsSource = fs.readFileSync(jsPath, 'utf8');
        const expectedPy = fs.readFileSync(pyPath, 'utf8').trim();

        const jsAst = parseJS(jsSource);
        const importManager = new ImportManager();
        const transformer = new Transformer(importManager);
        const pythonAst = transformer.transform(jsAst);
        const actualPy = generatePython(pythonAst).trim();

        if (actualPy === expectedPy) {
          console.log(`✓ ${dir}/${jsFile}`);
          passed++;
        } else {
          console.log(`✗ ${dir}/${jsFile}`);
          failures.push(`${dir}/${jsFile}:\n  Expected:\n${expectedPy}\n  Actual:\n${actualPy}`);
          failed++;
        }
      } catch (error: any) {
        console.log(`✗ ${dir}/${jsFile} (error: ${error.message})`);
        failures.push(`${dir}/${jsFile}: ${error.message}`);
        failed++;
      }
    }
  }

  console.log('');
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failures.length > 0) {
    console.log('');
    console.log('Failures:');
    failures.forEach(f => console.log(f));
  }

  process.exit(failed > 0 ? 1 : 0);
}

runGoldenTests();
