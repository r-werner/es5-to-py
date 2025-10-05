import type { Node } from 'acorn';
export declare class Transformer {
    private identifierMapper;
    private tempCounter;
    allocateTemp(): string;
    transform(jsAst: Node): any;
    visitNode(node: Node): any;
    visitProgram(node: any): any;
    visitLiteral(node: any): any;
}
//# sourceMappingURL=transformer.d.ts.map