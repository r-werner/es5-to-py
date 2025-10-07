import type { Node } from 'acorn';
import { PyAST } from './py-ast-builders.js';
import { IdentifierMapper } from './identifier-sanitizer.js';
import { ImportManager } from './import-manager.js';
import { UnsupportedNodeError, UnsupportedFeatureError } from './errors.js';

/**
 * AncestryTagger: Pre-pass to tag AST nodes with loop/switch context
 * for break/continue validation (S4)
 */
class AncestryTagger {
  private loopStack: number[] = [];
  private switchStack: any[] = [];
  private loopIdCounter = 0;

  tagAST(ast: any): void {
    this.traverse(ast);
  }

  private traverse(node: any): void {
    if (!node || typeof node !== 'object') return;

    // Tag loop nodes
    if (node.type === 'WhileStatement' || node.type === 'ForStatement' || node.type === 'ForInStatement') {
      const loopId = ++this.loopIdCounter;
      node._loopId = loopId;
      this.loopStack.push(loopId);
    }

    // Tag switch nodes
    if (node.type === 'SwitchStatement') {
      this.switchStack.push(node);
    }

    // Validate break/continue
    if (node.type === 'BreakStatement') {
      if (this.loopStack.length === 0 && this.switchStack.length === 0) {
        throw new UnsupportedFeatureError(
          'break',
          node,
          'Break statement outside loop or switch',
          'E_BREAK_OUTSIDE'
        );
      }
    }

    if (node.type === 'ContinueStatement') {
      if (this.loopStack.length === 0) {
        throw new UnsupportedFeatureError(
          'continue',
          node,
          'Continue statement outside loop',
          'E_CONTINUE_OUTSIDE'
        );
      }

      if (this.switchStack.length > 0 && this.loopStack.length > 0) {
        // Error if any switch in stack (conservative check)
        throw new UnsupportedFeatureError(
          'continue-in-switch',
          node,
          'Continue statement inside switch is not supported. Use break to exit switch, or refactor to use a loop.',
          'E_CONTINUE_IN_SWITCH'
        );
      }
    }

    // Annotate node with current loop ID
    if (this.loopStack.length > 0) {
      node._currentLoopId = this.loopStack[this.loopStack.length - 1];
    }

    // Recurse into child nodes
    for (const key in node) {
      if (key.startsWith('_')) continue; // Skip metadata
      if (node[key] && typeof node[key] === 'object') {
        if (Array.isArray(node[key])) {
          node[key].forEach((child: any) => this.traverse(child));
        } else {
          this.traverse(node[key]);
        }
      }
    }

    // Pop stacks
    if (node.type === 'WhileStatement' || node.type === 'ForStatement' || node.type === 'ForInStatement') {
      this.loopStack.pop();
    }
    if (node.type === 'SwitchStatement') {
      this.switchStack.pop();
    }
  }
}

export class Transformer {
  private identifierMapper = new IdentifierMapper();
  private tempCounter = 0;
  private switchIdCounter = 0; // S6: Switch discriminant ID counter
  private inForInitOrUpdate = false; // S5: Track context for SequenceExpression
  importManager: ImportManager;

  constructor(importManager: ImportManager) {
    this.importManager = importManager;
  }

  allocateTemp(): string {
    return `__js_tmp${++this.tempCounter}`;
  }

  allocateSwitchId(): number {
    return ++this.switchIdCounter;
  }

  resetTemps(): void {
    // Reset temp counter (called per function scope as per spec)
    this.tempCounter = 0;
  }

  // DRY helpers for common AST patterns
  private runtimeCall(funcName: string, args: any[]): any {
    this.importManager.addRuntime(funcName);
    return PyAST.Call(PyAST.Name(funcName, 'Load'), args, []);
  }

  private jsTruthyCall(arg: any): any {
    return this.runtimeCall('js_truthy', [arg]);
  }

