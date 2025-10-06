/**
 * S3: Functions and Variable Declarations - Tests
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

describe('S3: Variable Declarations', () => {
  test('Simple var declaration with init', () => {
    const python = transpile('var x = 5;');
    expect(python).toContain('x = 5');
  });

  test('Var declaration without init (JSUndefined)', () => {
    const python = transpile('var y;');
    expect(python).toContain('from runtime.js_compat import JSUndefined');
    expect(python).toContain('y = JSUndefined');
  });

  test('Multiple var declarations', () => {
    const python = transpile('var a = 1; var b = 2;');
    expect(python).toContain('a = 1');
    expect(python).toContain('b = 2');
  });
});

describe('S3: Simple Assignment', () => {
  test('Member assignment with dot access', () => {
    const python = transpile('var obj = {}; obj.prop = 1;');
    expect(python).toContain('obj["prop"] = 1');
  });

  test('Member assignment with bracket access', () => {
    const python = transpile('var arr = []; arr[0] = 5;');
    expect(python).toContain('arr[0] = 5');
  });
});

describe('S3: Augmented Assignment', () => {
  test('+=', () => {
    const python = transpile('var x = 5; x += 10;');
    expect(python).toContain('x = js_add(x, 10)');
  });

  test('-=', () => {
    const python = transpile('var x = 10; x -= 3;');
    expect(python).toContain('x = js_sub(x, 3)');
  });

  test('*=', () => {
    const python = transpile('var x = 5; x *= 2;');
    expect(python).toContain('x = js_mul(x, 2)');
  });

  test('/=', () => {
    const python = transpile('var x = 10; x /= 2;');
    expect(python).toContain('x = js_div(x, 2)');
  });

  test('%=', () => {
    const python = transpile('var x = 10; x %= 3;');
    expect(python).toContain('x = js_mod(x, 3)');
  });

  test('Member assignment in statement context', () => {
    const python = transpile('obj.prop = 1;');
    // py-ast uses double quotes by default
    expect(python).toContain('obj["prop"] = 1');
  });

  test('Array index assignment in statement context', () => {
    const python = transpile('arr[0] = 5;');
    expect(python).toContain('arr[0] = 5');
  });

  test('Computed property assignment in statement context', () => {
    const python = transpile('obj[key] = value;');
    expect(python).toContain('obj[key] = value');
  });
});

describe('S3: Function Declarations', () => {
  test('Function with parameters', () => {
    const python = transpile('function add(a, b) { return a + b; }');
    expect(python).toContain('def add(a, b):');
    expect(python).toContain('return js_add(a, b)');
  });

  test('Function without parameters', () => {
    const python = transpile('function greet() { return "hello"; }');
    expect(python).toContain('def greet():');
    expect(python).toContain('return "hello"');
  });

  test('Bare return statement', () => {
    const python = transpile('function f() { return; }');
    expect(python).toContain('from runtime.js_compat import JSUndefined');
    expect(python).toContain('return JSUndefined');
  });

  test('Empty function body', () => {
    const python = transpile('function empty() {}');
    expect(python).toContain('def empty():');
    expect(python).toContain('pass');
  });

  test('Function with multiple statements', () => {
    const python = transpile(`
      function calc(x) {
        var y = x + 1;
        return y * 2;
      }
    `);
    expect(python).toContain('def calc(x):');
    expect(python).toContain('y = js_add(x, 1)');
    expect(python).toContain('return js_mul(y, 2)');
  });
});

describe('S3: Program', () => {
  test('Multi-statement program with imports', () => {
    const python = transpile(`
      var x = 5;
      var y = 10;
      function add() { return x + y; }
    `);
    expect(python).toContain('from runtime.js_compat import js_add');
    expect(python).toContain('x = 5');
    expect(python).toContain('y = 10');
    expect(python).toContain('def add():');
  });
});
