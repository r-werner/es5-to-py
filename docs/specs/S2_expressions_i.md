# S2: Core Expressions I

**Status**: ✅ Complete (2025-10-05)
**Dependencies**: S0, S1
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

This spec implements core expression transformations: literals, identifiers, arrays, objects, member access, strict equality, comparison operators, logical operators, and ternary.

**Goal**: Transform JavaScript expressions to Python AST nodes with correct semantics, including proper handling of null/undefined, strict equality for objects/arrays, and logical operator short-circuiting.

---

## Scope

### In Scope

**Literals**:
- String, number, boolean literals
- `null` → `None`
- Regex literals (deferred compilation to S8)

**Identifiers**:
- Global mappings: `undefined` → `JSUndefined`, `NaN` → `float('nan')`, `Infinity` → `_js_math.inf`
- Sanitized identifiers (Python keyword collision handling)
- Unary minus on `Infinity`: `-Infinity` → `-_js_math.inf`

**Array and Object Expressions**:
- `ArrayExpression` → Python list
- `ObjectExpression` → Python dict (identifier and string-literal keys only)

**Member Access**:
- `.length` reads → `len()`
- All other member access → subscript `obj['prop']` (dot and bracket access)

**Strict Equality**:
- `===` → `js_strict_eq(a, b)` runtime helper
- `!==` → `js_strict_neq(a, b)` runtime helper
- **CRITICAL**: Never use Python `==` for objects/arrays/functions

**Comparison Operators**:
- `<`, `<=`, `>`, `>=` → direct Python comparison for numbers
- Mixed string/number comparisons may need runtime helpers (document limitation)

**Logical Operators**:
- `&&`, `||` → walrus-based transformation that returns original operand values
- **CRITICAL**: Not coerced to booleans; single-eval semantics
- `a && b` → `(b if js_truthy(__js_tmp1 := a) else __js_tmp1)`
- `a || b` → `(__js_tmp1 if js_truthy(__js_tmp1 := a) else b)`

**Ternary**:
- `? :` → Python `IfExp` with `js_truthy()` on test

### Out of Scope (Deferred to Later Specs)

- Arithmetic operators (`+`, `-`, `*`, `/`, `%`) → S3 (need `js_add`, `js_mod`, etc.)
- `==`/`!=` loose equality → S8
- `typeof` operator → S8
- `delete` operator → S8
- `void` operator → S2 (partial; full in S3)
- Assignment expressions → S3
- Function calls → S3
- Update expressions (`++`, `--`) → S5
- Sequence expressions → S5

---

## Implementation Requirements

### 1. Runtime Helpers (add to `runtime/js_compat.py`)

**Strict Equality**:
```python
def js_strict_eq(a, b):
    """
    JavaScript strict equality (===) semantics.

    - NaN !== NaN → True (use math.isnan())
    - null === null → True (a is None and b is None)
    - undefined === undefined → True (a is JSUndefined and b is JSUndefined)
    - Primitives (str, int, float, bool): value equality (a == b)
    - Objects/arrays/functions (dict, list, callable): identity (a is b)

    Note: -0 vs +0 distinction not implemented (acceptable for demo).
    """
    import math as _js_math

    # NaN handling: NaN !== NaN
    if isinstance(a, float) and _js_math.isnan(a):
        return False
    if isinstance(b, float) and _js_math.isnan(b):
        return False

    # null/undefined identity
    if a is None and b is None:
        return True
    if a is JSUndefined and b is JSUndefined:
        return True

    # Type check
    if type(a) != type(b):
        return False

    # Primitives: value equality
    if isinstance(a, (str, int, float, bool)):
        return a == b

    # Objects/arrays/functions: identity
    return a is b

def js_strict_neq(a, b):
    """JavaScript strict inequality (!==)."""
    return not js_strict_eq(a, b)
```

**Add to `__all__`**:
```python
__all__ = [
    'JSUndefined',
    'js_truthy',
    'JSException',
    'js_strict_eq',
    'js_strict_neq',
]
```

---

### 2. Literal Transformation

