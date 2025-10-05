# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ES5-to-Python transpiler: Converts a defined subset of ES5 JavaScript into executable Python code. This is a technology demo that handles core language features while explicitly failing fast on unsupported constructs.

**Python Requirements**: Python ≥ 3.7 (statement-temp mode default), Python ≥ 3.8 for optional `--use-walrus` mode.

## Architecture

The transpiler uses a three-stage pipeline:

1. **Parse**: Use `acorn` parser (ES5 mode) to generate ESTree-compatible AST from JavaScript source
2. **Transform**: Convert JavaScript AST to Python AST using `@kriss-u/py-ast` node builders
3. **Generate**: Unparse Python AST to source code

### Key Components

- **Visitor/Transformer**: Maps ESTree nodes to Python AST nodes; implements two-pass var hoisting and control flow transformations
- **Import Manager**: Tracks and injects required imports (`math`, `random`, `re`) based on feature usage
- **Runtime Library (`js_compat.py`)**: Bridges semantic gaps between JavaScript and Python (truthiness, loose equality, typeof, delete, for-in, Date, regex)

## Supported ES5 Subset

**In scope:**
- Function declarations (including nested functions, call-after-definition only)
- Statements: `var`, assignments (`=`, `+=`, etc.), `if`/`else`, `while`, `for` (C-style and for-in), `switch`/`case`, `return`, `throw`, `break`, `continue` (loops only)
- Expressions: ternary, logical (`&&`, `||`), comparison (`<`, `<=`, `>`, `>=`, `==`, `===`, `!=`, `!==`), arithmetic (`+`, `-`, `*`, `/`, `%`), member/index access, calls, unary (`!`, `-`, `+`, `typeof`, `delete`), update expressions (`++`, `--`)
- Literals: string, number, boolean, `null`, regex (`/.../flags`)
- Arrays `[]`, objects `{}` (identifier and string-literal keys)
- Constructor: `new Date()` only

**Out of scope (fail fast with errors):**
- `this`, prototypes, classes, `let`/`const`
- Closures beyond lexical nesting (captured variables not mutable)
- `try`/`catch`/`finally`, labels, `with`, `for..of`
- Dynamic/computed object literal keys
- Module systems, JSON serialization
- `new` for unknown constructors
- `continue` inside `switch`
- Switch fall-through between non-empty cases
- Bitwise operators (`|`, `&`, `^`, `~`, `<<`, `>>`, `>>>`)
- Array methods (`push`, `pop`, `shift`, `unshift`, `splice`, `map`, `filter`, `reduce`, `forEach`, etc.)
- Object methods (`Object.keys`, `Object.values`, `Object.assign`, etc.)
- `in` operator (property existence checking)
- `instanceof` operator
- Regex methods `match`, `exec` (only `.test()` and `.replace()` supported)
- Assignment to array `.length` property

## Transformation Details

### Critical Correctness Requirements

1. **null vs undefined**: Use `JSUndefined` sentinel (distinct from `None`). `None` = JS `null`, `JSUndefined` = JS `undefined`. Uninitialized vars → `JSUndefined`.

2. **Global identifiers**: Map `undefined` identifier → `JSUndefined`, `NaN` → `float('nan')`, `Infinity` → `math.inf`, `-Infinity` → `-math.inf`.

