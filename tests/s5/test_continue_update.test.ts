/**
 * S5: Continue-Update Injection Tests
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

describe('S5: Continue-Update Injection', () => {
  test('For loop with continue statement', () => {
    const { python } = transpile(`
      for (var i = 0; i < 10; i++) {
        if (i % 2 === 0) continue;
        sum += i;
      }
    `);

    // Should have update before continue AND at end of loop body
    const updateCount = (python.match(/i = js_add\(i, 1\)/g) || []).length;
    expect(updateCount).toBe(2); // One before continue, one at end

    // Verify structure: update comes before continue
    const lines = python.split('\n');
    const continueIdx = lines.findIndex(l => l.trim() === 'continue');
    expect(continueIdx).toBeGreaterThan(-1);

    // Check the line before continue has the update
    const prevLine = lines[continueIdx - 1];
    expect(prevLine).toContain('i = js_add(i, 1)');
  });

  test('For loop with multiple continues', () => {
    const { python } = transpile(`
      for (var i = 0; i < 10; i++) {
        if (i < 3) continue;
        if (i > 7) continue;
        sum += i;
      }
    `);

    // Both continues should have update before them
    const continueCount = (python.match(/continue/g) || []).length;
    expect(continueCount).toBe(2);

    // Count update injections (should be 2 before continues + 1 at end = 3)
    const updateCount = (python.match(/i = js_add\(i, 1\)/g) || []).length;
    expect(updateCount).toBe(3);
  });

  test('Nested for loops with continue', () => {
    const { python } = transpile(`
      for (var i = 0; i < 3; i++) {
        for (var j = 0; j < 3; j++) {
          if (j === 1) continue;
          sum += i + j;
        }
      }
    `);

    // Inner continue should only inject inner update (j++)
    expect(python).toContain('j = js_add(j, 1)');

    // Should have both i and j updates
    expect(python).toContain('i = js_add(i, 1)');
  });

  test('Continue in nested if inside for loop', () => {
    const { python } = transpile(`
      for (var i = 0; i < 10; i++) {
        if (cond1) {
          if (cond2) {
            continue;
          }
        }
        sum += i;
      }
    `);

    // Update should be injected before deeply nested continue
    expect(python).toContain('continue');
    const lines = python.split('\n');
    const continueIdx = lines.findIndex(l => l.includes('continue'));
    const updateBeforeContinue = lines.slice(Math.max(0, continueIdx - 2), continueIdx)
      .some(l => l.includes('i = js_add(i, 1)'));

    expect(updateBeforeContinue).toBe(true);
  });
});

describe('S5: For Loop Edge Cases', () => {
  test('For loop with continue but no update clause', () => {
    const { python } = transpile(`
      for (var i = 0; i < 10;) {
        i++;
        if (i % 2 === 0) continue;
        sum += i;
      }
    `);

    // Should not inject anything before continue (no update clause)
    expect(python).toContain('continue');
    expect(python).toContain('i = js_add(i, 1)'); // From i++ in body
  });

  test('For loop with while inside containing continue', () => {
    const { python } = transpile(`
      for (var i = 0; i < 3; i++) {
        while (cond) {
          if (other) continue;
          break;
        }
      }
    `);

    // The continue belongs to the while loop, not the for loop
    // With precise loop ID matching, update should NOT be injected before it
    const lines = python.split('\n');
    const continueIdx = lines.findIndex(l => l.includes('continue'));
    const updateBeforeContinue = lines.slice(Math.max(0, continueIdx - 2), continueIdx)
      .some(l => l.includes('i = js_add(i, 1)'));

    // Should NOT inject for-update before while's continue (precise implementation)
    expect(updateBeforeContinue).toBe(false);

    // But update should still appear at the end of the for loop body
    expect(python).toContain('i = js_add(i, 1)');
  });
});