**Implementation** (`visitLiteral` in transformer):
```javascript
visitLiteral(node) {
  if (node.regex) {
    // Regex literal: defer compilation to S8
    // For now, store pattern and flags for later
    throw new UnsupportedFeatureError(
      'regex',
      node,
      'Regex literals not yet implemented (deferred to S8)'
    );
  }

  if (node.value === null) {
    return pyAst.Constant({ value: null }); // Python None
  }

  if (typeof node.value === 'string') {
    return pyAst.Constant({ value: node.value });
  }

  if (typeof node.value === 'number') {
    return pyAst.Constant({ value: node.value });
  }

  if (typeof node.value === 'boolean') {
    return pyAst.Constant({ value: node.value });
  }

  throw new UnsupportedNodeError(node, `Unknown literal type: ${typeof node.value}`);
}
```

---

### 3. Identifier Transformation

**Global Identifier Mappings**:
- `undefined` → `JSUndefined`
- `NaN` → `float('nan')`
- `Infinity` → `_js_math.inf`

**Implementation** (`visitIdentifier` in transformer):
```javascript
visitIdentifier(node) {
  const name = node.name;

  // Global identifier mappings
  if (name === 'undefined') {
    this.importManager.addRuntime('JSUndefined');
    return pyAst.Name({ id: 'JSUndefined', ctx: pyAst.Load() });
  }

  if (name === 'NaN') {
    return pyAst.Call({
      func: pyAst.Name({ id: 'float', ctx: pyAst.Load() }),
      args: [pyAst.Constant({ value: 'nan' })],
      keywords: []
    });
  }

  if (name === 'Infinity') {
    this.importManager.addStdlib('math');
    return pyAst.Attribute({
      value: pyAst.Name({ id: '_js_math', ctx: pyAst.Load() }),
      attr: 'inf',
      ctx: pyAst.Load()
    });
  }

  // Sanitized identifier lookup
  const sanitized = this.identifierMapper.lookup(name);
  return pyAst.Name({ id: sanitized, ctx: pyAst.Load() });
}
```

**Unary Minus on Infinity**:
Handle in `UnaryExpression`:
```javascript
if (node.operator === '-' && node.argument.type === 'Identifier' && node.argument.name === 'Infinity') {
  this.importManager.addStdlib('math');
  return pyAst.UnaryOp({
    op: pyAst.USub(),
    operand: pyAst.Attribute({
      value: pyAst.Name({ id: '_js_math', ctx: pyAst.Load() }),
      attr: 'inf',
      ctx: pyAst.Load()
    })
  });
}
```

---

### 4. ArrayExpression and ObjectExpression

**ArrayExpression**:
```javascript
visitArrayExpression(node) {
  const elements = node.elements.map(el => el ? this.visitNode(el) : pyAst.Constant({ value: null }));
  return pyAst.List({ elts: elements, ctx: pyAst.Load() });
}
```

**ObjectExpression**:
```javascript
visitObjectExpression(node) {
  const keys = [];
  const values = [];

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
      key = pyAst.Constant({ value: prop.key.name });
    } else if (prop.key.type === 'Literal' && typeof prop.key.value === 'string') {
      key = pyAst.Constant({ value: prop.key.value });
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

  return pyAst.Dict({ keys, values });
}
```

---

### 5. MemberExpression

**Implementation**:
```javascript
visitMemberExpression(node) {
  const obj = this.visitNode(node.object);

  // Special case: .length reads → len()
  if (!node.computed && node.property.type === 'Identifier' && node.property.name === 'length') {
    return pyAst.Call({
      func: pyAst.Name({ id: 'len', ctx: pyAst.Load() }),
      args: [obj],
      keywords: []
    });
  }

  // Default: subscript access
  let key;
  if (node.computed) {
    // Bracket access: obj[expr]
    key = this.visitNode(node.property);
  } else {
    // Dot access: obj.prop → obj['prop']
    key = pyAst.Constant({ value: node.property.name });
  }

  return pyAst.Subscript({
    value: obj,
    slice: key,
    ctx: pyAst.Load()
  });
}
```

**CRITICAL**: All member access uses subscript by default, except `.length` reads.

---

### 6. Strict Equality

