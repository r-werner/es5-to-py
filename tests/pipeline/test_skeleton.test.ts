import { describe, test, expect } from 'vitest';
import { parseJS } from '../../src/parser.js';
import { Transformer } from '../../src/transformer.js';
import { UnsupportedNodeError, UnsupportedFeatureError } from '../../src/errors.js';
import { sanitizeIdentifier, IdentifierMapper } from '../../src/identifier-sanitizer.js';
import { ImportManager } from '../../src/import-manager.js';

describe('Pipeline Skeleton', () => {
  test('Parser produces ESTree AST', () => {
    const ast = parseJS('42');
    expect(ast.type).toBe('Program');
    expect((ast as any).body[0].type).toBe('ExpressionStatement');
  });

  test('Acorn configuration is correct', () => {
    const source = 'var x = 5;';
    const ast = parseJS(source);
    expect((ast as any).sourceType).toBe('script');
    expect(ast.loc).toBeDefined();
  });

  test('Error infrastructure works', () => {
    const node = { type: 'Unknown', loc: { start: { line: 1, column: 0 } } } as any;
    const error = new UnsupportedNodeError(node, 'Test error');
    expect(error.message).toContain('Test error');
    expect(error.message).toContain('1:0');
    expect(error.code).toBe('E_UNSUPPORTED_NODE');
  });

  test('UnsupportedFeatureError includes error code', () => {
    const node = { type: 'Test', loc: { start: { line: 2, column: 5 } } } as any;
    const error = new UnsupportedFeatureError('testFeature', node, 'Test feature error', 'E_TEST_FEATURE');
    expect(error.message).toContain('Test feature error');
    expect(error.message).toContain('2:5');
    expect(error.code).toBe('E_TEST_FEATURE');
    expect(error.feature).toBe('testFeature');
  });

  test('Identifier sanitization works', () => {
    expect(sanitizeIdentifier('class')).toBe('class_js');
    expect(sanitizeIdentifier('from')).toBe('from_js');
    expect(sanitizeIdentifier('None')).toBe('None_js');
    expect(sanitizeIdentifier('myVar')).toBe('myVar');
  });

  test('IdentifierMapper scope tracking works', () => {
    const mapper = new IdentifierMapper();

    // Global scope
    expect(mapper.declare('class')).toBe('class_js');
    expect(mapper.lookup('class')).toBe('class_js');

    // Enter new scope
    mapper.enterScope();
    expect(mapper.declare('myVar')).toBe('myVar');
    expect(mapper.lookup('myVar')).toBe('myVar');
    expect(mapper.lookup('class')).toBe('class_js'); // From parent scope

    // Exit scope
    mapper.exitScope();
    expect(mapper.lookup('class')).toBe('class_js'); // Still accessible
  });

  test('Import manager generates correct imports', () => {
    const mgr = new ImportManager();
    mgr.addStdlib('math');
    mgr.addRuntime('JSUndefined');
    mgr.addRuntime('js_truthy');

    const imports = mgr.generateImports();
    expect(imports).toContain('import math as _js_math');
    expect(imports).toContain('from js_compat import JSUndefined, js_truthy');
  });

  test('Import manager sorts imports deterministically', () => {
    const mgr = new ImportManager();
    mgr.addStdlib('re');
    mgr.addStdlib('math');
    mgr.addRuntime('js_truthy');
    mgr.addRuntime('JSUndefined');

    const imports = mgr.generateImports();
    expect(imports[0]).toBe('import math as _js_math');
    expect(imports[1]).toBe('import re as _js_re');
    expect(imports[2]).toBe('from js_compat import JSUndefined, js_truthy');
  });

  test('Temp allocator generates unique names', () => {
    const transformer = new Transformer();
    expect(transformer.allocateTemp()).toBe('__js_tmp1');
    expect(transformer.allocateTemp()).toBe('__js_tmp2');
    expect(transformer.allocateTemp()).toBe('__js_tmp3');
  });

  test('Transformer throws on unsupported nodes', () => {
    const transformer = new Transformer();
    const ast = parseJS('42');

    expect(() => transformer.transform(ast)).toThrow(UnsupportedNodeError);
    expect(() => transformer.transform(ast)).toThrow(/Program transformation not yet implemented/);
  });

  test('Walrus operator (NamedExpr) can be unparsed by py-ast', async () => {
    // Verify Python 3.8+ walrus operator support in py-ast
    const pyAst = await import('py-ast');

    // Parse Python code with walrus operator to get correct AST structure
    const pythonCode = 'x := 5';
    const ast = pyAst.parse(pythonCode);

    // Verify py-ast can unparse it without throwing
    let output: string;
    expect(() => {
      output = pyAst.unparse(ast);
    }).not.toThrow();

    // Verify output contains walrus operator
    expect(output!).toContain(':=');
    expect(output!).toContain('x');
  });
});
