#!/usr/bin/env node

import * as fs from 'fs';
import { parseJS } from './parser.js';
import { Transformer } from './transformer.js';
import { ImportManager } from './import-manager.js';
import { generatePython } from './generator.js';

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: es5-to-py <input.js>');
    process.exit(1);
  }

  const inputFile = args[0];

  try {
    const source = fs.readFileSync(inputFile, 'utf8');
    const jsAst = parseJS(source);
    const importManager = new ImportManager();
    const transformer = new Transformer(importManager);
    const pythonAst = transformer.transform(jsAst);
    const pythonCode = generatePython(pythonAst);

    // Prepend imports
    const imports = importManager.emitHeader();
    const output = imports ? `${imports}\n\n${pythonCode}` : pythonCode;

    console.log(output);
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    if (error.code) {
      console.error(`Code: ${error.code}`);
    }
    process.exit(1);
  }
}

main();