**BinaryExpression for `===` and `!==`**:
```javascript
visitBinaryExpression(node) {
  const left = this.visitNode(node.left);
  const right = this.visitNode(node.right);

  if (node.operator === '===') {
    this.importManager.addRuntime('js_strict_eq');
    return pyAst.Call({
      func: pyAst.Name({ id: 'js_strict_eq', ctx: pyAst.Load() }),
      args: [left, right],
      keywords: []
    });
  }

  if (node.operator === '!==') {
    this.importManager.addRuntime('js_strict_neq');
    return pyAst.Call({
      func: pyAst.Name({ id: 'js_strict_neq', ctx: pyAst.Load() }),
      args: [left, right],
      keywords: []
    });
  }

  // Comparison operators
  const opMap = {
    '<': pyAst.Lt(),
    '<=': pyAst.LtE(),
    '>': pyAst.Gt(),
    '>=': pyAst.GtE()
  };

  if (opMap[node.operator]) {
    return pyAst.Compare({
      left,
      ops: [opMap[node.operator]],
      comparators: [right]
    });
  }

  throw new UnsupportedNodeError(node, `Binary operator not yet implemented: ${node.operator}`);
}
```

---

### 7. Logical Operators (Walrus-Based)

**LogicalExpression**:
```javascript
visitLogicalExpression(node) {
  const temp = this.allocateTemp();
  this.importManager.addRuntime('js_truthy');

  const leftWalrus = pyAst.NamedExpr({
    target: pyAst.Name({ id: temp, ctx: pyAst.Store() }),
    value: this.visitNode(node.left)
  });

  const tempLoad = pyAst.Name({ id: temp, ctx: pyAst.Load() });
  const right = this.visitNode(node.right);

  if (node.operator === '&&') {
    // a && b → (b if js_truthy(__js_tmp1 := a) else __js_tmp1)
    return pyAst.IfExp({
      test: pyAst.Call({
        func: pyAst.Name({ id: 'js_truthy', ctx: pyAst.Load() }),
        args: [leftWalrus],
        keywords: []
      }),
      body: right,
      orelse: tempLoad
    });
  }

  if (node.operator === '||') {
    // a || b → (__js_tmp1 if js_truthy(__js_tmp1 := a) else b)
    return pyAst.IfExp({
      test: pyAst.Call({
        func: pyAst.Name({ id: 'js_truthy', ctx: pyAst.Load() }),
        args: [leftWalrus],
        keywords: []
      }),
      body: tempLoad,
      orelse: right
    });
  }

  throw new UnsupportedNodeError(node, `Logical operator not implemented: ${node.operator}`);
}
```

**CRITICAL**: Single-evaluation via walrus operator; returns original operand values, not booleans.

---

### 8. UnaryExpression

**Implementation**:
```javascript
visitUnaryExpression(node) {
  if (node.operator === '!') {
    this.importManager.addRuntime('js_truthy');
    return pyAst.UnaryOp({
      op: pyAst.Not(),
      operand: pyAst.Call({
        func: pyAst.Name({ id: 'js_truthy', ctx: pyAst.Load() }),
        args: [this.visitNode(node.argument)],
        keywords: []
      })
    });
  }

  if (node.operator === '-') {
    // Handle -Infinity specially (see Identifier section above)
    if (node.argument.type === 'Identifier' && node.argument.name === 'Infinity') {
      this.importManager.addStdlib('math');
      return pyAst.UnaryOp({
        op: pyAst.USub(),
        operand: pyAst.Attribute({
          value: pyAst.Name({ id: '_js_math', ctx: pyAst.Load() }),
          attr: 'inf',
          ctx: pyAst.Load()
        })
      });
    }

    // Regular unary minus (for now, direct)
    return pyAst.UnaryOp({
      op: pyAst.USub(),
      operand: this.visitNode(node.argument)
    });
  }

  // +, typeof, delete, void deferred to other specs
  throw new UnsupportedFeatureError(
    'unary-op',
    node,
    `Unary operator '${node.operator}' not yet implemented`,
    'E_UNARY_OP'
  );
}
```

---

### 9. ConditionalExpression (Ternary)

**Implementation**:
```javascript
visitConditionalExpression(node) {
  this.importManager.addRuntime('js_truthy');

  return pyAst.IfExp({
    test: pyAst.Call({
      func: pyAst.Name({ id: 'js_truthy', ctx: pyAst.Load() }),
      args: [this.visitNode(node.test)],
      keywords: []
    }),
    body: this.visitNode(node.consequent),
    orelse: this.visitNode(node.alternate)
  });
}
```

