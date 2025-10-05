import * as acorn from 'acorn';
/**
 * Parse JavaScript source code into an ESTree-compatible AST.
 *
 * @param source - JavaScript source code (ES5 subset)
 * @returns Acorn AST node (root node is always Program)
 */
export function parseJS(source) {
    return acorn.parse(source, {
        ecmaVersion: 5, // ES5 syntax only
        sourceType: 'script', // NOT 'module'
        locations: true, // line/column for errors
        ranges: true, // source ranges
        allowReturnOutsideFunction: false,
        allowReserved: true // ES5 allows reserved words in some contexts
    });
}
//# sourceMappingURL=parser.js.map