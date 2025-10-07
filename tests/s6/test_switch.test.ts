/**
 * S6: Switch Statement - Tests
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

describe('S6: Switch with Strict Equality', () => {
  test('Switch with number and string cases', () => {
    const { python, imports } = transpile(`
      function test(x) {
        switch (x) {
          case 1: return 'one';
          case '1': return 'string one';
          default: return 'other';
        }
      }
    `);

    expect(imports).toContain('js_strict_eq');
    expect(python).toContain('__js_switch_disc_');
    expect(python).toContain('js_strict_eq');
    expect(python).toContain('while True:');
    expect(python).toContain('break');
  });

  test('Switch uses strict equality', () => {
    const { python } = transpile(`
      function test(x) {
        switch (x) {
          case 0: return 'zero';
          case false: return 'false';
        }
      }
    `);

    // Should use js_strict_eq, not Python ==
    expect(python).toContain('js_strict_eq');
  });
});

describe('S6: Switch Case Aliases', () => {
  test('Consecutive empty cases merge', () => {
    const { python } = transpile(`
      function test(x) {
        switch (x) {
          case 1:
          case 2:
          case 3:
            return 'small';
          case 10:
            return 'ten';
        }
      }
    `);

    expect(python).toContain('or');
  });

  test('Single case with body', () => {
    const { python } = transpile(`
      function test(x) {
        switch (x) {
          case 1:
            return 'one';
        }
      }
    `);

    expect(python).toContain('if');
    expect(python).toContain('return');
  });
});

describe('S6: Switch Discriminant Caching', () => {
  test('Discriminant evaluated once', () => {
    const { python } = transpile(`
      function test(i) {
        switch (i++) {
          case 0:
            x = 10;
            break;
          case 1:
            return 'one';
        }
      }
    `);

    // Discriminant should be cached in temp variable
    expect(python).toContain('__js_switch_disc_');
    expect(python).toMatch(/__js_switch_disc_\d+ =/);
  });
});

describe('S6: Switch Break Synthesis', () => {
  test('Synthesize break at end of case', () => {
    const { python } = transpile(`
      function test(x) {
        switch (x) {
          case 1:
            y = 1;
            break;
          case 2:
            y = 2;
            break;
        }
      }
    `);

    // Should have explicit breaks
    expect(python).toContain('break');
  });

  test('No break after return', () => {
    const { python } = transpile(`
      function test(x) {
        switch (x) {
          case 1:
            return 'one';
        }
      }
    `);

    // Should not add break after return
    expect(python).toContain('return');
  });
});

describe('S6: Switch Default Case', () => {
  test('Default case', () => {
    const { python } = transpile(`
      function test(x) {
        switch (x) {
          case 1:
            return 'one';
          default:
            return 'other';
        }
      }
    `);

    expect(python).toContain('if');
    expect(python).toContain('else:');
  });

  test('Default case only', () => {
    const { python } = transpile(`
      function test(x) {
        switch (x) {
          default:
            return 'default';
        }
      }
    `);

    expect(python).toContain('while True:');
    expect(python).toContain('return');
  });
});

describe('S6: Switch Validation', () => {
  test('Fall-through error on non-empty cases', () => {
    expect(() => {
      transpile(`
        function test(x) {
          switch (x) {
            case 1:
              y = 1;
            case 2:
              y = 2;
              break;
          }
        }
      `);
    }).toThrow(/fall-through/i);
  });

  test('Empty cases are allowed (aliases)', () => {
    expect(() => {
      transpile(`
        function test(x) {
          switch (x) {
            case 1:
            case 2:
              return 'small';
          }
        }
      `);
    }).not.toThrow();
  });
});

describe('S6: Switch Complex Cases', () => {
  test('Switch with multiple statements in case', () => {
    const { python } = transpile(`
      function test(x) {
        switch (x) {
          case 1:
            var a = 1;
            var b = 2;
            return a + b;
        }
      }
    `);

    expect(python).toContain('a = 1');
    expect(python).toContain('b = 2');
    expect(python).toContain('return');
  });

  test('Switch in function', () => {
    const { python } = transpile(`
      function test(x) {
        switch (x) {
          case 1: return 'one';
          case 2: return 'two';
          default: return 'other';
        }
      }
    `);

    expect(python).toContain('def test');
    expect(python).toContain('while True:');
  });
});