---

## Error Codes

This spec introduces these error codes:

- `E_COMPUTED_KEY`: Computed object keys not supported
- `E_OBJECT_KEY`: Invalid object key type
- `E_UNARY_OP`: Unary operator not yet implemented

---

## Acceptance Tests

### Test: Literals
```javascript
// Input
null;
42;
"hello";
true;

// Expected Python
None
42
'hello'
True
```

### Test: Global Identifiers
```javascript
// Input
undefined;
NaN;
Infinity;
-Infinity;

// Expected Python
JSUndefined
float('nan')
_js_math.inf
-_js_math.inf
```

### Test: Arrays and Objects
```javascript
// Input
[1, 2, 3];
{a: 1, 'b': 2};

// Expected Python
[1, 2, 3]
{'a': 1, 'b': 2}
```

### Test: Member Access
```javascript
// Input
'hello'.length;
arr.length;
obj.prop;
obj['key'];

// Expected Python
len('hello')
len(arr)
obj['prop']
obj['key']
```

### Test: Strict Equality
```javascript
// Input
{} === {};
var a = {}; a === a;
NaN === NaN;
null === null;
undefined === undefined;

// Expected Results
js_strict_eq({}, {}) → False
js_strict_eq(a, a) → True
js_strict_eq(NaN, NaN) → False
js_strict_eq(None, None) → True
js_strict_eq(JSUndefined, JSUndefined) → True
```

### Test: Logical Operators
```javascript
// Input
'a' && 0;
0 || 'x';
f() && g();

// Expected Behavior
('a' && 0) → returns 0 (not False)
(0 || 'x') → returns 'x' (not True)
f() evaluated once; g() only if f() truthy
```

### Test: Ternary
```javascript
// Input
x ? 1 : 0;
[] ? 'truthy' : 'falsy';

// Expected Python
(1 if js_truthy(x) else 0)
('truthy' if js_truthy([]) else 'falsy')  # Empty array is truthy
```

---

## Done Criteria

- [x] `visitLiteral` handles string, number, boolean, null
- [x] `visitIdentifier` handles global mappings and sanitization
- [x] `visitArrayExpression` and `visitObjectExpression` implemented
- [x] `visitMemberExpression` uses subscript access (`.length` → `len()`)
- [x] `visitBinaryExpression` implements `===`, `!==`, comparison ops
- [x] `visitLogicalExpression` uses walrus operator for single-eval
- [x] `visitUnaryExpression` handles `!`, `-`, `-Infinity`
- [x] `visitConditionalExpression` wraps test with `js_truthy()`
- [x] `js_strict_eq()` and `js_strict_neq()` runtime helpers added
- [x] All acceptance tests pass (38/38 tests)
- [x] Import manager tracks `JSUndefined`, `js_truthy`, `js_strict_eq`, `_js_math`

---

## Notes for Implementers

1. **Strict Equality Validator**: Consider adding a post-transform validator (as in Phase 4.1) to ensure NO direct Python `==` for `===`. This prevents regressions.

2. **Logical Operators**: The walrus pattern is essential. Test thoroughly with side effects: `(f() && g())` should evaluate `f()` exactly once.

3. **Member Access**: Always subscript except `.length` reads. This avoids attribute shadowing and works for dicts.

4. **Global Identifiers**: `undefined`, `NaN`, `Infinity` must be handled before sanitization lookup.

5. **Object Keys**: Error on computed keys immediately. Only identifier and string-literal keys are supported.

---

## Timeline

**Day 1**:
- [ ] Implement runtime helpers (`js_strict_eq`, `js_strict_neq`)
- [ ] Implement `visitLiteral` and `visitIdentifier`

**Day 2**:
- [ ] Implement `visitArrayExpression`, `visitObjectExpression`
- [ ] Implement `visitMemberExpression` with `.length` special case

**Day 3**:
- [ ] Implement `visitBinaryExpression` (strict equality, comparison)
- [ ] Implement `visitLogicalExpression` with walrus operator

**Day 4**:
- [ ] Implement `visitUnaryExpression` and `visitConditionalExpression`
- [ ] Write acceptance tests
- [ ] Review and mark S2 complete
