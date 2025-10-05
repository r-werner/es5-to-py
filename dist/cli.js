#!/usr/bin/env node
import * as fs from 'fs';
import { parseJS } from './parser.js';
import { Transformer } from './transformer.js';
import { generatePython } from './generator.js';
function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.error('Usage: es5-to-py <input.js>');
        process.exit(1);
    }
    const inputFile = args[0];
    try {
        const source = fs.readFileSync(inputFile, 'utf8');
        const jsAst = parseJS(source);
        const transformer = new Transformer();
        const pythonAst = transformer.transform(jsAst);
        const pythonCode = generatePython(pythonAst);
        console.log(pythonCode);
    }
    catch (error) {
        console.error(`Error: ${error.message}`);
        if (error.code) {
            console.error(`Code: ${error.code}`);
        }
        process.exit(1);
    }
}
main();
//# sourceMappingURL=cli.js.map