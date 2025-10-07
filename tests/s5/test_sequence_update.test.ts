/**
 * S5: SequenceExpression and UpdateExpression Tests
 */

import { describe, test, expect } from 'vitest';
import { parseJS } from '../../src/parser.js';
import { Transformer } from '../../src/transformer.js';
import { ImportManager } from '../../src/import-manager.js';
import { UnsupportedFeatureError } from '../../src/errors.js';
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

function transpileThrows(jsCode: string) {
  const jsAst = parseJS(jsCode);
  const importManager = new ImportManager();
  const transformer = new Transformer(importManager);
  return () => transformer.transform(jsAst);
}

describe('S5: SequenceExpression in For Loops', () => {
  test('Multiple init expressions', () => {
    const { python } = transpile(`
      for (var i = 0, j = 0; i < 10; i++) {
        sum += i + j;
      }
    `);

    expect(python).toContain('i = 0');
    expect(python).toContain('j = 0');
    expect(python).toContain('while js_truthy');
  });

  test('Multiple update expressions', () => {
    const { python } = transpile(`
      for (var i = 0; i < 10; i++, j++) {
        sum += i + j;
      }
    `);

    // Both updates should appear at the end of the loop body
    expect(python).toContain('i = js_add(i, 1)');
    expect(python).toContain('j = js_add(j, 1)');
  });

  test('Both multiple init and update', () => {
    const { python } = transpile(`
      for (var i = 0, j = 0; i < 10; i++, j++) {
        sum += i + j;
      }
    `);

    expect(python).toContain('i = 0');
    expect(python).toContain('j = 0');
    expect(python).toContain('i = js_add(i, 1)');
    expect(python).toContain('j = js_add(j, 1)');
  });

  test('SequenceExpression with assignments in init', () => {
    const { python } = transpile(`
      for (i = 0, j = 10; i < j; i++, j--) {
        sum += i;
      }
    `);

    expect(python).toContain('i = 0');
    expect(python).toContain('j = 10');
    expect(python).toContain('i = js_add(i, 1)');
    expect(python).toContain('j = js_sub(j, 1)');
  });
});

describe('S5: SequenceExpression Outside For Loops (Error)', () => {
  test('SequenceExpression in variable init should error', () => {
    const transform = transpileThrows('var x = (a = 1, b = 2, a + b);');
    expect(transform).toThrow(UnsupportedFeatureError);
    expect(transform).toThrow(/only supported in for-loop init\/update/);
  });

  test('SequenceExpression in if condition should error', () => {
    const transform = transpileThrows('if (a = 1, b = 2) { }');
    expect(transform).toThrow(UnsupportedFeatureError);
    expect(transform).toThrow(/only supported in for-loop/);
  });

  test('SequenceExpression in return should error', () => {
    const transform = transpileThrows('function f() { return (a = 1, b = 2, a + b); }');
    expect(transform).toThrow(UnsupportedFeatureError);
    expect(transform).toThrow(/only supported in for-loop/);
  });
});

describe('S5: UpdateExpression (++ and --)', () => {
  test('Postfix increment in for-update', () => {
    const { python } = transpile(`
      for (var i = 0; i < 10; i++) {
        sum += i;
      }
    `);

    expect(python).toContain('i = js_add(i, 1)');
  });

  test('Prefix increment in for-update', () => {
    const { python } = transpile(`
      for (var i = 0; i < 10; ++i) {
        sum += i;
      }
    `);

    expect(python).toContain('i = js_add(i, 1)');
  });

  test('Postfix decrement in for-update', () => {
    const { python } = transpile(`
      for (var i = 10; i > 0; i--) {
        sum += i;
      }
    `);

    expect(python).toContain('i = js_sub(i, 1)');
  });

  test('Prefix decrement in for-update', () => {
    const { python } = transpile(`
      for (var i = 10; i > 0; --i) {
        sum += i;
      }
    `);

    expect(python).toContain('i = js_sub(i, 1)');
  });

  test('UpdateExpression in statement context', () => {
    const { python } = transpile(`
      var i = 0;
      i++;
      ++i;
      i--;
      --i;
    `);

    // All should generate assignments
    const assignCount = (python.match(/i = js_(add|sub)\(i, 1\)/g) || []).length;
    expect(assignCount).toBe(4);
  });

  test('UpdateExpression on member should error', () => {
    const transform = transpileThrows('obj.prop++;');
    expect(transform).toThrow(UnsupportedFeatureError);
    expect(transform).toThrow(/member expression not yet implemented/);
  });

  test('UpdateExpression on array index should error', () => {
    const transform = transpileThrows('arr[0]++;');
    expect(transform).toThrow(UnsupportedFeatureError);
    expect(transform).toThrow(/member expression not yet implemented/);
  });
});
