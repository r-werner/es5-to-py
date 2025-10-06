/**
 * S2: Core Expressions I - Acceptance Tests
 *
 * Tests for literals, identifiers, arrays, objects, member access,
 * strict equality, comparisons, logical operators, and ternary.
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

  // Extract just the expression from the Module body (skip imports)
  let exprNode = pythonAst;
  if (pythonAst.nodeType === 'Module' && pythonAst.body.length > 0) {
    // Find the first non-import statement
    const nonImport = pythonAst.body.find((stmt: any) =>
      stmt.nodeType !== 'Import' && stmt.nodeType !== 'ImportFrom'
    );
    if (nonImport && nonImport.nodeType === 'Expr') {
      exprNode = nonImport.value;
    }
  }

  const python = unparse(exprNode);
  const imports = importManager.emitHeader();
  return { python, imports };
}

describe('S2: Literals', () => {
  test('Null literal', () => {
    const { python } = transpile('null');
    expect(python).toBe('None');
  });

  test('Number literal', () => {
    const { python } = transpile('42');
    expect(python).toBe('42');
  });

  test('String literal', () => {
    const { python } = transpile('"hello"');
    expect(python).toBe('"hello"');
  });

  test('Boolean literals', () => {
    const { python: t } = transpile('true');
    const { python: f } = transpile('false');
    expect(t).toBe('True');
    expect(f).toBe('False');
  });
});

describe('S2: Global Identifiers', () => {
  test('undefined identifier', () => {
    const { python, imports } = transpile('undefined');
    expect(python).toBe('JSUndefined');
    expect(imports).toContain('from runtime.js_compat import JSUndefined');
  });

  test('NaN identifier', () => {
    const { python } = transpile('NaN');
    expect(python).toBe('float("nan")');
  });

  test('Infinity identifier', () => {
    const { python, imports } = transpile('Infinity');
    expect(python).toBe('_js_math.inf');
    expect(imports).toContain('import math as _js_math');
  });

  test('-Infinity unary expression', () => {
    const { python, imports } = transpile('-Infinity');
    expect(python).toBe('-_js_math.inf');
    expect(imports).toContain('import math as _js_math');
  });
});

describe('S2: Arrays and Objects', () => {
  test('Array literal', () => {
    const { python } = transpile('[1, 2, 3]');
    expect(python).toBe('[1, 2, 3]');
  });

  test('Object literal with identifier keys', () => {
    const { python } = transpile('({a: 1, b: 2})'); // Wrap in parens
    expect(python).toBe('{"a": 1, "b": 2}');
  });

  test('Object literal with string keys', () => {
    const { python } = transpile(`({'a': 1, 'b': 2})`); // Wrap in parens
    expect(python).toBe('{"a": 1, "b": 2}');
  });

  test('Mixed object keys', () => {
    const { python} = transpile(`({a: 1, 'b': 2})`); // Wrap in parens
    expect(python).toBe('{"a": 1, "b": 2}');
  });
});

describe('S2: Member Expression', () => {
  test('.length on string', () => {
    const { python } = transpile(`'hello'.length`);
    expect(python).toBe('len("hello")');
  });

  test('.length on identifier', () => {
    const { python } = transpile('arr.length');
    expect(python).toBe('len(arr)');
  });

  test('Dot access (non-length)', () => {
    const { python } = transpile('obj.prop');
    expect(python).toBe('obj["prop"]');
  });

  test('Bracket access', () => {
    const { python } = transpile('obj["key"]');
    expect(python).toBe('obj["key"]');
  });

  test('Computed bracket access', () => {
    const { python } = transpile('obj[key]');
    expect(python).toBe('obj[key]');
  });
});

describe('S2: Strict Equality', () => {
  test('=== operator', () => {
    const { python, imports } = transpile('x === y');
    expect(python).toBe('js_strict_eq(x, y)');
    expect(imports).toContain('from runtime.js_compat import js_strict_eq');
  });

  test('!== operator', () => {
    const { python, imports } = transpile('x !== y');
    expect(python).toBe('js_strict_neq(x, y)');
    expect(imports).toContain('from runtime.js_compat import js_strict_neq');
  });
});

describe('S2: Comparison Operators', () => {
  test('< operator', () => {
    const { python } = transpile('x < y');
    expect(python).toBe('x < y');
  });

  test('<= operator', () => {
    const { python } = transpile('x <= y');
    expect(python).toBe('x <= y');
  });

  test('> operator', () => {
    const { python } = transpile('x > y');
    expect(python).toBe('x > y');
  });

  test('>= operator', () => {
    const { python } = transpile('x >= y');
    expect(python).toBe('x >= y');
  });
});

describe('S2: Logical Operators', () => {
  test('&& operator uses walrus', () => {
    const { python, imports } = transpile('a && b');
    expect(python).toContain(':=');
    expect(python).toContain('js_truthy');
    expect(imports).toContain('from runtime.js_compat import js_truthy');
  });

  test('|| operator uses walrus', () => {
    const { python, imports } = transpile('a || b');
    expect(python).toContain(':=');
    expect(python).toContain('js_truthy');
    expect(imports).toContain('from runtime.js_compat import js_truthy');
  });

  test('&& returns right if truthy', () => {
    const { python } = transpile('a && b');
    // Check pattern: b if js_truthy(__js_tmp1 := a) else __js_tmp1
    expect(python).toMatch(/b if js_truthy\(__js_tmp\d+ := a\) else __js_tmp\d+/);
  });

  test('|| returns left if truthy', () => {
    const { python } = transpile('a || b');
    // Check pattern: __js_tmp1 if js_truthy(__js_tmp1 := a) else b
    expect(python).toMatch(/__js_tmp\d+ if js_truthy\(__js_tmp\d+ := a\) else b/);
  });
});

describe('S2: Unary Operators', () => {
  test('! (not) operator', () => {
    const { python, imports } = transpile('!x');
    expect(python).toBe('(not js_truthy(x))');
    expect(imports).toContain('from runtime.js_compat import js_truthy');
  });

  test('Unary minus', () => {
    const { python } = transpile('-x');
    expect(python).toBe('-x');
  });

  test('Unary minus on number', () => {
    const { python } = transpile('-42');
    expect(python).toBe('-42');
  });
});

describe('S2: Ternary Operator', () => {
  test('Simple ternary', () => {
    const { python, imports } = transpile('x ? 1 : 0');
    expect(python).toBe('1 if js_truthy(x) else 0');
    expect(imports).toContain('from runtime.js_compat import js_truthy');
  });

  test('Ternary with expressions', () => {
    const { python } = transpile('a > b ? a : b');
    expect(python).toBe('a if js_truthy(a > b) else b');
  });
});

describe('S2: Complex Expressions', () => {
  test('Nested member access', () => {
    const { python } = transpile('obj.a.b');
    expect(python).toBe('obj["a"]["b"]');
  });

  test('Array of objects', () => {
    const { python } = transpile('[{a: 1}, {b: 2}]');
    expect(python).toBe('[{"a": 1}, {"b": 2}]');
  });

  test('Object with array values (valid ES5 syntax)', () => {
    const jsCode = '({a: [1, 2], b: [3, 4]})'; // Wrap in parens to make it an expression
    const { python } = transpile(jsCode);
    expect(python).toBe('{"a": [1, 2], "b": [3, 4]}');
  });

  test('Comparison with strict equality', () => {
    const { python } = transpile('x < y && y === z');
    expect(python).toContain('x < y');
    expect(python).toContain('js_strict_eq(y, z)');
  });
});

describe('S2: Import Management', () => {
  test('Multiple runtime imports are sorted', () => {
    const { imports } = transpile('undefined === null && !x');
    expect(imports).toBe('from runtime.js_compat import JSUndefined, js_strict_eq, js_truthy');
  });

  test('Both stdlib and runtime imports', () => {
    const { imports } = transpile('Infinity === undefined');
    const lines = imports.split('\n');
    expect(lines[0]).toBe('import math as _js_math');
    expect(lines[1]).toBe('from runtime.js_compat import JSUndefined, js_strict_eq');
  });
});
