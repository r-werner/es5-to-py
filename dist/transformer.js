import { IdentifierMapper } from './identifier-sanitizer.js';
import { UnsupportedNodeError } from './errors.js';
export class Transformer {
    constructor() {
        this.identifierMapper = new IdentifierMapper();
        this.tempCounter = 0;
        // ... other visitors added in later specs
    }
    allocateTemp() {
        return `__js_tmp${++this.tempCounter}`;
    }
    transform(jsAst) {
        // Entry point for transformation
        return this.visitNode(jsAst);
    }
    visitNode(node) {
        const method = `visit${node.type}`;
        if (this[method] && typeof this[method] === 'function') {
            return this[method](node);
        }
        throw new UnsupportedNodeError(node, `Unsupported node type: ${node.type}`);
    }
    // Visitor methods added by other specs
    visitProgram(node) {
        // Implemented in S3
        throw new UnsupportedNodeError(node, 'Program transformation not yet implemented');
    }
    visitLiteral(node) {
        // Implemented in S2
        throw new UnsupportedNodeError(node, 'Literal transformation not yet implemented');
    }
}
//# sourceMappingURL=transformer.js.map