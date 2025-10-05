import * as pyAst from 'py-ast';

export function generatePython(pythonAst: any): string {
  // Use py-ast to unparse Python AST to source code
  return pyAst.unparse(pythonAst);
}
