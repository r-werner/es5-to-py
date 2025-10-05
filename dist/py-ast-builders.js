/**
 * Helper functions to build Python AST nodes.
 *
 * These functions create plain JavaScript objects that conform to the Python AST structure
 * that py-ast can unparse.
 */
export const PyAST = {
    Constant(value) {
        return { nodeType: 'Constant', value };
    },
    Name(id, ctx) {
        return { nodeType: 'Name', id, ctx: { nodeType: ctx } };
    },
    List(elts, ctx) {
        return { nodeType: 'List', elts, ctx: { nodeType: ctx } };
    },
    Dict(keys, values) {
        return { nodeType: 'Dict', keys, values };
    },
    Call(func, args, keywords) {
        return { nodeType: 'Call', func, args, keywords };
    },
    Attribute(value, attr, ctx) {
        return { nodeType: 'Attribute', value, attr, ctx: { nodeType: ctx } };
    },
    Subscript(value, slice, ctx) {
        return { nodeType: 'Subscript', value, slice, ctx: { nodeType: ctx } };
    },
    Compare(left, ops, comparators) {
        return {
            nodeType: 'Compare',
            left,
            ops: ops.map(op => ({ nodeType: op })),
            comparators
        };
    },
    BinOp(left, op, right) {
        return { nodeType: 'BinOp', left, op: { nodeType: op }, right };
    },
    UnaryOp(op, operand) {
        return { nodeType: 'UnaryOp', op: { nodeType: op }, operand };
    },
    IfExp(test, body, orelse) {
        return { nodeType: 'IfExp', test, body, orelse };
    },
    NamedExpr(target, value) {
        return { nodeType: 'NamedExpr', target, value };
    }
};
//# sourceMappingURL=py-ast-builders.js.map