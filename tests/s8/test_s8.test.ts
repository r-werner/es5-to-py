/**
 * S8: Regex + Type Ops + Loose Eq - Acceptance Tests
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

  // Extract the last non-import statement from Module body
  let exprNode = pythonAst;
  if (pythonAst.nodeType === 'Module' && pythonAst.body.length > 0) {
    // Find all non-import statements
    const nonImports = pythonAst.body.filter((stmt: any) =>
      stmt.nodeType !== 'Import' && stmt.nodeType !== 'ImportFrom'
    );

    if (nonImports.length > 0) {
      // Get the last statement (for multi-statement programs)
      const lastStmt = nonImports[nonImports.length - 1];
      if (lastStmt.nodeType === 'Expr') {
        exprNode = lastStmt.value;
      } else {
        // For multi-statement tests, return the whole program
        exprNode = pythonAst;
      }
    }
  }

  const python = unparse(exprNode);
  const imports = importManager.emitHeader();
  return { python, imports };
}

describe('S8: Regex Literals', () => {
  test('Basic regex without flags', () => {
    const { python, imports } = transpile('/hello/');
    expect(python).toContain('compile_js_regex("hello", "")');
    expect(imports).toContain('from runtime.js_compat import compile_js_regex');
  });

  test('Regex with case-insensitive flag', () => {
    const { python } = transpile('/test/i');
    expect(python).toContain('compile_js_regex("test", "i")');
  });

  test('Regex with multiline flag', () => {
    const { python } = transpile('/^start/m');
    expect(python).toContain('compile_js_regex("^start", "m")');
  });

  test('Regex with global flag (stripped by runtime)', () => {
    const { python } = transpile('/test/g');
    expect(python).toContain('compile_js_regex("test", "g")');
  });

  test('Regex with multiple flags', () => {
    const { python } = transpile('/pattern/gi');
    expect(python).toContain('compile_js_regex("pattern", "gi")');
  });

  test('Regex with escaped characters', () => {
    const { python } = transpile('/\\d+/');
    expect(python).toContain('compile_js_regex("\\\\d+", "")');
  });
});

describe('S8: typeof Operator', () => {
  test('typeof with declared variable', () => {
    const { python, imports } = transpile('var x = 5; typeof x;');
    expect(python).toContain('js_typeof(x)');
    expect(imports).toContain('from runtime.js_compat import js_typeof');
  });

  test('typeof with undeclared identifier returns constant', () => {
    const { python } = transpile('typeof undeclaredVar');
    expect(python).toBe('"undefined"');
  });

  test('typeof with literal', () => {
    const { python } = transpile('typeof "hello"');
    expect(python).toContain('js_typeof("hello")');
  });

  test('typeof with expression', () => {
    const { python } = transpile('typeof (5 + 3)');
    expect(python).toContain('js_typeof');
  });

  test('typeof null', () => {
    const { python } = transpile('typeof null');
    expect(python).toContain('js_typeof(None)');
  });

  test('typeof with global identifier (undefined)', () => {
    const { python } = transpile('typeof undefined');
    expect(python).toContain('js_typeof(JSUndefined)');
  });
});

describe('S8: delete Operator', () => {
  test('delete object property', () => {
    const { python, imports } = transpile('delete obj.prop');
    expect(python).toContain('js_delete(obj, "prop")');
    expect(imports).toContain('from runtime.js_compat import js_delete');
  });

  test('delete with computed property', () => {
    const { python } = transpile('delete obj[key]');
    expect(python).toContain('js_delete(obj, key)');
  });

  test('delete array element', () => {
    const { python } = transpile('delete arr[0]');
    expect(python).toContain('js_delete(arr, 0)');
  });

  test('delete on identifier throws error', () => {
    expect(() => transpile('delete x')).toThrow('Delete on identifiers is not supported');
  });
});

describe('S8: Loose Equality', () => {
  test('== operator', () => {
    const { python, imports } = transpile('x == y');
    expect(python).toContain('js_loose_eq(x, y)');
    expect(imports).toContain('from runtime.js_compat import js_loose_eq');
  });

  test('!= operator', () => {
    const { python, imports } = transpile('x != y');
    expect(python).toContain('js_loose_neq(x, y)');
    expect(imports).toContain('from runtime.js_compat import js_loose_neq');
  });

  test('Loose equality with literals', () => {
    const { python } = transpile('5 == "5"');
    expect(python).toContain('js_loose_eq(5, "5")');
  });

  test('Loose equality with null', () => {
    const { python } = transpile('null == undefined');
    expect(python).toContain('js_loose_eq(None, JSUndefined)');
  });

  test('Strict vs loose equality', () => {
    const strict = transpile('x === y');
    const loose = transpile('x == y');
    expect(strict.python).toContain('js_strict_eq');
    expect(loose.python).toContain('js_loose_eq');
  });
});

describe('S8: Integration Tests', () => {
  test('Combined regex and typeof', () => {
    const { python, imports } = transpile('typeof /test/i');
    expect(python).toContain('js_typeof');
    expect(python).toContain('compile_js_regex');
    expect(imports).toContain('js_typeof');
    expect(imports).toContain('compile_js_regex');
  });

  test('Delete in conditional', () => {
    const { python } = transpile('if (delete obj.prop) { }');
    expect(python).toContain('js_delete(obj, "prop")');
    expect(python).toContain('if js_truthy');
  });

  test('Loose equality in expression', () => {
    const { python } = transpile('var result = (5 == "5") && (null == undefined);');
    expect(python).toContain('js_loose_eq(5, "5")');
    expect(python).toContain('js_loose_eq(None, JSUndefined)');
  });
});
