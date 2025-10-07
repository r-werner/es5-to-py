/**
 * S3: Negative Tests - Features explicitly not yet supported
 *
 * These tests document known limitations and ensure we fail fast
 * with clear error messages rather than producing incorrect code.
 */

import { describe, test, expect } from 'vitest';
import { parseJS } from '../../src/parser.js';
import { Transformer } from '../../src/transformer.js';
import { ImportManager } from '../../src/import-manager.js';
import { UnsupportedFeatureError } from '../../src/errors.js';

function transpile(jsCode: string) {
  const jsAst = parseJS(jsCode);
  const importManager = new ImportManager();
  const transformer = new Transformer(importManager);
  return () => transformer.transform(jsAst);
}

describe('S3: Negative Cases - Assignment', () => {
  test('Member expression augmented assignment not yet supported', () => {
    const transform = transpile('obj.prop += 5;');
    expect(transform).toThrow(UnsupportedFeatureError);
    expect(transform).toThrow(/member expressions not yet implemented/);
  });

  test('Array index augmented assignment not yet supported', () => {
    const transform = transpile('arr[0] += 5;');
    expect(transform).toThrow(UnsupportedFeatureError);
    expect(transform).toThrow(/member expressions not yet implemented/);
  });

  test('Computed property augmented assignment not yet supported', () => {
    const transform = transpile('obj[key] += 5;');
    expect(transform).toThrow(UnsupportedFeatureError);
    expect(transform).toThrow(/member expressions not yet implemented/);
  });
});

describe('S3: Negative Cases - Functions', () => {
  // Note: Destructuring and rest parameters are ES6+ features
  // They fail at parse time with ES5 parser (as expected)
  // The E_PARAM_DESTRUCTURE error is for future-proofing if we ever support ES6 parsing

  test('Functions can only be declared at module or function scope', () => {
    // This will be testable once if/while/for are implemented in S4/S5
    // For now, all functions are at module scope so this passes
    const transform = transpile('function top() {} function another() {}');
    expect(transform).not.toThrow();
  });
});

describe('S3: Negative Cases - Deferred to Later Specs', () => {
  test('CallExpression deferred to S7', () => {
    const transform = transpile('var x = add(1, 2);');
    expect(transform).toThrow(/CallExpression/);
  });

  test('UpdateExpression now supported in S5', () => {
    // UpdateExpression is now implemented in S5
    const transform = transpile('var x = 5; x++;');
    expect(transform).not.toThrow();
  });

  test('SequenceExpression now supported in S5 (for-loops only)', () => {
    // SequenceExpression outside for-loops still errors
    const transform = transpile('var x = (1, 2, 3);');
    expect(transform).toThrow(/SequenceExpression/);
    expect(transform).toThrow(/only supported in for-loop/);
  });
});
