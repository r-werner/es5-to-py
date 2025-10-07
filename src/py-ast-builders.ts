/**
 * Helper functions to build Python AST nodes.
 *
 * These functions create plain JavaScript objects that conform to the Python AST structure
 * that py-ast can unparse.
 */

export const PyAST = {
  Constant(value: any) {
    return { nodeType: 'Constant', value };
  },

  Name(id: string, ctx: 'Load' | 'Store' | 'Del') {
    return { nodeType: 'Name', id, ctx: { nodeType: ctx } };
  },

  List(elts: any[], ctx: 'Load' | 'Store' | 'Del') {
    return { nodeType: 'List', elts, ctx: { nodeType: ctx } };
  },

  Dict(keys: any[], values: any[]) {
    return { nodeType: 'Dict', keys, values };
  },

  Call(func: any, args: any[], keywords: any[]) {
    return { nodeType: 'Call', func, args, keywords };
  },

  Attribute(value: any, attr: string, ctx: 'Load' | 'Store' | 'Del') {
    return { nodeType: 'Attribute', value, attr, ctx: { nodeType: ctx } };
  },

  Subscript(value: any, slice: any, ctx: 'Load' | 'Store' | 'Del') {
    return { nodeType: 'Subscript', value, slice, ctx: { nodeType: ctx } };
  },

  Compare(left: any, ops: string[], comparators: any[]) {
    return {
      nodeType: 'Compare',
      left,
      ops: ops.map(op => ({ nodeType: op })),
      comparators
    };
  },

  BinOp(left: any, op: string, right: any) {
    return { nodeType: 'BinOp', left, op: { nodeType: op }, right };
  },

  UnaryOp(op: string, operand: any) {
    return { nodeType: 'UnaryOp', op: { nodeType: op }, operand };
  },

  IfExp(test: any, body: any, orelse: any) {
    return { nodeType: 'IfExp', test, body, orelse };
  },

  NamedExpr(target: any, value: any) {
    return { nodeType: 'NamedExpr', target, value };
  },

  // S3: Statements
  Assign(targets: any[], value: any) {
    return { nodeType: 'Assign', targets, value };
  },

  Return(value: any) {
    return { nodeType: 'Return', value };
  },

  Expr(value: any) {
    return { nodeType: 'Expr', value };
  },

  Pass() {
    return { nodeType: 'Pass' };
  },

  FunctionDef(name: string, args: any, body: any[], decorator_list: any[], returns: any) {
    return { nodeType: 'FunctionDef', name, args, body, decorator_list, returns };
  },

  arguments(args: any[], posonlyargs: any[], kwonlyargs: any[], kw_defaults: any[], defaults: any[]) {
    return { nodeType: 'arguments', args, posonlyargs, kwonlyargs, kw_defaults, defaults };
  },

  arg(arg: string, annotation: any) {
    return { nodeType: 'Arg', arg, annotation };
  },

  Module(body: any[], type_ignores: any[]) {
    return { nodeType: 'Module', body, type_ignores };
  },

  Import(names: any[]) {
    return { nodeType: 'Import', names };
  },

  ImportFrom(module: string, names: any[], level: number) {
    return { nodeType: 'ImportFrom', module, names, level };
  },

  alias(name: string, asname: string | null) {
    return { nodeType: 'Alias', name, asname };
  },

  // Control Flow (S4)
  If(test: any, body: any[], orelse: any[]) {
    return { nodeType: 'If', test, body, orelse };
  },

  While(test: any, body: any[], orelse: any[]) {
    return { nodeType: 'While', test, body, orelse };
  },

  Break() {
    return { nodeType: 'Break' };
  },

  Continue() {
    return { nodeType: 'Continue' };
  },

  // S6: Switch and For-in
  BoolOp(op: 'And' | 'Or', values: any[]) {
    return { nodeType: 'BoolOp', op: { nodeType: op }, values };
  },

  For(target: any, iter: any, body: any[], orelse: any[]) {
    return { nodeType: 'For', target, iter, body, orelse };
  }
};
