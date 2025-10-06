# ES5-to-Python Transpiler: Detailed Implementation Plan & Progress Tracking

**Status Legend:** ❌ Not Started | 🔄 In Progress | ✅ Complete

---

## Critical Correctness Requirements (READ FIRST)

Before implementing, ensure these key semantic issues are addressed:

1. **Python version requirement**: Python ≥ 3.8 required. Walrus operator (`:=`) is the single strategy for assignment-in-expression and logical expressions. No fallback mode.

2. **Strict equality for objects/arrays/functions**:
   - **CRITICAL BUG**: Python `==` uses value equality; JS `===` uses identity for objects
   - `{} === {}` → `False` in JS, but `{} == {}` → `True` in Python
   - Must use `js_strict_eq(a, b)` runtime helper for ALL `===` comparisons (including switch cases)
   - Only primitives (string, number, boolean) use value equality; objects/arrays/functions use identity (`is`)

3. **Global identifiers (NaN, Infinity, undefined)**:
   - Map `undefined` identifier → `JSUndefined`
   - Map `NaN` identifier → `float('nan')`
   - Map `Infinity` identifier → `_js_math.inf` (use aliased import to avoid collisions)
   - Map `-Infinity` → `-_js_math.inf` (handle unary minus on Infinity)

4. **Return without expression**: `return;` (bare return) must emit `return JSUndefined` (NOT Python's implicit `None`). JS `return;` yields `undefined`, not `null`.

5. **Continue in for-loops**: When desugaring `for(init; test; update)` to while, `continue` must execute update before jumping to test. Only rewrite `continue` in the specific desugared loop's body, NOT inner loops. Use loop ID tagging to track which continues belong to which loop. **CRITICAL**: If update is a SequenceExpression with multiple statements, emit the entire update expression once, in order, before continue.

6. **SequenceExpression (comma operator)**: Support `(a, b, c)` which evaluates left-to-right and returns last value. Common in for-loop init/update: `for(i=0, j=0; ...; i++, j++)`. Ensure single-eval semantics.

7. **null vs undefined**:
   - Create `JSUndefined` sentinel (distinct from Python `None`)
   - `None` represents JS `null`
   - `JSUndefined` represents JS `undefined`
   - Uninitialized vars → `JSUndefined`
   - `typeof null` → `'object'`, `typeof undefined` → `'undefined'`

8. **Augmented assignment semantics**:
   - `+=` must use `js_add(lhs, rhs)` (string concatenation if either operand is string; otherwise numeric)
   - **REVISED DECISION** (S3 implementation): `-=`, `*=`, `/=`, `%=` use full ToNumber coercion via `js_sub`, `js_mul`, `js_div`, `js_mod` runtime helpers
   - **Rationale**: Matches JavaScript semantics exactly; simplifies transformer logic (uniform treatment of all augmented ops); runtime helpers handle all edge cases consistently
   - **Implementation**: All augmented assignment operators (`+=`, `-=`, `*=`, `/=`, `%=`) call corresponding runtime helpers; single-eval of member targets enforced with temps
   - Previous "numeric-only" policy was overly restrictive; full ToNumber coercion is more correct

9. **delete on arrays**: Python `del` shifts elements; JS leaves holes. Assign `JSUndefined` at index instead of deleting.

10. **delete on identifiers**: `delete identifier` returns `false` in JS (non-configurable). **Decision**: Use ERROR (recommended) for clarity. Be consistent in transformer + runtime.

11. **Switch case comparison**: Use strict equality (`js_strict_eq`) for case matching, not loose equality. Add static validation pass to detect non-empty fall-through and error early. **ENFORCEMENT**: Transform must fail if any `===`/`!==` path escapes without `js_strict_eq`/`js_strict_neq`, including all switch-case codegen.

12. **Strict equality edge cases**: Handle NaN (`NaN !== NaN`). **Decision on -0 vs +0**: JS treats `-0 === +0` as `true`. Document if skipping -0 distinction (acceptable for demo).

13. **js_truthy coverage**: Include `NaN` as falsy (use `_js_math.isnan()`). Empty arrays/objects are truthy.

14. **String method edge cases**:
    - `charAt(i)`: Use `str[i:i+1]` for out-of-range → empty string
    - `charCodeAt(i)`: Return `float('nan')` for out-of-range
    - `substring(s, e)`: Clamp negatives to 0, swap if start > end

15. **For-in keys**: Always yield **strings** (dict keys, list indices as '0', '1', etc.); skip array holes (JSUndefined). Test sparse arrays and numeric-like string keys.

16. **Member access**: Default to subscript `obj['prop']` for ALL property access (read AND write) to avoid attribute shadowing. Exception: `.length` property detection only.

17. **Logical operators**: Preserve original operand values in short-circuit evaluation, not coerced booleans. Use walrus operator (Python 3.8+ NamedExpr). Pattern: `a && b` → `(b if js_truthy(__js_tmp1 := a) else __js_tmp1)`. Ensure single-eval semantics via walrus assignment to temp.

18. **Break/Continue validation**: Add pre-pass to tag nodes with loop/switch ancestry for better error messages ("continue inside switch", "break outside loop").

19. **Error messages**: Include node type, location, "why" explanation, and "what to change" suggestion. Optional: Add error codes (e.g., `E_UNSUPPORTED_FEATURE`) for programmatic filtering.

20. **AssignmentExpression used as expression**: JS allows assignments inside `if`, `while`, logical expressions, and ternaries.
   - **DECISION**: Use walrus operator (`:=` / Python NamedExpr) since Python ≥ 3.8 is required
   - Pattern: `if (x = y)` → `if js_truthy(x := y): ...`
   - Pattern: `a && (x = y)` → `((x := y) if js_truthy(__js_tmp1 := a) else __js_tmp1)`
   - **CRITICAL**: Ensure single-evaluation semantics (evaluate RHS once, assign, use value)
   - **CRITICAL**: Handle ALL contexts that can host assignment: if/while tests, logical expressions, ternaries, call args, return values
   - Verify `py-ast` supports walrus operator (NamedExpr node)

21. **Single-evaluation of assignment/update targets**: For `MemberExpression` targets, capture base and key in temps before read/compute/write.
   - `obj().prop += f()` must evaluate `obj()` exactly once
   - `obj[key()]++` must evaluate `obj` and `key()` exactly once
   - Pattern: Capture base/key → read → compute → write using same base/key temps
   - Applies to ALL `AssignmentExpression` and `UpdateExpression` with member targets
   - Create "single-eval assignment target" utility in transformer

22. **SequenceExpression scope**: **DECISION FOR DEMO**: Limit to for-init/update contexts only.
   - Support ONLY in `for(init; test; update)` init and update clauses (most common real-world usage)
   - Common use case: `for(i=0, j=0; ...; i++, j++)` is fully supported
   - **Out of scope**: SequenceExpression in other contexts (general expressions, conditionals, return values, assignments)
   - Error with code `E_SEQUENCE_EXPR_CONTEXT` if found outside for-init/update
   - Message: "SequenceExpression (comma operator) is only supported in for-loop init/update clauses. Refactor to separate statements."
   - Rationale: Simplifies implementation; covers 99% of real ES5 code; clear scope boundaries for demo

23. **Augmented assignment policy**: See Critical Correctness #8 above for the canonical policy statement. Summary: All augmented ops (`+=`, `-=`, `*=`, `/=`, `%=`) use runtime helpers with full ToNumber coercion for correct JavaScript semantics.

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

26. **Global functions policy**: Explicit decisions for common global functions:
   - **Out of scope** (error with helpful alternatives):
     - `parseInt(str, radix)` → Error code `E_PARSEINT_UNSUPPORTED`. Message: "parseInt() is not supported. Use int(str) for base-10 or implement custom parsing."
     - `parseFloat(str)` → Error code `E_PARSEFLOAT_UNSUPPORTED`. Message: "parseFloat() is not supported. Use float(str) for simple cases."
     - `RegExp(pattern, flags)` constructor → Error code `E_REGEXP_CONSTRUCTOR_UNSUPPORTED`. Message: "RegExp() constructor is not supported. Use regex literals /pattern/flags instead."
     - `Number(x)`, `String(x)`, `Boolean(x)` constructors → Error with alternatives (use `js_to_number`, string coercion, `js_truthy`)
   - **Minimal support** (runtime wrappers):
     - `isNaN(x)` → `js_isnan(x)` runtime helper (use `js_to_number` then `_js_math.isnan`)
     - `isFinite(x)` → `js_isfinite(x)` runtime helper (use `js_to_number` then `_js_math.isfinite`)
   - Document all global function policies in "Known Limitations" and error message tables

27. **Array and Object library methods**: Most array/object methods are **out of scope**.
   - **IN SCOPE (minimal real-world support)**: `push`, `pop` (extremely common, low complexity)
     - `arr.push(x)` → `arr.append(x)` (single arg only; multi-arg push is out of scope)
     - `arr.pop()` → `js_array_pop(arr)` runtime wrapper (returns `JSUndefined` for empty arrays, not error)
     - **Detection policy**: Only rewrite when receiver is provably an array (array literal or tracked variable)
     - Ambiguous receivers (e.g., function parameters of unknown type) → error with code `E_ARRAY_METHOD_AMBIGUOUS`
     - Multi-arg push → error with code `E_ARRAY_PUSH_MULTI_ARG`
   - Out of scope: `shift`, `unshift`, `splice`, `map`, `filter`, `reduce`, `forEach`, etc.
   - Out of scope: `Object.keys`, `Object.values`, `Object.assign`, etc.
   - Error with code `E_ARRAY_METHOD_UNSUPPORTED` or `E_OBJECT_METHOD_UNSUPPORTED`
   - Message: "Array/Object method 'X' is not supported. Use explicit loops or supported alternatives."
   - Document in "Known Limitations" section

28. **Regex 'g' flag policy (uniform and testable)**:
   - **ALLOWED context (ONLY)**: Inline regex literal in `String.prototype.replace()` call
     - Example: `'aaa'.replace(/a/g, 'b')` → Compiles regex WITHOUT 'g', uses `count=0` in `.sub()`
     - Pattern: `_regex = compile_js_regex('a', 'g')` → `compile_js_regex()` strips 'g' before compilation
     - Then: `_regex.sub('b', 'aaa', count=0)` → `count=0` means "unlimited replacements" in Python
   - **REJECTED contexts (ERROR with code `E_REGEX_GLOBAL_CONTEXT`)**: ALL other uses of 'g' flag
     - Stored in variable: `var r = /a/g; 'aaa'.replace(r, 'b')` → ERROR
     - Used with `.test()`: `/test/g.test('str')` → ERROR
     - In array literal: `var patterns = [/a/g, /b/];` → ERROR
     - In object literal: `var obj = {pattern: /a/g};` → ERROR
     - Passed as function arg: `function f(r) {} f(/a/g);` → ERROR at literal site
     - Any context other than inline `String.prototype.replace()` → ERROR
   - **Error message**: "Regex global flag 'g' is only supported in String.prototype.replace with inline literals. Inline the regex in the replace call, or use Python's re.findall()/re.finditer() for global matching."
   - **Implementation**: Strip 'g' at compile time in `compile_js_regex()`; detect usage context during AST transformation
   - **Testing**: Explicit tests for allowed context (inline replace) and all rejection contexts listed above
   - Map `regex.test(str)` → `bool(regex.search(str))` (no 'g' allowed)
   - Map `str.replace(regex, repl)` without 'g' → `regex.sub(repl, str, count=1)` (single replacement)
   - Document `String.prototype.match`, `RegExp.prototype.exec` as out of scope
   - Add test: `'aaa'.replace(/a/g, 'b')` → `'bbb'` (global replace, count=0)
   - Add test: `var r = /a/g; 'aaa'.replace(r, 'b')` → ERROR (stored variable with 'g' not allowed)

29. **Identifier sanitization for Python keywords**: Real-world code uses identifiers that collide with Python keywords/builtins.
   - **CRITICAL**: Sanitize identifiers that collide with Python reserved words or literals
   - Python keywords: `class`, `from`, `import`, `def`, `return`, `if`, `else`, `elif`, `while`, `for`, `in`, `is`, `not`, `and`, `or`, `async`, `await`, `with`, `try`, `except`, `finally`, `raise`, `assert`, `lambda`, `yield`, `global`, `nonlocal`, `del`, `pass`, `break`, `continue`, etc.
   - Python literals: `None`, `True`, `False`
   - **Policy**: If identifier collides, append `_js` suffix (e.g., `class` → `class_js`, `from` → `from_js`)
   - **Apply to**: Variable declarations, function names, parameters
   - **Do NOT apply to**: Object property keys (since we use subscript access `obj['class']`)
   - **CRITICAL - Reference consistency**: Maintain scope-aware mapping table in transformer
     - When `var class = 5` is sanitized to `class_js = 5`, ALL references to `class` in that scope become `class_js`
     - When `function from() {}` becomes `def from_js():`, ALL call sites `from()` become `from_js()`
     - When parameter `None` becomes `None_js`, ALL references in function body remap to `None_js`
     - Use symbol table to track sanitized names per scope (function/block)
     - References (`Identifier` in expression position) look up sanitized name from symbol table
   - **Implementation**: Two-pass per scope:
     1. First pass: Collect all declarations and build sanitized name mapping
     2. Second pass: Transform AST, remapping all identifier references using the mapping
   - Add tests:
     - Declaration + reference: `var class = 5; return class;` → `class_js = 5; return class_js;`
     - Function + call: `function from() { return 1; } from();` → `def from_js(): return 1; from_js();`
     - Parameter: `function f(None) { return None; }` → `def f(None_js): return None_js;`
     - Nested scopes: `function from() { var from = 1; return from; }` → inner `from` shadowing
     - Property access (NOT sanitized): `obj.class` → `obj['class']` (property key unchanged)

30. **Stdlib import aliasing to avoid name collisions**: Users may define variables named `math`, `random`, `re`, `time`.
   - **CRITICAL**: Import stdlib with stable aliases to avoid collisions with user code
   - `import math as _js_math`
   - `import random as _js_random`
   - `import re as _js_re`
   - `import time as _js_time`
   - Update ALL mappings to use aliased names:
     - `Math.sqrt(x)` → `_js_math.sqrt(x)` (not `math.sqrt(x)`)
     - `Math.random()` → `_js_random.random()` (not `random.random()`)
     - `compile_js_regex()` → `_js_re.compile()` in runtime
     - `js_date_now()` → `_js_time.time()` in runtime
   - Ensure runtime library uses aliased imports consistently
   - Add tests: `var math = 42; return Math.sqrt(16) + math;` → verify user `math` and stdlib `_js_math` don't collide

31. **Loose equality guardrails**: Error on unsupported coercions.
   - If either operand to `==`/`!=` is list/dict/callable → error with code `E_LOOSE_EQ_OBJECT`
   - Message: "Loose equality with objects/arrays is not supported (ToPrimitive coercion complexity). Use strict equality (===) or explicit comparison."
   - Only primitives + null/undefined rules are supported in `js_loose_eq`
   - Document exact supported subset in runtime docstring

32. **typeof undeclared identifier special case**: ES5 allows `typeof undeclaredVar` without ReferenceError.
   - **CRITICAL**: Unresolved identifier pre-pass must NOT error on `typeof <Identifier>` usage
   - Pattern: Detect `UnaryExpression` with operator `typeof` and argument `Identifier`
   - Transform `typeof undeclaredVar` → `'undefined'` (literal string, not runtime call)
   - Add test: `typeof undeclaredVariable` → `'undefined'` (no error, no reference to undeclaredVariable)
   - All other undeclared identifier usage still errors with `E_UNRESOLVED_IDENTIFIER`

33. **void operator support**: `void expr` evaluates `expr` for side effects and returns `undefined`.
   - Transform `void expr` → evaluate `expr` (for side effects), then return `JSUndefined`
   - Pattern: Statement context: `expr; result = JSUndefined`. Expression context: use walrus `(expr, JSUndefined)[-1]` or similar
   - Common usage: `void 0` → `JSUndefined` (idiomatic way to get undefined)
   - Add test: `void 0` → `JSUndefined`, `void f()` → calls `f()` and returns `JSUndefined`

34. **Function declarations inside blocks (Annex B behavior)**: ES5 allows function declarations in blocks, but behavior is implementation-dependent.
   - **DECISION**: Disallow function declarations inside blocks (if/while/for bodies) for clarity
   - Add validator pass to detect `FunctionDeclaration` inside block statement (not at top level or function body top level)
   - Error code: `E_FUNCTION_IN_BLOCK`
   - Message: "Function declarations inside blocks are not supported. Move function declaration to top level or use function expression: var name = function() {...};"
   - Rationale: Avoids Annex B edge cases; promotes clearer code
   - Add test: `if (true) { function f() {} }` → error with migration hint

35. **Date.now() support**: Common real-world usage for timestamps.
   - Map `Date.now()` → `js_date_now()` runtime helper
   - Runtime: `js_date_now()` → `int(_js_time.time() * 1000)` (milliseconds since epoch)
   - Requires aliased import: `import time as _js_time`
   - Add test: `Date.now()` → returns integer timestamp in milliseconds

---

**NOTE**: All Critical Correctness Requirements have matching actionable tasks in the Phase sections. See cross-reference analysis in `/CRITICAL_REQUIREMENTS_ANALYSIS.md` for complete mapping.

---

## Phase 1: Skeleton + Core Expressions/Statements

### 1.1 Project Setup
- [ ] ❌ Create project structure (src/, tests/, runtime/)
- [ ] ❌ Initialize package.json with dependencies: `acorn`, `py-ast`
  - **Pin versions**: Specify exact versions for `acorn` and `py-ast` for reproducibility
  - Document Node.js version (e.g., Node 18 LTS) and Python version (≥ 3.8 required)
- [ ] ❌ Configure TypeScript/JavaScript environment
- [ ] ❌ Set up test framework (Jest or similar)
- [ ] ❌ Create basic CLI entry point (`src/cli.ts` or `src/cli.js`)
  - Add `--output <file>` flag to write to file
  - Add `--run` flag to execute transpiled Python immediately
  - Add `--verbose` flag for debugging (show AST, etc.)
  - Emit Python version check in generated code header comment: `# Requires Python >= 3.8`
- [ ] ❌ **Verify walrus support**: Test that `py-ast` can unparse walrus operator (`:=` / NamedExpr node)
  - Required for assignment-in-expression contexts
  - Document walrus operator usage in generated code

**Deliverable:** Working build system, empty transpiler skeleton that can be invoked

---

### 1.2 Core AST Infrastructure
- [ ] ❌ Create `src/parser.ts`: Wrapper around acorn with config:
  - `ecmaVersion: 5` (ES5 syntax only)
  - `sourceType: 'script'` (NOT 'module'; prevents module-only syntax)
  - `locations: true` (for error messages with line/column)
  - `ranges: true` (for source mapping)
  - `allowReturnOutsideFunction: false` (enforce return only inside functions)
  - `allowReserved: true` (ES5 allows reserved words in some contexts)
  - Verify Acorn node shapes: `node.regex.pattern`, `node.regex.flags`, `SequenceExpression.expressions`
- [ ] ❌ Create `src/errors.ts`: Define `UnsupportedNodeError`, `UnsupportedFeatureError` with source location formatting
- [ ] ❌ Create `src/identifier-sanitizer.ts`: **CRITICAL** for real-world code
  - Maintain set of Python keywords and reserved literals
  - Keywords: `class`, `from`, `import`, `def`, `return`, `if`, `else`, `elif`, `while`, `for`, `in`, `is`, `not`, `and`, `or`, `async`, `await`, `with`, `try`, `except`, `finally`, `raise`, `assert`, `lambda`, `yield`, `global`, `nonlocal`, `del`, `pass`, `break`, `continue`
  - Literals: `None`, `True`, `False`
  - Function `sanitizeIdentifier(name: string): string` → append `_js` if collision
  - **Apply to**: Variable declarations, function names, parameters
  - **Do NOT apply to**: Object property keys (subscript access handles this)
  - **Scope-aware remapping**: Build symbol table mapping original → sanitized names per scope
    - Track ALL identifier declarations in scope (vars, function names, params)
    - When transforming `Identifier` nodes in expression position, look up sanitized name
    - Ensures ALL references are consistently remapped (not just declarations)
  - Test with:
    - `var class = 5; return class;` → both declaration and reference sanitized
    - `function from() { return 1; } from();` → function name and call site both sanitized
    - `function f(None) { return None; }` → parameter and reference both sanitized
    - `obj.class` → property key NOT sanitized (uses subscript `obj['class']`)
- [ ] ❌ Create `src/transformer.ts`: Base visitor class/framework for traversing ESTree AST
- [ ] ❌ Create `src/generator.ts`: Python AST unparsing using `py-ast`
- [ ] ❌ Create `src/import-manager.ts`: Track required imports with **aliasing**
  - Use aliased imports to avoid collisions: `import math as _js_math`, `import random as _js_random`, `import re as _js_re`, `import time as _js_time`
  - Track which aliases are needed based on feature usage
  - Emit imports in deterministic order

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
  - **CRITICAL**: NaN must be falsy (use `_js_math.isnan()` check for float values)
- [ ] ❌ Implement `class JSException(Exception)`: Store arbitrary thrown value in `.value` attribute
- [ ] ❌ Add basic module structure with `__all__` export list

**Deliverable:** Minimal runtime that supports basic truthiness and exception handling

---

### 1.4 Literals and Basic Expressions
- [ ] ❌ Transform `Literal` nodes (string, number, boolean, null → None, regex → defer to Phase 4)
- [ ] ❌ Transform `Identifier` nodes:
  - **CRITICAL**: Map global identifiers: `undefined` → `JSUndefined`, `NaN` → `float('nan')`, `Infinity` → `_js_math.inf`
  - Regular identifiers → apply sanitization for Python keyword collisions (via `sanitizeIdentifier`)
  - Add aliased import `import math as _js_math` via import manager when `Infinity` is used
  - Handle unary minus on `Infinity`: `-Infinity` → `-_js_math.inf` (needs UnaryExpression handling)
- [ ] ❌ Transform `ArrayExpression` → Python `List` AST node
- [ ] ❌ Transform `ObjectExpression` → Python `Dict` AST node
  - Support identifier keys: `{a: 1}` → `{'a': 1}`
  - Support string-literal keys: `{'a': 1}` → `{'a': 1}`
  - Error on computed keys: `{[expr]: 1}` → unsupported
- [ ] ❌ Transform arithmetic operators: `+`, `-`, `*`, `/`
  - **LOCKED DECISION**: Use runtime helpers with full ToNumber coercion for all binary arithmetic operators
  - `+`: Use runtime helper `js_add(a, b)` (handles number addition vs string concatenation)
  - `-`: Use runtime helper `js_sub(a, b)` (ToNumber coercion; e.g., `'5' - 2` → `3`)
  - `*`: Use runtime helper `js_mul(a, b)` (ToNumber coercion)
  - `/`: Use runtime helper `js_div(a, b)` (ToNumber coercion; handles infinity for division by zero)
  - **Rationale**: Common patterns like `'5' - 2` work correctly; matches JS semantics
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
    - Handle NaN: `NaN !== NaN` → `True` (use `_js_math.isnan()`)
    - Handle null: `None` identity
    - Handle undefined: `JSUndefined` identity
    - Primitives (string, number, boolean): value equality
    - Objects/arrays/functions: identity check (`a is b`)
  - Use `js_strict_eq` for ALL `===` comparisons (including switch case tests)
- [ ] ❌ Transform `==` and `!=` → `js_loose_eq()` and `js_loose_neq()` calls (add to runtime in Phase 4)
- [ ] ❌ Transform `LogicalExpression` (`&&`, `||`) → **return original operand values** (not booleans)
  - **CRITICAL**: JS returns the actual operand, not a coerced boolean
  - **Walrus-based transformation using Python NamedExpr**:
    - `a && b` → `(b if js_truthy(__js_tmp1 := a) else __js_tmp1)`
    - `a || b` → `(__js_tmp1 if js_truthy(__js_tmp1 := a) else b)`
    - Python AST: Use `NamedExpr(target=Name(__js_tmp1), value=a)` for walrus operator
  - **Single-evaluation guarantee**: Left operand evaluated exactly once via walrus assignment
    - Walrus captures operand value in temp before truthiness check
    - Both branches of conditional expression use the same temp (no re-evaluation)
    - Side effects (function calls, mutations) happen exactly once
  - Create temp allocator in transformer state for unique temp names (prefix: `__js_tmp1`, `__js_tmp2`, etc.)
  - **Nested logicals**: Require a temp per short-circuit boundary
    - Example: `a && b && c` → temp for `a`, separate temp for `a && b` result
    - Pattern: `((__js_tmp2 if js_truthy(__js_tmp2 := (b if js_truthy(__js_tmp1 := a) else __js_tmp1)) else __js_tmp2) if js_truthy(...) else c)`
  - Test to ensure operand identity preservation (not coerced to boolean)
- [ ] ❌ Transform `UnaryExpression`:
  - `!` → `not js_truthy(...)`
  - `-` (unary minus) → direct for numbers, or use `js_negate()` for coercion
  - `+` (unary plus) → `js_to_number(x)` runtime helper for ToNumber coercion
  - `void` → evaluate operand for side effects, then emit `JSUndefined`
    - Common idiom: `void 0` yields `undefined`
    - Pattern: `void expr` → evaluate `expr`, then return `JSUndefined`. Use tuple indexing: `(expr, JSUndefined)[1]` or sequence with walrus
    - Ensure operand is evaluated (for side effects like `void f()`)
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

**Test (void operator):** `void 0` → `JSUndefined`

**Test (void with side effects):** `void (x = 5)` → evaluates `x = 5`, returns `JSUndefined`

---

### 1.5 Variable Declarations and Assignments
- [ ] ❌ Transform `VariableDeclaration`: Collect `var` names (first pass, defer hoisting to Phase 2)
- [ ] ❌ Transform `VariableDeclarator` with initializer → Python `Assign`
- [ ] ❌ Transform `AssignmentExpression`:
  - **CRITICAL**: Handle assignment used as expression (see Critical Correctness #20)
  - **Walrus-based transformation using Python NamedExpr**:
    - `if (x = y)` → `if js_truthy(x := y): ...`
    - `while (x = y)` → `while js_truthy(x := y): ...`
    - `a && (x = y)` → `((x := y) if js_truthy(__js_tmp1 := a) else __js_tmp1)`
      - Walrus in truthy branch only; false branch returns temp from `a` evaluation
    - `a || (x = y)` → `(__js_tmp1 if js_truthy(__js_tmp1 := a) else (x := y))`
      - Walrus in falsy branch only; true branch returns temp from `a` evaluation
    - Call args: `f(x = y)` → `f(x := y)` (walrus directly in arg position)
    - Return values: `return (x = y);` → `return (x := y)` (walrus in return expression)
    - Ternary test: `(x = y) ? a : b` → `(a if js_truthy(x := y) else b)` (walrus in test)
    - Python AST: Use `NamedExpr(target=Name(x), value=y)` for walrus operator
  - **Single-evaluation guarantee**: RHS evaluated exactly once, value assigned and returned
    - Walrus operator evaluates RHS, assigns to target, returns assigned value
    - No temporary needed for simple assignment (walrus handles it)
  - **Assignment operators**:
    - `=` → `Assign` (or walrus `NamedExpr` in expression context)
    - `+=`, `-=`, `*=`, `/=`, `%=` → See Critical Correctness #8 for augmented assignment policy
      - All augmented ops use runtime helpers: `js_add`, `js_sub`, `js_mul`, `js_div`, `js_mod`
      - Transform to `lhs = js_op(lhs, rhs)` with full ToNumber coercion (not Python AugAssign)
- [ ] ❌ **Single-evaluation for member targets** (see Critical Correctness #8, #21, #24):
  - For `MemberExpression` target: Capture base and key in temps before read/compute/write
  - Pattern: `_base := base_expr`, `_key := key_expr`, read `_base[_key]`, compute, write `_base[_key] = result`
  - Ensures `obj().prop += f()` evaluates `obj()` and `f()` exactly once
  - Create "single-eval assignment target" utility in transformer
- [ ] ❌ Support assignment targets: `Identifier`, `MemberExpression` (dot and bracket both → subscript)

**Test:** `function test() { var x = 5; x += 10; return x; }` → `x = js_add(x, 10)` → `15`

**Test:** `var s = 'hello'; s += ' world';` → `s = js_add(s, ' world')` → `'hello world'`

**Test:** `var x = 5; x += '3';` → `x = js_add(x, '3')` → `'53'` (string concatenation)

**Test (assignment in condition):** `if (x = f()) { ... }` → `if js_truthy(x := f()): ...` (NamedExpr walrus; single-eval of f())

**Test (assignment in while):** `while (x = next()) { ... }` → `while js_truthy(x := next()): ...` (NamedExpr walrus; single-eval of next())

**Test (assignment in logical AND):** `a && (x = y)` → `((x := y) if js_truthy(__js_tmp1 := a) else __js_tmp1)` (walrus in truthy branch; single-eval of `a`)

**Test (assignment in logical OR):** `a || (x = y)` → `(__js_tmp1 if js_truthy(__js_tmp1 := a) else (x := y))` (walrus in falsy branch; single-eval of `a`)

**Test (assignment in ternary):** `(x = y) ? a : b` → `(a if js_truthy(x := y) else b)` (NamedExpr walrus in test position)

**Test (assignment in call arg):** `f(x = y)` → `f(x := y)` (NamedExpr walrus directly in argument)

**Test (assignment in return):** `return (x = y);` → `return (x := y)` (NamedExpr walrus in return expression)

**Test (member augassign single-eval):** `getObj().prop += f()` → `_base = getObj(); _base['prop'] = js_add(_base['prop'], f())` (evaluates `getObj()` once)

**Test (bracket augassign single-eval):** `obj[g()] += h()` → temps for `obj`, `g()`, `h()`; evaluate each exactly once

---

### 1.6 Function Declarations and Return
- [ ] ❌ Transform `Program` → Python `Module`
- [ ] ❌ **CRITICAL**: Validate function declarations inside blocks
  - ES5 function declarations inside blocks (e.g., `if (cond) { function f() {} }`) have implementation-specific behavior (Annex B)
  - Acorn will parse them, but semantics are surprising/inconsistent across engines
  - **DECISION FOR DEMO**: Either:
    - (a) **Recommended**: Disallow with validator (error code `E_FUNCTION_IN_BLOCK`) and helpful message: "Function declarations inside blocks are not supported (Annex B). Use var f = function() {} instead."
    - (b) Normalize to `var f = function() {}` (FunctionExpression) before transform
  - Only allow function declarations at:
    - Program top-level
    - Immediately inside function bodies (nested functions)
  - Detect during AST traversal: if `FunctionDeclaration` parent is not `Program` or `FunctionDeclaration.body`, error or normalize
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

**Test (function in block):** `if (true) { function f() {} }` → error `E_FUNCTION_IN_BLOCK` with message suggesting `var f = function() {}`

---

### 1.7 UpdateExpression Support (++/--)
- [ ] ❌ Transform `UpdateExpression` for `++` and `--` operators
  - Prefix `++x`: Increment then return new value
  - Postfix `x++`: Return old value then increment
  - Prefix `--x`: Similar to `++x`
  - Postfix `x--`: Similar to `x++`
  - **CRITICAL**: Postfix returns old value; prefix returns new value
  - **CRITICAL**: Single-evaluation for `MemberExpression` targets (see Critical Correctness #21)
    - `obj[key()]++` must evaluate `obj` and `key()` exactly once
    - Capture base/key in temps, read, compute, write using same temps
  - **Implementation strategy**:
    - For for-update clause: Inline code okay since result value not used (simple increment/decrement)
    - For expression contexts: Use runtime helpers `js_pre_inc()`, `js_post_inc()`, `js_pre_dec()`, `js_post_dec()` for correctness
  - Minimum viable: Full support in ForStatement update clause (most common use case)
  - Extended: Support in other contexts (assignments, expressions) via runtime helpers

**Test:** `var i = 0; var x = i++;` → `x = 0`, `i = 1`
**Test:** `var i = 0; var x = ++i;` → `x = 1`, `i = 1`
**Test:** `for (var i = 0; i < 3; i++) { ... }` → uses `i++` in update
**Test (member update single-eval):** `obj[key()]++` → temps for `obj`, `key()`; evaluate each once
**Test (complex member update):** `getArr()[i++]++` → if in scope, verify nested evaluation order

---

### 1.8 SequenceExpression (Comma Operator)
- [ ] ❌ Transform `SequenceExpression` in for-init/update contexts ONLY
  - **SCOPE DECISION FOR DEMO**: Support ONLY in `for(init; test; update)` init and update clauses
  - **CRITICAL**: Required for for-loops: `for(i=0, j=0; ...; i++, j++)`
  - Acorn produces `SequenceExpression` with `expressions` array
  - Implementation: Emit each expression as separate statement in for-init/update transformation
  - **Out of scope**: SequenceExpression in all other contexts (general expressions, conditionals, return values, assignments, call arguments)
  - Add context tracking: Mark when transformer is inside for-init or for-update
  - Error with code `E_SEQUENCE_EXPR_CONTEXT` if `SequenceExpression` found outside for-init/update
  - Message: "SequenceExpression (comma operator) is only supported in for-loop init/update clauses. Refactor to separate statements."
  - Rationale: Covers 99% of real ES5 usage; simplifies implementation; clear scope boundaries

**Test:** `for (var i = 0, j = 0; i < 3; i++, j++) { ... }` → init and update both use SequenceExpression (supported)

**Test (error):** `var x = (a(), b(), c());` → error `E_SEQUENCE_EXPR_CONTEXT`: "SequenceExpression is only supported in for-loop init/update"

**Test (error):** `if ((a(), b())) { ... }` → error `E_SEQUENCE_EXPR_CONTEXT`

**Test (error):** `return (a(), b());` → error `E_SEQUENCE_EXPR_CONTEXT`

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
  - Dict: yield keys **converted to strings** (use `str(key)` to ensure all keys are strings)
    - **CRITICAL**: JS always converts property names to strings, even numeric properties
    - Example: `{1: 'a', 2: 'b'}` → yields `'1'`, `'2'` (strings, not integers)
  - List: yield indices as strings (`'0'`, `'1'`, ...) **but skip holes**
    - **CRITICAL**: Skip indices where value is `JSUndefined` (array holes created by delete)
    - JS for-in skips deleted array elements; our implementation must do the same
  - String: yield indices as strings
  - **CRITICAL**: All keys must be strings to match JS for-in behavior
  - **Enumeration order note**: ES5 order is implementation-quirky; for demo use "insertion order for dicts, ascending numeric for arrays"
    - Document this limitation: "For-in enumeration order: insertion order for objects, ascending numeric for arrays"
- [ ] ❌ Transform `ForInStatement(left, right, body)` → `for key in js_for_in_keys(right): body`
- [ ] ❌ Handle left side: `var x` or bare identifier

**Test:** `for (var k in {a: 1, b: 2}) { ... }` → iterates over `'a'`, `'b'` (strings)

**Test:** `for (var i in [10, 20, 30]) { ... }` → iterates over `'0'`, `'1'`, `'2'` (strings, not ints)

**Test:** `var arr = [1, 2, 3]; delete arr[1]; for (var i in arr) { ... }` → iterates over `'0'`, `'2'` (skips hole at index 1)

**Test:** `for (var k in {'0': 'a', '1': 'b'}) { ... }` → numeric-like string keys work correctly

**Test (numeric keys):** `for (var k in {1: 'a', 2: 'b'}) { ... }` → iterates over `'1'`, `'2'` (keys converted to strings)

**Test (assert string type):** `for (var k in {a: 1}) { console.log(typeof k); }` → prints `'string'` (verify keys are strings, not other types)

**Test:** Sparse array with multiple holes: `var a = []; a[0] = 1; a[5] = 2; for (var i in a) { ... }` → iterates over `'0'`, `'5'`

---

### 2.8 Switch Statements (with Static Validation)

**Implementation steps (in order):**

#### Step 1: Static Validation Pass (runs before transformation)
- [ ] ❌ Implement static validator to detect fall-through between non-empty cases:
  - Traverse switch cases sequentially
  - For each case with statements (non-empty):
    - Check if it ends with explicit terminator (`break`, `return`, `throw`)
    - If not, check if next case is empty (allowed as alias) or non-empty (error)
  - **Error on**: Non-empty case → non-empty case without terminator
  - **Allow**: Consecutive empty cases (case aliases: `case 1: case 2: case 3: stmt; break;`)
  - **Detect subtle case**: "non-empty case → empty alias case(s) → non-empty case without break" as invalid
  - Error message: "Fall-through between non-empty cases is unsupported; add explicit break statement at line X"

#### Step 2: Cache Discriminant in Temp Variable
- [ ] ❌ **CRITICAL**: Evaluate discriminant expression once and store in temp variable
  - Generate unique temp name: `__js_switch_disc_<id>` (use switch ID from pre-pass)
  - Pattern: `__js_switch_disc_1 = discriminant_expr`
  - Prevents re-evaluation if discriminant has side effects (e.g., `switch(i++)`)
  - Prevents re-dispatch if case bodies mutate variables referenced in discriminant
  - This temp is used for ALL subsequent case comparisons

#### Step 3: Transform to `while True` Wrapper
- [ ] ❌ Transform `SwitchStatement` to `while True:` block structure
  - Wrapper pattern:
    ```python
    __js_switch_disc_1 = discriminant_expr
    while True:
        if js_strict_eq(__js_switch_disc_1, case1_value):
            # case1 body
            break  # synthesized if not present
        elif js_strict_eq(__js_switch_disc_1, case2_value):
            # case2 body
            break  # synthesized if not present
        else:  # default case
            # default body
            break  # always synthesized
        break  # safety break (should never reach)
    ```
  - The `while True` allows user `break` statements to exit the switch

#### Step 4: Build Nested `if/elif/else` for Cases
- [ ] ❌ Generate nested conditional chain for cases:
  - First case → `if js_strict_eq(__js_switch_disc, case_value):`
  - Subsequent cases → `elif js_strict_eq(__js_switch_disc, case_value):`
  - Default case → `else:` (if present)
  - Empty cases (aliases) → chain multiple conditions: treat `case 1: case 2: stmt;` as `if (...case1...) or (...case2...): stmt`

#### Step 5: Use Strict Equality for ALL Case Matching
- [ ] ❌ **CRITICAL**: Use `js_strict_eq()` runtime helper (NOT Python `==`) for every case comparison
  - Generate: `js_strict_eq(__js_switch_disc, case_value)` for each case
  - This matches JS switch semantics (strict comparison, identity for objects/arrays/functions)
  - Ensures `switch (x) { case {}: ... }` doesn't match a different object literal
  - Ensures `switch (x) { case NaN: ... }` never matches (NaN !== NaN)
  - Handle primitives vs objects correctly (value equality vs identity)

#### Step 6: Synthesize `break` at End of Taken Branch
- [ ] ❌ **CRITICAL**: Synthesize `break` statement at the end of each case body if not already present
  - Check if case body ends with `break`, `return`, or `throw`
  - If not, append `break` statement
  - Applies to: all non-empty cases AND default case
  - Prevents infinite loop if user code in case mutates variables
  - Rule: Each taken branch must exit the `while True` wrapper exactly once

#### Step 7: Handle Default Case
- [ ] ❌ Transform `default` case as final `else` clause in the conditional chain
  - If no default case present, no `else` clause (fall through to final safety `break`)
  - If default case present, emit `else: default_body; break`

#### Step 8: Error on `continue` Inside Switch
- [ ] ❌ Use ancestry info from pre-pass (Section 2.4) to detect `continue` inside switch
  - Error message: "Continue statement inside switch is not supported. Use break to exit switch, or refactor to use a loop."
  - This prevents confusion with loop semantics

#### Step 9: Documentation
- [ ] ❌ Document in code comments and user docs:
  - Each non-empty case must end with explicit `break`, `return`, or `throw`
  - Fall-through between non-empty cases is not supported (static validation will catch this)
  - Consecutive empty cases are supported as aliases
  - Discriminant is evaluated once at switch entry and cached

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

**Test (switch discriminant side-effect + case mutation):** `var x = 0; switch(x++) { case 0: x = 5; break; case 1: return 'matched 1'; default: return 'default'; }` → verify discriminant is cached (doesn't re-dispatch after x mutation), returns from case 0 branch

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
  - Detect `.length` specifically and map to `len()` for reads
  - All other properties use subscript
  - **Array `.length = n` assignment**:
    - **SPECIAL CASE SUPPORTED**: `arr.length = 0` (literal zero only) → `arr.clear()`
      - Very common pattern for clearing arrays in JavaScript
      - Only literal `0` supported (not variables, not expressions like `1 - 1`)
      - Static check during transformation: `node.right.type === 'Literal' && node.right.value === 0`
      - Map to Python `arr.clear()` (Python 3.3+) for clarity and correctness
      - High practical value: appears in many real-world code snippets
      - Low implementation risk: simple special case with clear semantics
    - **ALL OTHER VALUES UNSUPPORTED**: `arr.length = n` where `n != 0` (literal) → error
      - ES5 allows arbitrary truncate/extend; our implementation does not
      - Error code: `E_LENGTH_ASSIGN`
      - Error message: "Assignment to array .length is only supported for .length = 0 (clear pattern). Arbitrary length assignment (truncate/extend) is not supported."
      - Explicit validation in Phase 3.1/3.4: Check if assignment target is `.length`
        - If RHS is literal `0`: emit `arr.clear()`
        - Otherwise (including variables, expressions, non-zero literals): error with `E_LENGTH_ASSIGN`
    - Document in "Known Limitations" with explanation of supported exception
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
- [ ] ❌ Create lookup tables for special cases (Math, String methods, global functions)
- [ ] ❌ **Detect and handle global function calls** (Critical Correctness #26):
  - **Supported (map to runtime helpers)**:
    - `isNaN(x)` → `js_isnan(x)` runtime helper (uses `js_to_number` then `_js_math.isnan`)
    - `isFinite(x)` → `js_isfinite(x)` runtime helper (uses `js_to_number` then `_js_math.isfinite`)
    - Add `from js_compat import js_isnan, js_isfinite` via import manager when used
  - **Out of scope (error with helpful alternatives)**:
    - `parseInt(str, radix)` → ERROR with code `E_PARSEINT_UNSUPPORTED`
      - Message: "parseInt() is not supported. Use int(str) for base-10 or implement custom parsing."
    - `parseFloat(str)` → ERROR with code `E_PARSEFLOAT_UNSUPPORTED`
      - Message: "parseFloat() is not supported. Use float(str) for simple cases."
    - `Number(x)` → ERROR with code `E_NUMBER_CONSTRUCTOR_UNSUPPORTED`
      - Message: "Number() constructor is not supported. Use js_to_number() runtime helper or explicit numeric coercion."
    - `String(x)` → ERROR with code `E_STRING_CONSTRUCTOR_UNSUPPORTED`
      - Message: "String() constructor is not supported. Use string concatenation ('' + x) or explicit conversion."
    - `Boolean(x)` → ERROR with code `E_BOOLEAN_CONSTRUCTOR_UNSUPPORTED`
      - Message: "Boolean() constructor is not supported. Use js_truthy() runtime helper or explicit comparison."
    - `RegExp(pattern, flags)` → ERROR with code `E_REGEXP_CONSTRUCTOR_UNSUPPORTED`
      - Message: "RegExp() constructor is not supported. Use regex literals /pattern/flags instead."
- [ ] ❌ Default: direct call mapping (for user-defined functions)

**Test:** `isNaN('abc')` → `js_isnan('abc')` → `True`
**Test:** `isFinite('123')` → `js_isfinite('123')` → `True`
**Test:** `isFinite(Infinity)` → `js_isfinite(_js_math.inf)` → `False`
**Test (error):** `parseInt('42', 10)` → ERROR `E_PARSEINT_UNSUPPORTED`: "parseInt() is not supported. Use int(str) for base-10..."
**Test (error):** `parseFloat('3.14')` → ERROR `E_PARSEFLOAT_UNSUPPORTED`
**Test (error):** `Number('5')` → ERROR `E_NUMBER_CONSTRUCTOR_UNSUPPORTED`
**Test (error):** `String(42)` → ERROR `E_STRING_CONSTRUCTOR_UNSUPPORTED`
**Test (error):** `Boolean(1)` → ERROR `E_BOOLEAN_CONSTRUCTOR_UNSUPPORTED`
**Test (error):** `new RegExp('test', 'i')` → ERROR `E_REGEXP_CONSTRUCTOR_UNSUPPORTED`

---

### 3.3 Math Library Mapping (with Aliased Imports)
- [ ] ❌ Detect `Math.abs`, `Math.max`, `Math.min` → Python built-ins `abs()`, `max()`, `min()`
- [ ] ❌ Detect `Math.sqrt`, `Math.floor`, `Math.ceil`, `Math.log`, `Math.log10`, `Math.log2` → `_js_math.sqrt()`, etc.
- [ ] ❌ Add `import math as _js_math` via import manager when needed
- [ ] ❌ Detect `Math.pow(x, y)` → `x ** y` (Python power operator)
- [ ] ❌ Detect `Math.round(x)` → `round(x)` (note: different .5 rounding behavior, document limitation)
- [ ] ❌ Detect `Math.random()` → `_js_random.random()`, add `import random as _js_random`
- [ ] ❌ Detect `Math.PI` → `_js_math.pi`, `Math.E` → `_js_math.e`
- [ ] ❌ **Add Date.now() mapping**:
  - `Date.now()` → `js_date_now()` runtime helper (returns milliseconds since epoch as int)
  - Runtime: `def js_date_now(): return int(_js_time.time() * 1000)` (requires `import time as _js_time`)
  - Add `import time as _js_time` via import manager when `Date.now()` is used

**Test:** `Math.sqrt(16)` → `_js_math.sqrt(16)` with `import math as _js_math`

**Test:** `Date.now()` → `js_date_now()` with `import time as _js_time`

**Test (name collision):** `var math = 42; return Math.sqrt(16) + math;` → verify user `math` and stdlib `_js_math` don't collide

---

### 3.4 Array and String Length
- [ ] ❌ Detect `.length` property on strings → `len(str)`
- [ ] ❌ Detect `.length` property on arrays → `len(list)`
  - Python `len()` works correctly even with holes (JSUndefined values don't affect length)

**Test:** `'hello'.length` → `len('hello')` → 5
**Test:** `[1, 2, 3].length` → `len([1, 2, 3])` → 3
**Test:** `var arr = [1, 2, 3]; delete arr[1]; arr.length` → still 3
**Test (clear pattern):** `var arr = [1, 2, 3]; arr.length = 0;` → `arr.clear()` → `arr` becomes `[]`
**Test (error on non-zero literal):** `arr.length = 5;` → error with code `E_LENGTH_ASSIGN`: "Assignment to array .length is only supported for .length = 0"
**Test (error on variable):** `var n = 0; arr.length = n;` → error with code `E_LENGTH_ASSIGN` (not literal zero)
**Test (error on expression):** `arr.length = 1 - 1;` → error with code `E_LENGTH_ASSIGN` (expression, not literal)

---

### 3.5 Regex Method Mapping
- [ ] ❌ Map `regex.test(str)` method calls
  - Transform `regex.test(str)` → `bool(regex.search(str))` (Python re.search returns Match or None)
  - Assumes `regex` is a compiled regex object from Phase 4
  - **'g' flag validation**: If regex literal has 'g' flag → ERROR with code `E_REGEX_GLOBAL_CONTEXT`
  - Add test for regex literal with `.test()`: `/\d+/.test('123')` → `True`
  - Add test for 'g' rejection: `/test/g.test('str')` → ERROR `E_REGEX_GLOBAL_CONTEXT`
- [ ] ❌ Map `str.replace(regex, repl)` with regex argument
  - **UNIFORM POLICY**: 'g' flag allowed ONLY for inline regex literals in `String.prototype.replace` (NOT stored variables)
  - **Without 'g' flag**: `str.replace(regex, repl)` → `regex.sub(repl, str, count=1)` (single replacement)
  - **With 'g' flag (inline literal ONLY)**: `'aaa'.replace(/a/g, 'b')` → `regex.sub('b', 'aaa', count=0)` (unlimited replacements)
    - **CRITICAL**: `count=0` in Python `.sub()` means "unlimited replacements" (NOT "zero replacements")
    - The compiled regex does NOT encode 'g'; the 'g' flag only controls the `count` parameter value
    - `compile_js_regex()` strips 'g' before compilation (Python re has no global flag)
  - **Context validation**: Detect regex literal parent node during AST transformation
    - **ALLOWED**: `'aaa'.replace(/a/g, 'b')` (inline literal in replace call)
    - **REJECTED**: `var r = /a/g; 'aaa'.replace(r, 'b')` → ERROR `E_REGEX_GLOBAL_CONTEXT`
    - Error message: "Regex global flag 'g' is only supported in String.prototype.replace with inline literals. Inline the regex in the replace call, or use Python's re.findall()/re.finditer() for global matching."
  - Add test: `'hello world'.replace(/o/, 'O')` → `'hellO world'` (first occurrence only, count=1)
  - Add test: `'aaa'.replace(/a/g, 'b')` → `'bbb'` (global replace allowed)
  - Add test: `var r = /a/g; 'aaa'.replace(r, 'b')` → ERROR `E_REGEX_GLOBAL_CONTEXT` (stored variable rejected)
- [ ] ❌ Document `String.prototype.match`, `RegExp.prototype.exec` as out of scope
  - Error with code `E_REGEX_METHOD_UNSUPPORTED`
  - Message: "Regex method 'match/exec' is not supported. Use .test() for boolean checks or Python re module directly."
  - Add to "Known Limitations"

**Test:** `/\d+/.test('123')` → `True`
**Test:** `/\d+/.test('abc')` → `False`
**Test:** `'hello world'.replace(/o/, 'O')` → `'hellO world'` (first occurrence)
**Test:** `'aaa'.replace(/a/g, 'b')` → `'bbb'` (global replace with 'g' flag)

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

### 3.7 Minimal Array Methods
- [ ] ❌ Map `arr.push(x)` → `arr.append(x)` (single argument only)
  - **Detection policy** (avoid false positives on dict methods):
    - ONLY rewrite when receiver is provably an array:
      - Array literal: `[].push(x)`, `[1, 2, 3].push(x)`
      - Variable initialized from ArrayExpression: `var arr = []; arr.push(x);`
      - Track array-typed variables through static analysis (basic flow)
    - Otherwise: Error with code `E_ARRAY_METHOD_AMBIGUOUS` and message "Cannot determine if receiver is array or object. Assign to variable initialized from array literal first."
  - Single argument: Direct mapping to `append()`
  - Multiple arguments: Error with code `E_ARRAY_PUSH_MULTI_ARG` and message "Array.push() with multiple arguments not supported. Use multiple .push() calls or explicit indexing."
- [ ] ❌ Map `arr.pop()` → `js_array_pop(arr)` (always use runtime wrapper)
  - **Detection policy**: Same as push (provably array receiver only)
  - Implement `js_array_pop(arr)` runtime helper: returns `arr.pop()` if non-empty, else `JSUndefined`
  - **CRITICAL**: Always use wrapper (never direct `arr.pop()`) to handle empty array case correctly
- [ ] ❌ Add `from js_compat import js_array_pop` via import manager

**Test:** `var arr = [1, 2]; arr.push(3);` → `arr.append(3)` → `[1, 2, 3]`
**Test:** `var arr = [1, 2, 3]; var x = arr.pop();` → `x = js_array_pop(arr)` → `x = 3`, `arr = [1, 2]`
**Test:** `var arr = []; var x = arr.pop();` → `x = js_array_pop(arr)` → `x = JSUndefined` (wrapper handles empty case)
**Test:** `arr.push(1, 2, 3)` → error with code `E_ARRAY_PUSH_MULTI_ARG`: "Array.push() with multiple arguments not supported."
**Test (ambiguous receiver):** `function f(obj) { obj.push(1); }` → error with code `E_ARRAY_METHOD_AMBIGUOUS`: "Cannot determine if receiver is array or object."
**Test (array literal receiver):** `[1, 2].push(3)` → `[1, 2].append(3)` (provably array)
**Test (tracked array variable):** `var arr = []; var x = arr; x.push(1);` → `x.append(1)` (tracked through assignment)

---

### 3.8 Console.log Mapping
- [ ] ❌ Add `console_log(*args)` to runtime library
  - Implement JS-style formatting (space-separated values)
  - This keeps transformer simple and allows future formatting parity
- [ ] ❌ Detect `console.log(...)` → `console_log(...)`
- [ ] ❌ Add `from js_compat import console_log` via import manager

**Test:** `console.log('hello', 42)` → `console_log('hello', 42)` → prints "hello 42"

---

### 3.9 Import Manager Finalization (with Aliasing)
- [ ] ❌ Ensure import manager tracks all required imports
- [ ] ❌ Emit imports at top of Python module in **deterministic order**:
  1. Standard library imports with aliases: `import math as _js_math`, `import random as _js_random`, `import re as _js_re`, `import time as _js_time`
  2. Runtime imports: `from js_compat import ...`
- [ ] ❌ **CRITICAL**: Use aliased imports consistently
  - Standard library: `import math as _js_math` (call via `_js_math.*`)
  - **Prevents name collisions**: User code can define `var math = ...` without conflict
  - **DO NOT** mix aliased and non-aliased imports
  - This prevents conflicts and keeps codegen simple
- [ ] ❌ Deduplicate imports
- [ ] ❌ **Only import when used**: Do not import `_js_math`/`_js_random`/`_js_re`/`_js_time` unless features require them
- [ ] ❌ Add tests that assert exact import header format
- [ ] ❌ Add lint/test for "no unused imports"

**Test:** Code using Math and String methods → `import math as _js_math` at top (once)
**Test:** Code using multiple runtime features → `from js_compat import JSUndefined, js_truthy, console_log` (sorted)
**Test:** Code without Math methods → no `import math as _js_math` (no unused imports)
**Test (all features):** Code using all features → verify deduping and ordering across stdlib and runtime imports (comprehensive import header test)
**Test (collision):** `var math = 5; var random = 10; return Math.sqrt(math) + Math.random() * random;` → user vars and stdlib imports coexist

---

### 3.10 Phase 3 Integration Tests
- [ ] ❌ Test function using multiple Math methods
- [ ] ❌ Test string manipulation with multiple methods
- [ ] ❌ Verify imports are correctly generated

**Deliverable:** Complete Math and String library mapping with import management

---

## Phase 4: Runtime Gaps

### 4.1 Strict Equality Helper
- [ ] ❌ **Add strict equality validator/linter pass**:
  - Create post-transform validator that scans generated Python AST
  - Forbid direct Python `Eq`/`NotEq` nodes where source was `===`/`!==`
  - Ensure ALL `===`/`!==` use `js_strict_eq`/`js_strict_neq` calls (including switch cases)
  - Flag any missed sites with internal error (prevents regressions)
  - Run validator as part of transform pipeline before code generation
  - Add test that intentionally tries to bypass (validates validator catches it)
- [ ] ❌ Implement `js_strict_eq(a, b)` in runtime:
  - **CRITICAL**: Handle object/array/function identity (NOT value equality)
  - NaN handling: `_js_math.isnan(a) and _js_math.isnan(b)` → `False` (NaN !== NaN)
  - **-0 vs +0 decision**: JS treats `-0 === +0` as `true`
    - For demo: Accept Python's default behavior (no distinction)
    - Document limitation: "-0 vs +0 distinction not implemented"
    - If needed: Check `_js_math.copysign(1, a) == _js_math.copysign(1, b)` for sign
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
- [ ] ❌ Implement `js_isnan(x)` and `js_isfinite(x)` in runtime:
  - `js_isnan(x)`: Use `js_to_number(x)` then `_js_math.isnan(result)`
  - `js_isfinite(x)`: Use `js_to_number(x)` then `_js_math.isfinite(result)`
  - Map global `isNaN(x)` → `js_isnan(x)`, `isFinite(x)` → `js_isfinite(x)`
  - Add to runtime library and import when used
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
  - Use: `a - (b * _js_math.trunc(a / b))` to match JS semantics
- [ ] ❌ Implement `js_sub(a, b)` in runtime:
  - Coerce operands with `js_to_number()` for full ToNumber semantics
  - Enables common patterns like `'5' - 2` → `3`
- [ ] ❌ Implement `js_mul(a, b)` in runtime:
  - Coerce operands with `js_to_number()` for full ToNumber semantics
- [ ] ❌ Implement `js_div(a, b)` in runtime:
  - Handle division by zero: `1/0` → `_js_math.inf`, `-1/0` → `-_js_math.inf`
  - Coerce operands with `js_to_number()` for full ToNumber semantics
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
  - For identifiers: Generate inline Python code with walrus operator for single-eval
  - For member access: Use runtime helpers to handle read/compute/write with single-evaluation
  - Postfix returns old value, then increments: `js_post_inc(obj, 'prop')`
  - Prefix increments, then returns new value: `js_pre_inc(obj, 'prop')`
- [ ] ❌ Implement `js_pre_inc(container, key)` and `js_pre_dec(container, key)` in runtime
  - Handle both dict (object) and list (array) targets
  - Ensure single-evaluation for complex targets like `obj[key()]++`

**Test:** `i++` returns old value, increments variable
**Test:** `++i` increments then returns new value

---

### 4.4 Loose Equality
- [ ] ❌ Implement `js_loose_eq(a, b)` in runtime:
  - Same type → use `==`
  - `None == JSUndefined` → `True` (null == undefined)
  - Number and string → coerce string to number with `js_to_number()`
  - Boolean → coerce to number (True → 1, False → 0) then compare
  - NaN handling: `NaN == NaN` → `False` (use `_js_math.isnan()`)
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
- [ ] ❌ **CRITICAL SPECIAL CASE**: `typeof undeclaredIdentifier` must NOT error
  - In JS, `typeof undeclaredVar` returns `'undefined'` without throwing ReferenceError
  - **Exception to unresolved identifier check**: Exempt `typeof Identifier` from unresolved-identifier validation
  - Always returns `'undefined'` for undeclared identifiers (no need for special runtime helper; just return string literal)
  - Pattern: If `typeof` operand is `Identifier` and not in scope, emit `'undefined'` directly (or `js_typeof(JSUndefined)`)
- [ ] ❌ Transform identifier `undefined` (when used as value) → `JSUndefined`

**Test:** `typeof null` → `'object'`, `typeof undefined` → `'undefined'`
**Test:** `var x; typeof x` → `'undefined'` (uninitialized var)
**Test:** `typeof undeclaredVariable` → `'undefined'` (does NOT throw error; special case for typeof)

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
  - **EXCEPTION**: `typeof undeclaredIdentifier` does NOT error (JS allows typeof on undeclared vars without ReferenceError)
    - Check if identifier is direct child of `UnaryExpression` with operator `typeof`
    - If so, skip validation and allow transpilation
    - Mirror the special-case from 4.5 (typeof operator handling)
  - Error code: `E_UNRESOLVED_IDENTIFIER`
  - Message: "Identifier 'X' is not declared. JavaScript would throw ReferenceError."
  - Helps catch typos and ensures clean transpiled code

**Test:** `function f() { return undeclaredVar; }` → error: "Identifier 'undeclaredVar' is not declared"
**Test:** `function f() { var x = 1; return x; }` → OK (declared)
**Test:** `function f() { return Math.sqrt(4); }` → OK (Math is standard library)

---

### 4.9 Regex Literals (with 'g' flag support for String.replace)
- [ ] ❌ Implement `compile_js_regex(pattern, flags_str)` in runtime:
  - Map JS flags using aliased import: `i` → `_js_re.IGNORECASE`, `m` → `_js_re.MULTILINE`, `s` → `_js_re.DOTALL`
  - **CRITICAL**: 'g' flag is NOT a compilation flag
    - **ALWAYS** strip 'g' from flags_str before compilation: `flags_str.replace('g', '')`
    - Python re doesn't have a global flag; 'g' only controls `.sub()` count parameter
  - Error on unsupported flags (`y`, `u`) with clear message
  - Document: 'y' (sticky) and 'u' (unicode) flags not directly supported
  - **Ensure backslash escaping**: Pattern string must preserve backslashes (e.g., `\d`, `\w`, `\s`)
  - **CRITICAL**: Always emit Python raw strings `r'...'` for regex patterns unless impossible
    - This prevents double-escaping pitfalls
    - If pattern contains both ' and ", choose quote style or escape appropriately
  - Return `_js_re.compile(pattern, flags)` (using aliased import, with 'g' already stripped)
- [ ] ❌ Add `import re as _js_re` via import manager
- [ ] ❌ Transform regex `Literal` → `compile_js_regex(pattern, flags)`
  - Access pattern via `node.regex.pattern` (Acorn structure)
  - Access flags via `node.regex.flags` (Acorn structure)
  - **'g' flag context validation**: If flags contain 'g', validate usage context
    - **ALLOWED**: Inline literal in `String.prototype.replace` call (detect via parent node analysis)
    - **REJECTED**: ALL other contexts → ERROR `E_REGEX_GLOBAL_CONTEXT`
      - Stored in variable: `var r = /a/g;` → ERROR
      - Used with `.test()`: `/test/g.test('str')` → ERROR
      - In array literal: `[/a/g]` → ERROR
      - In object literal: `{pattern: /a/g}` → ERROR
      - Function argument: `f(/a/g)` → ERROR
    - Error message: "Regex global flag 'g' is only supported in String.prototype.replace with inline literals. Inline the regex in the replace call, or use Python's re.findall()/re.finditer() for global matching."
  - Track whether regex has 'g' flag separately (for later `.sub()` count determination in phase 3.5)
  - Pass flags to `compile_js_regex()` (runtime will strip 'g' before compilation)

**Test:** `/hello/i` → `compile_js_regex('hello', 'i')` → case-insensitive regex

**Test:** `/\d+/` → `compile_js_regex('\\d+', '')` → pattern preserves backslash correctly in raw string

**Test:** `/[a-z]+/i` → `compile_js_regex('[a-z]+', 'i')` → character class works

**Test (allowed 'g' context):** `'aaa'.replace(/a/g, 'b')`
  → Transformation: `_regex = compile_js_regex('a', 'g')` (runtime strips 'g'), then `_regex.sub('b', 'aaa', count=0)`
  → Result: `'bbb'` (count=0 means unlimited replacements)

**Test (rejected 'g' context - .test() method):** `/test/g.test('test')`
  → ERROR `E_REGEX_GLOBAL_CONTEXT`: "Regex global flag 'g' is only supported in String.prototype.replace with inline literals."

**Test (rejected 'g' context - variable storage):** `var regex = /a/g; 'aaa'.replace(regex, 'b')`
  → ERROR `E_REGEX_GLOBAL_CONTEXT`: "Regex global flag 'g' is only supported in String.prototype.replace with inline literals. Inline the regex in the replace call."

**Test (rejected 'g' context - array literal):** `var patterns = [/a/g, /b/];`
  → ERROR `E_REGEX_GLOBAL_CONTEXT`

**Test (rejected 'g' context - object literal):** `var obj = {pattern: /a/g};`
  → ERROR `E_REGEX_GLOBAL_CONTEXT`

**Test (rejected 'g' context - function argument):** `function f(r) { return r; } f(/a/g);`
  → ERROR `E_REGEX_GLOBAL_CONTEXT` at regex literal site

**Test:** `/test/y` → error "Regex sticky flag 'y' is not supported."

**Test:** `/test/u` → error "Regex unicode flag 'u' is not supported."

**Test (count=0 clarification):** Verify Python `regex.sub(repl, str, count=0)` means "unlimited replacements" (not "zero replacements")
  → Python docs: count=0 is default, means replace all occurrences

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
- [ ] ❌ Implement `js_date_now()` runtime helper for `Date.now()`
  - `Date.now()` → `js_date_now()` → `int(_js_time.time() * 1000)` (milliseconds since epoch)
  - Add `import time as _js_time` via import manager
- [ ] ❌ Transform `NewExpression` with callee `Date` → `JSDate(...)`
- [ ] ❌ Transform `CallExpression` with `Date.now` → `js_date_now()`
- [ ] ❌ Add `from js_compat import JSDate, js_date_now` via import manager

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
- [ ] ❌ Test SequenceExpression: `for(var i=0, j=0; ...; i++, j++)` → supported in for-init and for-update only
- [ ] ❌ Test SequenceExpression error: `(1, 2, 3)` in non-for context → error `E_SEQUENCE_EXPR_CONTEXT`
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

### 5.1 Critical Test Requirements from Architect Feedback
- [ ] ❌ **typeof undeclared**: `typeof undeclaredVar` → `'undefined'` without error
- [ ] ❌ **void operator**: `void 0` → `JSUndefined`, `void (x = 5)` → evaluates assignment, returns `JSUndefined`
- [ ] ❌ **For-update + continue with SequenceExpression**: `for(var i=0, j=0; i<10; i++, j++) { if (i % 2) continue; }` → ensure both `i++` and `j++` execute on continue (critical for loop-ID tagging)
- [ ] ❌ **For-update + continue in nested loops**: Verify only owning loop's update executes on continue (not inner loop's update)
  ```javascript
  for (var i = 0; i < 3; i++) {
    for (var j = 0; j < 3; j++) {
      if (j == 1) continue; // Only j++ should run, NOT i++
    }
  }
  ```
- [ ] ❌ **Member-target single-eval under augassign**: `obj()[key()] += f()` → evaluate `obj()` and `key()` exactly once
- [ ] ❌ **Regex 'g' flag validation (comprehensive)**:
  - **ALLOWED context**: `'aaa'.replace(/a/g, 'b')` → `'bbb'` (inline literal in replace call)
  - **Verify count=0**: Confirm Python `regex.sub(repl, str, count=0)` produces unlimited replacements
  - **Verify 'g' stripped**: Confirm `compile_js_regex('a', 'g')` compiles WITHOUT 'g' flag (Python re has no global flag)
  - **REJECTED context - test method**: `/test/g.test('test')` → error `E_REGEX_GLOBAL_CONTEXT`
  - **REJECTED context - variable storage**: `var r = /a/g; 'aaa'.replace(r, 'b')` → error `E_REGEX_GLOBAL_CONTEXT`
  - **REJECTED context - array literal**: `var patterns = [/a/g];` → error `E_REGEX_GLOBAL_CONTEXT`
  - **REJECTED context - object literal**: `var obj = {pattern: /a/g};` → error `E_REGEX_GLOBAL_CONTEXT`
  - **REJECTED context - function arg**: `function f(r) { 'aaa'.replace(r, 'b'); } f(/a/g);` → error at regex literal site
  - Error message: "Regex global flag 'g' is only supported in String.prototype.replace with inline literals. Use Python's re.findall() or re.finditer() for other cases."
- [ ] ❌ **Member-target single-eval under update**: `obj[key++]++` → evaluate `obj` and `key++` exactly once
- [ ] ❌ **Regex escaping**: `\d` patterns preserved exactly, quotes chosen to avoid extra escaping
- [ ] ❌ **Mixed equality in switch**: Cases with NaN, -0/+0, object literals (identity), primitives
- [ ] ❌ **isNaN/isFinite**: `isNaN('abc')` → `true`, `isFinite('123')` → `true`, `isFinite(Infinity)` → `false`
- [ ] ❌ **Date.now()**: Returns milliseconds since epoch as int
- [ ] ❌ **Identifier sanitization**: `var class = 5;` → `class_js = 5`, `function from() {}` → `def from_js():`
- [ ] ❌ **Stdlib import aliasing**: `var math = 42; return Math.sqrt(16) + math;` → verify user `math` and `_js_math` coexist
- [ ] ❌ **Strict equality validator negative test**: Intentionally try to emit direct Python `==` for `===` → validator should catch and error
- [ ] ❌ **Regex 'g' flag in String.replace**: `'aaa'.replace(/a/g, 'b')` → `'bbb'` (global replace works)

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
- [ ] ❌ Test: Array methods (`shift`, `unshift`, `splice`, `map`, `filter`, `reduce`, `forEach`, etc.) → error with code `E_ARRAY_METHOD_UNSUPPORTED`
  - Message: "Array method 'X' is not supported. Use explicit loops or supported alternatives."
  - Note: `push` (single arg) and `pop` ARE supported (see Phase 3.7); this test is for OTHER array methods
- [ ] ❌ Test: Object methods (`Object.keys`, `Object.values`, `Object.assign`) → error with code `E_OBJECT_METHOD_UNSUPPORTED`
  - Message: "Object method 'X' is not supported. Use explicit loops or manual property access."
- [ ] ❌ Test: Regex methods (`match`, `exec`) → error with code `E_REGEX_METHOD_UNSUPPORTED`
  - Message: "Regex method 'match/exec' is not supported. Use .test() for boolean checks."
- [ ] ❌ Test: SequenceExpression outside for-init/update → error with code `E_SEQUENCE_EXPR_CONTEXT`
  - `(a(), b()) ? x : y` → error: "SequenceExpression (comma operator) is only supported in for-loop init/update clauses."
  - `var x = (1, 2, 3);` → error (not in for-init/update)
  - `return (f(), g());` → error (not in for-init/update)

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
- [ ] ❌ Test: Array `.length = 0` assignment → supported: `arr.length = 0;` → `arr.clear()` (clear pattern exception)
- [ ] ❌ Test: Array `.length = n` (non-zero) assignment → error with code `E_LENGTH_ASSIGN`: "Assignment to array .length is only supported for .length = 0"
- [x] ✅ Test: Augmented assignment with ToNumber coercion → all augmented ops (`+=`, `-=`, `*=`, `/=`, `%=`) use runtime helpers with full coercion (S3 complete)
- [ ] ❌ Verify error codes (e.g., `E_UNSUPPORTED_FEATURE`, `E_UNSUPPORTED_NODE`, `E_LENGTH_ASSIGN`) for programmatic filtering
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
- [ ] ❌ **Document Python version requirement: Python ≥ 3.8 REQUIRED**
  - Walrus operator (`:=`) used for logical expressions and assignment-in-expression contexts
  - SequenceExpression limited to for-init/update only (not general expression contexts)
  - No fallback mode; Python 3.8+ is mandatory
  - Add to README: "Requires Python ≥ 3.8"
- [ ] ❌ **Pin versions**: Document Node.js version (e.g., Node 18 LTS) and Python version (≥ 3.8) for CI and execution parity tests
- [ ] ❌ Document runtime library API with exact function signatures and behavior
- [ ] ❌ **Add performance note**: "This demo prioritizes correctness over speed; runtime helpers add overhead by design."
- [ ] ❌ **Add "Unsupported but common patterns" troubleshooting table**:
  - `parseInt(str, radix)` → `int(str)` for base-10 or implement custom parsing
  - `parseFloat(str)` → `float(str)` for simple cases
  - Bitwise `| 0` truncation → `Math.floor(x)` or `int(x)`
  - `Array.prototype.map(fn)` → explicit for-loop
  - `Array.prototype.filter(fn)` → explicit for-loop with conditional append
  - Loose equality `==` with objects → use strict equality `===` or explicit comparison
  - `RegExp(pattern, flags)` constructor → regex literals `/pattern/flags`
- [ ] ❌ **Document error codes**: Create table mapping error codes to messages
  - `E_UNSUPPORTED_FEATURE`: Feature outside ES5 subset (e.g., `let`, `const`, `class`)
  - `E_UNSUPPORTED_NODE`: AST node type not implemented
  - `E_LENGTH_ASSIGN`: Assignment to array `.length` property
  - `E_BITWISE_UNSUPPORTED`: Bitwise operators not supported
  - `E_ARRAY_METHOD_UNSUPPORTED`: Array method not supported (excludes `push` single-arg and `pop` which ARE supported)
  - `E_ARRAY_METHOD_AMBIGUOUS`: Cannot determine if receiver is array or object for push/pop
  - `E_ARRAY_PUSH_MULTI_ARG`: Array.push() with multiple arguments not supported
  - `E_OBJECT_METHOD_UNSUPPORTED`: Object method not supported
  - `E_REGEX_METHOD_UNSUPPORTED`: Regex method not supported
  - `E_REGEX_GLOBAL_CONTEXT`: Regex 'g' flag used in unsupported context (only allowed in String.prototype.replace with inline literals)
  - `E_LOOSE_EQ_OBJECT`: Loose equality with objects/arrays not supported
  - `E_SEQUENCE_EXPR_CONTEXT`: SequenceExpression outside for-init/update (only supported in for-loop init/update clauses)
  - `E_IN_OPERATOR_UNSUPPORTED`: 'in' operator not supported
  - `E_UNRESOLVED_IDENTIFIER`: Undeclared identifier
  - `E_INSTANCEOF_UNSUPPORTED`: 'instanceof' operator not supported
  - `E_FUNCTION_IN_BLOCK`: Function declaration inside block (Annex B)
  - `E_PARSEINT_UNSUPPORTED`: parseInt() not supported
  - `E_PARSEFLOAT_UNSUPPORTED`: parseFloat() not supported
  - `E_REGEXP_CONSTRUCTOR_UNSUPPORTED`: RegExp() constructor not supported
  - Others as needed
- [ ] ❌ **Add troubleshooting section**: Map common patterns to alternatives
  - "Use Math.floor() instead of bitwise OR `| 0` to truncate"
  - "Use explicit for-loop instead of .map()/.filter()/.reduce()"
  - "Use strict equality (===) instead of loose equality (==) for objects"
- [ ] ❌ Document known limitations:
  - **Python ≥ 3.8 required** (walrus operator `:=` is mandatory; no fallback mode)
  - **Return semantics**: `return;` (bare return) yields `undefined`, not `null`
  - **SequenceExpression**: Comma operator `(a, b, c)` supported ONLY in for-init/update contexts (e.g., `for(i=0, j=0; ...; i++, j++)`); error `E_SEQUENCE_EXPR_CONTEXT` in other contexts
  - **Strict equality**: -0 vs +0 distinction not implemented (acceptable for demo; `-0 === +0` is `true`)
  - **Augmented assignment**: All operators (`+=`, `-=`, `*=`, `/=`, `%=`) use runtime helpers with full ToNumber coercion
  - **Math.round**: .5 behavior differs (Python uses banker's rounding; avoid .5 inputs or use js_round shim)
  - **JSDate timezone**: Uses UTC for predictability
  - **Loose equality**: ToPrimitive on objects not supported; only primitives supported
  - **Nested function hoisting**: Not supported (call-after-definition only)
  - **Function declarations in blocks**: Not supported (Annex B); use function expressions instead
  - **No try/catch**: throw raises JSException but cannot be caught in transpiled code
  - **Switch fall-through**: Between non-empty cases not supported (must use explicit break)
  - **Regex 'g' flag**: Allowed ONLY in `String.prototype.replace` with inline literals (e.g., `'aaa'.replace(/a/g, 'b')`). ALL other contexts error with `E_REGEX_GLOBAL_CONTEXT`: stored variables, `.test()`, array/object literals, function args. Use Python's `re.findall()/re.finditer()` for global matching in other contexts.
  - **Regex flags y, u**: Not supported (sticky, unicode flags); error with workaround suggestions
  - **No closure support**: Beyond lexical nesting (captured variables not mutable across scopes)
  - **Delete on identifiers**: Not supported (error)
  - **For-in enumeration order**: Insertion order for objects, ascending numeric for arrays (ES5 order is implementation-quirky; behavior may differ from some engines)
  - **Method calls requiring 'this'**: Not supported unless recognized standard library method
  - **Bitwise operators**: All bitwise ops (`|`, `&`, `^`, `~`, `<<`, `>>`, `>>>`) not supported
  - **Array methods**: `push` (single arg), `pop` supported; `shift`, `unshift`, `splice`, `map`, `filter`, `reduce`, `forEach`, etc. not supported
  - **Object methods**: `Object.keys`, `Object.values`, `Object.assign`, etc. not supported
  - **Regex methods**: `match`, `exec` not supported; `.test()` and `.replace()` supported
  - **'in' operator**: Out of scope (property existence checking); error with workaround
  - **'instanceof' operator**: Out of scope; error
  - **void operator**: Supported; `void expr` evaluates expr and returns `undefined`
  - **typeof undeclared**: Supported; `typeof undeclaredVar` returns `'undefined'` without error
  - **Array .length assignment**: **SPECIAL CASE**: `arr.length = 0` (literal zero) supported → `arr.clear()` (common clear pattern); all other `.length = n` values unsupported (error)
  - **Global functions**: `isNaN`, `isFinite` supported via runtime helpers; `parseInt`, `parseFloat`, `Number()`, `String()`, `Boolean()`, `RegExp()` not supported (error with alternatives)
  - **Date.now()**: Supported; returns milliseconds since epoch
- [ ] ❌ Provide migration guide (unsupported features and alternatives)
- [x] ✅ Document arithmetic coercion strategy decision (full ToNumber coercion implemented in S3)
  - All augmented assignment operators use runtime helpers with full ToNumber coercion
  - Exact coercion tables documented in runtime/js_compat.py docstrings
  - Simplifications: hex/octal literals not supported (ES5 parser limitation documented)
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
- `py-ast`: Check package documentation for node builders
- Acorn parser: https://github.com/acornjs/acorn

**Runtime Design:** Keep runtime minimal. Prefer simple, well-tested helpers over complex inline transformations. Document all unsupported edge cases.

**Error Messages:** Always include:
1. Node type and source location (line/column from `locations: true`)
2. Why it failed (out of scope, unsupported)
3. What to change (suggestion or workaround)

**Architectural Decisions:**
- **Python version**: Python ≥ 3.8 REQUIRED (walrus operator is the single strategy)
- **Codegen strategy**: Walrus operator for logical expressions and assignment-in-expression contexts
- **Return semantics**: Bare `return;` → `return JSUndefined` (NOT Python's implicit `None`)
- **SequenceExpression**: Limited to for-init/update contexts (most common use case)
- **Assignment-in-expression**: Walrus operator (`:=`) for all contexts
- **Logical operators**: Walrus operator (NamedExpr) for single-eval: `a && b` → `(b if js_truthy(__js_tmp1 := a) else __js_tmp1)`
- **Strict equality**: Use `js_strict_eq()` for ALL `===` (including switch); identity for objects, value for primitives; -0 vs +0 not distinguished
- **Augmented assignment**: All operators (`+=`, `-=`, `*=`, `/=`, `%=`) use runtime helpers with full ToNumber coercion
- **Loose equality**: Primitives + null/undefined only; error on objects/arrays (ToPrimitive complexity)
- **Global identifiers**: Map `undefined` → `JSUndefined`, `NaN` → `float('nan')`, `Infinity` → `_js_math.inf`
- **Member access**: Default to subscript `obj['prop']` (reads AND writes); exception: `.length` detection
- **Break/Continue validation**: Pre-pass tags nodes with loop/switch ancestry for better diagnostics
- **Switch fall-through**: Static validator detects non-empty fall-through and errors early
- **Console.log**: Map to runtime `console_log()` function (not direct `print`)
- **Imports**: Deterministic order (aliased stdlib first: `import math as _js_math`, `import random as _js_random`, `import re as _js_re`, `import time as _js_time`; then runtime imports sorted); no unused imports; test for unused imports
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
