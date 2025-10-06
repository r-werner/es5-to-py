import type { Node } from 'acorn';
import { PyAST } from './py-ast-builders.js';
import { IdentifierMapper } from './identifier-sanitizer.js';
import { ImportManager } from './import-manager.js';
import { UnsupportedNodeError, UnsupportedFeatureError } from './errors.js';

export class Transformer {
  private identifierMapper = new IdentifierMapper();
  private tempCounter = 0;
  importManager: ImportManager;

  constructor(importManager: ImportManager) {
    this.importManager = importManager;
  }

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

  // ==========================================================================
  // S2: Core Expressions I
  // ==========================================================================

  visitLiteral(node: any): any {
    if (node.regex) {
      // Regex literal: defer compilation to S8
      throw new UnsupportedFeatureError(
        'regex',
        node,
        'Regex literals not yet implemented (deferred to S8)',
        'E_REGEX'
      );
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

  visitIdentifier(node: any): any {
    const name = node.name;

    // Global identifier mappings
    if (name === 'undefined') {
      this.importManager.addRuntime('JSUndefined');
      return PyAST.Name('JSUndefined', 'Load');
    }

    if (name === 'NaN') {
      return PyAST.Call(
        PyAST.Name('float', 'Load'),
        [PyAST.Constant('nan')],
        []
      );
    }

    if (name === 'Infinity') {
      this.importManager.addStdlib('math');
      return PyAST.Attribute(
        PyAST.Name('_js_math', 'Load'),
        'inf',
        'Load'
      );
    }

    // Sanitized identifier lookup
    const sanitized = this.identifierMapper.lookup(name);
    return PyAST.Name(sanitized, 'Load');
  }

  visitArrayExpression(node: any): any {
    const elements = node.elements.map((el: any) =>
      el ? this.visitNode(el) : PyAST.Constant(null)
    );
    return PyAST.List(elements, 'Load');
  }

  visitObjectExpression(node: any): any {
    const keys: any[] = [];
    const values: any[] = [];

    for (const prop of node.properties) {
      if (prop.computed) {
        throw new UnsupportedFeatureError(
          'computed-key',
          prop,
          'Computed object keys are not supported. Use identifier or string-literal keys only.',
          'E_COMPUTED_KEY'
        );
      }

      let key;
      if (prop.key.type === 'Identifier') {
        key = PyAST.Constant(prop.key.name);
      } else if (prop.key.type === 'Literal' && typeof prop.key.value === 'string') {
        key = PyAST.Constant(prop.key.value);
      } else {
        throw new UnsupportedFeatureError(
          'object-key',
          prop.key,
          'Object keys must be identifiers or string literals.',
          'E_OBJECT_KEY'
        );
      }

      keys.push(key);
      values.push(this.visitNode(prop.value));
    }

    return PyAST.Dict(keys, values);
  }

  visitMemberExpression(node: any): any {
    const obj = this.visitNode(node.object);

    // Special case: .length reads → len()
    if (!node.computed && node.property.type === 'Identifier' && node.property.name === 'length') {
      return PyAST.Call(
        PyAST.Name('len', 'Load'),
        [obj],
        []
      );
    }

    // Default: subscript access
    let key;
    if (node.computed) {
      // Bracket access: obj[expr]
      key = this.visitNode(node.property);
    } else {
      // Dot access: obj.prop → obj['prop']
      key = PyAST.Constant(node.property.name);
    }

    return PyAST.Subscript(obj, key, 'Load');
  }

  visitBinaryExpression(node: any): any {
    const left = this.visitNode(node.left);
    const right = this.visitNode(node.right);

    if (node.operator === '===') {
      this.importManager.addRuntime('js_strict_eq');
      return PyAST.Call(
        PyAST.Name('js_strict_eq', 'Load'),
        [left, right],
        []
      );
    }

    if (node.operator === '!==') {
      this.importManager.addRuntime('js_strict_neq');
      return PyAST.Call(
        PyAST.Name('js_strict_neq', 'Load'),
        [left, right],
        []
      );
    }

    // Comparison operators
    const comparisonOps: Record<string, string> = {
      '<': 'Lt',
      '<=': 'LtE',
      '>': 'Gt',
      '>=': 'GtE'
    };

    if (comparisonOps[node.operator]) {
      return PyAST.Compare(left, [comparisonOps[node.operator]], [right]);
    }

    // Arithmetic operators (S3)
    const arithmeticOps: Record<string, string> = {
      '+': 'js_add',
      '-': 'js_sub',
      '*': 'js_mul',
      '/': 'js_div',
      '%': 'js_mod'
    };

    if (arithmeticOps[node.operator]) {
      this.importManager.addRuntime(arithmeticOps[node.operator]);
      return PyAST.Call(
        PyAST.Name(arithmeticOps[node.operator], 'Load'),
        [left, right],
        []
      );
    }

    throw new UnsupportedFeatureError(
      'binary-op',
      node,
      `Binary operator not yet implemented: ${node.operator}`,
      'E_BINARY_OP'
    );
  }

  visitLogicalExpression(node: any): any {
    const temp = this.allocateTemp();
    this.importManager.addRuntime('js_truthy');

    const leftWalrus = PyAST.NamedExpr(
      PyAST.Name(temp, 'Store'),
      this.visitNode(node.left)
    );

    const tempLoad = PyAST.Name(temp, 'Load');
    const right = this.visitNode(node.right);

    // DRY: Build js_truthy call once
    const truthyTest = PyAST.Call(
      PyAST.Name('js_truthy', 'Load'),
      [leftWalrus],
      []
    );

    if (node.operator === '&&') {
      // a && b → (b if js_truthy(__js_tmp1 := a) else __js_tmp1)
      return PyAST.IfExp(truthyTest, right, tempLoad);
    }

    if (node.operator === '||') {
      // a || b → (__js_tmp1 if js_truthy(__js_tmp1 := a) else b)
      return PyAST.IfExp(truthyTest, tempLoad, right);
    }

    throw new UnsupportedFeatureError(
      'logical-op',
      node,
      `Logical operator not implemented: ${node.operator}`,
      'E_LOGICAL_OP'
    );
  }

  visitUnaryExpression(node: any): any {
    if (node.operator === '!') {
      this.importManager.addRuntime('js_truthy');
      return PyAST.UnaryOp(
        'Not',
        PyAST.Call(
          PyAST.Name('js_truthy', 'Load'),
          [this.visitNode(node.argument)],
          []
        )
      );
    }

    if (node.operator === '-') {
      // Handle -Infinity specially
      if (node.argument.type === 'Identifier' && node.argument.name === 'Infinity') {
        this.importManager.addStdlib('math');
        return PyAST.UnaryOp(
          'USub',
          PyAST.Attribute(
            PyAST.Name('_js_math', 'Load'),
            'inf',
            'Load'
          )
        );
      }

      // Regular unary minus
      return PyAST.UnaryOp('USub', this.visitNode(node.argument));
    }

    if (node.operator === '+') {
      // Unary plus: ToNumber coercion (S3)
      this.importManager.addRuntime('js_to_number');
      return PyAST.Call(
        PyAST.Name('js_to_number', 'Load'),
        [this.visitNode(node.argument)],
        []
      );
    }

    // typeof, delete, void deferred to other specs
    throw new UnsupportedFeatureError(
      'unary-op',
      node,
      `Unary operator '${node.operator}' not yet implemented`,
      'E_UNARY_OP'
    );
  }

  visitConditionalExpression(node: any): any {
    this.importManager.addRuntime('js_truthy');

    return PyAST.IfExp(
      PyAST.Call(
        PyAST.Name('js_truthy', 'Load'),
        [this.visitNode(node.test)],
        []
      ),
      this.visitNode(node.consequent),
      this.visitNode(node.alternate)
    );
  }

  // ==========================================================================
  // S3: Variables, Functions, and Statements
  // ==========================================================================

  visitVariableDeclaration(node: any): any {
    const assigns: any[] = [];

    for (const decl of node.declarations) {
      if (decl.id.type !== 'Identifier') {
        throw new UnsupportedFeatureError(
          'destructure',
          decl.id,
          'Destructuring in variable declarations is not supported',
          'E_DESTRUCTURE'
        );
      }

      const sanitized = this.identifierMapper.declare(decl.id.name);
      const target = PyAST.Name(sanitized, 'Store');

      let value;
      if (decl.init) {
        value = this.visitNode(decl.init);
      } else {
        // Uninitialized var → JSUndefined
        this.importManager.addRuntime('JSUndefined');
        value = PyAST.Name('JSUndefined', 'Load');
      }

      assigns.push(PyAST.Assign([target], value));
    }

    return assigns.length === 1 ? assigns[0] : assigns;
  }

  visitAssignmentExpression(node: any): any {
    if (node.operator === '=') {
      // Simple assignment
      if (node.left.type === 'Identifier') {
        const sanitized = this.identifierMapper.lookup(node.left.name);
        const value = this.visitNode(node.right);
        return PyAST.Assign([PyAST.Name(sanitized, 'Store')], value);
      }

      if (node.left.type === 'MemberExpression') {
        const target = this.visitMemberTarget(node.left);
        const value = this.visitNode(node.right);
        return PyAST.Assign([target], value);
      }

      throw new UnsupportedNodeError(node.left, `Unsupported assignment target: ${node.left.type}`);
    }

    // Augmented assignment
    return this.visitAugmentedAssignment(node);
  }

  visitMemberTarget(node: any): any {
    const obj = this.visitNode(node.object);
    let key;
    if (node.computed) {
      key = this.visitNode(node.property);
    } else {
      key = PyAST.Constant(node.property.name);
    }
    return PyAST.Subscript(obj, key, 'Store');
  }

  visitAugmentedAssignment(node: any): any {
    const opMap: Record<string, string> = {
      '+=': 'js_add',
      '-=': 'js_sub',
      '*=': 'js_mul',
      '/=': 'js_div',
      '%=': 'js_mod'
    };

    if (!opMap[node.operator]) {
      throw new UnsupportedFeatureError(
        'augmented-assign',
        node,
        `Augmented assignment operator '${node.operator}' not supported`,
        'E_AUGMENTED_ASSIGN'
      );
    }

    this.importManager.addRuntime(opMap[node.operator]);

    if (node.left.type === 'Identifier') {
      const sanitized = this.identifierMapper.lookup(node.left.name);
      const target = PyAST.Name(sanitized, 'Store');
      const leftLoad = PyAST.Name(sanitized, 'Load');
      const rightVal = this.visitNode(node.right);

      return PyAST.Assign(
        [target],
        PyAST.Call(
          PyAST.Name(opMap[node.operator], 'Load'),
          [leftLoad, rightVal],
          []
        )
      );
    }

    throw new UnsupportedFeatureError(
      'member-augassign',
      node,
      'Augmented assignment to member expressions not yet implemented (requires single-eval)',
      'E_MEMBER_AUGASSIGN'
    );
  }

  visitFunctionDeclaration(node: any): any {
    const funcName = this.identifierMapper.declare(node.id.name);

    // Enter new scope
    this.identifierMapper.enterScope();

    // Map parameters - collect names while in scope
    const paramNames: string[] = [];
    for (const param of node.params) {
      if (param.type !== 'Identifier') {
        throw new UnsupportedFeatureError(
          'param',
          param,
          'Only simple identifier parameters are supported',
          'E_PARAM_DESTRUCTURE'
        );
      }
      const paramName = this.identifierMapper.declare(param.name);
      paramNames.push(paramName);
    }

    // Transform body
    const body = this.visitBlockStatement(node.body);

    // Exit scope
    this.identifierMapper.exitScope();

    // Build args list after collecting names
    const args = paramNames.map(name => PyAST.arg(name, null));

    return PyAST.FunctionDef(
      funcName,
      PyAST.arguments(args, [], [], [], []),
      body,
      [],
      null
    );
  }

  visitBlockStatement(node: any): any {
    const statements: any[] = [];

    for (const stmt of node.body) {
      const result = this.visitNode(stmt);
      if (Array.isArray(result)) {
        statements.push(...result);
      } else {
        statements.push(result);
      }
    }

    return statements.length > 0 ? statements : [PyAST.Pass()];
  }

  visitReturnStatement(node: any): any {
    if (node.argument) {
      return PyAST.Return(this.visitNode(node.argument));
    } else {
      // Bare return → return JSUndefined
      this.importManager.addRuntime('JSUndefined');
      return PyAST.Return(PyAST.Name('JSUndefined', 'Load'));
    }
  }

  visitProgram(node: any): any {
    const statements: any[] = [];

    for (const stmt of node.body) {
      const result = this.visitNode(stmt);
      if (Array.isArray(result)) {
        statements.push(...result);
      } else {
        statements.push(result);
      }
    }

    // Generate imports
    const importLines = this.importManager.generateImports();
    const importStatements: any[] = [];

    for (const line of importLines) {
      if (line.startsWith('import ')) {
        // Parse: import math as _js_math
        const match = line.match(/import (\w+) as (\w+)/);
        if (match) {
          importStatements.push(
            PyAST.Import([PyAST.alias(match[1], match[2])])
          );
        }
      } else if (line.startsWith('from ')) {
        // Parse: from runtime.js_compat import x, y, z
        const match = line.match(/from ([\w.]+) import (.+)/);
        if (match) {
          const names = match[2].split(', ').map(n => PyAST.alias(n.trim(), null));
          importStatements.push(
            PyAST.ImportFrom(match[1], names, 0)
          );
        }
      }
    }

    return PyAST.Module([...importStatements, ...statements], []);
  }

  visitExpressionStatement(node: any): any {
    return PyAST.Expr(this.visitNode(node.expression));
  }

  // ... other visitors added in later specs
}
