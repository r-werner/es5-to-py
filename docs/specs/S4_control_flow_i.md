# S4: Control Flow I

**Status**: ✅ Complete (2025-10-06)
**Dependencies**: S0, S1, S3
**Estimated Effort**: 2-3 days
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

This spec implements control flow structures: variable hoisting, if/else statements, while loops, and break/continue statements with validation.

**Goal**: Transform JavaScript control flow to Python with correct hoisting semantics, truthiness wrapping, and break/continue validation.

---

## Scope

### In Scope

**Variable Hoisting**:
- Two-pass per function: collect all `var` declarations, emit at function top
- Uninitialized vars → `JSUndefined` (not `None`)

**If/Else Statements**:
- `IfStatement` → Python `If` with `js_truthy()` on test
- `else` and `else if` chains

**While Loops**:
- `WhileStatement` → Python `While` with `js_truthy()` on test

**Break and Continue**:
- `BreakStatement` → Python `Break`
- `ContinueStatement` → Python `Continue`
- Validation pre-pass: tag nodes with loop/switch ancestry
- Error on `continue` in switch, `break` outside loop/switch, `continue` outside loop

### Out of Scope (Deferred to Later Specs)

- For loops → S5
- Switch statements → S6
- For-in loops → S6
- Try/catch/finally → Out of scope (not supported)

---

## Implementation Requirements

### 1. Variable Hoisting (Two-Pass)

**First Pass: Collect `var` Declarations**:
```javascript
collectVarDeclarations(node) {
  const vars = new Set();

  function traverse(n) {
    if (n.type === 'VariableDeclaration' && n.kind === 'var') {
      for (const decl of n.declarations) {
        vars.add(decl.id.name);
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
  }

  traverse(node);
  return vars;
}
```

**Emit Hoisted Initializers**:
```javascript
generateHoistedVars(varNames) {
  this.importManager.addRuntime('JSUndefined');

  return Array.from(varNames).map(name => {
    const sanitized = this.identifierMapper.declare(name);
    return pyAst.Assign({
      targets: [pyAst.Name({ id: sanitized, ctx: pyAst.Store() })],
      value: pyAst.Name({ id: 'JSUndefined', ctx: pyAst.Load() })
    });
  });
}
```

**Updated FunctionDeclaration**:
```javascript
visitFunctionDeclaration(node) {
  // ... existing code ...

  // First pass: collect vars
  const hoistedVars = this.collectVarDeclarations(node.body);

  // Generate hoisted initializers
  const hoistedStmts = this.generateHoistedVars(hoistedVars);

  // Second pass: transform body (skip duplicate initializers)
  const bodyStmts = this.visitBlockStatement(node.body, hoistedVars);

  const body = [...hoistedStmts, ...bodyStmts];

  // ... rest of function def ...

  return pyAst.FunctionDef({
    name: funcName,
    args: pyAst.arguments({ ... }),
    body: body.length > 0 ? body : [pyAst.Pass()],
    decorator_list: [],
    returns: null
  });
}
```

---

### 2. If/Else Statements

**IfStatement**:
```javascript
visitIfStatement(node) {
  this.importManager.addRuntime('js_truthy');

  const test = pyAst.Call({
    func: pyAst.Name({ id: 'js_truthy', ctx: pyAst.Load() }),
    args: [this.visitNode(node.test)],
    keywords: []
  });

  const body = this.visitStatement(node.consequent);
  const orelse = node.alternate ? this.visitStatement(node.alternate) : [];

  return pyAst.If({ test, body, orelse });
}

visitStatement(node) {
  if (node.type === 'BlockStatement') {
    return this.visitBlockStatement(node);
  } else {
    // Single statement
    const stmt = this.visitNode(node);
    return Array.isArray(stmt) ? stmt : [stmt];
  }
}
```

---

### 3. While Loops

**WhileStatement**:
```javascript
visitWhileStatement(node) {
  this.importManager.addRuntime('js_truthy');

  const test = pyAst.Call({
    func: pyAst.Name({ id: 'js_truthy', ctx: pyAst.Load() }),
    args: [this.visitNode(node.test)],
    keywords: []
  });

  const body = this.visitStatement(node.body);

  return pyAst.While({
    test,
    body,
    orelse: []
  });
}
```

---

### 4. Break and Continue Validation (Pre-Pass)

