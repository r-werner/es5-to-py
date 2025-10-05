import type { Node } from 'acorn';

function formatLocation(node: Node | undefined): string {
  return node?.loc ? ` at ${node.loc.start.line}:${node.loc.start.column}` : '';
}

export class UnsupportedNodeError extends Error {
  public readonly node: Node;
  public readonly code = 'E_UNSUPPORTED_NODE';

  constructor(node: Node, message: string) {
    super(`${message}${formatLocation(node)}`);
    this.name = 'UnsupportedNodeError';
    this.node = node;
  }
}

export class UnsupportedFeatureError extends Error {
  public readonly feature: string;
  public readonly node?: Node;
  public readonly code: string;

  constructor(feature: string, node: Node | undefined, message: string, code: string) {
    super(`${message}${formatLocation(node)}`);
    this.name = 'UnsupportedFeatureError';
    this.feature = feature;
    this.node = node;
    this.code = code || 'E_UNSUPPORTED_FEATURE';
  }
}
