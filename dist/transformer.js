import { PyAST } from './py-ast-builders.js';
import { IdentifierMapper } from './identifier-sanitizer.js';
import { UnsupportedNodeError, UnsupportedFeatureError } from './errors.js';
export class Transformer {
    constructor(importManager) {
        this.identifierMapper = new IdentifierMapper();
        this.tempCounter = 0;
        this.importManager = importManager;
    }
    allocateTemp() {
        return `__js_tmp${++this.tempCounter}`;
    }
    resetTemps() {
        // Reset temp counter (called per function scope as per spec)
        this.tempCounter = 0;
    }
    transform(jsAst) {
        // Entry point for transformation
        return this.visitNode(jsAst);
    }
    getVisitor(node) {
        const method = `visit${node.type}`;
        const visitor = this[method];
        return typeof visitor === 'function' ? visitor.bind(this) : undefined;
    }
    visitNode(node) {
        const visitor = this.getVisitor(node);
        if (visitor) {
            return visitor(node);
        }
        throw new UnsupportedNodeError(node, `Unsupported node type: ${node.type}`);
    }
    // ==========================================================================
    // S2: Core Expressions I
    // ==========================================================================
    visitLiteral(node) {
        if (node.regex) {
            // Regex literal: defer compilation to S8
            throw new UnsupportedFeatureError('regex', node, 'Regex literals not yet implemented (deferred to S8)', 'E_REGEX');
        }
        if (node.value === null) {
            return PyAST.Constant(null); // Python None
        }
        if (typeof node.value === 'string') {
            return PyAST.Constant(node.value);
        }
        if (typeof node.value === 'number') {
            return PyAST.Constant(node.value);
        }
        if (typeof node.value === 'boolean') {
            return PyAST.Constant(node.value);
        }
        throw new UnsupportedNodeError(node, `Unknown literal type: ${typeof node.value}`);
    }
    visitIdentifier(node) {
        const name = node.name;
        // Global identifier mappings
        if (name === 'undefined') {
            this.importManager.addRuntime('JSUndefined');
            return PyAST.Name('JSUndefined', 'Load');
        }
        if (name === 'NaN') {
            return PyAST.Call(PyAST.Name('float', 'Load'), [PyAST.Constant('nan')], []);
        }
        if (name === 'Infinity') {
            this.importManager.addStdlib('math');
            return PyAST.Attribute(PyAST.Name('_js_math', 'Load'), 'inf', 'Load');
        }
        // Sanitized identifier lookup
        const sanitized = this.identifierMapper.lookup(name);
        return PyAST.Name(sanitized, 'Load');
    }
    visitArrayExpression(node) {
        const elements = node.elements.map((el) => el ? this.visitNode(el) : PyAST.Constant(null));
        return PyAST.List(elements, 'Load');
    }
    visitObjectExpression(node) {
        const keys = [];
        const values = [];
        for (const prop of node.properties) {
            if (prop.computed) {
                throw new UnsupportedFeatureError('computed-key', prop, 'Computed object keys are not supported. Use identifier or string-literal keys only.', 'E_COMPUTED_KEY');
            }
            let key;
            if (prop.key.type === 'Identifier') {
                key = PyAST.Constant(prop.key.name);
            }
            else if (prop.key.type === 'Literal' && typeof prop.key.value === 'string') {
                key = PyAST.Constant(prop.key.value);
            }
            else {
                throw new UnsupportedFeatureError('object-key', prop.key, 'Object keys must be identifiers or string literals.', 'E_OBJECT_KEY');
            }
            keys.push(key);
            values.push(this.visitNode(prop.value));
        }
        return PyAST.Dict(keys, values);
    }
    visitMemberExpression(node) {
        const obj = this.visitNode(node.object);
        // Special case: .length reads → len()
        if (!node.computed && node.property.type === 'Identifier' && node.property.name === 'length') {
            return PyAST.Call(PyAST.Name('len', 'Load'), [obj], []);
        }
        // Default: subscript access
        let key;
        if (node.computed) {
            // Bracket access: obj[expr]
            key = this.visitNode(node.property);
        }
        else {
            // Dot access: obj.prop → obj['prop']
            key = PyAST.Constant(node.property.name);
        }
        return PyAST.Subscript(obj, key, 'Load');
    }
    visitBinaryExpression(node) {
        const left = this.visitNode(node.left);
        const right = this.visitNode(node.right);
        if (node.operator === '===') {
            this.importManager.addRuntime('js_strict_eq');
            return PyAST.Call(PyAST.Name('js_strict_eq', 'Load'), [left, right], []);
        }
        if (node.operator === '!==') {
            this.importManager.addRuntime('js_strict_neq');
            return PyAST.Call(PyAST.Name('js_strict_neq', 'Load'), [left, right], []);
        }
        // Comparison operators
        const opMap = {
            '<': 'Lt',
            '<=': 'LtE',
            '>': 'Gt',
            '>=': 'GtE'
        };
        if (opMap[node.operator]) {
            return PyAST.Compare(left, [opMap[node.operator]], [right]);
        }
        throw new UnsupportedFeatureError('binary-op', node, `Binary operator not yet implemented: ${node.operator}`, 'E_BINARY_OP');
    }
    visitLogicalExpression(node) {
        const temp = this.allocateTemp();
        this.importManager.addRuntime('js_truthy');
        const leftWalrus = PyAST.NamedExpr(PyAST.Name(temp, 'Store'), this.visitNode(node.left));
        const tempLoad = PyAST.Name(temp, 'Load');
        const right = this.visitNode(node.right);
        if (node.operator === '&&') {
            // a && b → (b if js_truthy(__js_tmp1 := a) else __js_tmp1)
            return PyAST.IfExp(PyAST.Call(PyAST.Name('js_truthy', 'Load'), [leftWalrus], []), right, tempLoad);
        }
        if (node.operator === '||') {
            // a || b → (__js_tmp1 if js_truthy(__js_tmp1 := a) else b)
            return PyAST.IfExp(PyAST.Call(PyAST.Name('js_truthy', 'Load'), [leftWalrus], []), tempLoad, right);
        }
        throw new UnsupportedFeatureError('logical-op', node, `Logical operator not implemented: ${node.operator}`, 'E_LOGICAL_OP');
    }
    visitUnaryExpression(node) {
        if (node.operator === '!') {
            this.importManager.addRuntime('js_truthy');
            return PyAST.UnaryOp('Not', PyAST.Call(PyAST.Name('js_truthy', 'Load'), [this.visitNode(node.argument)], []));
        }
        if (node.operator === '-') {
            // Handle -Infinity specially
            if (node.argument.type === 'Identifier' && node.argument.name === 'Infinity') {
                this.importManager.addStdlib('math');
                return PyAST.UnaryOp('USub', PyAST.Attribute(PyAST.Name('_js_math', 'Load'), 'inf', 'Load'));
            }
            // Regular unary minus
            return PyAST.UnaryOp('USub', this.visitNode(node.argument));
        }
        // +, typeof, delete, void deferred to other specs
        throw new UnsupportedFeatureError('unary-op', node, `Unary operator '${node.operator}' not yet implemented`, 'E_UNARY_OP');
    }
    visitConditionalExpression(node) {
        this.importManager.addRuntime('js_truthy');
        return PyAST.IfExp(PyAST.Call(PyAST.Name('js_truthy', 'Load'), [this.visitNode(node.test)], []), this.visitNode(node.consequent), this.visitNode(node.alternate));
    }
    // ==========================================================================
    // Visitor methods for other specs
    // ==========================================================================
    visitProgram(node) {
        // Minimal Program implementation for S2 testing
        // Full implementation with statements in S3
        if (node.body.length === 1 && node.body[0].type === 'ExpressionStatement') {
            // Single expression statement - just return the expression for testing
            return this.visitNode(node.body[0].expression);
        }
        throw new UnsupportedNodeError(node, 'Program with multiple statements not yet implemented (S3)');
    }
    visitExpressionStatement(node) {
        return this.visitNode(node.expression);
    }
}
//# sourceMappingURL=transformer.js.map