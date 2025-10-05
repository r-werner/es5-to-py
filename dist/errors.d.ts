import type { Node } from 'acorn';
export declare class UnsupportedNodeError extends Error {
    readonly node: Node;
    readonly code = "E_UNSUPPORTED_NODE";
    constructor(node: Node, message: string);
}
export declare class UnsupportedFeatureError extends Error {
    readonly feature: string;
    readonly node?: Node;
    readonly code: string;
    constructor(feature: string, node: Node | undefined, message: string, code: string);
}
//# sourceMappingURL=errors.d.ts.map