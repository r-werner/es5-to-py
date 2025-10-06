/**
 * S4: Variable Hoisting Tests
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

describe('S4: Variable Hoisting', () => {
  test('Var in nested block is hoisted to function top', () => {
    const { python } = transpile(`
      function test() {
        if (true) {
          var x = 1;
        }
        return x;
      }
    `);

    // Should have hoisted x = JSUndefined at top
    expect(python).toContain('x = JSUndefined');
    expect(python).toContain('if js_truthy(True):');
    expect(python).toContain('x = 1');
    expect(python).toContain('return x');

    // Hoisted var should come before if statement
    const xHoistedIndex = python.indexOf('x = JSUndefined');
    const ifIndex = python.indexOf('if js_truthy');
    expect(xHoistedIndex).toBeLessThan(ifIndex);
  });

  test('Uninitialized var uses JSUndefined', () => {
    const { python, imports } = transpile(`
      function test() {
        var x;
        return x;
      }
    `);

    expect(python).toContain('x = JSUndefined');
    expect(imports).toContain('from runtime.js_compat import JSUndefined');
  });

  test('Multiple vars in different blocks are hoisted', () => {
    const { python } = transpile(`
      function test() {
        if (true) {
          var x = 1;
        }
        if (false) {
          var y = 2;
        }
        return x + y;
      }
    `);

    expect(python).toContain('x = JSUndefined');
    expect(python).toContain('y = JSUndefined');
  });

  test('Function parameters are not hoisted', () => {
    const { python } = transpile(`
      function test(a, b) {
        var c = a + b;
        return c;
      }
    `);

    // Should only hoist c, not a or b
    const defLine = python.split('\n').find(line => line.includes('def test'));
    expect(defLine).toContain('def test(a, b):');
    expect(python).toContain('c = JSUndefined');

    // a and b should not have JSUndefined assignments
    const lines = python.split('\n');
    const aUndefinedLines = lines.filter(line => line.includes('a = JSUndefined'));
    const bUndefinedLines = lines.filter(line => line.includes('b = JSUndefined'));
    expect(aUndefinedLines.length).toBe(0);
    expect(bUndefinedLines.length).toBe(0);
  });

  test('Vars declared in nested functions are not hoisted to outer function', () => {
    const { python } = transpile(`
      function outer() {
        var x = 1;
        function inner() {
          var y = 2;
          return y;
        }
        return x;
      }
    `);

    // Each function should hoist only its own vars
    const lines = python.split('\n');
    const defOuterIndex = lines.findIndex(line => line.includes('def outer'));
    const defInnerIndex = lines.findIndex(line => line.includes('def inner'));

    // x should be hoisted in outer
    const xHoistedIndex = lines.findIndex(line => line.trim() === 'x = JSUndefined');
    expect(xHoistedIndex).toBeGreaterThan(defOuterIndex);
    expect(xHoistedIndex).toBeLessThan(defInnerIndex);

    // y should be hoisted in inner
    const yHoistedIndex = lines.findIndex(line => line.trim() === 'y = JSUndefined');
    expect(yHoistedIndex).toBeGreaterThan(defInnerIndex);
  });

  test('Duplicate var declarations only hoist once', () => {
    const { python } = transpile(`
      function test() {
        var x = 1;
        if (true) {
          var x = 2;
        }
        return x;
      }
    `);

    // Should only have one hoisted JSUndefined for x
    const jsUndefinedCount = (python.match(/x = JSUndefined/g) || []).length;
    expect(jsUndefinedCount).toBe(1);
  });

  test('Multiple vars across nested blocks appear at function top in order', () => {
    const { python } = transpile(`
      function test() {
        var a = 1;
        if (true) {
          var b = 2;
          while (true) {
            var c = 3;
            break;
          }
        }
        var d = 4;
        return a + b + c + d;
      }
    `);

    const lines = python.split('\n').map(l => l.trim());
    const defIndex = lines.findIndex(l => l.startsWith('def test'));

    // Find all hoisted JSUndefined assignments
    const hoistedIndices = {
      a: lines.findIndex((l, i) => i > defIndex && l === 'a = JSUndefined'),
      b: lines.findIndex((l, i) => i > defIndex && l === 'b = JSUndefined'),
      c: lines.findIndex((l, i) => i > defIndex && l === 'c = JSUndefined'),
      d: lines.findIndex((l, i) => i > defIndex && l === 'd = JSUndefined')
    };

    // All should be hoisted (found)
    expect(hoistedIndices.a).toBeGreaterThan(defIndex);
    expect(hoistedIndices.b).toBeGreaterThan(defIndex);
    expect(hoistedIndices.c).toBeGreaterThan(defIndex);
    expect(hoistedIndices.d).toBeGreaterThan(defIndex);

    // All hoisted vars should appear before the first non-hoisted statement
    const firstAssignmentIndex = lines.findIndex((l, i) => i > defIndex && l === 'a = 1');
    expect(hoistedIndices.a).toBeLessThan(firstAssignmentIndex);
    expect(hoistedIndices.b).toBeLessThan(firstAssignmentIndex);
    expect(hoistedIndices.c).toBeLessThan(firstAssignmentIndex);
    expect(hoistedIndices.d).toBeLessThan(firstAssignmentIndex);

    // Should appear before any conditionals
    const firstIfIndex = lines.findIndex((l, i) => i > defIndex && l.startsWith('if '));
    expect(hoistedIndices.a).toBeLessThan(firstIfIndex);
    expect(hoistedIndices.b).toBeLessThan(firstIfIndex);
    expect(hoistedIndices.c).toBeLessThan(firstIfIndex);
    expect(hoistedIndices.d).toBeLessThan(firstIfIndex);
  });
});
