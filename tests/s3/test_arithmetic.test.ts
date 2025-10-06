/**
 * S3: Arithmetic Operators - Tests
 */

import { describe, test, expect } from 'vitest';
import { parseJS } from '../../src/parser.js';
import { Transformer } from '../../src/transformer.js';
import { ImportManager } from '../../src/import-manager.js';
import { unparse } from 'py-ast';

function transpile(jsCode: string): string {
  const jsAst = parseJS(jsCode);
  const importManager = new ImportManager();
  const transformer = new Transformer(importManager);
  const pythonAst = transformer.transform(jsAst);
  return unparse(pythonAst);
}

describe('S3: Arithmetic Operators', () => {
  test('Addition operator', () => {
    const python = transpile('5 + 3');
    expect(python).toContain('from runtime.js_compat import js_add');
    expect(python).toContain('js_add(5, 3)');
  });

  test('Subtraction operator', () => {
    const python = transpile('10 - 3');
    expect(python).toContain('from runtime.js_compat import js_sub');
    expect(python).toContain('js_sub(10, 3)');
  });

  test('Multiplication operator', () => {
    const python = transpile('5 * 3');
    expect(python).toContain('from runtime.js_compat import js_mul');
    expect(python).toContain('js_mul(5, 3)');
  });

  test('Division operator', () => {
    const python = transpile('10 / 2');
    expect(python).toContain('from runtime.js_compat import js_div');
    expect(python).toContain('js_div(10, 2)');
  });

  test('Modulo operator', () => {
    const python = transpile('10 % 3');
    expect(python).toContain('from runtime.js_compat import js_mod');
    expect(python).toContain('js_mod(10, 3)');
  });

  test('Unary plus operator', () => {
    const python = transpile('+"5"');
    expect(python).toContain('from runtime.js_compat import js_to_number');
    expect(python).toContain('js_to_number(');
  });

  test('Complex arithmetic expression', () => {
    const python = transpile('(5 + 3) * 2');
    expect(python).toContain('js_mul(js_add(5, 3), 2)');
  });
});