**Ancestry Tagging**:
```javascript
class AncestryTagger {
  constructor() {
    this.loopStack = [];
    this.switchStack = [];
    this.loopIdCounter = 0;
  }

  tagAST(ast) {
    this.traverse(ast);
  }

  traverse(node, parent = null) {
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
        // Check if innermost context is switch
        // (complex check; for now, error if any switch in stack)
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

    // Recurse
    for (const key in node) {
      if (key.startsWith('_')) continue; // Skip metadata
      if (node[key] && typeof node[key] === 'object') {
        if (Array.isArray(node[key])) {
          node[key].forEach(child => this.traverse(child, node));
        } else {
          this.traverse(node[key], node);
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
```

**Use in Transformer**:
```javascript
transform(jsAst) {
  // Pre-pass: tag ancestry
  const tagger = new AncestryTagger();
  tagger.tagAST(jsAst);

  // Transform
  return this.visitNode(jsAst);
}
```

---

### 5. Break and Continue Statements

**BreakStatement**:
```javascript
visitBreakStatement(node) {
  return pyAst.Break();
}
```

**ContinueStatement**:
```javascript
visitContinueStatement(node) {
  return pyAst.Continue();
}
```

**Note**: Loop-specific continue handling (for update injection) is in S5.

---

## Error Codes

This spec introduces these error codes:

- `E_BREAK_OUTSIDE`: Break statement outside loop or switch
- `E_CONTINUE_OUTSIDE`: Continue statement outside loop
- `E_CONTINUE_IN_SWITCH`: Continue inside switch

---

## Acceptance Tests

### Test: Variable Hoisting
```javascript
// Input
function test() {
  if (true) {
    var x = 1;
  }
  return x;
}

// Expected Python
def test():
    x = JSUndefined  # Hoisted
    if js_truthy(True):
        x = 1
    return x
```

### Test: Uninitialized Var
```javascript
// Input
function test() {
  var x;
  return typeof x;
}

// Expected
def test():
    x = JSUndefined
    return js_typeof(x)  # 'undefined'
```

### Test: If/Else
```javascript
// Input
if ([]) { return 1; }

// Expected
if js_truthy([]):  # Empty array is truthy
    return 1
```

### Test: While Loop
```javascript
// Input
while (x) {
  x--;
}

// Expected
while js_truthy(x):
    x = js_sub(x, 1)
```

### Test: Break/Continue Validation
```javascript
// Input (valid)
while (true) {
  if (x) break;
  if (y) continue;
}

// Input (error)
if (true) break;  // ERROR: E_BREAK_OUTSIDE

// Input (error)
while (true) {
  switch (x) {
    case 1:
      continue;  // ERROR: E_CONTINUE_IN_SWITCH
  }
}
```

### Test: Nested Loops with Continue
```javascript
// Input
for (var i = 0; i < 3; i++) {
  for (var j = 0; j < 3; j++) {
    if (j == 1) continue;  // Inner continue only
  }
}

// Expected: Inner continue does NOT trigger outer loop update
```

---

## Done Criteria

- [x] Two-pass variable hoisting implemented (`collectVarDeclarations`, `generateHoistedVars`)
- [x] Hoisted vars initialized to `JSUndefined` at function top (excluding parameters)
- [x] `visitIfStatement` with `js_truthy()` wrapping
- [x] `visitWhileStatement` with `js_truthy()` wrapping
- [x] Ancestry tagging pre-pass (`AncestryTagger` class) for break/continue validation
- [x] `visitBreakStatement` and `visitContinueStatement`
- [x] Error on continue inside switch (`E_CONTINUE_IN_SWITCH`)
- [x] All acceptance tests pass (104/104 tests passing)

**Implementation Notes:**
- Acorn parser validates break/continue placement at parse time, so bare break/continue outside loops/switches throw `SyntaxError` before reaching the transformer
- Our `AncestryTagger` primarily validates the switch+continue case that acorn allows but we don't support
- Single-statement support works for both if and while (e.g., `if (x) return 1;`)
- Nested loops are properly tagged with unique loop IDs

---

## Notes for Implementers

1. **Hoisting**: Collect vars from entire function body, including nested blocks. Skip nested functions.

2. **JSUndefined**: Hoisted vars must use `JSUndefined`, not `None`. This preserves `typeof x === 'undefined'` semantics.

3. **Ancestry Tagging**: Run pre-pass before transformation. Annotate nodes with loop/switch IDs for validation.

4. **Continue in Switch**: Error immediately. No workaround in Python.

5. **Nested Loops**: Loop ID tagging prevents cross-contamination. Each continue targets its own loop.

---

## Timeline

**Day 1**:
- [ ] Implement two-pass variable hoisting
- [ ] Test hoisting with nested blocks

**Day 2**:
- [ ] Implement if/else and while statements
- [ ] Implement ancestry tagging pre-pass

**Day 3**:
- [ ] Implement break/continue with validation
- [ ] Write acceptance tests
- [ ] Review and mark S4 complete
