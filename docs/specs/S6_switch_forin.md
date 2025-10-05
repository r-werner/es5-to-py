# S6: Switch + For-in

**Status**: ❌ Not Started
**Dependencies**: S0, S1, S3, S4
**Estimated Effort**: 3-4 days

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

This spec implements switch statements with strict equality matching and for-in loops with keys as strings.

**Goal**: Transform JavaScript switch to Python while-loop structure with strict equality checks, and for-in to iterate over string keys while skipping array holes.

---

## Scope

### In Scope

**Switch Statements**:
- Transform to `while True` block with nested `if/elif/else`
- Discriminant caching in temp variable (single-evaluation)
- Strict equality (`js_strict_eq`) for ALL case matching
- Static validation for fall-through between non-empty cases
- Error on `continue` inside switch
- Synthesize `break` at end of each case if not present

**For-in Loops**:
- `ForInStatement` → `for key in js_for_in_keys(obj)`
- Runtime helper `js_for_in_keys()` yields keys as strings
- Skip array holes (JSUndefined values)
- Dict: yield keys as strings
- List: yield indices as strings ('0', '1', ...)

### Out of Scope

- Switch fall-through (error on non-empty → non-empty without break)

---

## Implementation Requirements

### 1. Runtime Helper for For-in

**Add to `runtime/js_compat.py`**:
```python
def js_for_in_keys(obj):
    """
    JavaScript for-in enumeration.

    - Dict: yield keys converted to strings
    - List: yield indices as strings ('0', '1', ...), skip holes (JSUndefined)
    - String: yield indices as strings
    - Otherwise: empty iterator

    CRITICAL: ALL keys are strings to match JS for-in behavior.
    """
    if isinstance(obj, dict):
        for key in obj:
            yield str(key)
    elif isinstance(obj, list):
        for i, val in enumerate(obj):
            if val is not JSUndefined:  # Skip holes
                yield str(i)
    elif isinstance(obj, str):
        for i in range(len(obj)):
            yield str(i)
    # Otherwise: no iteration
```

**Add to `__all__`**: `'js_for_in_keys'`

---

### 2. Switch Statement

**Static Validation (pre-pass)**:
```javascript
validateSwitch(node) {
  const cases = node.cases;

  for (let i = 0; i < cases.length; i++) {
    const currentCase = cases[i];
    const isDefaultCase = currentCase.test === null;

    // Check if case body is non-empty
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
            `Fall-through between non-empty cases is unsupported. Add explicit break statement at line ${currentCase.loc.start.line}.`,
            'E_SWITCH_FALLTHROUGH'
          );
        }
      }
    }
  }
}
```

**Switch Transformation**:
```javascript
visitSwitchStatement(node) {
  // Validate
  this.validateSwitch(node);

  // Cache discriminant
  const discTemp = `__js_switch_disc_${node._switchId || this.allocateSwitchId()}`;
  const discAssign = pyAst.Assign({
    targets: [pyAst.Name({ id: discTemp, ctx: pyAst.Store() })],
    value: this.visitNode(node.discriminant)
  });

  // Build if/elif/else chain
  this.importManager.addRuntime('js_strict_eq');

  const conditions = [];
  const bodies = [];

  for (const caseNode of node.cases) {
    if (caseNode.test === null) {
      // Default case
      conditions.push(null);
    } else {
      // Regular case: js_strict_eq(disc, caseValue)
      conditions.push(pyAst.Call({
        func: pyAst.Name({ id: 'js_strict_eq', ctx: pyAst.Load() }),
        args: [
          pyAst.Name({ id: discTemp, ctx: pyAst.Load() }),
          this.visitNode(caseNode.test)
        ],
        keywords: []
      }));
    }

    // Transform case body
    const body = caseNode.consequent.map(stmt => this.visitNode(stmt)).flat();

    // Synthesize break if not present
    if (body.length > 0) {
      const lastStmt = body[body.length - 1];
      const hasTerminator = ['Break', 'Return'].includes(lastStmt.type);
      if (!hasTerminator) {
        body.push(pyAst.Break());
      }
    } else {
      // Empty case: will be merged with next non-empty case
    }

    bodies.push(body);
  }

  // Build nested if/elif/else
  const ifChain = this.buildSwitchChain(conditions, bodies);

  // Wrap in while True
  const whileLoop = pyAst.While({
    test: pyAst.Constant({ value: true }),
    body: [ifChain, pyAst.Break()],  // Safety break
    orelse: []
  });

  return [discAssign, whileLoop];
}

buildSwitchChain(conditions, bodies) {
  // Merge empty cases with next non-empty case (alias handling)
  const merged = [];
  let currentConditions = [];

  for (let i = 0; i < conditions.length; i++) {
    if (bodies[i].length === 0) {
      // Empty case: accumulate condition
      if (conditions[i] !== null) {
        currentConditions.push(conditions[i]);
      }
    } else {
      // Non-empty case
      if (currentConditions.length > 0) {
        // Merge: if (cond1 or cond2 or ...): body
        const orExpr = currentConditions.reduce((acc, cond) =>
          pyAst.BoolOp({ op: pyAst.Or(), values: [acc, cond] })
        );
        merged.push({ test: orExpr, body: bodies[i] });
        currentConditions = [];
      } else {
        merged.push({ test: conditions[i], body: bodies[i] });
      }
    }
  }

  // Build if/elif/else
  if (merged.length === 0) {
    return pyAst.Pass();
  }

  const first = merged[0];
  let ifNode;

  if (first.test === null) {
    // Default case first (unusual)
    ifNode = pyAst.If({
      test: pyAst.Constant({ value: true }),
      body: first.body,
      orelse: []
    });
  } else {
    ifNode = pyAst.If({
      test: first.test,
      body: first.body,
      orelse: []
    });
  }

  let current = ifNode;
  for (let i = 1; i < merged.length; i++) {
    const { test, body } = merged[i];

    if (test === null) {
      // Default case
      current.orelse = body;
    } else {
      // elif
      const elifNode = pyAst.If({ test, body, orelse: [] });
      current.orelse = [elifNode];
      current = elifNode;
    }
  }

  return ifNode;
}
```

