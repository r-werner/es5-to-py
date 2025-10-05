import * as pyAst from 'py-ast';

/**
 * Generate Python source code from a Python AST.
 *
 * @param pythonAst - Python AST node (typically Module from py-ast)
 * @returns Python source code as a string
 */
export function generatePython(pythonAst: any): string {
  // Use py-ast to unparse Python AST to source code
  // Note: pythonAst should be a py-ast Module node or compatible AST node
  // Typed as 'any' since py-ast does not export comprehensive TypeScript types
  return pyAst.unparse(pythonAst);
}
