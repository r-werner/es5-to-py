# S3: Assignment + Functions

**Status**: ✅ Complete (2025-10-06)
**Dependencies**: S0, S1, S2
**Estimated Effort**: 3-4 days
**Actual Effort**: < 1 day

---

## Critical Invariants (Repeated in Every Spec)

These invariants apply to **all** specs. Every feature must respect these rules:

1. **Python ≥ 3.8**: Walrus operator (`:=`) required; no fallback mode
2. **Strict equality**: Use `js_strict_eq()` for `===`; never Python `==` for object/array comparisons
3. **null vs undefined**: `None` is `null`; `JSUndefined` (singleton) is `undefined`; uninitialized vars → `JSUndefined`
4. **Member access**: Always via subscript (`obj['prop']`); exception: `.length` reads → `len()`
5. **Identifier sanitization**: `_js` suffix for reserved words; scope-aware remapping; property keys not sanitized
6. **Aliased stdlib imports**: `import math as _js_math`, `import random as _js_random`, `import re as _js_re` only
7. **Return semantics**: Bare `return` → `return JSUndefined` (NOT Python's implicit `None`)
8. **Temp naming**: `__js_tmp<n>` for temps, `__js_switch_disc_<id>` for switch discriminants

---

## Overview

This spec implements variable declarations, assignments (including augmented assignment), function declarations, and return statements. It includes arithmetic operators with runtime helpers for correct JavaScript semantics.

**Goal**: Transform JavaScript variables, functions, and assignments to Python with proper coercion, single-evaluation semantics, and walrus operator support for assignment-in-expression contexts.

---

## Scope

### In Scope

**Variable Declarations**:
- `VariableDeclaration` and `VariableDeclarator`
- `var` keyword (hoisting deferred to S4)
- Uninitialized vars → `JSUndefined` (not `None`)

**Assignment Expressions**:
- Simple assignment (`=`) in statement and expression contexts
- Walrus operator (`:=`) for assignment-in-expression
- Augmented assignment: `+=` with `js_add()`, `-=`/`*=`/`/=`/`%=` numeric-only
- Single-evaluation for `MemberExpression` targets

**Arithmetic Operators**:
- `+` → `js_add()` (string concat or numeric addition)
- `-` → `js_sub()` (ToNumber coercion)
- `*` → `js_mul()` (ToNumber coercion)
- `/` → `js_div()` (ToNumber coercion, handles division by zero)
- `%` → `js_mod()` (dividend sign semantics)
- Unary `+` → `js_to_number()` (ToNumber coercion)

**Function Declarations**:
- `FunctionDeclaration` → Python `FunctionDef`
- Parameters mapping
- Nested functions (call-after-definition only; no hoisting)
- Block validation (error on functions inside if/while/for blocks)

**Return Statements**:
- `return expr;` → `return expr`
- `return;` → `return JSUndefined`

**Program/Module**:
- `Program` → Python `Module` with body statements

### Out of Scope (Deferred to Later Specs)

- Variable hoisting → S4
- Function calls (CallExpression) → S7
- UpdateExpression (`++`, `--`) → S5
- SequenceExpression → S5

---

## Implementation Requirements

### 1. Runtime Helpers (add to `runtime/js_compat.py`)

**ToNumber Coercion**:
```python
def js_to_number(x):
    """
    JavaScript ToNumber coercion.

    - None (null) → 0
    - JSUndefined → NaN
    - bool: True → 1, False → 0
    - int/float → return as-is
    - str → parse as number (trim whitespace, empty → 0, parse errors → NaN)
    - Otherwise → NaN or error

    Limitations:
    - Hex literals ('0x1A') simplified (document limitation)
    - Octal literals skipped (document limitation)
    """
    if x is None:
        return 0
    if x is JSUndefined:
        return float('nan')
    if isinstance(x, bool):
        return 1 if x else 0
    if isinstance(x, (int, float)):
        return x
    if isinstance(x, str):
        s = x.strip()
        if s == '':
            return 0
        try:
            # Try int first, then float
            if '.' in s or 'e' in s.lower():
                return float(s)
            return int(s)
        except ValueError:
            return float('nan')
    return float('nan')

def js_add(a, b):
    """
    JavaScript + operator.

    - If either operand is string → string concatenation
    - Otherwise → numeric addition with ToNumber coercion
    """
    if isinstance(a, str) or isinstance(b, str):
        # String concatenation
        return str(a) + str(b)
    # Numeric addition
    return js_to_number(a) + js_to_number(b)

def js_sub(a, b):
    """JavaScript - operator (ToNumber coercion)."""
    return js_to_number(a) - js_to_number(b)

def js_mul(a, b):
    """JavaScript * operator (ToNumber coercion)."""
    return js_to_number(a) * js_to_number(b)

def js_div(a, b):
    """
    JavaScript / operator (ToNumber coercion).

    Handles division by zero: 1/0 → Infinity, -1/0 → -Infinity
    """
    import math as _js_math
    num_a = js_to_number(a)
    num_b = js_to_number(b)

    if num_b == 0:
        if num_a > 0:
            return _js_math.inf
        elif num_a < 0:
            return -_js_math.inf
        else:
            return float('nan')  # 0/0 → NaN

    return num_a / num_b

def js_mod(a, b):
    """
    JavaScript % operator (remainder, not modulo).

    JS: -1 % 2 → -1 (dividend sign)
    Python: -1 % 2 → 1 (divisor sign)

    Formula: a - (b * trunc(a / b))
    """
    import math as _js_math
    num_a = js_to_number(a)
    num_b = js_to_number(b)
    return num_a - (num_b * _js_math.trunc(num_a / num_b))
```

**Add to `__all__`**:
```python
__all__ = [
    # ... existing ...
    'js_to_number',
    'js_add',
    'js_sub',
    'js_mul',
    'js_div',
    'js_mod',
]
```

---

### 2. Arithmetic Operators

**BinaryExpression (extend from S2)**:
```javascript
visitBinaryExpression(node) {
  // ... existing S2 code for ===, !==, <, <=, >, >= ...

  const opMap = {
    '+': 'js_add',
    '-': 'js_sub',
    '*': 'js_mul',
    '/': 'js_div',
    '%': 'js_mod'
  };

  if (opMap[node.operator]) {
    this.importManager.addRuntime(opMap[node.operator]);
    return pyAst.Call({
      func: pyAst.Name({ id: opMap[node.operator], ctx: pyAst.Load() }),
      args: [this.visitNode(node.left), this.visitNode(node.right)],
      keywords: []
    });
  }

  throw new UnsupportedNodeError(node, `Binary operator not implemented: ${node.operator}`);
}
```

**UnaryExpression (extend from S2)**:
```javascript
visitUnaryExpression(node) {
  // ... existing S2 code for !, -, -Infinity ...

  if (node.operator === '+') {
    // Unary plus: ToNumber coercion
    this.importManager.addRuntime('js_to_number');
    return pyAst.Call({
      func: pyAst.Name({ id: 'js_to_number', ctx: pyAst.Load() }),
      args: [this.visitNode(node.argument)],
      keywords: []
    });
  }

  throw new UnsupportedFeatureError(
    'unary-op',
    node,
    `Unary operator '${node.operator}' not yet implemented`,
    'E_UNARY_OP'
  );
}
```

---

### 3. Variable Declarations

**VariableDeclaration**:
```javascript
visitVariableDeclaration(node) {
  const targets = [];
  const values = [];

  for (const decl of node.declarations) {
    const sanitized = this.identifierMapper.declare(decl.id.name);
    targets.push(pyAst.Name({ id: sanitized, ctx: pyAst.Store() }));

    if (decl.init) {
      values.push(this.visitNode(decl.init));
    } else {
      // Uninitialized var → JSUndefined
      this.importManager.addRuntime('JSUndefined');
      values.push(pyAst.Name({ id: 'JSUndefined', ctx: pyAst.Load() }));
    }
  }

  // Generate multiple assignments if needed
  const assigns = [];
  for (let i = 0; i < targets.length; i++) {
    assigns.push(pyAst.Assign({ targets: [targets[i]], value: values[i] }));
  }

  return assigns;
}
```

**Note**: Hoisting (moving all `var` declarations to function top) is handled in S4. For now, emit declarations in place.

---

### 4. Assignment Expressions

**Simple Assignment**:
```javascript
visitAssignmentExpression(node) {
  if (node.operator === '=') {
    const target = this.visitAssignmentTarget(node.left);
    const value = this.visitNode(node.right);

    // Expression context: use walrus operator (NamedExpr)
    if (this.isExpressionContext(node)) {
      if (node.left.type === 'Identifier') {
        const sanitized = this.identifierMapper.lookup(node.left.name);
        return pyAst.NamedExpr({
          target: pyAst.Name({ id: sanitized, ctx: pyAst.Store() }),
          value
        });
      } else {
        // MemberExpression target: requires temp for single-eval
        // This is complex; for now, error or use statement context
        throw new UnsupportedFeatureError(
          'assignment-expr',
          node,
          'Assignment to member expression in expression context not yet supported',
          'E_ASSIGNMENT_EXPR_MEMBER'
        );
      }
    }

    // Statement context: regular assignment
    return pyAst.Assign({ targets: [target], value });
  }

  // Augmented assignment
  return this.visitAugmentedAssignment(node);
}
```

**Augmented Assignment**:
```javascript
visitAugmentedAssignment(node) {
  const { operator, left, right } = node;

  if (operator === '+=') {
    this.importManager.addRuntime('js_add');

    if (left.type === 'Identifier') {
      const sanitized = this.identifierMapper.lookup(left.name);
      const target = pyAst.Name({ id: sanitized, ctx: pyAst.Store() });
      const leftLoad = pyAst.Name({ id: sanitized, ctx: pyAst.Load() });
      const rightVal = this.visitNode(right);

      return pyAst.Assign({
        targets: [target],
        value: pyAst.Call({
          func: pyAst.Name({ id: 'js_add', ctx: pyAst.Load() }),
          args: [leftLoad, rightVal],
          keywords: []
        })
      });
    }

    if (left.type === 'MemberExpression') {
      // Single-evaluation: capture base and key in temps
      return this.visitMemberAugmentedAssignment(left, right, 'js_add');
    }

    throw new UnsupportedNodeError(left, `Unsupported assignment target: ${left.type}`);
  }

  // Numeric-only augmented assignments
  const numericOps = { '-=': 'js_sub', '*=': 'js_mul', '/=': 'js_div', '%=': 'js_mod' };

  if (numericOps[operator]) {
    this.importManager.addRuntime(numericOps[operator]);

    // Similar pattern as +=, but error on type mismatch (enforced at runtime)
    if (left.type === 'Identifier') {
      const sanitized = this.identifierMapper.lookup(left.name);
      const target = pyAst.Name({ id: sanitized, ctx: pyAst.Store() });
      const leftLoad = pyAst.Name({ id: sanitized, ctx: pyAst.Load() });
      const rightVal = this.visitNode(right);

      return pyAst.Assign({
        targets: [target],
        value: pyAst.Call({
          func: pyAst.Name({ id: numericOps[operator], ctx: pyAst.Load() }),
          args: [leftLoad, rightVal],
          keywords: []
        })
      });
    }

    if (left.type === 'MemberExpression') {
      return this.visitMemberAugmentedAssignment(left, right, numericOps[operator]);
    }

    throw new UnsupportedNodeError(left, `Unsupported assignment target: ${left.type}`);
  }

  throw new UnsupportedFeatureError(
    'augmented-assign',
    node,
    `Augmented assignment operator '${operator}' not supported`,
    'E_AUGMENTED_ASSIGN'
  );
}
```

**Single-Evaluation for Member Targets**:
```javascript
visitMemberAugmentedAssignment(memberExpr, right, opFunc) {
  // Capture base and key in temps
  const baseTemp = this.allocateTemp();
  const keyTemp = this.allocateTemp();

  const baseVal = this.visitNode(memberExpr.object);
  let keyVal;
  if (memberExpr.computed) {
    keyVal = this.visitNode(memberExpr.property);
  } else {
    keyVal = pyAst.Constant({ value: memberExpr.property.name });
  }

  const rightVal = this.visitNode(right);

  // Statements:
  // _base = base_expr
  // _key = key_expr
  // _base[_key] = op(_base[_key], right_expr)

  const statements = [
    pyAst.Assign({
      targets: [pyAst.Name({ id: baseTemp, ctx: pyAst.Store() })],
      value: baseVal
    }),
    pyAst.Assign({
      targets: [pyAst.Name({ id: keyTemp, ctx: pyAst.Store() })],
      value: keyVal
    }),
    pyAst.Assign({
      targets: [
        pyAst.Subscript({
          value: pyAst.Name({ id: baseTemp, ctx: pyAst.Load() }),
          slice: pyAst.Name({ id: keyTemp, ctx: pyAst.Load() }),
          ctx: pyAst.Store()
        })
      ],
      value: pyAst.Call({
        func: pyAst.Name({ id: opFunc, ctx: pyAst.Load() }),
        args: [
          pyAst.Subscript({
            value: pyAst.Name({ id: baseTemp, ctx: pyAst.Load() }),
            slice: pyAst.Name({ id: keyTemp, ctx: pyAst.Load() }),
            ctx: pyAst.Load()
          }),
          rightVal
        ],
        keywords: []
      })
    })
  ];

  // Return multiple statements (transformer must handle this)
  return statements;
}
```

---

### 5. Function Declarations

**Validate Function Placement**:
```javascript
validateFunctionPlacement(node, parent) {
  // Allow at Program top-level or immediately inside FunctionDeclaration body
  const validParents = ['Program', 'BlockStatement'];

  if (!validParents.includes(parent?.type)) {
    throw new UnsupportedFeatureError(
      'function-in-block',
      node,
      'Function declarations inside blocks are not supported (Annex B). Use var f = function() {} instead.',
      'E_FUNCTION_IN_BLOCK'
    );
  }

  // Additional check: BlockStatement must be direct child of FunctionDeclaration
  // (not inside if/while/for)
  // This requires parent chain tracking; implement in traversal
}
```

**FunctionDeclaration**:
```javascript
visitFunctionDeclaration(node) {
  // Validate placement
  this.validateFunctionPlacement(node, this.currentParent);

  const funcName = this.identifierMapper.declare(node.id.name);

  // Enter new scope
  this.identifierMapper.enterScope();

  // Map parameters
  const args = [];
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
    args.push(pyAst.arg({ arg: paramName, annotation: null }));
  }

  // Transform body
  const body = this.visitBlockStatement(node.body);

  // Exit scope
  this.identifierMapper.exitScope();

  return pyAst.FunctionDef({
    name: funcName,
    args: pyAst.arguments({
      args,
      posonlyargs: [],
      kwonlyargs: [],
      kw_defaults: [],
      defaults: []
    }),
    body,
    decorator_list: [],
    returns: null
  });
}
```

**BlockStatement**:
```javascript
visitBlockStatement(node) {
  const statements = [];

  for (const stmt of node.body) {
    const result = this.visitNode(stmt);
    if (Array.isArray(result)) {
      statements.push(...result);
    } else {
      statements.push(result);
    }
  }

  return statements.length > 0 ? statements : [pyAst.Pass()];
}
```

---

### 6. Return Statements

**ReturnStatement**:
```javascript
visitReturnStatement(node) {
  if (node.argument) {
    return pyAst.Return({ value: this.visitNode(node.argument) });
  } else {
    // Bare return → return JSUndefined
    this.importManager.addRuntime('JSUndefined');
    return pyAst.Return({
      value: pyAst.Name({ id: 'JSUndefined', ctx: pyAst.Load() })
    });
  }
}
```

---

### 7. Program

**Program**:
```javascript
visitProgram(node) {
  const statements = [];

  for (const stmt of node.body) {
    const result = this.visitNode(stmt);
    if (Array.isArray(result)) {
      statements.push(...result);
    } else {
      statements.push(result);
    }
  }

  // Add imports at top
  const imports = this.importManager.generateImports();
  const importStmts = this.parseImports(imports);

  return pyAst.Module({
    body: [...importStmts, ...statements],
    type_ignores: []
  });
}

parseImports(importStr) {
  // Parse import strings to Python AST nodes
  // Use py-ast or manual construction
  // For simplicity, use string-based approach and parse
}
```

---

## Error Codes

This spec introduces these error codes:

- `E_ASSIGNMENT_EXPR_MEMBER`: Assignment to member in expression context
- `E_AUGMENTED_ASSIGN`: Unsupported augmented assignment operator
- `E_FUNCTION_IN_BLOCK`: Function declaration inside block
- `E_PARAM_DESTRUCTURE`: Destructuring parameters not supported

---

## Acceptance Tests

### Test: Arithmetic Operators
```javascript
// Input
'5' + 2;
'5' - 2;
'5' * 2;
null + 1;
+'5';

// Expected Results
'52' (string concat)
3 (numeric sub with coercion)
10 (numeric mul with coercion)
1 (null → 0)
5 (unary plus coercion)
```

### Test: Variable Declarations
```javascript
// Input
var x = 5;
var y;

// Expected Python
x = 5
y = JSUndefined
```

### Test: Augmented Assignment
```javascript
// Input
var x = 5; x += 10;
var s = 'hello'; s += ' world';

// Expected
x = js_add(x, 10) → 15
s = js_add(s, ' world') → 'hello world'
```

### Test: Member Augmented Assignment (Single-Eval)
```javascript
// Input
obj().prop += f();

// Expected (single-eval)
_base = obj()
_key = 'prop'
_base[_key] = js_add(_base[_key], f())
```

### Test: Function Declaration
```javascript
// Input
function add(a, b) {
  return a + b;
}

// Expected Python
def add(a, b):
    return js_add(a, b)
```

### Test: Bare Return
```javascript
// Input
function f() {
  return;
}

// Expected
def f():
    return JSUndefined
```

### Test: Nested Function (Call-After-Definition)
```javascript
// Input
function outer() {
  function inner() {
    return 42;
  }
  return inner();
}

// Expected: Works (call after definition)
```

### Test: Nested Function Error (Call-Before-Definition)
```javascript
// Input
function f() {
  return g();
  function g() { return 1; }
}

// Expected Error
E_NESTED_FUNCTION_HOISTING: "Nested function hoisting is not supported. Define function 'g' before calling it."
```

### Test: Function in Block Error
```javascript
// Input
if (true) {
  function f() {}
}

// Expected Error
E_FUNCTION_IN_BLOCK: "Function declarations inside blocks are not supported (Annex B). Use var f = function() {} instead."
```

---

## Done Criteria

- [ ] Runtime helpers: `js_to_number`, `js_add`, `js_sub`, `js_mul`, `js_div`, `js_mod`
- [ ] `visitBinaryExpression` handles arithmetic operators
- [ ] `visitUnaryExpression` handles unary `+`
- [ ] `visitVariableDeclaration` with `JSUndefined` for uninitialized vars
- [ ] `visitAssignmentExpression` with walrus operator support
- [ ] Augmented assignment with single-evaluation for member targets
- [ ] `visitFunctionDeclaration` with parameter mapping and nested functions
- [ ] `visitReturnStatement` with bare return → `JSUndefined`
- [ ] `visitProgram` and `visitBlockStatement`
- [ ] Function placement validation (error on functions in blocks)
- [ ] All acceptance tests pass

---

## Notes for Implementers

1. **Arithmetic Coercion**: Full ToNumber semantics via runtime helpers. Test edge cases: `null + 1`, `'5' - 2`, `undefined + 1` → NaN.

2. **Augmented Assignment**: `+=` uses `js_add`; numeric-only ops use `js_sub`/`js_mul`/`js_div`/`js_mod`. Single-evaluation for member targets is critical.

3. **Walrus Operator**: Assignment-in-expression requires walrus (NamedExpr). Test in conditionals: `if (x = y)`.

4. **Bare Return**: `return;` must emit `return JSUndefined`, NOT Python's implicit `None`.

5. **Nested Functions**: Call-after-definition only. Error on hoisting with helpful message.

---

## Timeline

**Day 1**:
- [ ] Implement runtime helpers (arithmetic, ToNumber)
- [ ] Implement arithmetic operators in BinaryExpression/UnaryExpression

**Day 2**:
- [ ] Implement variable declarations
- [ ] Implement assignment expressions with walrus operator

**Day 3**:
- [ ] Implement augmented assignment with single-evaluation
- [ ] Implement function declarations and return statements

**Day 4**:
- [ ] Write acceptance tests
- [ ] Review and mark S3 complete
