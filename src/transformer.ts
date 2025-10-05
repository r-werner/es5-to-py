import type { Node } from 'acorn';
import { IdentifierMapper } from './identifier-sanitizer.js';
import { UnsupportedNodeError } from './errors.js';

export class Transformer {
  private identifierMapper = new IdentifierMapper();
  private tempCounter = 0;

  allocateTemp(): string {
    return `__js_tmp${++this.tempCounter}`;
  }

  resetTemps(): void {
    // Reset temp counter (called per function scope as per spec)
    this.tempCounter = 0;
  }

  transform(jsAst: Node): any {
    // Entry point for transformation
    return this.visitNode(jsAst);
  }

  private getVisitor(node: Node): ((node: any) => any) | undefined {
    const method = `visit${node.type}` as keyof this;
    const visitor = this[method];
    return typeof visitor === 'function' ? (visitor as any).bind(this) : undefined;
  }

  visitNode(node: Node): any {
    const visitor = this.getVisitor(node);
    if (visitor) {
      return visitor(node);
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
