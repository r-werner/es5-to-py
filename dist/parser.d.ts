import type { Node } from 'acorn';
/**
 * Parse JavaScript source code into an ESTree-compatible AST.
 *
 * @param source - JavaScript source code (ES5 subset)
 * @returns Acorn AST node (root node is always Program)
 */
export declare function parseJS(source: string): Node & {
    type: 'Program';
};
//# sourceMappingURL=parser.d.ts.map