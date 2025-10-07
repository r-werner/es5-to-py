#!/usr/bin/env node

import * as fs from 'fs';
import { execSync } from 'child_process';
import { parseJS } from './parser.js';
import { Transformer } from './transformer.js';
import { ImportManager } from './import-manager.js';
import { generatePython } from './generator.js';

function checkPythonVersion(): void {
  if (process.env.CHECK_PYTHON === 'false') {
    return;
  }

  try {
    const pyVersion = execSync('python3 --version', { encoding: 'utf8' });
    const match = pyVersion.match(/Python (\d+)\.(\d+)/);
    if (match) {
      const major = parseInt(match[1]);
      const minor = parseInt(match[2]);
      if (major < 3 || (major === 3 && minor < 8)) {
        console.error('Error: Python 3.8 or higher is required (walrus operator support)');
        process.exit(1);
      }
    }
  } catch (e) {
    console.warn('Warning: Could not verify Python version');
  }
}

function showUsage(): void {
  console.error('Usage: es5-to-py <input.js> [options]');
  console.error('');
  console.error('Options:');
  console.error('  -o, --output <file>  Write output to file instead of stdout');
  console.error('  -r, --run            Execute transpiled Python immediately');
  console.error('  -v, --verbose        Show AST and debug information');
  console.error('  -h, --help           Show this help message');
}

function main(): void {
  checkPythonVersion();

  const args = process.argv.slice(2);
  let inputFile: string | null = null;
  let outputFile: string | null = null;
  let runAfter = false;
  let verbose = false;

  // Parse flags
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' || args[i] === '-o') {
      outputFile = args[++i];
    } else if (args[i] === '--run' || args[i] === '-r') {
      runAfter = true;
    } else if (args[i] === '--verbose' || args[i] === '-v') {
      verbose = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      showUsage();
      process.exit(0);
    } else if (!args[i].startsWith('-')) {
      inputFile = args[i];
    } else {
      console.error(`Unknown option: ${args[i]}`);
      showUsage();
      process.exit(1);
    }
  }

  if (!inputFile) {
    console.error('Error: No input file specified');
    showUsage();
    process.exit(1);
  }

  let source: string;
  try {
    source = fs.readFileSync(inputFile, 'utf8');
  } catch (error: any) {
    console.error(`Error reading file: ${error.message}`);
    process.exit(1);
  }

  try {
    const jsAst = parseJS(source);

    if (verbose) {
      console.error('=== JavaScript AST ===');
      console.error(JSON.stringify(jsAst, null, 2));
      console.error('');
    }

    const importManager = new ImportManager();
    const transformer = new Transformer(importManager);
    const pythonAst = transformer.transform(jsAst);

    if (verbose) {
      console.error('=== Python AST ===');
      console.error(JSON.stringify(pythonAst, null, 2));
      console.error('');
    }

    const pythonCode = generatePython(pythonAst);

    // Add header comment
    const header = `# Transpiled from ${inputFile}\n# Requires Python >= 3.8\n\n`;
    const output = header + pythonCode;

    if (outputFile) {
      fs.writeFileSync(outputFile, output);
      if (!runAfter) {
        console.error(`Wrote to ${outputFile}`);
      }

      if (runAfter) {
        if (verbose) {
          console.error('=== Execution Output ===');
        }
        try {
          execSync(`python3 "${outputFile}"`, { stdio: 'inherit' });
        } catch (error: any) {
          console.error(`Execution failed: ${error.message}`);
          process.exit(1);
        }
      }
    } else {
      console.log(output);

      if (runAfter) {
        // Write to temp file and execute
        const tempFile = '/tmp/es5-to-py-temp.py';
        fs.writeFileSync(tempFile, output);
        if (verbose) {
          console.error('=== Execution Output ===');
        }
        try {
          execSync(`python3 "${tempFile}"`, { stdio: 'inherit' });
        } catch (error: any) {
          console.error(`Execution failed: ${error.message}`);
          process.exit(1);
        }
      }
    }
  } catch (error: any) {
    // Pretty error formatting
    console.error('');
    console.error(`Error: ${error.message}`);
    console.error('');

    if (error.code) {
      console.error(`Error Code: ${error.code}`);
    }

    if (error.node && error.node.loc) {
      const loc = error.node.loc.start;
      console.error(`Location: ${inputFile}:${loc.line}:${loc.column}`);
      console.error('');

      // Show source snippet
      const lines = source.split('\n');
      if (loc.line <= lines.length) {
        const lineNum = loc.line;
        const lineNumStr = String(lineNum);
        const indent = ' '.repeat(lineNumStr.length);

        console.error(`${lineNumStr} | ${lines[lineNum - 1]}`);
        console.error(`${indent} | ${' '.repeat(loc.column)}^`);
        console.error('');
      }
    }

    if (verbose && error.stack) {
      console.error('Stack trace:');
      console.error(error.stack);
      console.error('');
    }

    process.exit(1);
  }
}

main();
