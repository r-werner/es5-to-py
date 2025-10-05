# S5: For + Sequence + Update

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

This spec implements C-style for loops with continue-update injection, SequenceExpression in for-init/update contexts, and UpdateExpression (`++`/`--`).

**Goal**: Transform JavaScript for-loops to Python while-loops with correct continue semantics, support comma operator in for contexts, and handle increment/decrement operators.

---

## Scope

### In Scope

**For Loops (C-style)**:
- `for(init; test; update)` desugared to `init; while(test) { body; update; }`
- Continue-update injection: rewrite `continue` in loop body to execute update first
- Loop ID tagging to prevent incorrect update injection in nested loops

**SequenceExpression (Comma Operator)**:
- Support in for-init and for-update contexts ONLY
- `for(i=0, j=0; ...; i++, j++)` → emit each expression as separate statement
- Error with `E_SEQUENCE_EXPR_CONTEXT` if found outside for-init/update

**UpdateExpression (`++`/`--`)**:
- Prefix and postfix increment/decrement
- Support in for-update clause (most common)
- Optional: expression contexts via runtime helpers or inline code

### Out of Scope (Deferred to Later Specs)

- For-in loops → S6
- Switch statements → S6

---

## Implementation Requirements

### 1. For Loop Desugaring

**ForStatement**:
```javascript
visitForStatement(node) {
  // Desugar to: init; while(test) { body; update; }

  const loopId = node._loopId; // From ancestry tagger
  const statements = [];

  // Emit init
  if (node.init) {
    if (node.init.type === 'SequenceExpression') {
      // Multiple init expressions
      for (const expr of node.init.expressions) {
        statements.push(pyAst.Expr({ value: this.visitNode(expr) }));
      }
    } else {
      const initStmt = this.visitNode(node.init);
      if (Array.isArray(initStmt)) {
        statements.push(...initStmt);
      } else {
        statements.push(initStmt);
      }
    }
  }

  // Build while loop
  this.importManager.addRuntime('js_truthy');

  let test;
  if (node.test) {
    test = pyAst.Call({
      func: pyAst.Name({ id: 'js_truthy', ctx: pyAst.Load() }),
      args: [this.visitNode(node.test)],
      keywords: []
    });
  } else {
    test = pyAst.Constant({ value: true });
  }

  // Transform body with continue-update injection
  const body = this.transformForBody(node.body, node.update, loopId);

  // Append update at end of body (for normal flow)
  if (node.update) {
    if (node.update.type === 'SequenceExpression') {
      for (const expr of node.update.expressions) {
        body.push(pyAst.Expr({ value: this.visitNode(expr) }));
      }
    } else {
      body.push(pyAst.Expr({ value: this.visitNode(node.update) }));
    }
  }

  statements.push(pyAst.While({
    test,
    body: body.length > 0 ? body : [pyAst.Pass()],
    orelse: []
  }));

  return statements;
}
```

**Continue-Update Injection**:
```javascript
transformForBody(bodyNode, updateNode, loopId) {
  // Transform body and inject update before continue statements

  const body = this.visitStatement(bodyNode);

  if (!updateNode) {
    return body; // No update to inject
  }

  // Recursively find and rewrite continue statements
  return this.injectUpdateBeforeContinue(body, updateNode, loopId);
}

injectUpdateBeforeContinue(statements, updateNode, loopId) {
  const result = [];

  for (const stmt of statements) {
    if (stmt.type === 'Continue') {
      // Check if this continue belongs to this loop
      // (use metadata from ancestry tagger)
      if (stmt._currentLoopId === loopId) {
        // Inject update before continue
        if (updateNode.type === 'SequenceExpression') {
          for (const expr of updateNode.expressions) {
            result.push(pyAst.Expr({ value: this.visitNode(expr) }));
          }
        } else {
          result.push(pyAst.Expr({ value: this.visitNode(updateNode) }));
        }
      }
      result.push(stmt);
    } else if (stmt.body) {
      // Recurse into blocks (if, while, etc.)
      stmt.body = this.injectUpdateBeforeContinue(stmt.body, updateNode, loopId);
      result.push(stmt);
    } else {
      result.push(stmt);
    }
  }

  return result;
}
```

---

### 2. SequenceExpression

**Implementation**:
```javascript
visitSequenceExpression(node) {
  // Check context: only allowed in for-init/update
  if (!this.isForContext()) {
    throw new UnsupportedFeatureError(
      'sequence-expr',
      node,
      'SequenceExpression (comma operator) is only supported in for-loop init/update clauses. Refactor to separate statements.',
      'E_SEQUENCE_EXPR_CONTEXT'
    );
  }

  // Return expressions array (handled by caller)
  return node.expressions.map(expr => this.visitNode(expr));
}

isForContext() {
  // Track context flag during for-loop init/update transformation
  return this.inForInitOrUpdate;
}
```

**Context Tracking** (in `visitForStatement`):
```javascript
visitForStatement(node) {
  // ... init transformation ...
  this.inForInitOrUpdate = true;

  if (node.init && node.init.type === 'SequenceExpression') {
    // Handle SequenceExpression
  }

  if (node.update && node.update.type === 'SequenceExpression') {
    // Handle SequenceExpression
  }

  this.inForInitOrUpdate = false;
  // ... rest of transformation ...
}
```

---

### 3. UpdateExpression (`++`/`--`)

