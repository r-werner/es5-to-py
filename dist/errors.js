function formatLocation(node) {
    return node?.loc ? ` at ${node.loc.start.line}:${node.loc.start.column}` : '';
}
export class UnsupportedNodeError extends Error {
    constructor(node, message) {
        super(`${message}${formatLocation(node)}`);
        this.code = 'E_UNSUPPORTED_NODE';
        this.name = 'UnsupportedNodeError';
        this.node = node;
    }
}
export class UnsupportedFeatureError extends Error {
    constructor(feature, node, message, code) {
        super(`${message}${formatLocation(node)}`);
        this.name = 'UnsupportedFeatureError';
        this.feature = feature;
        this.node = node;
        this.code = code || 'E_UNSUPPORTED_FEATURE';
    }
}
//# sourceMappingURL=errors.js.map