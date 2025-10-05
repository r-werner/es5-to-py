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
  }
};
