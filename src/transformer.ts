import type { Node } from 'acorn';
import { IdentifierMapper } from './identifier-sanitizer.js';
import { UnsupportedNodeError } from './errors.js';

export class Transformer {
  private identifierMapper = new IdentifierMapper();
  private tempCounter = 0;

  allocateTemp(): string {
    return `__js_tmp${++this.tempCounter}`;
  }

  transform(jsAst: Node): any {
    // Entry point for transformation
    return this.visitNode(jsAst);
  }

  visitNode(node: Node): any {
    const method = `visit${node.type}` as keyof this;
    if (this[method] && typeof this[method] === 'function') {
      return (this[method] as any)(node);
    }
    throw new UnsupportedNodeError(node, `Unsupported node type: ${node.type}`);
  }

  // Visitor methods added by other specs
  visitProgram(node: any): any {
    // Implemented in S3
    throw new UnsupportedNodeError(node, 'Program transformation not yet implemented');
  }

  visitLiteral(node: any): any {
    // Implemented in S2
    throw new UnsupportedNodeError(node, 'Literal transformation not yet implemented');
  }

  // ... other visitors added in later specs
}
