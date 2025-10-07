/**
 * S6: For-in Statement - Tests
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

describe('S6: For-in with Dict', () => {
  test('For-in iterates over object keys', () => {
    const { python, imports } = transpile(`
      for (var k in obj) {
        x = k;
      }
    `);

    expect(imports).toContain('js_for_in_keys');
    expect(python).toContain('for k in js_for_in_keys(obj):');
    expect(python).toContain('x = k');
  });

  test('For-in with identifier (not var)', () => {
    const { python } = transpile(`
      for (i in arr) {
        x = i;
      }
    `);

    expect(python).toContain('for i in js_for_in_keys(arr):');
  });
});

describe('S6: For-in Keys as Strings', () => {
  test('All keys yielded as strings', () => {
    const { python, imports } = transpile(`
      for (var i in items) {
        x = i;
      }
    `);

    // Runtime helper returns keys as strings
    expect(imports).toContain('js_for_in_keys');
    expect(python).toContain('js_for_in_keys');
  });
});

describe('S6: For-in with Different Iterables', () => {
  test('For-in with array literal', () => {
    const { python } = transpile(`
      for (var i in [1, 2, 3]) {
        x = i;
      }
    `);

    expect(python).toContain('for i in js_for_in_keys([1, 2, 3]):');
  });

  test('For-in with object literal', () => {
    const { python } = transpile(`
      for (var k in {a: 1, b: 2}) {
        x = k;
      }
    `);

    expect(python).toContain('for k in js_for_in_keys({');
  });

  test('For-in with member expression', () => {
    const { python } = transpile(`
      for (var k in obj["items"]) {
        x = k;
      }
    `);

    expect(python).toContain('js_for_in_keys(obj["items"])');
  });
});

describe('S6: For-in Complex Cases', () => {
  test('For-in with multiple statements in body', () => {
    const { python } = transpile(`
      for (var i in arr) {
        var x = i;
        var y = i + 1;
      }
    `);

    expect(python).toContain('for i in js_for_in_keys(arr):');
    expect(python).toContain('x = i');
    expect(python).toContain('y = js_add(i, 1)');
  });

  test('For-in in function', () => {
    const { python } = transpile(`
      function iter(obj) {
        for (var k in obj) {
          return k;
        }
      }
    `);

    expect(python).toContain('def iter(obj):');
    expect(python).toContain('for k in js_for_in_keys(obj):');
    expect(python).toContain('return k');
  });

  test('Nested for-in loops', () => {
    const { python } = transpile(`
      for (var i in outer) {
        for (var j in inner) {
          x = i + j;
        }
      }
    `);

    expect(python).toContain('for i in js_for_in_keys(outer):');
    expect(python).toContain('for j in js_for_in_keys(inner):');
    expect(python).toContain('x = js_add(i, j)');
  });
});

describe('S6: For-in with Break/Continue', () => {
  test('For-in with break', () => {
    const { python } = transpile(`
      for (var i in arr) {
        if (i === '5') {
          break;
        }
      }
    `);

    expect(python).toContain('for i in js_for_in_keys(arr):');
    expect(python).toContain('break');
  });

  test('For-in with continue', () => {
    const { python } = transpile(`
      for (var i in arr) {
        if (i === '0') {
          continue;
        }
        x = i;
      }
    `);

    expect(python).toContain('for i in js_for_in_keys(arr):');
    expect(python).toContain('continue');
  });
});

describe('S6: For-in Empty Body', () => {
  test('For-in with empty body', () => {
    const { python } = transpile(`
      for (var i in arr) {
      }
    `);

    expect(python).toContain('for i in js_for_in_keys(arr):');
    expect(python).toContain('pass');
  });
});