**For-Update Clause** (Simple):
```javascript
visitUpdateExpression(node) {
  const arg = node.argument;

  if (arg.type === 'Identifier') {
    const sanitized = this.identifierMapper.lookup(arg.name);
    const name = pyAst.Name({ id: sanitized, ctx: pyAst.Load() });

    if (node.operator === '++') {
      // i++ or ++i → i = js_add(i, 1)
      this.importManager.addRuntime('js_add');
      return pyAst.Assign({
        targets: [pyAst.Name({ id: sanitized, ctx: pyAst.Store() })],
        value: pyAst.Call({
          func: pyAst.Name({ id: 'js_add', ctx: pyAst.Load() }),
          args: [name, pyAst.Constant({ value: 1 })],
          keywords: []
        })
      });
    }

    if (node.operator === '--') {
      // i-- or --i → i = js_sub(i, 1)
      this.importManager.addRuntime('js_sub');
      return pyAst.Assign({
        targets: [pyAst.Name({ id: sanitized, ctx: pyAst.Store() })],
        value: pyAst.Call({
          func: pyAst.Name({ id: 'js_sub', ctx: pyAst.Load() }),
          args: [name, pyAst.Constant({ value: 1 })],
          keywords: []
        })
      });
    }
  }

  if (arg.type === 'MemberExpression') {
    // Member target: single-evaluation required
    // For now, defer to runtime helpers or error
    throw new UnsupportedFeatureError(
      'update-expr-member',
      node,
      'UpdateExpression on member expression not yet implemented',
      'E_UPDATE_EXPR_MEMBER'
    );
  }

  throw new UnsupportedNodeError(node, `UpdateExpression target not supported: ${arg.type}`);
}
```

**Expression Contexts (Optional)**:
For expression contexts (e.g., `var x = i++;`), need to distinguish prefix vs postfix:
```javascript
visitUpdateExpression(node) {
  // ... existing code ...

  if (this.isExpressionContext(node)) {
    // Postfix: return old value, then increment
    // Prefix: increment, then return new value
    // Use runtime helpers or walrus operator
    throw new UnsupportedFeatureError(
      'update-expr-context',
      node,
      'UpdateExpression in expression context not yet implemented (use statement context)',
      'E_UPDATE_EXPR_CONTEXT'
    );
  }

  // ... statement context code ...
}
```

---

## Error Codes

This spec introduces these error codes:

- `E_SEQUENCE_EXPR_CONTEXT`: SequenceExpression outside for-init/update
- `E_UPDATE_EXPR_MEMBER`: UpdateExpression on member expression
- `E_UPDATE_EXPR_CONTEXT`: UpdateExpression in expression context

---

## Acceptance Tests

### Test: For Loop Desugaring
```javascript
// Input
for (var i = 0; i < 10; i++) {
  sum += i;
}

// Expected Python
i = JSUndefined  # Hoisted
i = 0
while js_truthy(js_strict_neq(i, 10)):  # i < 10
    sum = js_add(sum, i)
    i = js_add(i, 1)
```

### Test: For Loop with Continue
```javascript
// Input
for (var i = 0; i < 10; i++) {
  if (i % 2) continue;
  sum += i;
}

// Expected: Update runs before continue
i = JSUndefined
i = 0
while js_truthy(...):
    if js_truthy(js_mod(i, 2)):
        i = js_add(i, 1)  # Update injected
        continue
    sum = js_add(sum, i)
    i = js_add(i, 1)  # Update at end
```

### Test: Nested Loops with Continue
```javascript
// Input
for (var i = 0; i < 3; i++) {
  for (var j = 0; j < 3; j++) {
    if (j == 1) continue;
  }
}

// Expected: Inner continue only triggers inner update
```

### Test: SequenceExpression in For-Init/Update
```javascript
// Input
for (var i = 0, j = 0; i < 10; i++, j++) {
  sum += i + j;
}

// Expected Python
i = JSUndefined
j = JSUndefined
i = 0
j = 0
while js_truthy(...):
    sum = js_add(sum, js_add(i, j))
    i = js_add(i, 1)
    j = js_add(j, 1)
```

### Test: SequenceExpression Error (Outside For)
```javascript
// Input
var x = (a(), b(), c());

// Expected Error
E_SEQUENCE_EXPR_CONTEXT: "SequenceExpression (comma operator) is only supported in for-loop init/update clauses. Refactor to separate statements."
```

### Test: UpdateExpression in For-Update
```javascript
// Input
for (var i = 0; i < 3; i++) { }
for (var i = 0; i < 3; ++i) { }

// Expected: Both work (prefix/postfix same in statement context)
```

---

## Done Criteria

- [ ] `visitForStatement` desugars to `init; while(test) { body; update; }`
- [ ] Continue-update injection with loop ID tracking
- [ ] Nested loops handle continues correctly (no cross-contamination)
- [ ] `visitSequenceExpression` with context validation
- [ ] Error on SequenceExpression outside for-init/update
- [ ] `visitUpdateExpression` for identifier targets in for-update
- [ ] All acceptance tests pass

---

## Notes for Implementers

1. **Continue-Update Injection**: CRITICAL to execute update before continue. Use loop ID to match continues to their loops.

2. **SequenceExpression**: Comma operator ONLY in for-init/update. Error everywhere else. This simplifies implementation and covers 99% of real code.

3. **UpdateExpression**: Prefix vs postfix only matters in expression contexts. In for-update (statement context), they're equivalent.

4. **Nested Loops**: Ancestry tagger from S4 provides loop IDs. Use them to prevent incorrect update injection.

5. **Multiple Continues**: Test with multiple continues in same loop body. Each should inject update.

---

## Timeline

**Day 1**:
- [ ] Implement for-loop desugaring
- [ ] Implement continue-update injection with loop ID tracking

**Day 2**:
- [ ] Implement SequenceExpression with context validation
- [ ] Test nested loops with continues

**Day 3**:
- [ ] Implement UpdateExpression for for-update clause
- [ ] Write acceptance tests

**Day 4**:
- [ ] Review and mark S5 complete
