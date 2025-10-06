/**
 * S4: Break/Continue Validation Tests (Negative Cases)
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

describe('S4: Break/Continue Validation', () => {
  // Note: Acorn parser validates break/continue at parse time, so some
  // invalid cases will throw SyntaxError before reaching our transformer.
  // Our AncestryTagger primarily validates the switch+continue case.

  test('Continue in switch inside while throws error', () => {
    const transform = transpile(`
      while (true) {
        switch (x) {
          case 1:
            continue;
        }
      }
    `);
    expect(transform).toThrow(UnsupportedFeatureError);
    expect(transform).toThrow(/Continue statement inside switch/);
    // Error code is in error.code property, not in message
    try {
      transform();
    } catch (e: any) {
      expect(e.code).toBe('E_CONTINUE_IN_SWITCH');
    }
  });

  test('Break in while loop is allowed', () => {
    const transform = transpile('while (true) { break; }');
    expect(transform).not.toThrow();
  });

  test('Continue in while loop is allowed', () => {
    const transform = transpile('while (true) { continue; }');
    expect(transform).not.toThrow();
  });

  test('Break in nested while loops is allowed', () => {
    const transform = transpile(`
      while (x) {
        while (y) {
          break;
        }
      }
    `);
    expect(transform).not.toThrow();
  });

  test('Continue in nested while loops is allowed', () => {
    const transform = transpile(`
      while (x) {
        while (y) {
          continue;
        }
      }
    `);
    expect(transform).not.toThrow();
  });
});