---

### 3. For-in Statement

**Implementation**:
```javascript
visitForInStatement(node) {
  this.importManager.addRuntime('js_for_in_keys');

  // Handle left side (var declaration or identifier)
  let iterVar;
  if (node.left.type === 'VariableDeclaration') {
    const decl = node.left.declarations[0];
    iterVar = this.identifierMapper.declare(decl.id.name);
  } else if (node.left.type === 'Identifier') {
    iterVar = this.identifierMapper.lookup(node.left.name);
  } else {
    throw new UnsupportedNodeError(node.left, `Unsupported for-in left: ${node.left.type}`);
  }

  const iterable = pyAst.Call({
    func: pyAst.Name({ id: 'js_for_in_keys', ctx: pyAst.Load() }),
    args: [this.visitNode(node.right)],
    keywords: []
  });

  const body = this.visitStatement(node.body);

  return pyAst.For({
    target: pyAst.Name({ id: iterVar, ctx: pyAst.Store() }),
    iter: iterable,
    body,
    orelse: []
  });
}
```

---

## Error Codes

- `E_SWITCH_FALLTHROUGH`: Fall-through between non-empty cases

---

## Acceptance Tests

### Test: Switch with Strict Equality
```javascript
switch (x) {
  case 1: return 'one';
  case '1': return 'string one';
  default: return 'other';
}

// Expected: 1 and '1' are different cases (strict equality)
```

### Test: Switch with Case Aliases
```javascript
switch (x) {
  case 1:
  case 2:
  case 3:
    return 'small';
  case 10:
    return 'ten';
}

// Expected: cases 1, 2, 3 merge via OR condition
```

### Test: Switch Discriminant Caching
```javascript
var i = 0;
switch (i++) {
  case 0:
    i = 10;
    break;
  case 1:
    return 'matched 1';
}

// Expected: Discriminant evaluated once (i++ happens once), doesn't re-dispatch
```

### Test: For-in with Dict
```javascript
for (var k in {a: 1, b: 2}) {
  console.log(k);
}

// Expected: Iterates over 'a', 'b' (strings)
```

### Test: For-in with Array (Indices as Strings)
```javascript
for (var i in [10, 20, 30]) {
  console.log(typeof i);  // 'string'
}

// Expected: Iterates over '0', '1', '2' (strings, not ints)
```

### Test: For-in Skips Array Holes
```javascript
var arr = [1, 2, 3];
delete arr[1];
for (var i in arr) {
  console.log(i);
}

// Expected: Iterates over '0', '2' (skips hole at index 1)
```

---

## Done Criteria

- [ ] `js_for_in_keys()` runtime helper implemented
- [ ] Static validation for switch fall-through
- [ ] `visitSwitchStatement` with discriminant caching and strict equality
- [ ] Case alias merging (consecutive empty cases)
- [ ] Synthesize break at end of case bodies
- [ ] `visitForInStatement` with keys as strings
- [ ] All acceptance tests pass

---

## Timeline

**Day 1-2**: Switch statement transformation and validation
**Day 3**: For-in statement and runtime helper
**Day 4**: Testing and completion