  // S4: Variable hoisting helpers
  private collectVarDeclarations(node: any): Set<string> {
    const vars = new Set<string>();

    const traverse = (n: any): void => {
      if (!n || typeof n !== 'object') return;

      if (n.type === 'VariableDeclaration' && n.kind === 'var') {
        for (const decl of n.declarations) {
          if (decl.id.type === 'Identifier') {
            vars.add(decl.id.name);
          }
        }
      }

      // Recurse into child nodes (except nested functions)
      if (n.type !== 'FunctionDeclaration' && n.type !== 'FunctionExpression') {
        for (const key in n) {
          if (n[key] && typeof n[key] === 'object') {
            if (Array.isArray(n[key])) {
              n[key].forEach(traverse);
            } else {
              traverse(n[key]);
            }
          }
        }
      }
    };

    traverse(node);
    return vars;
  }

  private generateHoistedVars(varNames: Set<string>): any[] {
    if (varNames.size === 0) return [];

    this.importManager.addRuntime('JSUndefined');
    return Array.from(varNames).map(name => {
      const sanitized = this.identifierMapper.declare(name);
      return PyAST.Assign(
        [PyAST.Name(sanitized, 'Store')],
        PyAST.Name('JSUndefined', 'Load')
      );
    });
  }

  transform(jsAst: Node): any {
    // S4: Pre-pass for break/continue validation
    const tagger = new AncestryTagger();
    tagger.tagAST(jsAst);

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

    // S7: Special case: Math.PI (property access, not method call)
    if (!node.computed &&
        node.object.type === 'Identifier' &&
        node.object.name === 'Math' &&
        node.property.name === 'PI') {
      this.importManager.addStdlib('math');
      return PyAST.Attribute(
        PyAST.Name('_js_math', 'Load'),
        'pi',
        'Load'
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

  // S7: CallExpression - function calls with library method mappings
  visitCallExpression(node: any): any {
    // Math.* methods
    if (node.callee.type === 'MemberExpression' &&
        node.callee.object.type === 'Identifier' &&
        node.callee.object.name === 'Math') {
      return this.visitMathMethod(node);
    }

    // Date.now()
    if (node.callee.type === 'MemberExpression' &&
        node.callee.object.type === 'Identifier' &&
        node.callee.object.name === 'Date' &&
        node.callee.property.name === 'now') {
      this.importManager.addRuntime('js_date_now');
      return PyAST.Call(PyAST.Name('js_date_now', 'Load'), [], []);
    }

    // console.log()
    if (node.callee.type === 'MemberExpression' &&
        node.callee.object.type === 'Identifier' &&
        node.callee.object.name === 'console' &&
        node.callee.property.name === 'log') {
      this.importManager.addRuntime('console_log');
      const args = node.arguments.map((arg: any) => this.visitNode(arg));
      return PyAST.Call(PyAST.Name('console_log', 'Load'), args, []);
    }

    // String and Array methods (method calls on objects)
    if (node.callee.type === 'MemberExpression') {
      const methodName = node.callee.property.name;

      // String methods
      if (this.isStringMethod(methodName)) {
        return this.visitStringMethod(node);
      }

      // Array methods (push/pop with provability check)
      if (methodName === 'push' || methodName === 'pop') {
        return this.visitArrayMethod(node);
      }
    }

    // Default: regular function call
    const func = this.visitNode(node.callee);
    const args = node.arguments.map((arg: any) => this.visitNode(arg));
    return PyAST.Call(func, args, []);
  }

  private visitMathMethod(node: any): any {
    const method = node.callee.property.name;
    const args = node.arguments.map((arg: any) => this.visitNode(arg));

    // Built-in functions: abs, max, min
    if (['abs', 'max', 'min'].includes(method)) {
      return PyAST.Call(PyAST.Name(method, 'Load'), args, []);
    }

    // Math library methods: sqrt, floor, ceil, log, log10, log2, sin, cos, tan, etc.
    const mathMethods = ['sqrt', 'floor', 'ceil', 'log', 'log10', 'log2',
                         'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
                         'exp', 'round'];
    if (mathMethods.includes(method)) {
      this.importManager.addStdlib('math');
      return PyAST.Call(
        PyAST.Attribute(PyAST.Name('_js_math', 'Load'), method, 'Load'),
        args,
        []
      );
    }

    // Math.pow(x, y) → x ** y
    if (method === 'pow') {
      if (args.length !== 2) {
        throw new UnsupportedFeatureError(
          'math-pow',
          node,
          'Math.pow() requires exactly 2 arguments',
          'E_MATH_POW_ARGS'
        );
      }
      return PyAST.BinOp(args[0], 'Pow', args[1]);
    }

    // Math.random()
    if (method === 'random') {
      this.importManager.addStdlib('random');
      return PyAST.Call(
        PyAST.Attribute(PyAST.Name('_js_random', 'Load'), 'random', 'Load'),
        [],
        []
      );
    }

    throw new UnsupportedFeatureError(
      'math-method',
      node,
      `Math.${method}() is not supported`,
      'E_MATH_METHOD'
    );
  }

  private isStringMethod(method: string): boolean {
    const stringMethods = ['charAt', 'charCodeAt', 'substring', 'toLowerCase',
                           'toUpperCase', 'indexOf', 'slice', 'split', 'trim', 'replace'];
    return stringMethods.includes(method);
  }

  private visitStringMethod(node: any): any {
    const method = node.callee.property.name;
    const obj = this.visitNode(node.callee.object);
    const args = node.arguments.map((arg: any) => this.visitNode(arg));

    // charAt(i) → str[i:i+1]
    if (method === 'charAt') {
      const index = args[0];
      return PyAST.Subscript(
        obj,
        PyAST.Slice(index, PyAST.BinOp(index, 'Add', PyAST.Constant(1)), null),
        'Load'
      );
    }

    // charCodeAt(i) → js_char_code_at(str, i)
    if (method === 'charCodeAt') {
      this.importManager.addRuntime('js_char_code_at');
      return PyAST.Call(
        PyAST.Name('js_char_code_at', 'Load'),
        [obj, args[0]],
        []
      );
    }

    // substring(start, end) → js_substring(str, start, end)
    if (method === 'substring') {
      this.importManager.addRuntime('js_substring');
      return PyAST.Call(
        PyAST.Name('js_substring', 'Load'),
        [obj, ...args],
        []
      );
    }

    // toLowerCase() → str.lower()
    if (method === 'toLowerCase') {
      return PyAST.Call(
        PyAST.Attribute(obj, 'lower', 'Load'),
        [],
        []
      );
    }

    // toUpperCase() → str.upper()
    if (method === 'toUpperCase') {
      return PyAST.Call(
        PyAST.Attribute(obj, 'upper', 'Load'),
        [],
        []
      );
    }

    // indexOf(substr) → str.find(substr)
    if (method === 'indexOf') {
      return PyAST.Call(
        PyAST.Attribute(obj, 'find', 'Load'),
        args,
        []
      );
    }

    // slice(start, end) → str[start:end]
    if (method === 'slice') {
      const start = args[0] || PyAST.Constant(null);
      const end = args[1] || PyAST.Constant(null);
      return PyAST.Subscript(obj, PyAST.Slice(start, end, null), 'Load');
    }

    // split(sep) → str.split(sep)
    if (method === 'split') {
      return PyAST.Call(
        PyAST.Attribute(obj, 'split', 'Load'),
        args,
        []
      );
    }

    // trim() → str.strip()
    if (method === 'trim') {
      return PyAST.Call(
        PyAST.Attribute(obj, 'strip', 'Load'),
        [],
        []
      );
    }

    // replace(search, replace) → str.replace(search, replace, 1) (single replacement)
    if (method === 'replace') {
      return PyAST.Call(
        PyAST.Attribute(obj, 'replace', 'Load'),
        [...args, PyAST.Constant(1)],  // count=1 for single replacement
        []
      );
    }

    throw new UnsupportedFeatureError(
      'string-method',
      node,
      `String method .${method}() is not supported`,
      'E_STRING_METHOD'
    );
  }

  private visitArrayMethod(node: any): any {
    const method = node.callee.property.name;
    const obj = node.callee.object;

    // Check if receiver is provably an array
    if (!this.isProvablyArray(obj)) {
      throw new UnsupportedFeatureError(
        'array-method-ambiguous',
        node,
        `Cannot determine if receiver is an array for .${method}(). Only use array methods on variables that are initialized with array literals.`,
        'E_ARRAY_METHOD_AMBIGUOUS'
      );
    }

    const objNode = this.visitNode(obj);
    const args = node.arguments.map((arg: any) => this.visitNode(arg));

    // push(x) → arr.append(x) (single argument only)
    if (method === 'push') {
      if (args.length !== 1) {
        throw new UnsupportedFeatureError(
          'array-push-multi',
          node,
          'Array.push() with multiple arguments not supported. Use multiple .push() calls.',
          'E_ARRAY_PUSH_MULTI_ARG'
        );
      }
      return PyAST.Call(
        PyAST.Attribute(objNode, 'append', 'Load'),
        args,
        []
      );
    }

    // pop() → js_array_pop(arr)
    if (method === 'pop') {
      this.importManager.addRuntime('js_array_pop');
      return PyAST.Call(
        PyAST.Name('js_array_pop', 'Load'),
        [objNode],
        []
      );
    }

    throw new UnsupportedFeatureError(
      'array-method',
      node,
      `Array method .${method}() is not supported`,
      'E_ARRAY_METHOD'
    );
  }

  private isProvablyArray(node: any): boolean {
    // For now, only consider array literals as provably arrays
    // Could be extended to track variable types in the future
    if (node.type === 'ArrayExpression') {
      return true;
    }

    // Consider identifiers that were initialized with array literals
    // This is a simple heuristic - could be improved with dataflow analysis
    if (node.type === 'Identifier') {
      // For S7, we'll be conservative and require explicit array literals
      // at the call site or accept the error
      return false;
    }

    return false;
  }

  visitBinaryExpression(node: any): any {
    const left = this.visitNode(node.left);
    const right = this.visitNode(node.right);

    if (node.operator === '===') {
      return this.runtimeCall('js_strict_eq', [left, right]);
    }

    if (node.operator === '!==') {
      return this.runtimeCall('js_strict_neq', [left, right]);
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
      return this.runtimeCall(arithmeticOps[node.operator], [left, right]);
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

    const leftWalrus = PyAST.NamedExpr(
      PyAST.Name(temp, 'Store'),
      this.visitNode(node.left)
    );

    const tempLoad = PyAST.Name(temp, 'Load');
    const right = this.visitNode(node.right);

    const truthyTest = this.jsTruthyCall(leftWalrus);

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
      return PyAST.UnaryOp('Not', this.jsTruthyCall(this.visitNode(node.argument)));
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
      return this.runtimeCall('js_to_number', [this.visitNode(node.argument)]);
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
    return PyAST.IfExp(
      this.jsTruthyCall(this.visitNode(node.test)),
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
          'var-destructure',
          decl.id,
          'Destructuring in variable declarations is not supported',
          'E_VAR_DESTRUCTURE'
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
    // S3: Assignment expressions produce statement-level Assign nodes
    // Walrus operator (assignment-as-expression) is deferred to later specs
    // when we need assignments in expression contexts (e.g., if ((x = foo())) { ... })

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
    // Note: We use JS coercion helpers (js_sub, js_mul, etc.) for all augmented ops
    // to match JavaScript's ToNumber semantics. This means 'x -= "3"' coerces to numeric
    // subtraction, just like in JavaScript. This is intentional and correct per ES5 spec.
    const opMap: Record<string, string> = {
      '+=': 'js_add',      // Handles both string concat and numeric addition
      '-=': 'js_sub',      // ToNumber coercion on both operands
      '*=': 'js_mul',      // ToNumber coercion on both operands
      '/=': 'js_div',      // ToNumber coercion on both operands
      '%=': 'js_mod'       // ToNumber coercion with JS remainder semantics
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

    // S3: Member-target augmented assignment deferred
    // Requires temp variable generation for single-evaluation:
    //   obj[key] += val  -->  __tmp = obj; __tmp2 = key; __tmp[__tmp2] = js_add(__tmp[__tmp2], val)
    // Will be implemented when temp variable management is added in later specs
    throw new UnsupportedFeatureError(
      'member-augassign',
      node,
      'Augmented assignment to member expressions not yet implemented (requires single-eval with temp variables)',
      'E_MEMBER_AUGASSIGN'
    );
  }

  visitFunctionDeclaration(node: any): any {
    // S4: Function placement validation will be added when control flow blocks are implemented
    const funcName = this.identifierMapper.declare(node.id.name);

    // Enter new scope
    this.identifierMapper.enterScope();

    // Reset temp counter to prevent name bleed across functions
    this.resetTemps();

    // S4: First pass - collect var declarations for hoisting
    const hoistedVars = this.collectVarDeclarations(node.body);

    // Map parameters - collect raw names for exclusion from hoisting
    const rawParamNames: string[] = [];
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
      rawParamNames.push(param.name);
      const paramName = this.identifierMapper.declare(param.name);
      paramNames.push(paramName);
    }

    // S4: Generate hoisted initializers (exclude params)
    const hoistedVarNames = new Set(hoistedVars);
    rawParamNames.forEach(p => hoistedVarNames.delete(p));
    const hoistedStmts = this.generateHoistedVars(hoistedVarNames);

    // Second pass: Transform body (var declarations are now redundant initializations)
    const bodyStmts = this.visitBlockStatement(node.body);

    // Exit scope
    this.identifierMapper.exitScope();

    // Build args list after collecting names
    const args = paramNames.map(name => PyAST.arg(name, null));

    // Combine hoisted vars + body
    const finalBody = [...hoistedStmts, ...bodyStmts];

    return PyAST.FunctionDef(
      funcName,
      PyAST.arguments(args, [], [], [], []),
      finalBody.length > 0 ? finalBody : [PyAST.Pass()],
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

    // Generate import AST nodes via ImportManager (S3+)
    const importStatements = this.importManager.generateImportAst(PyAST);

    return PyAST.Module([...importStatements, ...statements], []);
  }

  visitExpressionStatement(node: any): any {
    return PyAST.Expr(this.visitNode(node.expression));
  }

  // S4: Control Flow visitors
  visitIfStatement(node: any): any {
    const test = this.jsTruthyCall(this.visitNode(node.test));
    const body = this.visitStatement(node.consequent);
    const orelse = node.alternate ? this.visitStatement(node.alternate) : [];

    return PyAST.If(test, body, orelse);
  }

  visitWhileStatement(node: any): any {
    const test = this.jsTruthyCall(this.visitNode(node.test));
    const body = this.visitStatement(node.body);

    return PyAST.While(test, body, []);
  }

  visitBreakStatement(node: any): any {
    return PyAST.Break();
  }

  visitContinueStatement(node: any): any {
    const continueStmt = PyAST.Continue() as any;
    // Preserve source node for loop ID checking in continue-update injection
    continueStmt._sourceNode = node;
    return continueStmt;
  }

  // S5: For loops with continue-update injection
  visitForStatement(node: any): any {
    const statements: any[] = [];
    const loopId = node._loopId; // Set by AncestryTagger

    // Emit init using the same helper as update
    if (node.init) {
      const initStmts = this.emitForClauseStatements(node.init);
      statements.push(...initStmts);
    }

    // Build test condition
    let test;
    if (node.test) {
      test = this.jsTruthyCall(this.visitNode(node.test));
    } else {
      test = PyAST.Constant(true);
    }

    // Transform body with continue-update injection
    let body = this.visitStatement(node.body);

    // Inject update before continues that belong to this loop
    if (node.update) {
      body = this.injectUpdateBeforeContinue(body, node.update, loopId);
    }

    // Append update at end of body (for normal flow)
    if (node.update) {
      body.push(...this.emitUpdateStatements(node.update));
    }

    statements.push(PyAST.While(test, body.length > 0 ? body : [PyAST.Pass()], []));
    return statements;
  }

  private injectUpdateBeforeContinue(statements: any[], updateNode: any, loopId: number): any[] {
    const result: any[] = [];

    for (const stmt of statements) {
      if (stmt.nodeType === 'Continue') {
        // Only inject update if this continue belongs to the current loop
        // _sourceNode is the original AST node (set in visitContinueStatement)
        // _currentLoopId is annotated by AncestryTagger during pre-pass
        // This ensures updates are only injected for continues in THIS for-loop, not nested loops
        if (stmt._sourceNode && stmt._sourceNode._currentLoopId === loopId) {
          // This continue belongs to this for-loop, inject update
          result.push(...this.emitUpdateStatements(updateNode));
        }
        result.push(stmt);
      } else if (stmt.body && Array.isArray(stmt.body)) {
        // Recurse into blocks (if, while, etc.)
        stmt.body = this.injectUpdateBeforeContinue(stmt.body, updateNode, loopId);
        result.push(stmt);
      } else if (stmt.orelse && Array.isArray(stmt.orelse)) {
        // Recurse into else blocks
        stmt.orelse = this.injectUpdateBeforeContinue(stmt.orelse, updateNode, loopId);
        result.push(stmt);
      } else {
        result.push(stmt);
      }
    }

    return result;
  }

  // DRY helper: Wrap a visited node into a statement if needed
  // Assign/AugAssign nodes are already statements; other expressions need Expr() wrapper
  private wrapAsStatement(node: any): any {
    if (node.nodeType === 'Assign' || node.nodeType === 'AugAssign') {
      return node;
    }
    return PyAST.Expr(node);
  }

  // DRY helper: Emit statement(s) from for-init or for-update clause
  // Used by both init and update sections to unify handling
  // Note: Callers iterate to emit statements; this returns array, not single expression
  private emitForClauseStatements(clauseNode: any): any[] {
    return this.withForContext(() => {
      const statements: any[] = [];

      if (clauseNode.type === 'SequenceExpression') {
        // Multiple expressions in sequence
        for (const expr of clauseNode.expressions) {
          const result = this.visitNode(expr);
          if (Array.isArray(result)) {
            // VariableDeclaration can return multiple Assign statements
            statements.push(...result);
          } else {
            statements.push(this.wrapAsStatement(result));
          }
        }
      } else {
        // Single expression or statement
        const result = this.visitNode(clauseNode);
        if (Array.isArray(result)) {
          // VariableDeclaration can return multiple Assign statements
          statements.push(...result);
        } else {
          statements.push(this.wrapAsStatement(result));
        }
      }

      return statements;
    });
  }

  // Convenience alias for update statements (semantic clarity)
  private emitUpdateStatements(updateNode: any): any[] {
    return this.emitForClauseStatements(updateNode);
  }

  // DRY helper: Execute callback in for-init/update context
  private withForContext<T>(callback: () => T): T {
    const prev = this.inForInitOrUpdate;
    this.inForInitOrUpdate = true;
    try {
      return callback();
    } finally {
      this.inForInitOrUpdate = prev;
    }
  }

  // S5: SequenceExpression (comma operator)
  visitSequenceExpression(node: any): any {
    // Only allowed in for-init/update contexts
    if (!this.inForInitOrUpdate) {
      throw new UnsupportedFeatureError(
        'sequence-expr',
        node,
        'SequenceExpression (comma operator) is only supported in for-loop init/update clauses. Refactor to separate statements.',
        'E_SEQUENCE_EXPR_CONTEXT'
      );
    }

    // In for context, return the last expression (JavaScript semantics)
    // But caller will handle multiple expressions
    const expressions = node.expressions.map((expr: any) => this.visitNode(expr));
    return expressions[expressions.length - 1]; // Return last for expression context
  }

  // S5: UpdateExpression (++/--)
  visitUpdateExpression(node: any): any {
    const arg = node.argument;

    if (arg.type === 'Identifier') {
      const sanitized = this.identifierMapper.lookup(arg.name);
      const target = PyAST.Name(sanitized, 'Store');
      const value = PyAST.Name(sanitized, 'Load');

      if (node.operator === '++') {
        return PyAST.Assign([target], this.runtimeCall('js_add', [value, PyAST.Constant(1)]));
      }

      if (node.operator === '--') {
        return PyAST.Assign([target], this.runtimeCall('js_sub', [value, PyAST.Constant(1)]));
      }
    }

    if (arg.type === 'MemberExpression') {
      throw new UnsupportedFeatureError(
        'update-expr-member',
        node,
        'UpdateExpression on member expression not yet implemented (requires single-evaluation)',
        'E_UPDATE_EXPR_MEMBER'
      );
    }

    throw new UnsupportedNodeError(node, `UpdateExpression target not supported: ${arg.type}`);
  }

  private visitStatement(node: any): any[] {
    if (node.type === 'BlockStatement') {
      return this.visitBlockStatement(node);
    } else {
      // Single statement
      const stmt = this.visitNode(node);
      return Array.isArray(stmt) ? stmt : [stmt];
    }
  }

  // S6: Switch Statement
  private validateSwitch(node: any): void {
    const cases = node.cases;

    for (let i = 0; i < cases.length; i++) {
      const currentCase = cases[i];
      const hasStatements = currentCase.consequent.length > 0;

      if (hasStatements) {
        const lastStmt = currentCase.consequent[currentCase.consequent.length - 1];
        const hasTerminator = ['BreakStatement', 'ReturnStatement', 'ThrowStatement'].includes(lastStmt.type);

        if (!hasTerminator && i < cases.length - 1) {
          // Check next case
          const nextCase = cases[i + 1];
          const nextHasStatements = nextCase.consequent.length > 0;

          if (nextHasStatements) {
            // Fall-through from non-empty to non-empty
            throw new UnsupportedFeatureError(
              'switch-fallthrough',
              currentCase,
              `Fall-through between non-empty cases is unsupported. Add explicit break statement at line ${currentCase.loc?.start?.line || 'unknown'}.`,
              'E_SWITCH_FALLTHROUGH'
            );
          }
        }
      }
    }
  }

  private buildSwitchChain(conditions: (any | null)[], bodies: any[][]): any {
    // Merge empty cases with next non-empty case (alias handling)
    const merged: Array<{ test: any | null; body: any[] }> = [];
    const currentConditions: any[] = [];

    for (let i = 0; i < conditions.length; i++) {
      if (bodies[i].length === 0) {
        // Empty case: accumulate condition (skip null for default)
        if (conditions[i] !== null) {
          currentConditions.push(conditions[i]);
        }
      } else {
        // Non-empty case
        if (currentConditions.length > 0) {
          // Merge: if (cond1 or cond2 or ...): body
          // If this case is default (null), treat accumulated conditions as aliases to default
          if (conditions[i] !== null) {
            currentConditions.push(conditions[i]);
          }

          if (currentConditions.length > 0) {
            const orExpr = currentConditions.reduce((acc, cond) =>
              PyAST.BoolOp('Or', [acc, cond])
            );
            merged.push({ test: conditions[i] === null ? null : orExpr, body: bodies[i] });
          } else {
            // All accumulated were empty cases before default
            merged.push({ test: null, body: bodies[i] });
          }
          currentConditions.length = 0; // Clear array
        } else {
          merged.push({ test: conditions[i], body: bodies[i] });
        }
      }
    }

    // Build if/elif/else
    if (merged.length === 0) {
      return PyAST.Pass();
    }

    const first = merged[0];
    let ifNode: any;

    if (first.test === null) {
      // Default case first (unusual)
      ifNode = PyAST.If(PyAST.Constant(true), first.body, []);
    } else {
      ifNode = PyAST.If(first.test, first.body, []);
    }

    let current = ifNode;
    for (let i = 1; i < merged.length; i++) {
      const { test, body } = merged[i];

      if (test === null) {
        // Default case
        current.orelse = body;
      } else {
        // elif
        const elifNode = PyAST.If(test, body, []);
        current.orelse = [elifNode];
        current = elifNode;
      }
    }

    return ifNode;
  }

  visitSwitchStatement(node: any): any[] {
    // Validate no fall-through
    this.validateSwitch(node);

    // Cache discriminant in temp variable
    const switchId = node._switchId || this.allocateSwitchId();
    const discTemp = `__js_switch_disc_${switchId}`;
    const discAssign = PyAST.Assign(
      [PyAST.Name(discTemp, 'Store')],
      this.visitNode(node.discriminant)
    );

    // Build if/elif/else chain
    this.importManager.addRuntime('js_strict_eq');

    const conditions: (any | null)[] = [];
    const bodies: any[][] = [];

    for (const caseNode of node.cases) {
      if (caseNode.test === null) {
        // Default case
        conditions.push(null);
      } else {
        // Regular case: js_strict_eq(disc, caseValue)
        conditions.push(
          this.runtimeCall('js_strict_eq', [
            PyAST.Name(discTemp, 'Load'),
            this.visitNode(caseNode.test)
          ])
        );
      }

      // Transform case body
      const body: any[] = [];
      for (const stmt of caseNode.consequent) {
        const result = this.visitNode(stmt);
        if (Array.isArray(result)) {
          body.push(...result);
        } else {
          body.push(result);
        }
      }

      // Synthesize break if not present
      if (body.length > 0) {
        const lastStmt = body[body.length - 1];
        const hasTerminator = lastStmt.nodeType === 'Break' || lastStmt.nodeType === 'Return';
        if (!hasTerminator) {
          body.push(PyAST.Break());
        }
      }

      bodies.push(body);
    }

    // Build nested if/elif/else
    const ifChain = this.buildSwitchChain(conditions, bodies);

    // Wrap in while True
    const whileLoop = PyAST.While(
      PyAST.Constant(true),
      [ifChain, PyAST.Break()], // Safety break after if-chain
      []
    );

    return [discAssign, whileLoop];
  }

  // S6: For-in Statement
  visitForInStatement(node: any): any {
    this.importManager.addRuntime('js_for_in_keys');

    // Handle left side (var declaration or identifier)
    let iterVar: string;
    if (node.left.type === 'VariableDeclaration') {
      const decl = node.left.declarations[0];
      iterVar = this.identifierMapper.declare(decl.id.name);
    } else if (node.left.type === 'Identifier') {
      iterVar = this.identifierMapper.lookup(node.left.name);
    } else {
      throw new UnsupportedNodeError(node.left, `Unsupported for-in left: ${node.left.type}`);
    }

    const iterable = this.runtimeCall('js_for_in_keys', [this.visitNode(node.right)]);
    const body = this.visitStatement(node.body);

    return PyAST.For(
      PyAST.Name(iterVar, 'Store'),
      iterable,
      body.length > 0 ? body : [PyAST.Pass()],
      []
    );
  }

  // ... other visitors added in later specs
}