3. **Bare return**: `return;` (without expression) → `return JSUndefined` (NOT Python's implicit `None`). JS bare return yields `undefined`, not `null`.

4. **Strict equality for objects/arrays**: **CRITICAL BUG**: Python `==` uses value equality; JS `===` uses identity for objects. `{} === {}` → `False` in JS, but `{} == {}` → `True` in Python. Must use `js_strict_eq(a, b)` runtime helper for ALL `===` comparisons (including switch cases). Only primitives use value equality; objects/arrays/functions use identity (`is`). Handle NaN: `NaN !== NaN` → `True`.

5. **Logical operators**: Return original operand values (not booleans). Default strategy (statement-temp): `a && b` → `__js_tmp1 = a; result = b if js_truthy(__js_tmp1) else __js_tmp1`. Alternative with `--use-walrus`: `a && b` → `(b if js_truthy(_temp := a) else _temp)`.

6. **Assignment in expression context**: Default strategy is statement-temp lifting (works Python 3.7+). `if (x = y)` → `x = y; if js_truthy(x): ...`. Alternative with `--use-walrus`: use walrus operator pattern (requires Python ≥ 3.8).

7. **SequenceExpression (comma operator)**: Support limited to for-init/update contexts (most common use case). General expression-level support requires `--use-walrus` mode. `for(i=0, j=0; ...; i++, j++)` is supported.

8. **Augmented assignment**: `+=` uses `js_add()` (handles string concat + numeric addition). `-=`, `*=`, `/=`, `%=` are numeric-only; error on type mismatches with code `E_NUM_AUGMENT_COERCION`.

9. **delete on arrays**: Assign `JSUndefined` (not Python `del`) to create holes and preserve length. `delete arr[1]` → `arr[1] = JSUndefined`.

10. **For-in keys**: Always yield strings; skip array holes (JSUndefined values). Dict keys, list indices as strings ('0', '1', ...).

11. **Continue in for-loops**: Must execute update before jumping to test (track loop context). Only rewrite `continue` in the specific desugared loop's body, NOT inner loops.

12. **Switch cases**: Use strict equality (`js_strict_eq`) for ALL case matching. Evaluate discriminant once and cache in temp variable to prevent re-evaluation.

13. **Member access**: Default to subscript `obj['prop']` (not attribute access) for ALL property access (reads AND writes) to avoid attribute shadowing. Exception: `.length` property detection.

14. **JS modulo**: `%` operator keeps dividend sign (use `js_mod()` helper). Python `%` differs: `-1 % 2` → `1` (Python), `-1` (JS).

15. **Arithmetic coercion**: `+` handles both number addition and string concatenation (use `js_add()`). Other operators use numeric-only strategy or full ToNumber coercion as documented.

### Variable Hoisting
Two-pass per function: collect all `var` names (including nested blocks) and emit `name = JSUndefined` initializers at function top.

### Control Flow
- **For-loops**: C-style `for(init; test; update)` desugars to `init; while (test) { body; update; }`. **CRITICAL**: Rewrite `continue` to execute update first. Use loop ID tagging to track which continues belong to which loop (prevents incorrect update injection in nested loops).
- **For-in**: Use `js_for_in_keys(expr)` runtime helper to enumerate dict keys, list indices as strings ('0', '1', ...), skipping array holes (JSUndefined values)
- **Switch**: Transform to `while True` block with nested `if/elif/else` using strict equality (`js_strict_eq`). Cache discriminant in temp variable to ensure single-evaluation. `break` exits the loop; error on `continue` inside switch. Static validation pass detects fall-through between non-empty cases.
- **Continue/break**: Pre-pass tags AST nodes with loop/switch ancestry for validation. Track loop depth/context to prevent incorrect update injection in nested loops.

### Built-in Mappings

**Math**: Map `Math.*` to Python `math` module or built-ins (e.g., `Math.abs(x)` → `abs(x)`, `Math.sqrt(x)` → `math.sqrt(x)`, `Math.pow(x,y)` → `x ** y`)

**String**: Map methods to Python equivalents with edge case handling:
- `str.length` → `len(str)`, array `.length` → `len(list)` (read-only; assignment to `.length` is unsupported and errors with `E_LENGTH_ASSIGN`)
- `str.charAt(i)` → `str[i:i+1]` (returns empty string for out-of-range, not error)
- `str.charCodeAt(i)` → `js_char_code_at(s, i)` runtime helper (returns `float('nan')` for out-of-range)
- `str.substring(s,e)` → `js_substring(s, start, end)` runtime helper with clamping and swapping
- `str.replace(a,b)` → `str.replace(a,b,1)` (single replacement for strings)
- `str.replace(regex, repl)` → `regex.sub(repl, str, count=1)` for regex argument
- `regex.test(str)` → `bool(regex.search(str))` (regex method mapping)

**Date**: `new Date(...)` → `JSDate(...)` runtime shim with core constructor overloads and methods

**Regex**: Literal `/.../flags` → `compile_js_regex("...", flags)` via helper. Support `i`, `m`, `s` flags; error on `g`, `y`, `u` with workarounds. Always emit Python raw strings `r'...'` for regex patterns to preserve backslashes.

**Console**: `console.log(...)` → `console_log(...)` runtime helper (NOT direct `print`)

**Loose Equality**: `==`/`!=` → `js_loose_eq()`/`js_loose_neq()` calls. Only primitives + null/undefined supported. Error on objects/arrays with code `E_LOOSE_EQ_OBJECT` (ToPrimitive coercion complexity).

### Runtime Helpers (`js_compat.py`)

Must provide:
- `JSUndefined`: Sentinel class (singleton) for JS `undefined` (distinct from `None` which is JS `null`). Implemented as module-level singleton constant; all checks use identity (`is`).
- `js_truthy(x)`: JS truthiness (falsy: `''`, `0`, `-0`, `None`, `JSUndefined`, `NaN`; truthy: `[]`, `{}`, etc.). **CRITICAL**: Empty dict/list are truthy; NaN is falsy (use `math.isnan()`).
- `js_strict_eq(a,b)`, `js_strict_neq(a,b)`: Strict equality (`===`/`!==`) with identity checks for objects/arrays/functions, value equality for primitives. Handle NaN: `NaN !== NaN`. Handle null/undefined identity.
- `js_loose_eq(a,b)`, `js_loose_neq(a,b)`: Loose equality (`==`/`!=`) with type coercion (primitives + null/undefined only). Error on objects/arrays.
- `js_typeof(x)`: JS typeof operator (`JSUndefined` → `'undefined'`, `None` → `'object'`, `bool` → `'boolean'`, `int`/`float` → `'number'`, `str` → `'string'`, `list`/`dict` → `'object'`, `callable` → `'function'`)
- `js_delete(base, keyOrIndex)`: Delete dict key or assign `JSUndefined` to array index (preserves length). Returns `True`. Error on identifier deletion.
- `js_for_in_keys(x)`: Enumerate dict keys, list indices as strings ('0', '1', ...), skipping holes (JSUndefined values)
- `js_add(a,b)`: Handle `+` operator (string concatenation if either operand is string, otherwise numeric addition)
- `js_mod(a,b)`: JS remainder semantics (dividend sign, not divisor). Use `a - (b * math.trunc(a / b))`.
- `js_div(a,b)`: Division with proper infinity handling (`1/0` → `math.inf`, `-1/0` → `-math.inf`)
- `js_to_number(x)`: ToNumber coercion for unary `+` and arithmetic (`None` → `0`, `JSUndefined` → `NaN`, `bool`, `int`, `float`, `str` parsing)
- `js_substring(s, start, end)`: Handle negative clamping and swapping
- `js_char_code_at(s, i)`: Return `float('nan')` for out-of-range
- `compile_js_regex(pattern, flags)`: Convert JS regex to Python `re` (map `i`/`m`/`s` flags; error on `g`/`y`/`u`)
- `js_pre_inc()`, `js_post_inc()`, `js_pre_dec()`, `js_post_dec()`: UpdateExpression helpers for `++`/`--`
- `class JSException(Exception)`: Throw arbitrary values (store in `.value` attribute)
- `class JSDate`: Date constructor and methods (use UTC for predictability)
- `console_log(*args)`: JS-style console.log formatting

## Error Handling

Fail fast with `UnsupportedNodeError` or `UnsupportedFeatureError` for any construct outside the defined subset. Error messages must include:
1. Node type and source location (line/column)
2. Why it failed (out of scope, unsupported)
3. What to change (suggestion or workaround)
4. Error code for programmatic filtering (optional but recommended)

**Error Codes** (partial list):
- `E_UNSUPPORTED_FEATURE`: Feature outside ES5 subset (e.g., `let`, `const`, `class`, `this`)
- `E_UNSUPPORTED_NODE`: AST node type not implemented
- `E_BITWISE_UNSUPPORTED`: Bitwise operators not supported
- `E_ARRAY_METHOD_UNSUPPORTED`: Array method not supported (`push`, `pop`, `map`, etc.)
- `E_OBJECT_METHOD_UNSUPPORTED`: Object method not supported (`Object.keys`, etc.)
- `E_REGEX_METHOD_UNSUPPORTED`: Regex method not supported (`match`, `exec`)
- `E_LOOSE_EQ_OBJECT`: Loose equality with objects/arrays not supported
- `E_SEQUENCE_EXPR_CONTEXT`: SequenceExpression in unsupported context (requires `--use-walrus`)
- `E_IN_OPERATOR_UNSUPPORTED`: `in` operator not supported
- `E_INSTANCEOF_UNSUPPORTED`: `instanceof` operator not supported
- `E_UNRESOLVED_IDENTIFIER`: Undeclared identifier (would throw ReferenceError in JS)
- `E_LENGTH_ASSIGN`: Assignment to array `.length` property not supported
- `E_NUM_AUGMENT_COERCION`: Augmented assignment requires numeric operands

Example: "Regex global flag 'g' is not supported. Use Python's re.findall() or re.finditer() as a workaround. [E_REGEX_UNSUPPORTED_FLAG]"

## Implementation Phases

1. **Skeleton + Core**: Project setup, AST infrastructure, literals, expressions, var/assignments, functions, return, UpdateExpression (++/--)
2. **Control Flow**: Var hoisting (JSUndefined), if/else, while, for (desugared with continue handling), for-in, break/continue, switch (strict equality)
3. **Library Mappings**: Member access (subscript), Math/String methods, array/string .length, console.log, import management
4. **Runtime Gaps**: Arithmetic coercion (js_add, js_mod, js_to_number), loose equality, typeof, delete (array holes), regex, JSDate
5. **Tests + Playground**: Golden tests, execution parity, error handling tests, CLI enhancements, documentation

## Development Notes

- Use `acorn.parse` with `{ ecmaVersion: 5, sourceType: 'script', locations: true, ranges: true }`
- Build Python AST with `@kriss-u/py-ast` to guarantee syntactic validity
- **Always** use dict subscripting for member access: `obj.prop` → `obj['prop']` (avoids attribute shadowing; applies to reads AND writes)
- Object literals: Support both identifier and string-literal keys; error on computed keys
- Switch: Require explicit `break`; consecutive empty cases are aliases; static validation detects fall-through between non-empty cases; cache discriminant in temp variable
- Nested functions: Call-after-definition only (no hoisting); error on call-before-definition
- Imports: Deterministic order (stdlib first: `math`, `random`, `re`; then `from js_compat import ...`); no unused imports
- Temp variables: Use `__js_tmp<n>` prefix for all temps to avoid collisions with user code
- Break/Continue validation: Pre-pass tags nodes with loop/switch ancestry for better diagnostics
- Single-evaluation semantics: For `MemberExpression` targets in assignments/updates, capture base and key in temps before read/compute/write
- Default codegen strategy: Statement-temp lifting (Python 3.7+ compatible); optional `--use-walrus` mode for walrus operator (Python ≥ 3.8)
- CLI flags: `--use-walrus` (enable walrus operator), `--output` (write to file), `--run` (execute immediately), `--verbose` (debugging)
- See `IMPLEMENTATION.md` for detailed task breakdown and `plan.md` for complete transformation rules

## Known Limitations

- **Python version**: ≥ 3.7 (statement-temp mode), ≥ 3.8 recommended for `--use-walrus` mode
- **Bare return**: `return;` yields `undefined`, not `null`
- **SequenceExpression**: Limited to for-init/update; general support requires `--use-walrus`
- **Augmented assignment**: `+=` supports mixed types; `-=`/`*=`/`/=`/`%=` numeric-only
- **Strict equality**: -0 vs +0 distinction not implemented (acceptable for demo)
- **Math.round**: .5 behavior differs (Python banker's rounding)
- **JSDate timezone**: Uses UTC for predictability
- **Loose equality**: ToPrimitive on objects not supported; primitives only
- **Nested function hoisting**: Not supported (call-after-definition only)
- **No try/catch**: `throw` raises JSException but cannot be caught in transpiled code
- **Switch fall-through**: Between non-empty cases not supported (must use explicit `break`)
- **Regex flags**: `g`, `y`, `u` not supported (workarounds documented)
- **For-in enumeration order**: Insertion order for objects, ascending numeric for arrays
- **Method calls requiring `this`**: Not supported unless recognized standard library method
- **Bitwise operators**: All bitwise ops not supported
- **Array/Object methods**: Most methods not supported; use explicit loops
- **`in` operator**: Out of scope (use explicit property checks)
- **`instanceof` operator**: Out of scope
- **Assignment to `.length`**: Not supported (read-only)
