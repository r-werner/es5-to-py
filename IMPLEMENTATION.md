# ES5-to-Python Transpiler: Detailed Implementation Plan & Progress Tracking

**Status Legend:** ❌ Not Started | 🔄 In Progress | ✅ Complete

---

## Critical Correctness Requirements (READ FIRST)

Before implementing, ensure these key semantic issues are addressed:

1. **Python version requirement**: Python ≥ 3.7 supported (statement-temp mode is default). Python ≥ 3.8 required only for optional `--use-walrus` mode. Document this clearly.

2. **Strict equality for objects/arrays/functions**:
   - **CRITICAL BUG**: Python `==` uses value equality; JS `===` uses identity for objects
   - `{} === {}` → `False` in JS, but `{} == {}` → `True` in Python
   - Must use `js_strict_eq(a, b)` runtime helper for ALL `===` comparisons (including switch cases)
   - Only primitives (string, number, boolean) use value equality; objects/arrays/functions use identity (`is`)

3. **Global identifiers (NaN, Infinity, undefined)**:
   - Map `undefined` identifier → `JSUndefined`
   - Map `NaN` identifier → `float('nan')`
   - Map `Infinity` identifier → `math.inf`
   - Map `-Infinity` → `-math.inf` (handle unary minus on Infinity)

