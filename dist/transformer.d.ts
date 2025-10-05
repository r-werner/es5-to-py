import type { Node } from 'acorn';
import { ImportManager } from './import-manager.js';
export declare class Transformer {
    private identifierMapper;
    private tempCounter;
    importManager: ImportManager;
    constructor(importManager: ImportManager);
    allocateTemp(): string;
    resetTemps(): void;
    transform(jsAst: Node): any;
    private getVisitor;
    visitNode(node: Node): any;
    visitLiteral(node: any): any;
    visitIdentifier(node: any): any;
    visitArrayExpression(node: any): any;
    visitObjectExpression(node: any): any;
    visitMemberExpression(node: any): any;
    visitBinaryExpression(node: any): any;
    visitLogicalExpression(node: any): any;
    visitUnaryExpression(node: any): any;
    visitConditionalExpression(node: any): any;
    visitProgram(node: any): any;
    visitExpressionStatement(node: any): any;
}
//# sourceMappingURL=transformer.d.ts.map