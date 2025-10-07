/**
 * S7: Library + Methods - Acceptance Tests
 */

import { describe, test, expect } from 'vitest';
import { parseJS } from '../../src/parser.js';
import { Transformer } from '../../src/transformer.js';
import { ImportManager } from '../../src/import-manager.js';
import { unparse } from 'py-ast';

function transpile(jsCode: string): { python: string; imports: string } {
  const jsAst = parseJS(jsCode);
  const importManager = new ImportManager();
  const transformer = new Transformer(importManager);
  const pythonAst = transformer.transform(jsAst);
  const python = unparse(pythonAst);
  const imports = importManager.emitHeader();
  return { python, imports };
}

describe('S7: Math Library', () => {
  test('Math.sqrt() → _js_math.sqrt()', () => {
    const { python, imports } = transpile('Math.sqrt(16)');
    expect(python).toContain('_js_math.sqrt(16)');
    expect(imports).toContain('import math as _js_math');
  });

  test('Math.pow() → ** operator', () => {
    const { python } = transpile('Math.pow(2, 3)');
    expect(python).toContain('2 ** 3');
  });

  test('Math.abs() → abs()', () => {
    const { python, imports } = transpile('Math.abs(-5)');
    expect(python).toContain('abs(-5)');
    // abs is a builtin, no import needed
    expect(imports).not.toContain('math');
  });

  test('Math.max() → max()', () => {
    const { python } = transpile('Math.max(1, 5, 3)');
    expect(python).toContain('max(1, 5, 3)');
  });

  test('Math.min() → min()', () => {
    const { python } = transpile('Math.min(1, 5, 3)');
    expect(python).toContain('min(1, 5, 3)');
  });

  test('Math.floor() → _js_math.floor()', () => {
    const { python, imports } = transpile('Math.floor(3.7)');
    expect(python).toContain('_js_math.floor(3.7)');
    expect(imports).toContain('import math as _js_math');
  });

  test('Math.ceil() → _js_math.ceil()', () => {
    const { python } = transpile('Math.ceil(3.2)');
    expect(python).toContain('_js_math.ceil(3.2)');
  });

  test('Math.round() → _js_math.round()', () => {
    const { python } = transpile('Math.round(3.5)');
    expect(python).toContain('_js_math.round(3.5)');
  });

  test('Math.random() → _js_random.random()', () => {
    const { python, imports } = transpile('Math.random()');
    expect(python).toContain('_js_random.random()');
    expect(imports).toContain('import random as _js_random');
  });

  test('Math.PI → _js_math.pi', () => {
    const { python, imports } = transpile('Math.PI');
    expect(python).toContain('_js_math.pi');
    expect(imports).toContain('import math as _js_math');
  });
});

describe('S7: String Methods', () => {
  test('charAt() → str[i:i+1]', () => {
    const { python } = transpile('"abc".charAt(1)');
    expect(python).toContain('[1:1 + 1]');
  });

  test('charCodeAt() → js_char_code_at()', () => {
    const { python, imports } = transpile('"abc".charCodeAt(0)');
    expect(python).toContain('js_char_code_at("abc", 0)');
    expect(imports).toContain('from runtime.js_compat import js_char_code_at');
  });

  test('substring() → js_substring()', () => {
    const { python, imports } = transpile('"hello".substring(1, 4)');
    expect(python).toContain('js_substring("hello", 1, 4)');
    expect(imports).toContain('from runtime.js_compat import js_substring');
  });

  test('toLowerCase() → str.lower()', () => {
    const { python } = transpile('"HELLO".toLowerCase()');
    expect(python).toContain('.lower()');
  });

  test('toUpperCase() → str.upper()', () => {
    const { python } = transpile('"hello".toUpperCase()');
    expect(python).toContain('.upper()');
  });

  test('indexOf() → str.find()', () => {
    const { python } = transpile('"hello".indexOf("l")');
    expect(python).toContain('.find("l")');
  });

  test('slice() → str[start:end]', () => {
    const { python } = transpile('"hello".slice(1, 4)');
    expect(python).toContain('[1:4]');
  });

  test('split() → str.split()', () => {
    const { python } = transpile('"a,b,c".split(",")');
    expect(python).toContain('.split(",")');
  });

  test('trim() → str.strip()', () => {
    const { python } = transpile('"  hello  ".trim()');
    expect(python).toContain('.strip()');
  });

  test('replace() → str.replace(x, y, 1)', () => {
    const { python } = transpile('"hello".replace("l", "x")');
    expect(python).toContain('.replace("l", "x", 1)');
  });
});

describe('S7: Date.now()', () => {
  test('Date.now() → js_date_now()', () => {
    const { python, imports } = transpile('Date.now()');
    expect(python).toContain('js_date_now()');
    expect(imports).toContain('from runtime.js_compat import js_date_now');
  });
});

describe('S7: Console.log()', () => {
  test('console.log() → console_log()', () => {
    const { python, imports } = transpile('console.log("hello", 42)');
    expect(python).toContain('console_log("hello", 42)');
    expect(imports).toContain('from runtime.js_compat import console_log');
  });

  test('console.log() with single argument', () => {
    const { python } = transpile('console.log("test")');
    expect(python).toContain('console_log("test")');
  });

  test('console.log() with no arguments', () => {
    const { python } = transpile('console.log()');
    expect(python).toContain('console_log()');
  });
});

describe('S7: Array Methods', () => {
  test('[].push(x) → arr.append(x)', () => {
    const { python } = transpile('[].push(1)');
    expect(python).toContain('.append(1)');
  });

  test('[].pop() → js_array_pop()', () => {
    const { python, imports } = transpile('[1, 2, 3].pop()');
    expect(python).toContain('js_array_pop([1, 2, 3])');
    expect(imports).toContain('from runtime.js_compat import js_array_pop');
  });

  test('arr.push() on variable throws error', () => {
    expect(() => {
      transpile('var arr = []; arr.push(1);');
    }).toThrow(/Cannot determine if receiver is an array/);
  });

  test('multi-arg push throws error', () => {
    expect(() => {
      transpile('[].push(1, 2, 3)');
    }).toThrow(/multiple arguments not supported/);
  });
});

describe('S7: Regular Function Calls', () => {
  test('User-defined function call', () => {
    const { python } = transpile('function foo() {} foo();');
    expect(python).toContain('foo()');
  });

  test('Function with arguments', () => {
    const { python } = transpile('function add(a, b) { return a + b; } add(1, 2);');
    expect(python).toContain('add(1, 2)');
  });
});

describe('S7: Combined Library Usage', () => {
  test('Multiple library methods', () => {
    const { python, imports } = transpile(`
      var x = Math.sqrt(16);
      var y = "hello".toUpperCase();
      console.log(x, y);
    `);
    expect(python).toContain('_js_math.sqrt(16)');
    expect(python).toContain('.upper()');
    expect(python).toContain('console_log(x, y)');
    expect(imports).toContain('import math as _js_math');
    expect(imports).toContain('from runtime.js_compat import console_log');
  });
});
