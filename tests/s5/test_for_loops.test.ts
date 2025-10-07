/**
 * S5: For Loops - Basic Tests
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

describe('S5: Basic For Loops', () => {
  test('Simple for loop with var init', () => {
    const { python } = transpile(`
      for (var i = 0; i < 3; i++) {
        sum += i;
      }
    `);
    expect(python).toContain('i = 0'); // Init
    expect(python).toContain('while js_truthy'); // Desugared to while
    expect(python).toContain('i = js_add(i, 1)'); // Update at end
  });

  test('For loop with var hoisting in function', () => {
    const { python } = transpile(`
      function test() {
        for (var i = 0; i < 3; i++) {
          sum += i;
        }
      }
    `);
    expect(python).toContain('i = JSUndefined'); // Hoisted at function top
    expect(python).toContain('i = 0'); // Init
    expect(python).toContain('while js_truthy'); // Desugared to while
    expect(python).toContain('i = js_add(i, 1)'); // Update at end
  });

  test('For loop without init', () => {
    const { python } = transpile(`
      for (; i < 3; i++) {
        sum += i;
      }
    `);
    expect(python).toContain('while js_truthy');
    expect(python).toContain('i = js_add(i, 1)');
  });

  test('For loop without test (infinite)', () => {
    const { python } = transpile(`
      for (var i = 0; ; i++) {
        if (i > 10) break;
      }
    `);
    expect(python).toContain('while True'); // No test → infinite loop
  });

  test('For loop without update', () => {
    const { python } = transpile(`
      for (var i = 0; i < 3;) {
        i += 1;
      }
    `);
    expect(python).toContain('i = 0');
    expect(python).toContain('while js_truthy');
    expect(python).toContain('i = js_add(i, 1)'); // Body increment
  });

  test('For loop with empty body', () => {
    const { python } = transpile(`
      for (var i = 0; i < 3; i++) {
      }
    `);
    expect(python).toContain('i = 0');
    expect(python).toContain('while js_truthy');
  });

  test('For loop with comparison operators', () => {
    const { python } = transpile(`
      for (var i = 0; i < 10; i++) {
        x = i;
      }
    `);
    expect(python).toContain('i < 10');
  });
});

describe('S5: For Loop with Break', () => {
  test('Break in for loop', () => {
    const { python } = transpile(`
      for (var i = 0; i < 10; i++) {
        if (i === 5) break;
      }
    `);
    expect(python).toContain('break');
  });
});
