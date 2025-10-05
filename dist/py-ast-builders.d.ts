/**
 * Helper functions to build Python AST nodes.
 *
 * These functions create plain JavaScript objects that conform to the Python AST structure
 * that py-ast can unparse.
 */
export declare const PyAST: {
    Constant(value: any): {
        nodeType: string;
        value: any;
    };
    Name(id: string, ctx: "Load" | "Store" | "Del"): {
        nodeType: string;
        id: string;
        ctx: {
            nodeType: "Load" | "Store" | "Del";
        };
    };
    List(elts: any[], ctx: "Load" | "Store" | "Del"): {
        nodeType: string;
        elts: any[];
        ctx: {
            nodeType: "Load" | "Store" | "Del";
        };
    };
    Dict(keys: any[], values: any[]): {
        nodeType: string;
        keys: any[];
        values: any[];
    };
    Call(func: any, args: any[], keywords: any[]): {
        nodeType: string;
        func: any;
        args: any[];
        keywords: any[];
    };
    Attribute(value: any, attr: string, ctx: "Load" | "Store" | "Del"): {
        nodeType: string;
        value: any;
        attr: string;
        ctx: {
            nodeType: "Load" | "Store" | "Del";
        };
    };
    Subscript(value: any, slice: any, ctx: "Load" | "Store" | "Del"): {
        nodeType: string;
        value: any;
        slice: any;
        ctx: {
            nodeType: "Load" | "Store" | "Del";
        };
    };
    Compare(left: any, ops: string[], comparators: any[]): {
        nodeType: string;
        left: any;
        ops: {
            nodeType: string;
        }[];
        comparators: any[];
    };
    BinOp(left: any, op: string, right: any): {
        nodeType: string;
        left: any;
        op: {
            nodeType: string;
        };
        right: any;
    };
    UnaryOp(op: string, operand: any): {
        nodeType: string;
        op: {
            nodeType: string;
        };
        operand: any;
    };
    IfExp(test: any, body: any, orelse: any): {
        nodeType: string;
        test: any;
        body: any;
        orelse: any;
    };
    NamedExpr(target: any, value: any): {
        nodeType: string;
        target: any;
        value: any;
    };
};
//# sourceMappingURL=py-ast-builders.d.ts.map