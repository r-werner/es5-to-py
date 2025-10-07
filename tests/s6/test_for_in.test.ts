/**
 * S6: For-in Loops - Acceptance Tests
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

describe('S6: For-in Loops', () => {
  test('For-in with dict (object literal)', () => {
    const { python, imports } = transpile(`
      for (var k in obj) {
        y = k;
      }
    `);
    expect(python).toContain('for k in js_for_in_keys(obj):');
    expect(imports).toContain('from runtime.js_compat import js_for_in_keys');
  });

  test('For-in with var declaration', () => {
    const { python } = transpile(`
      for (var i in arr) {
        sum = i;
      }
    `);
    expect(python).toContain('for i in js_for_in_keys(arr):');
  });

  test('For-in with existing variable', () => {
    const { python } = transpile(`
      var key;
      for (key in obj) {
        y = key;
      }
    `);
    expect(python).toContain('for key in js_for_in_keys(obj):');
  });

  test('For-in with empty body', () => {
    const { python } = transpile(`
      for (var k in obj) {}
    `);
    expect(python).toContain('for k in js_for_in_keys(obj):');
    expect(python).toContain('pass');
  });

  test('For-in with block statement', () => {
    const { python } = transpile(`
      for (var k in obj) {
        x = k;
        y = k;
      }
    `);
    expect(python).toContain('for k in js_for_in_keys(obj):');
    expect(python).toContain('x = k');
    expect(python).toContain('y = k');
  });

  test('For-in with break', () => {
    const { python } = transpile(`
      for (var k in obj) {
        if (k) break;
      }
    `);
    expect(python).toContain('for k in js_for_in_keys(obj):');
    expect(python).toContain('break');
  });

  test('For-in with continue', () => {
    const { python } = transpile(`
      for (var k in obj) {
        if (k) continue;
        y = k;
      }
    `);
    expect(python).toContain('for k in js_for_in_keys(obj):');
    expect(python).toContain('continue');
  });

  test('Nested for-in loops', () => {
    const { python } = transpile(`
      for (var i in outer) {
        for (var j in inner) {
          sum = i;
        }
      }
    `);
    expect(python).toContain('for i in js_for_in_keys(outer):');
    expect(python).toContain('for j in js_for_in_keys(inner):');
  });
});
