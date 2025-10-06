/**
 * S4: If/Else and While Loop Tests
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

describe('S4: If/Else Statements', () => {
  test('Simple if statement with js_truthy', () => {
    const { python, imports } = transpile('if (x) { var y = 1; }');
    expect(python).toContain('if js_truthy(x):');
    expect(python).toContain('y = 1');
    expect(imports).toContain('from runtime.js_compat import js_truthy');
  });

  test('If with else', () => {
    const { python } = transpile(`
      if (x) {
        var a = 1;
      } else {
        var a = 2;
      }
    `);
    expect(python).toContain('if js_truthy(x):');
    expect(python).toContain('a = 1');
    expect(python).toContain('else:');
    expect(python).toContain('a = 2');
  });

  test('If with else if chain', () => {
    const { python } = transpile(`
      if (x) {
        var a = 1;
      } else if (y) {
        var a = 2;
      } else {
        var a = 3;
      }
    `);
    expect(python).toContain('if js_truthy(x):');
    expect(python).toContain('elif js_truthy(y):');
    expect(python).toContain('else:');
  });

  test('Else-if renders as elif (not nested if/else)', () => {
    const { python } = transpile(`
      if (x) {
        var a = 1;
      } else if (y) {
        var a = 2;
      }
    `);

    // Should have elif, not "else:\n    if"
    expect(python).toContain('elif js_truthy(y):');
    expect(python).not.toMatch(/else:\s+if js_truthy/);
  });

  test('If with falsy value wrapping (empty array is truthy)', () => {
    const { python } = transpile(`
      function test() {
        if ([]) { return 1; }
      }
    `);
    expect(python).toContain('if js_truthy([]):');
  });

  test('If with single statement (no block)', () => {
    const { python } = transpile(`
      function test() {
        if (x) return 1;
      }
    `);
    expect(python).toContain('if js_truthy(x):');
    expect(python).toContain('return 1');
  });
});

describe('S4: While Loops', () => {
  test('Simple while loop', () => {
    const { python } = transpile(`
      while (x) {
        x = x - 1;
      }
    `);
    expect(python).toContain('while js_truthy(x):');
    expect(python).toContain('x = js_sub(x, 1)');
  });

  test('While with break', () => {
    const { python } = transpile(`
      while (true) {
        if (x) break;
      }
    `);
    expect(python).toContain('while js_truthy(True):');
    expect(python).toContain('if js_truthy(x):');
    expect(python).toContain('break');
  });

  test('While with continue', () => {
    const { python } = transpile(`
      while (x > 0) {
        if (x === 5) continue;
        x = x - 1;
      }
    `);
    expect(python).toContain('while js_truthy(x > 0):');
    expect(python).toContain('continue');
  });

  test('While with single statement (no block)', () => {
    const { python } = transpile('while (x) x = x - 1;');
    expect(python).toContain('while js_truthy(x):');
    expect(python).toContain('x = js_sub(x, 1)');
  });

  test('Nested while loops', () => {
    const { python } = transpile(`
      while (x) {
        while (y) {
          y = y - 1;
        }
        x = x - 1;
      }
    `);
    expect(python).toContain('while js_truthy(x):');
    expect(python).toContain('while js_truthy(y):');
  });
});

describe('S4: Break and Continue', () => {
  test('Break in while loop', () => {
    const { python } = transpile(`
      while (true) {
        break;
      }
    `);
    expect(python).toContain('break');
  });

  test('Continue in while loop', () => {
    const { python } = transpile(`
      while (true) {
        continue;
      }
    `);
    expect(python).toContain('continue');
  });

  test('Break with if condition', () => {
    const { python } = transpile(`
      while (true) {
        if (x) break;
      }
    `);
    expect(python).toContain('if js_truthy(x):');
    expect(python).toContain('break');
  });
});