4. **Return without expression**: `return;` (bare return) must emit `return JSUndefined` (NOT Python's implicit `None`). JS `return;` yields `undefined`, not `null`.

5. **Continue in for-loops**: When desugaring `for(init; test; update)` to while, `continue` must execute update before jumping to test. Only rewrite `continue` in the specific desugared loop's body, NOT inner loops. Use loop ID tagging to track which continues belong to which loop.

6. **SequenceExpression (comma operator)**: Support `(a, b, c)` which evaluates left-to-right and returns last value. Common in for-loop init/update: `for(i=0, j=0; ...; i++, j++)`. Ensure single-eval semantics.

7. **null vs undefined**:
   - Create `JSUndefined` sentinel (distinct from Python `None`)
   - `None` represents JS `null`
   - `JSUndefined` represents JS `undefined`
   - Uninitialized vars → `JSUndefined`
   - `typeof null` → `'object'`, `typeof undefined` → `'undefined'`

8. **Augmented assignment semantics**:
   - `+=` must use `js_add(lhs, rhs)` (string concatenation if either operand is string)
   - **Decision required**: For `-=`, `*=`, `/=`, `%=` either:
     - (a) Numeric-only and error on type mismatches (RECOMMENDED for demo), OR
     - (b) Full ToNumber coercion with `js_sub`, `js_mul`, `js_div`, `js_mod`
   - Pick one approach and document in "Known Limitations"

9. **delete on arrays**: Python `del` shifts elements; JS leaves holes. Assign `JSUndefined` at index instead of deleting.

10. **delete on identifiers**: `delete identifier` returns `false` in JS (non-configurable). **Decision**: Use ERROR (recommended) for clarity. Be consistent in transformer + runtime.

11. **Switch case comparison**: Use strict equality (`js_strict_eq`) for case matching, not loose equality. Add static validation pass to detect non-empty fall-through and error early.

12. **Strict equality edge cases**: Handle NaN (`NaN !== NaN`). **Decision on -0 vs +0**: JS treats `-0 === +0` as `true`. Document if skipping -0 distinction (acceptable for demo).

13. **js_truthy coverage**: Include `NaN` as falsy (use `math.isnan()`). Empty arrays/objects are truthy.

14. **String method edge cases**:
    - `charAt(i)`: Use `str[i:i+1]` for out-of-range → empty string
    - `charCodeAt(i)`: Return `float('nan')` for out-of-range
    - `substring(s, e)`: Clamp negatives to 0, swap if start > end

15. **For-in keys**: Always yield **strings** (dict keys, list indices as '0', '1', etc.); skip array holes (JSUndefined). Test sparse arrays and numeric-like string keys.

16. **Member access**: Default to subscript `obj['prop']` for ALL property access (read AND write) to avoid attribute shadowing. Exception: `.length` property detection only.

17. **Logical operators**: Preserve original operand values in short-circuit evaluation, not coerced booleans. Ensure single-eval semantics. Python ≥3.8 uses walrus; provide fallback for 3.7 if needed.

18. **Break/Continue validation**: Add pre-pass to tag nodes with loop/switch ancestry for better error messages ("continue inside switch", "break outside loop").

19. **Error messages**: Include node type, location, "why" explanation, and "what to change" suggestion. Optional: Add error codes (e.g., `E_UNSUPPORTED_FEATURE`) for programmatic filtering.

20. **AssignmentExpression used as expression**: JS allows assignments inside `if`, `while`, logical expressions, and ternaries.
   - **DECISION FOR DEMO**: Default to statement-temp lifting (works Python 3.7+, avoids walrus risks)
   - Alternative (future optimization): Use walrus operator if `@kriss-u/py-ast` verified to support it
   - Pattern (statement-temp): Lift assignment to statement before expression context, use variable in expression
   - `if (x = y)` → `x = y; if js_truthy(x): ...` (statement lifting)
   - `while (x = y)` → `x = y; while js_truthy(x): ... x = y` (re-evaluate in loop)
   - `a && (x = y)` → lift assignment before logical expression
   - **CRITICAL**: Ensure single-evaluation semantics (evaluate RHS once, assign, use value)
   - **CRITICAL**: Handle ALL contexts that can host assignment: if/while tests, logical expressions, ternaries, call args, return values
   - Keep walrus path as optional enhancement (`--use-walrus` flag), not core dependency

21. **Single-evaluation of assignment/update targets**: For `MemberExpression` targets, capture base and key in temps before read/compute/write.
   - `obj().prop += f()` must evaluate `obj()` exactly once
   - `obj[key()]++` must evaluate `obj` and `key()` exactly once
   - Pattern: Capture base/key → read → compute → write using same base/key temps
   - Applies to ALL `AssignmentExpression` and `UpdateExpression` with member targets
   - Create "single-eval assignment target" utility in transformer

22. **SequenceExpression scope**: Limit to for-init/update contexts first. General expression-level support without walrus is complex.
   - **DECISION FOR DEMO**: Support in for-init/update (most common use case)
   - Optional: Support in statement contexts (where lifting to multiple statements is legal)
   - **Defer**: SequenceExpression inside pure expression contexts (nested boolean/logical/ternary) unless using walrus
   - If walrus unavailable and SequenceExpression appears in illegal lifting context → error with clear message
   - Document limits explicitly

23. **Augmented assignment policy**: **DECISION FOR DEMO**: Numeric-only. Error on type mismatches.
   - `+=` uses `js_add` (handles string concat + numeric addition)
   - `-=`, `*=`, `/=`, `%=` are numeric-only; error with code `E_NUM_AUGMENT_COERCION` on type mismatch
   - Document full coercion as future enhancement
   - Simplifies runtime and reduces edge-case bugs

24. **Augmented assignment single-evaluation**: For `obj[key] += val`, temp base/key once:
   - Capture `_base := obj`, `_key := key`, `_val := val`
   - Read: `_base[_key]`
   - Compute: `js_add(_base[_key], _val)`
   - Write: `_base[_key] = result`
   - Ensures all side effects happen exactly once in correct order

25. **Bitwise operators**: All bitwise ops (`|`, `&`, `^`, `~`, `<<`, `>>`, `>>>`) are **out of scope**.
   - Error with code `E_BITWISE_UNSUPPORTED`
   - Message: "Bitwise operators are not supported. Use Math.floor() to truncate or arithmetic equivalents."
   - Add tests that error clearly with helpful alternatives

26. **Array and Object library methods**: Most array/object methods are **out of scope**.
   - Out of scope: `push`, `pop`, `shift`, `unshift`, `splice`, `map`, `filter`, `reduce`, `forEach`, etc.
   - Out of scope: `Object.keys`, `Object.values`, `Object.assign`, etc.
   - Error with code `E_ARRAY_METHOD_UNSUPPORTED` or `E_OBJECT_METHOD_UNSUPPORTED`
   - Message: "Array/Object method 'X' is not supported. Use explicit loops or supported alternatives."
   - Document in "Known Limitations" section

27. **Regex usage beyond literals**: Map common regex usage patterns.
   - Map `regex.test(str)` → `bool(regex.search(str))` or `js_regex_test(regex, str)` helper
   - Map `str.replace(regex, repl)` → `regex.sub(repl, str, count=1)` (single replacement, matches JS default)
   - Document `String.prototype.match`, `RegExp.prototype.exec` as out of scope (or add minimal helpers)
   - Add explicit tests for `.test()` and `replace()` with regex argument

28. **Loose equality guardrails**: Error on unsupported coercions.
   - If either operand to `==`/`!=` is list/dict/callable → error with code `E_LOOSE_EQ_OBJECT`
   - Message: "Loose equality with objects/arrays is not supported (ToPrimitive coercion complexity). Use strict equality (===) or explicit comparison."
   - Only primitives + null/undefined rules are supported in `js_loose_eq`
   - Document exact supported subset in runtime docstring

---

## Phase 1: Skeleton + Core Expressions/Statements

### 1.1 Project Setup
- [ ] ❌ Create project structure (src/, tests/, runtime/)
- [ ] ❌ Initialize package.json with dependencies: `acorn`, `@kriss-u/py-ast`
  - **Pin versions**: Specify exact versions for `acorn` and `@kriss-u/py-ast` for reproducibility
  - Document Node.js version (e.g., Node 18 LTS) and Python version (≥3.7 for statement-temp mode, ≥3.8 for walrus mode)
- [ ] ❌ Configure TypeScript/JavaScript environment
- [ ] ❌ Set up test framework (Jest or similar)
- [ ] ❌ Create basic CLI entry point (`src/cli.ts` or `src/cli.js`)
  - **Default mode**: Statement-temp lifting (Python 3.7+ compatible)
  - Add `--use-walrus` flag to enable walrus operator (requires Python ≥3.8 and `@kriss-u/py-ast` support)
  - Add `--strict` flag to error on any feature requiring nontrivial runtime helpers (optional, handy for demo)
  - Add runtime preflight: Verify Python ≥ 3.8 if walrus is used in emitted code (emit error if not met)
- [ ] ❌ **Optional: Verify walrus support**: Test that `@kriss-u/py-ast` can unparse walrus operator (`:=`)
  - Default to statement-temp pattern; walrus is optional enhancement
  - Document which pattern is used (statement-temp default, walrus optional)

**Deliverable:** Working build system, empty transpiler skeleton that can be invoked

---

### 1.2 Core AST Infrastructure
- [ ] ❌ Create `src/parser.ts`: Wrapper around acorn with config `{ ecmaVersion: 5, sourceType: 'script', locations: true, ranges: true }`
- [ ] ❌ Create `src/errors.ts`: Define `UnsupportedNodeError`, `UnsupportedFeatureError` with source location formatting
- [ ] ❌ Create `src/transformer.ts`: Base visitor class/framework for traversing ESTree AST
- [ ] ❌ Create `src/generator.ts`: Python AST unparsing using `@kriss-u/py-ast`
- [ ] ❌ Create `src/import-manager.ts`: Track required imports (`math`, `random`, `re`, `js_compat`)

**Deliverable:** Pipeline infrastructure: parse JS → transform to Python AST → generate Python code

---

### 1.3 Minimal Runtime Library
- [ ] ❌ Create `runtime/js_compat.py`
- [ ] ❌ Create `JSUndefined` sentinel class (singleton) to represent JavaScript `undefined`
  - **CRITICAL**: Implement as module-level singleton constant `JSUndefined = _JSUndefined()`
  - **NEVER instantiate again**; all checks use identity (`is`), not equality
  - This prevents bugs in sets/dicts and across module boundaries
  - Distinct from Python `None` (which represents JS `null`)
  - Used for uninitialized variables and explicit `undefined` identifier
- [ ] ❌ Implement `js_truthy(x)`: Return `True` for truthy values
  - Falsy: `''` (empty string), `0`, `-0`, `None` (null), `JSUndefined`, `float('nan')` (NaN)
  - Truthy: `[]` (empty list), `{}` (empty dict), all other values (non-empty strings, non-zero numbers, objects)
  - **CRITICAL**: Empty dict/list are truthy (JS semantics); only empty string/0/NaN/undefined/null/−0 are falsy
  - **CRITICAL**: NaN must be falsy (use `math.isnan()` check for float values)
- [ ] ❌ Implement `class JSException(Exception)`: Store arbitrary thrown value in `.value` attribute
- [ ] ❌ Add basic module structure with `__all__` export list

**Deliverable:** Minimal runtime that supports basic truthiness and exception handling

---

### 1.4 Literals and Basic Expressions
- [ ] ❌ Transform `Literal` nodes (string, number, boolean, null → None, regex → defer to Phase 4)
- [ ] ❌ Transform `Identifier` nodes:
  - **CRITICAL**: Map global identifiers: `undefined` → `JSUndefined`, `NaN` → `float('nan')`, `Infinity` → `math.inf`
  - Regular identifiers → direct mapping (no renaming)
  - Add `import math` via import manager when `Infinity` is used
  - Handle unary minus on `Infinity`: `-Infinity` → `-math.inf` (needs UnaryExpression handling)
- [ ] ❌ Transform `ArrayExpression` → Python `List` AST node
- [ ] ❌ Transform `ObjectExpression` → Python `Dict` AST node
  - Support identifier keys: `{a: 1}` → `{'a': 1}`
  - Support string-literal keys: `{'a': 1}` → `{'a': 1}`
  - Error on computed keys: `{[expr]: 1}` → unsupported
- [ ] ❌ Transform arithmetic operators: `+`, `-`, `*`, `/`
  - For `+`: Use runtime helper `js_add(a, b)` (handles number addition vs string concatenation)
  - For `-`, `*`, `/`: Use runtime helpers `js_sub()`, `js_mul()`, `js_div()` for ToNumber coercion
  - OR: Scope to numeric-only operands and error on type mismatches (simpler for demo)
- [ ] ❌ Transform `%` operator → `js_mod(a, b)` runtime helper
  - **CRITICAL**: JS remainder keeps dividend sign; Python % differs with negatives
  - `js_mod(-1, 2)` must return `-1` (not `1` as in Python)
- [ ] ❌ Transform comparison operators: `<`, `<=`, `>`, `>=`
  - Direct mapping for numbers
  - May need runtime helpers if supporting string/number mixed comparisons
- [ ] ❌ Transform `===` and `!==` → `js_strict_eq()` and `js_strict_neq()` runtime helpers
  - **CRITICAL BUG FIX**: Cannot use Python `==` for objects/arrays/functions
  - JS `{} === {}` is `false` (identity); Python `{} == {}` is `True` (value equality)
  - Runtime helper `js_strict_eq(a, b)` must:
    - Handle NaN: `NaN !== NaN` → `True` (use `math.isnan()`)
    - Handle null: `None` identity
    - Handle undefined: `JSUndefined` identity
    - Primitives (string, number, boolean): value equality
    - Objects/arrays/functions: identity check (`a is b`)
  - Use `js_strict_eq` for ALL `===` comparisons (including switch case tests)
- [ ] ❌ Transform `==` and `!=` → `js_loose_eq()` and `js_loose_neq()` calls (add to runtime in Phase 4)
- [ ] ❌ Transform `LogicalExpression` (`&&`, `||`) → **return original operand values** (not booleans)
  - **CRITICAL**: JS returns the actual operand, not a coerced boolean
  - **Default strategy (statement-temp)**:
    - `a && b` → `__js_tmp1 = a; result = b if js_truthy(__js_tmp1) else __js_tmp1`
    - `a || b` → `__js_tmp1 = a; result = __js_tmp1 if js_truthy(__js_tmp1) else b`
  - Alternative (if `--use-walrus`):
    - `a && b` → `(b if js_truthy(_temp := a) else _temp)` using walrus operator
    - `a || b` → `(_temp if js_truthy(_temp := a) else b)` using walrus operator
  - Create temp allocator in transformer state for unique temp names (prefix: `__js_tmp1`, `__js_tmp2`, etc. to avoid user code collisions)
  - Single-eval semantics: Evaluate left operand once, store in temp (important for side effects)
  - **Nested logicals**: Require a temp per short-circuit boundary to ensure single-eval across nesting
    - Example: `a && b && c` → two temps (one for `a`, one for `a && b`)
  - Test with both statement-temp and walrus modes to ensure operand identity preservation
- [ ] ❌ Transform `UnaryExpression`:
  - `!` → `not js_truthy(...)`
  - `-` (unary minus) → direct for numbers, or use `js_negate()` for coercion
  - `+` (unary plus) → `js_to_number(x)` runtime helper for ToNumber coercion
  - `typeof`, `delete` → defer to Phase 4
- [ ] ❌ Transform `ConditionalExpression` (ternary) → Python `IfExp` with `js_truthy()` on test
- [ ] ❌ Create temp allocator utility in transformer for generating unique temp variable names

**Test:** `function add(a, b) { return a + b; }` → `def add(a, b):\n    return js_add(a, b)`

**Test:** `function check(x) { return x ? 1 : 0; }` → uses `js_truthy(x)`

**Test:** `var a = {}; var b = a; a === b` → `True` (identity)

**Test:** `{} === {}` → `False` (different objects)

**Test:** `var x = undefined; x === undefined` → `True`

**Test:** `NaN === NaN` → `False`

**Test:** `(f() && g())` → f() evaluated once, g() only if f() truthy, returns g()'s value or f()'s value

**Test (nested logicals):** `a && b && c` → temp for `a`, temp for `a && b`; single-eval across nesting

**Test (logical with side effects):** `(x = 1) && (y = 2)` → both assignments happen if first is truthy; returns second assignment value

---

### 1.5 Variable Declarations and Assignments
- [ ] ❌ Transform `VariableDeclaration`: Collect `var` names (first pass, defer hoisting to Phase 2)
- [ ] ❌ Transform `VariableDeclarator` with initializer → Python `Assign`
- [ ] ❌ Transform `AssignmentExpression`:
  - **CRITICAL**: Handle assignment used as expression (see Critical Correctness #20)
    - **Default strategy**: Statement-temp lifting (works on Python 3.7+)
    - `if (x = y)` → lift to statement: `x = y; if js_truthy(x): ...`
    - `while (x = y)` → `x = y; while js_truthy(x): ... x = y` (re-evaluate in loop)
    - `a && (x = y)` → lift assignment before logical expression
    - Call args, return values, etc.: Lift to statement before usage
    - Alternative (if `--use-walrus`): Use walrus operator `(_temp := expr)` pattern
    - Ensure single-evaluation (evaluate RHS once, assign, use value)
  - `=` → `Assign`
  - `+=` → **CRITICAL**: Use `js_add(lhs, rhs)` (handles string concat + numeric addition)
  - `-=`, `*=`, `/=`, `%=` → **Numeric-only** (demo decision); error on type mismatch with code `E_NUM_AUGMENT_COERCION`
  - Transform to: `lhs = js_add(lhs, rhs)` (not Python AugAssign which has different semantics)
- [ ] ❌ **Single-evaluation for member targets** (see Critical Correctness #21, #23):
  - For `MemberExpression` target: Capture base and key in temps before read/compute/write
  - Pattern: `_base := base_expr`, `_key := key_expr`, read `_base[_key]`, compute, write `_base[_key] = result`
  - Ensures `obj().prop += f()` evaluates `obj()` and `f()` exactly once
  - Create "single-eval assignment target" utility in transformer
- [ ] ❌ Support assignment targets: `Identifier`, `MemberExpression` (dot and bracket both → subscript)

**Test:** `function test() { var x = 5; x += 10; return x; }` → `x = js_add(x, 10)` → `15`

**Test:** `var s = 'hello'; s += ' world';` → `s = js_add(s, ' world')` → `'hello world'`

**Test:** `var x = 5; x += '3';` → `x = js_add(x, '3')` → `'53'` (string concatenation)

**Test (assignment in condition):** `if (x = f()) { ... }` → `x = f(); if js_truthy(x): ...` (statement-temp pattern)

**Test (assignment in while):** `while (x = next()) { ... }` → `x = next(); while js_truthy(x): ... x = next()` (re-evaluate)

**Test (assignment in logical):** `a && (x = y)` → lift assignment before logical

**Test (assignment in ternary):** `(x = y) ? a : b` → lift assignment before ternary

**Test (assignment in call arg):** `f(x = y)` → `x = y; f(x)` (lift before call)

**Test (assignment in return):** `return (x = y);` → `x = y; return x;` (lift before return)

**Test (member augassign single-eval):** `getObj().prop += f()` → `_base = getObj(); _base['prop'] = js_add(_base['prop'], f())` (evaluates `getObj()` once)

**Test (bracket augassign single-eval):** `obj[g()] += h()` → temps for `obj`, `g()`, `h()`; evaluate each exactly once

---

### 1.6 Function Declarations and Return
- [ ] ❌ Transform `Program` → Python `Module`
- [ ] ❌ Transform `FunctionDeclaration` → Python `FunctionDef`
- [ ] ❌ Map function parameters to Python args
- [ ] ❌ Transform function body (`BlockStatement` → list of Python statements)
- [ ] ❌ Transform `ReturnStatement`:
  - With expression: `return expr` → Python `Return(expr)`
  - **Without expression (bare return)**: `return;` → `return JSUndefined` (NOT Python's implicit `None`)
  - **CRITICAL**: JS `return;` yields `undefined`, not `null`
  - Ensures `function f() { return; } f() === undefined` works correctly
- [ ] ❌ Handle nested functions: Generate nested `def` inside parent function
  - **Scoping decision**: For this demo, nested functions are lexically scoped but NOT hoisted
  - Call-before-definition for nested functions is **not supported** (clear error with helpful message)
  - This simplifies implementation; full ES5 function hoisting is deferred
  - Error message: "Nested function hoisting is not supported. Define function 'X' before calling it."

**Test:** `function outer() { function inner() { return 42; } return inner(); }` → nested def works

**Test:** `function f() { return g(); function g() { return 1; } }` → error: "Nested function hoisting is not supported. Define function 'g' before calling it."

**Test:** `function f() { return; }` → `return JSUndefined`, verify `f() === undefined` is `True`

**Test:** `function f() { if (true) return; return 1; }` → first return is `JSUndefined`

---

### 1.7 UpdateExpression Support (++/--)
- [ ] ❌ Transform `UpdateExpression` for `++` and `--` operators
  - **CRITICAL**: For non-for contexts, prefer runtime helpers over walrus tuples for readability
  - For for-update clause: Inline code okay since result value not used
  - Prefix `++x`: Increment then return new value
  - Postfix `x++`: Return old value then increment
  - Prefix `--x`: Similar to `++x`
  - Postfix `x--`: Similar to `x++`
  - **CRITICAL**: Postfix returns old value; prefix returns new value
  - **CRITICAL**: Single-evaluation for `MemberExpression` targets (see Critical Correctness #21)
    - `obj[key()]++` must evaluate `obj` and `key()` exactly once
    - Capture base/key in temps, read, compute, write using same temps
  - Implement runtime helpers `js_pre_inc()`, `js_post_inc()`, `js_pre_dec()`, `js_post_dec()` for correctness
  - Minimum viable: Full support in ForStatement update clause (most common use case)
  - Optional: Support in other contexts (assignments, expressions)

**Test:** `var i = 0; var x = i++;` → `x = 0`, `i = 1`
**Test:** `var i = 0; var x = ++i;` → `x = 1`, `i = 1`
**Test:** `for (var i = 0; i < 3; i++) { ... }` → uses `i++` in update
**Test (member update single-eval):** `obj[key()]++` → temps for `obj`, `key()`; evaluate each once
**Test (complex member update):** `getArr()[i++]++` → if in scope, verify nested evaluation order

---

### 1.8 SequenceExpression (Comma Operator)
- [ ] ❌ Transform `SequenceExpression` → evaluate expressions left-to-right, return last value
  - **SCOPE DECISION FOR DEMO**: Limit to for-init/update contexts (most common use case)
  - **CRITICAL**: Required for for-loops: `for(i=0, j=0; ...; i++, j++)`
  - **Optional**: Support in statement contexts where lifting to multiple statements is legal
  - **Defer/Error**: SequenceExpression inside pure expression contexts (nested boolean/logical/ternary) unless using walrus
    - If statement-temp mode and SequenceExpression appears in illegal lifting context → error with code `E_SEQUENCE_EXPR_CONTEXT`
    - Message: "SequenceExpression in this context requires --use-walrus mode or refactoring to separate statements."
  - Acorn produces `SequenceExpression` with `expressions` array
  - For for-init/update: Emit each expression as separate statement
  - For statement contexts: Emit statement for each expression except last; return last expression value
  - Create transformer utility to "evaluate list left-to-right and return last node"
  - Cover side-effect cases explicitly
  - Document limits explicitly in "Known Limitations"

**Test:** `for (var i = 0, j = 0; i < 3; i++, j++) { ... }` → init and update both use SequenceExpression (supported)

**Test:** `var x; x = (a(), b(), c());` → statement context; emit `a(); b(); x = c();` (supported if in statement position)

**Test (deferred/error):** `(f(), g(), h()) ? a : b` → error in statement-temp mode: "SequenceExpression in conditional test requires --use-walrus mode"

**Test (deferred/error):** `var x = (1, 2, 3);` → error or support via statement lifting depending on context legality

---

### 1.9 Expression Statements
- [ ] ❌ Transform `ExpressionStatement` → Python `Expr` node (for side-effect expressions like calls)

---

### 1.10 End-to-End Integration Test
- [ ] ❌ Write integration test: Parse simple JS function → transform → generate Python → execute Python and verify output
- [ ] ❌ CLI: Accept input file, output transpiled Python to stdout or file

**Deliverable:** Working transpiler for Phase 1 subset (literals, expressions, basic functions, return)

---

## Phase 2: Control Flow + Hoisting + Switch

### 2.1 Two-Pass Variable Hoisting
- [ ] ❌ Implement first pass: Traverse function body to collect all `var` declarations (including nested blocks)
- [ ] ❌ Generate `name = JSUndefined` initializers at top of function for all hoisted vars
  - **CRITICAL**: Use `JSUndefined` (not `None`) for uninitialized variables
  - This preserves `typeof x === 'undefined'` semantics before assignment
- [ ] ❌ Second pass: Transform body normally, skip emitting duplicate var initializers

**Test:** `function test() { if (true) { var x = 1; } return x; }` → `x` initialized at function top
**Test:** `function test() { var x; return typeof x; }` → should return `'undefined'`

---

### 2.2 If/Else Statements
- [ ] ❌ Transform `IfStatement` → Python `If`
- [ ] ❌ Wrap test expression with `js_truthy()` to preserve JS truthiness
- [ ] ❌ Handle `consequent` and `alternate` (else/else-if chains)

**Test:** `if ([]) { return 1; }` → `if js_truthy([]):` (empty array is truthy in JS)

---

### 2.3 While Loops
- [ ] ❌ Transform `WhileStatement` → Python `While`
- [ ] ❌ Wrap test with `js_truthy()`

**Test:** `while (x) { x--; }`

---

### 2.4 Break and Continue Validation (Pre-pass)
- [ ] ❌ Add pre-pass to tag AST nodes with loop/switch ancestry information
  - Traverse AST and annotate each node with its containing loop/switch
  - Assign unique IDs to each loop and switch
  - Store ancestry chain (e.g., "inside while#1, inside for#2")
- [ ] ❌ Use ancestry info to validate break/continue usage:
  - Error if `continue` used inside `switch` (with helpful message)
  - Error if `break` used outside any loop/switch
  - Error if `continue` used outside any loop
- [ ] ❌ Track loop depth/context ID to ensure continue in desugared for-loops targets correct loop
  - **CRITICAL**: Only inject update for the specific for-loop being desugared
  - Use loop ID to match continue statements to their target loop
  - Prevents incorrect update injection in nested loops

---

### 2.5 Break and Continue Statements
- [ ] ❌ Transform `BreakStatement` → Python `Break`
- [ ] ❌ Transform `ContinueStatement` → Python `Continue`

**Test:** `while (true) { if (x) break; }`
**Test:** `for (var i = 0; i < 3; i++) { for (var j = 0; j < 3; j++) { if (j == 1) continue; } }` → inner continue doesn't trigger outer update

---

### 2.6 For Loops (C-style, desugared)
- [ ] ❌ Desugar `ForStatement(init, test, update, body)` to:
  ```
  init;
  while (test) {
    body;
    update;
  }
  ```
- [ ] ❌ Emit init statement first
- [ ] ❌ Create `While` with test (wrapped in `js_truthy()`)
- [ ] ❌ **CRITICAL**: Rewrite `continue` statements inside for-loop body to execute update before continuing
  - Traverse body to find all `ContinueStatement` nodes **that belong to this specific loop** (use loop ID from ancestry)
  - Replace each with: `update; continue;`
  - **CRITICAL**: Do NOT alter continues in inner loops (use loop ID tagging to distinguish)
  - This ensures update runs even when continue is hit
  - Placement: Inject update code immediately before continue statement
- [ ] ❌ Append update statements at end of while body (for normal flow)

**Test:** `for (var i = 0; i < 10; i++) { sum += i; }`
**Test:** `for (var i = 0; i < 10; i++) { if (i % 2) continue; sum += i; }` → update must run on continue
**Test (nested loops):** `for (var i = 0; i < 3; i++) { for (var j = 0; j < 3; j++) { if (j == 1) continue; } }` → inner continue does NOT trigger outer update

**Test (multiple continues):** `for (var i = 0; i < 10; i++) { if (a) continue; if (b) continue; stmt; }` → both continues run update

**Test (continue in nested blocks):** `for (var i = 0; i < 10; i++) { if (cond) { if (inner) continue; } stmt; }` → continue runs update

**Test (deeply nested loops):** Three-level nesting with continues at each level → verify loop ID tagging isolates each loop's update injection

---

### 2.7 For-In Loops
- [ ] ❌ Add `js_for_in_keys(obj)` to runtime: Return iterator over keys as **strings**
  - Dict: yield keys as-is (assumed to be strings for this demo)
  - List: yield indices as strings (`'0'`, `'1'`, ...) **but skip holes**
    - **CRITICAL**: Skip indices where value is `JSUndefined` (array holes created by delete)
    - JS for-in skips deleted array elements; our implementation must do the same
  - String: yield indices as strings
  - **CRITICAL**: All keys must be strings to match JS for-in behavior
  - **Enumeration order note**: ES5 order is implementation-quirky; for demo use "insertion order for dicts, ascending numeric for arrays"
    - Document this limitation: "For-in enumeration order: insertion order for objects, ascending numeric for arrays"
- [ ] ❌ Transform `ForInStatement(left, right, body)` → `for key in js_for_in_keys(right): body`
- [ ] ❌ Handle left side: `var x` or bare identifier

**Test:** `for (var k in {a: 1, b: 2}) { ... }` → iterates over `'a'`, `'b'`

**Test:** `for (var i in [10, 20, 30]) { ... }` → iterates over `'0'`, `'1'`, `'2'` (strings, not ints)

**Test:** `var arr = [1, 2, 3]; delete arr[1]; for (var i in arr) { ... }` → iterates over `'0'`, `'2'` (skips hole at index 1)

**Test:** `for (var k in {'0': 'a', '1': 'b'}) { ... }` → numeric-like string keys work correctly

**Test:** Sparse array with multiple holes: `var a = []; a[0] = 1; a[5] = 2; for (var i in a) { ... }` → iterates over `'0'`, `'5'`

---

### 2.8 Switch Statements (with Static Validation)
- [ ] ❌ Add static validator pass to detect fall-through between non-empty cases:
  - Traverse switch cases
  - Check if non-empty case (has statements) lacks explicit terminator (break, return, throw)
  - Error with location: "Fall-through between non-empty cases is unsupported; add explicit break statement"
  - Allow consecutive empty cases (case aliases)
  - **Detect subtle case**: "non-empty case → empty alias case(s) → non-empty case without break" as invalid
- [ ] ❌ Transform `SwitchStatement` to `while True:` wrapper
- [ ] ❌ **CRITICAL**: Evaluate discriminant once and cache in temp variable
  - Pattern: `_switch_disc = discriminant_expr; while True: if js_strict_eq(_switch_disc, case1): ...`
  - This prevents re-evaluation if discriminant has side effects or if cases mutate referenced variables
  - Ensures correct semantics when discriminant is an expression with side effects
- [ ] ❌ Build nested `if/elif/else` for cases
- [ ] ❌ **CRITICAL**: Use strict equality (`js_strict_eq`) for ALL case matching
  - Generate `js_strict_eq(_switch_disc, case_value)` (NOT Python `==`)
  - This matches JS switch semantics (strict comparison, identity for objects)
  - Ensures `switch (x) { case {}: ... }` doesn't match a different object literal
  - Add unit test matrix for object/array/function identity, NaN, null/undefined, primitive cases in switch
- [ ] ❌ **CRITICAL**: Synthesize `break` at end of default/last non-empty case
  - Prevents accidental loop when discriminant value changes due to user code in cases
  - Ensures switch doesn't loop infinitely
  - Rule: Wrapper always executes once per entry; at end of any taken branch (including default), synthesize `break` regardless of whether discriminant changes mid-execution
- [ ] ❌ Track whether case has `break`; synthesize `break` at end of switch
- [ ] ❌ Handle `default` case as final `else`
- [ ] ❌ Error if `continue` appears inside switch (use ancestry info from pre-pass)
- [ ] ❌ Allow fall-through for consecutive empty cases (case aliases)
- [ ] ❌ Document: Each non-empty case should end with explicit `break` or early exit (return/throw)

**Test:**
```javascript
switch (x) {
  case 1: return 'one';
  case 2: return 'two';
  default: return 'other';
}
```
**Test:** `switch (x) { case '1': return 'string'; case 1: return 'number'; }` → '1' and 1 are different cases

**Test:** `switch (x) { case 1: stmt; case 2: stmt; }` → error: fall-through without break

**Test:** `switch (x) { case 1: stmt1; case 2: case 3: stmt2; break; }` → error: subtle fall-through (non-empty → empty → non-empty without break)

**Test (NaN in switch):** `var x = NaN; switch(x) { case NaN: return 'matched'; default: return 'no match'; }` → returns 'no match' (NaN !== NaN via `js_strict_eq`)

**Test (case alias chain validation):** `switch(x) { case 1: case 2: case 3: stmt; break; }` → valid (alias chain ends in non-empty case with break)

**Test (case alias chain error):** `switch(x) { case 1: case 2: stmt1; case 3: stmt2; break; }` → error (alias chain has non-empty case without break before next case)

**Test (switch discriminant caching):** `var i = 0; switch(i++) { case 0: i = 10; case 1: return i; }` → discriminant evaluated once at switch entry (i++ happens once); verify with side-effect test

---

### 2.9 Phase 2 Integration Tests
- [ ] ❌ Test var hoisting with complex nesting
- [ ] ❌ Test for-loop with break/continue
- [ ] ❌ Test switch with multiple cases and break
- [ ] ❌ Test error on `continue` in switch

**Deliverable:** Full control flow support (if/else, while, for, for-in, switch, break, continue, hoisting)

---

## Phase 3: Library Mappings

### 3.1 Member Expression Handling
- [ ] ❌ Transform `MemberExpression` with `computed: false` (dot access) → Python subscript
  - **Default rule**: `obj.prop` → `obj['prop']` (subscript access)
  - Applies to BOTH reads AND writes
  - This avoids attribute shadowing and works consistently for dicts
  - Arrays/strings already use subscript naturally
- [ ] ❌ Transform `MemberExpression` with `computed: true` (bracket access) → Python subscript
- [ ] ❌ **Exception**: `.length` property detection (handled separately in 3.4)
  - Detect `.length` specifically and map to `len()`
  - All other properties use subscript
  - **Array `.length = n` assignment is UNSUPPORTED** and will error
    - ES5 allows it and truncates/extends; our implementation does not
    - Error code: `E_LENGTH_ASSIGN`
    - Error message: "Assignment to array .length property is not supported. Array length in this transpiler is read-only."
    - Explicit validation in Phase 3.1/3.4: Check if assignment target is `.length` on array-like and error
    - Add to "Known Limitations" documentation
- [ ] ❌ Consider supporting string-literal keys in object literals (beyond identifier keys)
  - Current scope: `{a: 1}` (identifier key)
  - Enhanced: `{'a': 1}` (string-literal key) covers more real-world snippets
  - Still error on computed keys: `{[expr]: 1}`
- [ ] ❌ **Method calls policy**: Since `this` is out of scope, calling `obj['method'](...)` is only supported for:
  - Recognized standard library mappings (String/Math methods)
  - Local callable variables
  - Otherwise: ERROR with message "Method calls requiring 'this' binding are not supported. Extract method to a local function or use supported standard library methods."
- [ ] ❌ Optional: If JSObject wrapper is implemented, allow attribute-style access for demo convenience
  - Document this as optional enhancement, not required for core functionality

**Test:** `obj.prop` → `obj['prop']` (subscript by default, read)

**Test:** `obj.prop = 5` → `obj['prop'] = 5` (subscript by default, write)

**Test:** `obj['prop']` → `obj['prop']` (already subscript)

**Test:** `{a: 1, 'b': 2}` → `{'a': 1, 'b': 2}` (both identifier and string-literal keys)

---

### 3.2 Call Expression Framework
- [ ] ❌ Transform `CallExpression` → Python `Call`
- [ ] ❌ Create lookup tables for special cases (Math, String methods)
- [ ] ❌ Default: direct call mapping

---

### 3.3 Math Library Mapping
- [ ] ❌ Detect `Math.abs`, `Math.max`, `Math.min` → Python built-ins `abs()`, `max()`, `min()`
- [ ] ❌ Detect `Math.sqrt`, `Math.floor`, `Math.ceil`, `Math.log`, `Math.log10`, `Math.log2` → `math.sqrt()`, etc.
- [ ] ❌ Add `import math` via import manager when needed
- [ ] ❌ Detect `Math.pow(x, y)` → `x ** y` (Python power operator)
- [ ] ❌ Detect `Math.round(x)` → `round(x)` (note: different .5 rounding behavior, document limitation)
- [ ] ❌ Detect `Math.random()` → `random.random()`, add `import random`
- [ ] ❌ Detect `Math.PI` → `math.pi`, `Math.E` → `math.e`

**Test:** `Math.sqrt(16)` → `math.sqrt(16)` with `import math`

---

### 3.4 Array and String Length
- [ ] ❌ Detect `.length` property on strings → `len(str)`
- [ ] ❌ Detect `.length` property on arrays → `len(list)`
  - Python `len()` works correctly even with holes (JSUndefined values don't affect length)

**Test:** `'hello'.length` → `len('hello')` → 5
**Test:** `[1, 2, 3].length` → `len([1, 2, 3])` → 3
**Test:** `var arr = [1, 2, 3]; delete arr[1]; arr.length` → still 3

---

### 3.5 Regex Method Mapping
- [ ] ❌ Map `regex.test(str)` method calls
  - Transform `regex.test(str)` → `bool(regex.search(str))` (Python re.search returns Match or None)
  - Assumes `regex` is a compiled regex object from Phase 4
  - Add test for regex literal with `.test()`: `/\d+/.test('123')` → `True`
- [ ] ❌ Map `str.replace(regex, repl)` with regex argument
  - Transform `str.replace(regex, repl)` → `regex.sub(repl, str, count=1)` (single replacement, matches JS default)
  - Ensure `regex` is a compiled regex object
  - Add test: `'hello world'.replace(/o/, 'O')` → `'hellO world'` (first occurrence only)
- [ ] ❌ Document `String.prototype.match`, `RegExp.prototype.exec` as out of scope
  - Error with code `E_REGEX_METHOD_UNSUPPORTED`
  - Message: "Regex method 'match/exec' is not supported. Use .test() for boolean checks or Python re module directly."
  - Add to "Known Limitations"

**Test:** `/\d+/.test('123')` → `True`
**Test:** `/\d+/.test('abc')` → `False`
**Test:** `'hello world'.replace(/o/, 'O')` → `'hellO world'`
**Test:** `'hello world'.replace(/o/g, 'O')` → error (global flag unsupported, caught earlier)

---

### 3.6 String Method Mapping
- [ ] ❌ Detect `.charAt(i)` → `str[i:i+1]`
  - **CRITICAL**: Use slice `str[i:i+1]` (not `str[i]`) to return empty string for out-of-range, matching JS behavior
  - JS: `'abc'.charAt(10)` → `''` (not error)
- [ ] ❌ Detect `.charCodeAt(i)` → conditional returning `float('nan')` for out-of-range
  - In-range: `ord(str[i])`
  - Out-of-range: `float('nan')` (matches JS which returns NaN)
  - Implement as runtime helper `js_char_code_at(s, i)` to avoid complex inline code
- [ ] ❌ Detect `.concat(...)` → `str + ...`
- [ ] ❌ Detect `.indexOf(sub, start)` → `str.find(sub, start)`
- [ ] ❌ Detect `.lastIndexOf(sub)` → `str.rfind(sub)`
- [ ] ❌ Detect `.slice(s, e)` → `str[s:e]`
- [ ] ❌ Detect `.substring(s, e)` → runtime helper `js_substring(str, s, e)`
  - Clamp negative values to 0
  - Swap if start > end
  - Helper: `js_substring(s, start, end)` in runtime
- [ ] ❌ Detect `.toLowerCase()` → `str.lower()`
- [ ] ❌ Detect `.toUpperCase()` → `str.upper()`
- [ ] ❌ Detect `.split(sep)` → `str.split(sep)`
- [ ] ❌ Detect `.trim()` → `str.strip()`
- [ ] ❌ Detect `.replace(a, b)` → `str.replace(a, b, 1)` (single replacement)

**Test:** `'hello'.toUpperCase()` → `'hello'.upper()`
**Test:** `'abc'.charAt(10)` → `''` (empty string, not error)
**Test:** `'abc'.charCodeAt(10)` → `NaN`
**Test:** `'hello'.substring(7, 2)` → `'llo'` (swapped and clamped)

---

### 3.7 Console.log Mapping
- [ ] ❌ Add `console_log(*args)` to runtime library
  - Implement JS-style formatting (space-separated values)
  - This keeps transformer simple and allows future formatting parity
- [ ] ❌ Detect `console.log(...)` → `console_log(...)`
- [ ] ❌ Add `from js_compat import console_log` via import manager

**Test:** `console.log('hello', 42)` → `console_log('hello', 42)` → prints "hello 42"

---

### 3.8 Import Manager Finalization
- [ ] ❌ Ensure import manager tracks all required imports
- [ ] ❌ Emit imports at top of Python module in **deterministic order**:
  1. Standard library imports (`import math`, `import random`, `import re`)
  2. Runtime imports (`from js_compat import ...`)
- [ ] ❌ **CRITICAL**: Use consistent import style
  - Standard library: `import math` (call via `math.*`)
  - **DO NOT** mix `import math` and `from math import ...`
  - This prevents conflicts and keeps codegen simple
- [ ] ❌ Deduplicate imports
- [ ] ❌ **Only import when used**: Do not import `math`/`random`/`re` unless features require them
- [ ] ❌ Add tests that assert exact import header format
- [ ] ❌ Add lint/test for "no unused imports"

**Test:** Code using Math and String methods → `import math` at top (once)
**Test:** Code using multiple runtime features → `from js_compat import JSUndefined, js_truthy, console_log` (sorted)
**Test:** Code without Math methods → no `import math` (no unused imports)
**Test (all features):** Code using all features → verify deduping and ordering across stdlib and runtime imports (comprehensive import header test)

---

### 3.9 Phase 3 Integration Tests
- [ ] ❌ Test function using multiple Math methods
- [ ] ❌ Test string manipulation with multiple methods
- [ ] ❌ Verify imports are correctly generated

**Deliverable:** Complete Math and String library mapping with import management

---

## Phase 4: Runtime Gaps

### 4.1 Strict Equality Helper
- [ ] ❌ Implement `js_strict_eq(a, b)` in runtime:
  - **CRITICAL**: Handle object/array/function identity (NOT value equality)
  - NaN handling: `math.isnan(a) and math.isnan(b)` → `False` (NaN !== NaN)
  - **-0 vs +0 decision**: JS treats `-0 === +0` as `true`
    - For demo: Accept Python's default behavior (no distinction)
    - Document limitation: "-0 vs +0 distinction not implemented"
    - If needed: Check `math.copysign(1, a) == math.copysign(1, b)` for sign
  - null: `a is None and b is None` → `True`
  - undefined: `a is JSUndefined and b is JSUndefined` → `True`
  - Primitives (str, int, float, bool): value equality `a == b`
  - Objects/arrays/functions (dict, list, callable): identity `a is b`
  - Same-type check first for efficiency
- [ ] ❌ Implement `js_strict_neq(a, b)` → `not js_strict_eq(a, b)`
- [ ] ❌ Update transformer to route ALL `===`/`!==` to these functions (including switch cases)

**Test:** `{} === {}` → `False`, `var a = {}; a === a` → `True`

**Test:** `NaN === NaN` → `False`

**Test:** `null === null` → `True`, `undefined === undefined` → `True`

**Test:** `-0 === +0` → `True` (if -0 distinction skipped, document this)

---

### 4.2 Arithmetic and Coercion Helpers
- [ ] ❌ Implement `js_to_number(x)` in runtime (ToNumber coercion):
  - `None` (null) → `0`
  - `JSUndefined` → `float('nan')`
  - `bool`: `True` → `1`, `False` → `0`
  - `int`, `float` → return as-is
  - `str` → parse as number:
    - Trim leading/trailing whitespace
    - Empty string → `0`
    - Hex literals (e.g., `'0x1A'`): acceptable to simplify (document limitation)
    - Octal literals: acceptable to skip (document limitation)
    - Parse errors → `float('nan')`
    - Provide exact coercion table in runtime docstring
  - Otherwise → `float('nan')` or error
- [ ] ❌ Implement `js_add(a, b)` in runtime:
  - If either is string → string concatenation (coerce both to strings)
  - If both are numbers (int/float) → numeric addition
  - Otherwise → attempt numeric addition with `js_to_number` coercion or error
- [ ] ❌ Implement `js_mod(a, b)` in runtime:
  - Python: `-1 % 2` → `1` (result has sign of divisor)
  - JS: `-1 % 2` → `-1` (result has sign of dividend)
  - Use: `a - (b * math.trunc(a / b))` to match JS semantics
- [ ] ❌ Implement `js_div(a, b)` in runtime:
  - Handle division by zero: `1/0` → `math.inf`, `-1/0` → `-math.inf`
  - Coerce operands with `js_to_number` if supporting mixed types
  - Document: numeric-only for demo, or full coercion
- [ ] ❌ Optional: Implement `js_sub()`, `js_mul()` for full ToNumber coercion
  - OR: Scope to numeric-only and error on type mismatches (simpler for demo)
- [ ] ❌ Implement `js_negate(x)` for unary minus with coercion (optional, or direct `-` for numbers only)

**Test:** `'5' + 2` → `'52'` (string concatenation)
**Test:** `'5' - 2` → `3` (numeric subtraction with coercion)
**Test:** `+('5')` → `5` (unary plus coercion)
**Test:** `-1 % 2` → `-1` (JS remainder semantics)
**Test:** `null + 1` → `1` (null coerces to 0)
**Test:** `+undefined` → `NaN` (ToNumber on undefined via `js_to_number`)
**Test:** `NaN + 5` → `NaN` (NaN flows through arithmetic)
**Test:** `typeof (NaN + 5)` → `'number'`

---

### 4.3 UpdateExpression Helpers
- [ ] ❌ Implement `js_post_inc(container, key)` and `js_post_dec(container, key)` in runtime
  - For identifiers: Use Python variables (may need code generation strategy instead)
  - For member access: Increment/decrement and return old value
  - Alternative: Generate inline Python code with temp variables
- [ ] ❌ Implement `js_pre_inc(container, key)` and `js_pre_dec(container, key)` if needed
- [ ] ❌ Decision: Use runtime helpers vs inline temp variable generation
  - Inline may be cleaner for simple cases: `(_temp := x, x := x + 1, _temp)[2]` for postfix
  - Runtime helpers may be cleaner for member access: `js_post_inc(obj, 'prop')`

**Test:** `i++` returns old value, increments variable
**Test:** `++i` increments then returns new value

---

### 4.4 Loose Equality
- [ ] ❌ Implement `js_loose_eq(a, b)` in runtime:
  - Same type → use `==`
  - `None == JSUndefined` → `True` (null == undefined)
  - Number and string → coerce string to number with `js_to_number()`
  - Boolean → coerce to number (True → 1, False → 0) then compare
  - NaN handling: `NaN == NaN` → `False` (use `math.isnan()`)
  - **Explicitly unsupported** (error with code `E_LOOSE_EQ_OBJECT`):
    - If either operand is list/dict/callable → error
    - Object to primitive coercion (ToPrimitive)
    - Date objects
    - Complex array/object comparisons
  - **Provide tiny table in runtime docstring** listing exactly what is supported (primitives + null/undefined only)
- [ ] ❌ Implement `js_loose_neq(a, b)` → `not js_loose_eq(a, b)`
- [ ] ❌ Update transformer to route `==`/`!=` to these functions
- [ ] ❌ **Add guardrails in transformer**: Detect if either operand to `==`/`!=` is likely object/array/function and error
  - Static detection: If operand is ArrayExpression, ObjectExpression, FunctionExpression → error
  - Runtime detection: `js_loose_eq` checks type and errors
  - Message: "Loose equality with objects/arrays is not supported (ToPrimitive coercion complexity). Use strict equality (===) or explicit comparison."
- [ ] ❌ Document unsupported edge cases in runtime docstring

**Test:** `null == undefined` → `True`, `5 == '5'` → `True`, `true == 1` → `True`, `NaN == NaN` → `False`

**Test (error on object equality):** `{} == {}` → error with code `E_LOOSE_EQ_OBJECT`

**Test (error on array equality):** `[] == []` → error with code `E_LOOSE_EQ_OBJECT`

---

### 4.5 Typeof Operator
- [ ] ❌ Implement `js_typeof(x)` in runtime:
  - `JSUndefined` → `'undefined'` (**CRITICAL**: check before None)
  - `None` → `'object'` (JS null is object type)
  - `bool` → `'boolean'`
  - `int`, `float` → `'number'`
  - `str` → `'string'`
  - `list`, `dict` → `'object'`
  - `callable` → `'function'`
- [ ] ❌ Transform `UnaryExpression` with operator `typeof` → `js_typeof(...)`
- [ ] ❌ Transform identifier `undefined` (when used as value) → `JSUndefined`

**Test:** `typeof null` → `'object'`, `typeof undefined` → `'undefined'`
**Test:** `var x; typeof x` → `'undefined'` (uninitialized var)

---

### 4.6 In Operator (out of scope)
- [ ] ❌ **DECISION**: `in` operator is **out of scope** for this demo
  - JS `in` checks property existence: `'prop' in obj`, `'1' in arr`
  - Complex semantics: prototype chain traversal, numeric string keys, array holes
  - Error with code `E_IN_OPERATOR_UNSUPPORTED`
  - Message: "'in' operator is not supported. Use explicit property checks (obj['prop'] !== JSUndefined) or Object.hasOwnProperty()."
  - Remove any tests that rely on `in` operator
  - Add error test: `'1' in arr` → error with clear message

---

### 4.7 Delete Operator
- [ ] ❌ Implement `js_delete(base, key)` in runtime:
  - Dict: `del base[key]` if key exists, return `True`; if key doesn't exist, still return `True` (no error)
  - **List/Array**: **DO NOT use `del`** (Python shifts elements, JS leaves hole)
    - Instead: Assign `JSUndefined` at index: `base[int(key)] = JSUndefined` (if index in range)
    - This preserves array length and creates "hole" semantics
    - Out-of-range indices: Still return `True` (no error, no crash)
    - Return `True`
  - Otherwise: return `True` (no-op, mimics JS delete on non-deletable properties)
- [ ] ❌ Transform `UnaryExpression` with operator `delete`:
  - On `MemberExpression` → `js_delete(obj, key)` (returns `True`)
  - On `Identifier` → **ERROR** (recommended for clarity)
    - JS: `delete identifier` returns `false` (non-configurable binding)
    - Error message: "Delete on identifiers is not supported (non-configurable binding)."
    - **Decision**: Use ERROR approach consistently in transformer + runtime

**Test:** `delete obj.prop` → `js_delete(obj, 'prop')` (dict key removed)
**Test:** `delete arr[1]` → `arr[1] = JSUndefined` (hole created, length unchanged)
**Test:** `var arr = [1,2,3]; delete arr[1]; arr.length` → should be 3, `arr[1]` is JSUndefined
**Test:** Chained behaviors: `var arr = [1,2,3]; delete arr[1]; arr.length; for (var i in arr) ...` → verify holes persist and for-in skips them
**Test:** `delete obj.nonExistent` → `True` (no error, returns true for non-existent keys)
**Test:** `delete arr[999]` → `True` (out-of-range index still returns true, doesn't crash)

**Test (delete non-existent object key):** `var obj = {a: 1}; delete obj.b;` → `True` (no side effects, idempotent)

---

### 4.8 Unresolved Identifier Pre-pass
- [ ] ❌ Add pre-pass to detect reads of undeclared identifiers
  - Traverse AST and build symbol table of declared variables (var, function params)
  - Error on reads of identifiers that are not:
    - Declared in current or parent scope
    - Global identifiers (NaN, Infinity, undefined)
    - Standard library (Math, String, Date, console, etc.)
  - Error code: `E_UNRESOLVED_IDENTIFIER`
  - Message: "Identifier 'X' is not declared. JavaScript would throw ReferenceError."
  - Helps catch typos and ensures clean transpiled code

**Test:** `function f() { return undeclaredVar; }` → error: "Identifier 'undeclaredVar' is not declared"
**Test:** `function f() { var x = 1; return x; }` → OK (declared)
**Test:** `function f() { return Math.sqrt(4); }` → OK (Math is standard library)

---

### 4.9 Regex Literals
- [ ] ❌ Implement `compile_js_regex(pattern, flags_str)` in runtime:
  - Map JS flags: `i` → `re.IGNORECASE`, `m` → `re.MULTILINE`, `s` → `re.DOTALL`
  - Error on unsupported flags (`g`, `y`, `u`) with clear message explaining why
  - Document: 'g' (global) flag not supported; Python re.findall() can be used as workaround
  - Document: 'y' (sticky) and 'u' (unicode) flags not directly supported
  - **Ensure backslash escaping**: Pattern string must preserve backslashes (e.g., `\d`, `\w`, `\s`)
  - **CRITICAL**: Always emit Python raw strings `r'...'` for regex patterns unless impossible
    - This prevents double-escaping pitfalls
    - If pattern contains both ' and ", choose quote style or escape appropriately
    - Document this policy: "Regex patterns always use Python raw strings (r'...') to preserve backslashes"
  - **CRITICAL**: Test escaped backslashes and raw vs cooked strings in final Python string literal
    - Ensure Python gets same pattern bytes it expects
    - Exact flags mapping and escaping strategy documented
  - Return `re.compile(pattern, flags)`
- [ ] ❌ Add `import re` via import manager
- [ ] ❌ Transform regex `Literal` → `compile_js_regex(pattern, flags)`
  - Access pattern via `node.regex.pattern` (Acorn structure)
  - Access flags via `node.regex.flags` (Acorn structure)
  - Acorn pre-processes pattern; ensure proper escaping in Python string

**Test:** `/hello/i` → `compile_js_regex('hello', 'i')` → case-insensitive regex

**Test:** `/\d+/` → pattern preserves backslash correctly

**Test:** `/[a-z]+/i` → character class works

**Test:** `/test/g` → error with message "Regex global flag 'g' is not supported. Use Python's re.findall() or re.finditer() as a workaround."

**Test:** `/test/y` → error with message "Regex sticky flag 'y' is not supported."

**Test:** `/test/u` → error with message "Regex unicode flag 'u' is not supported."

---

### 4.10 Temp Allocator API Contract
- [ ] ❌ Define temp allocator utility with clear contract to avoid name collisions
  - **Prefix**: Use `__js_tmp` prefix (double underscore to avoid user code collisions)
  - **Uniqueness**: Increment counter per temp: `__js_tmp1`, `__js_tmp2`, etc.
  - **Scoping**: Allocate temps at statement level; reset counter per function
  - **Naming contract**: Document in transformer that user code should not use `__js_tmp*` names
  - **Switch discriminant temp**: Use `__js_switch_disc_<id>` for switch discriminants (unique per switch)
  - **Logical expression temps**: Use `__js_tmp<n>` for logical short-circuit temps
  - Document this convention to avoid regressions

---

### 4.11 JSDate Class
- [ ] ❌ Implement `class JSDate` in runtime:
  - Constructor overloads: `JSDate()` → current time, `JSDate(ms)` → from timestamp, `JSDate(year, month, ...)` → construct date
  - **Timezone decision**: Use UTC for predictability (document this clearly)
    - `JSDate()` → `datetime.utcnow()` or `datetime.now(timezone.utc)`
    - `JSDate(ms)` → `datetime.utcfromtimestamp(ms/1000)`
    - Alternatively: Use local time and document environment-dependent behavior
  - Methods: `getTime()`, `getFullYear()`, `getMonth()` (returns 0–11), `getDate()`, `getHours()`, `getMinutes()`, `getSeconds()`
  - `toString()`, `toISOString()`
  - Document timezone assumptions in runtime docstring
  - **Edge case**: Test end-of-month boundary after `setFullYear` on Feb 29 non-leap-year; document as limitation if not covered
- [ ] ❌ Transform `NewExpression` with callee `Date` → `JSDate(...)`
- [ ] ❌ Add `from js_compat import JSDate` via import manager

**Test:** `new Date()` → `JSDate()`, verify timestamp is reasonable

**Test:** `new Date(2020, 0, 1)` → `JSDate(2020, 0, 1)`, verify date components

**Test:** `new Date(0).getTime()` → `0` (epoch)

---

### 4.12 For-in Runtime Helper (if not done in Phase 2)
- [ ] ❌ Verify `js_for_in_keys(x)` implementation:
  - Dict → yield keys as-is
  - List → yield indices as strings ('0', '1', ...)
  - String → yield indices as strings
  - Otherwise → empty iterator or error

**Test:** `for (var i in [10, 20]) { ... }` → iterates over `'0'`, `'1'`

---

### 4.13 Throw Statement
- [ ] ❌ Transform `ThrowStatement` → `raise JSException(value)`
- [ ] ❌ Verify JSException stores arbitrary values

**Test:** `throw 'error message';` → `raise JSException('error message')`

---

### 4.14 Optional Helpers (Nice-to-Have)
- [ ] ❌ Optional: Implement `js_round(x)` for exact JS Math.round parity (banker's rounding differs)
  - JS: 0.5 rounds up to 1, -0.5 rounds toward zero to -0
  - Python: banker's rounding (round half to even)
  - If skipping, document limitation and avoid .5 inputs in tests
- [ ] ❌ Optional: UpdateExpression support in non-for contexts
  - Priority is for-update; general use is lower priority
  - Use temp variables or runtime helpers for `i++` in expressions

---

### 4.15 Phase 4 Integration Tests
- [ ] ❌ Test strict equality for objects/arrays: `{} === {}` → `False`, `var a = {}; a === a` → `True`
- [ ] ❌ Test strict equality for primitives: `5 === 5` → `True`, `'5' === 5` → `False`
- [ ] ❌ Test NaN strict equality: `NaN === NaN` → `False`
- [ ] ❌ Test -0 vs +0: `-0 === +0` → `True` (if -0 distinction skipped)
- [ ] ❌ Test global identifiers: `NaN`, `Infinity`, `undefined` in expressions, equality, typeof
- [ ] ❌ Test bare return: `function f() { return; }`, verify `f() === undefined`
- [ ] ❌ Test SequenceExpression: `(1, 2, 3)` → `3`, in for-init and for-update
- [ ] ❌ Test `+=` on strings/numbers: `5 + '3'` → `'53'`, `'hello' + ' world'` → `'hello world'`
- [ ] ❌ Test arithmetic coercion: `'5' - 2` → `3`, `+'5'` → `5`, `null + 1` → `1`
- [ ] ❌ Test division by zero: `1/0` → `Infinity`, `-1/0` → `-Infinity`
- [ ] ❌ Test modulo with negatives: `-1 % 2` → `-1` (JS semantics, not Python)
- [ ] ❌ Test UpdateExpression: `i++`, `++i`, postfix vs prefix return values
- [ ] ❌ Test loose equality edge cases: `null == undefined`, `5 == '5'`, `true == 1`, `NaN == NaN` (false)
- [ ] ❌ Test typeof comprehensive matrix:
  - `typeof undefined` → `'undefined'`
  - `typeof null` → `'object'`
  - `typeof 5` → `'number'`
  - `typeof 'hello'` → `'string'`
  - `typeof true` → `'boolean'`
  - `typeof function(){}` → `'function'`
  - `typeof {}` → `'object'`
  - `typeof []` → `'object'`
  - `typeof (new Date())` → `'object'`
- [ ] ❌ Test delete on objects (key removal) and arrays (hole creation with JSUndefined)
- [ ] ❌ Test delete edge cases: non-existent keys, out-of-range array indices (all return true)
- [ ] ❌ Test delete on identifier: error with clear message
- [ ] ❌ Test regex compilation with supported flags (i, m, s) and error on unsupported (g, y, u)
- [ ] ❌ Test regex with backslashes and character classes
- [ ] ❌ Test Date construction and method calls, timezone behavior
- [ ] ❌ Test throw with string, number, object
- [ ] ❌ Test logical operators return original operands: `'a' && 0` → `0`, `0 || 'x'` → `'x'`
- [ ] ❌ Test logical short-circuit evaluation order with side effects: `(f() && g())` evaluates f() once

**Deliverable:** Complete runtime library with all semantic gaps bridged

---

## Phase 5: Tests + Playground

### 5.1 Golden Test Suite
- [ ] ❌ Create `tests/golden/` directory with JS input files and expected Python output
- [ ] ❌ Test: Arithmetic and logic operators
- [ ] ❌ Test: Var hoisting (nested blocks, uninitialized → JSUndefined)
- [ ] ❌ Test: If/else chains
- [ ] ❌ Test: While loop with break/continue
- [ ] ❌ Test: For loop (C-style) with continue (ensure update runs)
- [ ] ❌ Test: For-in over dict, list, string (keys as strings)
- [ ] ❌ Test: Switch with multiple cases, default, break (strict equality)
- [ ] ❌ Test: Switch with type mismatch ('1' vs 1 are different cases)
- [ ] ❌ Test: Math library methods
- [ ] ❌ Test: String library methods (charAt/charCodeAt out-of-range, substring edge cases)
- [ ] ❌ Test: Regex literals with flags
- [ ] ❌ Test: Date construction and methods
- [ ] ❌ Test: Loose equality (`==`, `!=`) including null/undefined, NaN
- [ ] ❌ Test: Typeof operator (null → 'object', undefined → 'undefined')
- [ ] ❌ Test: Delete operator on objects and arrays (array holes)
- [ ] ❌ Test: Throw (no try/catch, just raising JSException)
- [ ] ❌ Test: Nested functions (call-after-definition only)
- [ ] ❌ Test: Object literals (identifier and string-literal keys)
- [ ] ❌ Test: Array literals
- [ ] ❌ Test: Truthiness (empty array/object are truthy, NaN is falsy, 0 is falsy)
- [ ] ❌ Test: Logical operators preserve operand values: `('a' && 0)` → `0`; `(0 || 'x')` → `'x'`
- [ ] ❌ Test: Strict equality with null/undefined: `x === null`, `x === undefined` (identity checks)

---

### 5.2 Execution Parity Tests
- [ ] ❌ Create test harness that runs JS (via Node.js) and transpiled Python
- [ ] ❌ Compare stdout/return values for equivalence
- [ ] ❌ Cover all supported features with parity tests

---

### 5.3 Unsupported Feature Tests
- [ ] ❌ Test: Bitwise operators (`|`, `&`, `^`, `~`, `<<`, `>>`, `>>>`) → error with code `E_BITWISE_UNSUPPORTED`
  - Message: "Bitwise operators are not supported. Use Math.floor() to truncate or arithmetic equivalents."
  - Test each bitwise operator
- [ ] ❌ Test: Array methods (`push`, `pop`, `shift`, `unshift`, `splice`, `map`, `filter`, `reduce`, `forEach`) → error with code `E_ARRAY_METHOD_UNSUPPORTED`
  - Message: "Array method 'X' is not supported. Use explicit loops or supported alternatives."
- [ ] ❌ Test: Object methods (`Object.keys`, `Object.values`, `Object.assign`) → error with code `E_OBJECT_METHOD_UNSUPPORTED`
  - Message: "Object method 'X' is not supported. Use explicit loops or manual property access."
- [ ] ❌ Test: Regex methods (`match`, `exec`) → error with code `E_REGEX_METHOD_UNSUPPORTED`
  - Message: "Regex method 'match/exec' is not supported. Use .test() for boolean checks."
- [ ] ❌ Test: SequenceExpression in illegal context (if statement-temp mode) → error with code `E_SEQUENCE_EXPR_CONTEXT`
  - `(a(), b()) ? x : y` → error in statement-temp mode

---

### 5.4 Error Handling Tests
- [ ] ❌ Test: Unsupported node type (e.g., `let`, `const`) → clear error with location and error code
- [ ] ❌ Test: Unsupported feature (e.g., `this`, `class`) → clear error with error code
- [ ] ❌ Test: `new UnknownConstructor()` → error
- [ ] ❌ Test: `continue` inside switch → error from ancestry validation
- [ ] ❌ Test: `break` outside loop/switch → error from ancestry validation
- [ ] ❌ Test: `continue` outside loop → error from ancestry validation
- [ ] ❌ Test: Computed object keys → error
- [ ] ❌ Test: `in` operator → error with code `E_IN_OPERATOR_UNSUPPORTED`
  - `'1' in arr` → error: "'in' operator is not supported. Use explicit property checks (obj['prop'] !== JSUndefined)."
- [ ] ❌ Test: `instanceof` operator → error with code `E_INSTANCEOF_UNSUPPORTED`
  - `obj instanceof Date` → error: "'instanceof' operator is not supported."
- [ ] ❌ Test: Unresolved identifier → error with code `E_UNRESOLVED_IDENTIFIER`
  - `function f() { return undeclaredVar; }` → error: "Identifier 'undeclaredVar' is not declared. JavaScript would throw ReferenceError."
- [ ] ❌ Test: Switch fall-through between non-empty cases → error from static validator with location
- [ ] ❌ Test: Regex unsupported flags (g, y, u) → error with workaround suggestion
- [ ] ❌ Test: Nested function called before definition → error: "Nested function hoisting is not supported. Define function 'X' before calling it."
- [ ] ❌ Test: Delete on identifier → error: "Delete on identifiers is not supported (non-configurable binding)."
- [ ] ❌ Test: Array `.length = n` assignment → error with code `E_LENGTH_ASSIGN`: "Assignment to array .length property is not supported. Array length in this transpiler is read-only."
- [ ] ❌ Test: Augmented assignment with type mismatch → error with code `E_NUM_AUGMENT_COERCION`: "Augmented assignment operators (-=, *=, /=, %=) require numeric operands. Mixed types are not supported."
- [ ] ❌ Verify error codes (e.g., `E_UNSUPPORTED_FEATURE`, `E_UNSUPPORTED_NODE`, `E_LENGTH_ASSIGN`, `E_NUM_AUGMENT_COERCION`) for programmatic filtering
- [ ] ❌ Create error code table mapping codes to messages in documentation

---

### 5.5 CLI Enhancement
- [ ] ❌ Add `--output` flag to write to file
- [ ] ❌ Add `--run` flag to execute transpiled Python immediately
- [ ] ❌ Add `--verbose` flag for debugging (show AST, etc.)
- [ ] ❌ Pretty-print errors with source location (line/column, snippet, node type)
- [ ] ❌ Error messages should include:
  - What failed (node type, feature name)
  - Why it failed (out of scope, unsupported)
  - What to change (suggestion or workaround)
  - Example: "Switch fall-through between non-empty cases is unsupported. Add an explicit 'break' statement at the end of case."
  - Example: "Regex global flag 'g' is not supported. Use Python's re.findall() or re.finditer() as a workaround."

---

### 5.6 Playground (Optional)
- [ ] ❌ Create simple web UI (HTML + JS)
- [ ] ❌ Left panel: JS input (textarea)
- [ ] ❌ Right panel: Transpiled Python output
- [ ] ❌ Bottom panel: Execution output (run Python via backend or WebAssembly)
- [ ] ❌ Display errors with highlighting

---

### 5.7 Documentation
- [ ] ❌ Update README.md with usage instructions, examples, supported subset
- [ ] ❌ **Document Python version requirement: Python ≥ 3.8** (for walrus operator in logical expressions; fallback available for 3.7 if needed)
- [ ] ❌ **Pin versions**: Document Node.js version (e.g., Node 18 LTS) and Python version (≥3.8) for CI and execution parity tests
- [ ] ❌ Document runtime library API with exact function signatures and behavior
- [ ] ❌ **Add performance note**: "This demo prioritizes correctness over speed; runtime helpers add overhead by design."
- [ ] ❌ **Document error codes**: Create table mapping error codes to messages
  - `E_UNSUPPORTED_FEATURE`: Feature outside ES5 subset (e.g., `let`, `const`, `class`)
  - `E_UNSUPPORTED_NODE`: AST node type not implemented
  - `E_LENGTH_ASSIGN`: Assignment to array `.length` property
  - `E_NUM_AUGMENT_COERCION`: Augmented assignment requires numeric operands
  - `E_BITWISE_UNSUPPORTED`: Bitwise operators not supported
  - `E_ARRAY_METHOD_UNSUPPORTED`: Array method not supported
  - `E_OBJECT_METHOD_UNSUPPORTED`: Object method not supported
  - `E_REGEX_METHOD_UNSUPPORTED`: Regex method not supported
  - `E_LOOSE_EQ_OBJECT`: Loose equality with objects/arrays not supported
  - `E_SEQUENCE_EXPR_CONTEXT`: SequenceExpression in unsupported context
  - `E_IN_OPERATOR_UNSUPPORTED`: 'in' operator not supported
  - `E_UNRESOLVED_IDENTIFIER`: Undeclared identifier
  - `E_INSTANCEOF_UNSUPPORTED`: 'instanceof' operator not supported
  - Others as needed
- [ ] ❌ **Add troubleshooting section**: Map common patterns to alternatives
  - "Use Math.floor() instead of bitwise OR `| 0` to truncate"
  - "Use explicit for-loop instead of .map()/.filter()/.reduce()"
  - "Use strict equality (===) instead of loose equality (==) for objects"
  - "Refactor comma expressions to separate statements or use --use-walrus"
- [ ] ❌ Document known limitations:
  - **Python ≥ 3.8 recommended** (walrus operator for logical expressions; 3.7 fallback available but verbose)
  - **Return semantics**: `return;` (bare return) yields `undefined`, not `null`
  - **SequenceExpression**: Comma operator `(a, b, c)` supported
  - **Strict equality**: -0 vs +0 distinction not implemented (acceptable for demo; `-0 === +0` is `true`)
  - **Augmented assignment**: `+=` uses JS semantics (string concat); `-=`/`*=`/`/=`/`%=` are numeric-only (error on type mismatch)
  - **Math.round**: .5 behavior differs (Python uses banker's rounding; avoid .5 inputs or use js_round shim)
  - **JSDate timezone**: Uses UTC for predictability (document this clearly)
  - **Loose equality**: ToPrimitive on objects not supported; only primitives supported
  - **Nested function hoisting**: Not supported (call-after-definition only)
  - **No try/catch**: throw raises JSException but cannot be caught in transpiled code
  - **Switch fall-through**: Between non-empty cases not supported (must use explicit break)
  - **Regex flags**: g, y, u not supported (workarounds: re.findall, etc.)
  - **No closure support**: Beyond lexical nesting (captured variables not mutable across scopes)
  - **Delete on identifiers**: Not supported (error)
  - **For-in enumeration order**: Insertion order for objects, ascending numeric for arrays (ES5 order is implementation-quirky; this is acceptable for demo and may differ from some engines; document as "behavior may differ")
  - **Method calls requiring 'this'**: Not supported unless recognized standard library method
  - **Bitwise operators**: All bitwise ops (`|`, `&`, `^`, `~`, `<<`, `>>`, `>>>`) not supported
  - **Array methods**: `push`, `pop`, `shift`, `unshift`, `splice`, `map`, `filter`, `reduce`, `forEach`, etc. not supported
  - **Object methods**: `Object.keys`, `Object.values`, `Object.assign`, etc. not supported
  - **Regex methods**: `match`, `exec` not supported; use `.test()` or Python re module
  - **SequenceExpression limits**: In statement-temp mode, limited to for-init/update; use --use-walrus for general support
  - **Assignment-in-expression**: Statement-temp lifting default; use --use-walrus for inline pattern
  - **'in' operator**: Out of scope (property existence checking); error with workaround
  - **'instanceof' operator**: Out of scope; error
- [ ] ❌ Provide migration guide (unsupported features and alternatives)
- [ ] ❌ Document arithmetic coercion strategy decision (numeric-only recommended for demo)
  - Exact coercion tables in runtime docstrings (strings with leading/trailing whitespace, empty string, hex/octal forms if supported)
  - Explicitly state simplifications (e.g., hex/octal support skipped; document limitation)
- [ ] ❌ Document ESTree node expectations from Acorn:
  - **SequenceExpression**: `node.expressions` array
  - **Regex literal**: `node.regex.pattern`, `node.regex.flags`
  - **ForInStatement** vs ForOfStatement distinction
  - **MemberExpression**: `computed` flag
  - **UpdateExpression**: prefix vs postfix, operator (++ vs --)
  - **Literal** types: string, number, boolean, null, regex
  - **ReturnStatement**: `argument` may be null for bare return
- [ ] ❌ Add explicit examples of unsupported ES5 Abstract Equality edge cases:
  - Object-to-primitive coercion (ToPrimitive): Not supported
  - Complex array/object comparisons: Not supported
  - Date object comparisons: Not supported
  - Symbol comparisons: Not applicable (ES6 feature)
- [ ] ❌ Document import management: No unused imports (test for this); deterministic ordering

---

### 5.8 Phase 5 Deliverable
- [ ] ❌ Complete test suite with 100% coverage of supported subset
- [ ] ❌ CLI tool ready for use
- [ ] ❌ (Optional) Working playground demo
- [ ] ❌ Comprehensive documentation

---

## Final Acceptance Checklist

- [ ] ❌ All Phase 1-5 tasks complete
- [ ] ❌ Representative snippets transpile and execute correctly
- [ ] ❌ Clear errors for unsupported features
- [ ] ❌ Readable Python output
- [ ] ❌ Minimal runtime library
- [ ] ❌ Imports added only when needed
- [ ] ❌ Golden tests pass
- [ ] ❌ Execution parity verified
- [ ] ❌ Documentation complete

---

## Notes for Developers

**Starting Point:** Begin with Phase 1.1 (Project Setup). Each task is self-contained and can be picked up independently once prerequisites are met.

**CRITICAL**: Read the "Critical Correctness Requirements" section at the top before implementing any feature.

**Testing Strategy:** Write tests alongside implementation. Use TDD where possible: write test first, implement feature, verify.

**AST References:**
- ESTree spec: https://github.com/estree/estree
- Python AST: https://docs.python.org/3/library/ast.html
- `@kriss-u/py-ast`: Check package documentation for node builders
- Acorn parser: https://github.com/acornjs/acorn

**Runtime Design:** Keep runtime minimal. Prefer simple, well-tested helpers over complex inline transformations. Document all unsupported edge cases.

**Error Messages:** Always include:
1. Node type and source location (line/column from `locations: true`)
2. Why it failed (out of scope, unsupported)
3. What to change (suggestion or workaround)

**Architectural Decisions:**
- **Python version**: Python ≥ 3.7 (statement-temp mode); ≥ 3.8 for --use-walrus mode
- **Default codegen strategy**: Statement-temp lifting (avoids walrus dependency, works on 3.7+)
- **Return semantics**: Bare `return;` → `return JSUndefined` (NOT Python's implicit `None`)
- **SequenceExpression**: Limited to for-init/update in statement-temp mode; general support with --use-walrus
- **Assignment-in-expression**: Statement-temp lifting default; walrus optional with --use-walrus
- **Logical operators**: Statement-temp pattern default; walrus optional
- **Strict equality**: Use `js_strict_eq()` for ALL `===` (including switch); identity for objects, value for primitives; -0 vs +0 not distinguished
- **Augmented assignment**: `+=` uses `js_add()` (string concat + numeric); `-=`/`*=`/`/=`/`%=` numeric-only (error on type mismatch)
- **Loose equality**: Primitives + null/undefined only; error on objects/arrays (ToPrimitive complexity)
- **Global identifiers**: Map `undefined` → `JSUndefined`, `NaN` → `float('nan')`, `Infinity` → `math.inf`
- **Member access**: Default to subscript `obj['prop']` (reads AND writes); exception: `.length` detection
- **Break/Continue validation**: Pre-pass tags nodes with loop/switch ancestry for better diagnostics
- **Switch fall-through**: Static validator detects non-empty fall-through and errors early
- **Console.log**: Map to runtime `console_log()` function (not direct `print`)
- **Imports**: Deterministic order (stdlib first: math, random, re; then runtime imports sorted); no unused imports; test for unused imports
- **Temp naming**: Use `__js_tmp<n>` prefix for all temps; `__js_switch_disc_<id>` for switch discriminants; document to avoid collisions
- **Nested functions**: Lexically scoped but NOT hoisted (call-after-definition only; error otherwise)
- **No try/catch**: Out of scope; throw raises JSException but cannot be caught
- **Delete on identifiers**: ERROR (recommended; consistent in transformer + runtime)
- **JSDate timezone**: Use UTC for predictability
- **Bitwise operators**: Out of scope; error with alternatives suggested
- **Array/Object methods**: Out of scope; error with manual loop alternatives
- **Regex usage**: `.test()` and `.replace()` supported; `.match()`/`.exec()` out of scope
- **Regex escaping**: Always use Python raw strings `r'...'` for patterns to avoid double-escaping
- **Unresolved identifiers**: Pre-pass detects undeclared variables; error early (prevents ReferenceError-like bugs)

**Progress Tracking:** Update checkboxes as you complete tasks. Change ❌ → 🔄 when starting, 🔄 → ✅ when done.
