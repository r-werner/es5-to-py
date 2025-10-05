import * as acorn from 'acorn';
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