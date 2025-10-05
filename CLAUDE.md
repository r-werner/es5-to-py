# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ES5-to-Python transpiler: Converts a defined subset of ES5 JavaScript into executable Python code. This is a technology demo that handles core language features while explicitly failing fast on unsupported constructs.

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

## Transformation Details

### Critical Correctness Requirements

1. **null vs undefined**: Use `JSUndefined` sentinel (distinct from `None`). `None` = JS `null`, `JSUndefined` = JS `undefined`. Uninitialized vars → `JSUndefined`.
2. **Logical operators**: Return original operand values (not booleans): `a && b` → `(b if js_truthy(_temp := a) else _temp)`
3. **Strict equality**: Use identity checks for null/undefined: `x === null` → `x is None`, `x === undefined` → `x is JSUndefined`
4. **delete on arrays**: Assign `JSUndefined` (not Python `del`) to create holes and preserve length
5. **For-in keys**: Always yield strings; skip array holes (JSUndefined values)
6. **Continue in for-loops**: Must execute update before jumping to test (track loop context)
7. **Switch cases**: Use strict equality (===) for case matching
8. **Member access**: Default to subscript `obj['prop']` (not attribute access)
9. **JS modulo**: `%` operator keeps dividend sign (use `js_mod()` helper)
10. **Arithmetic coercion**: `+` handles both number addition and string concatenation (use `js_add()`)

### Variable Hoisting
Two-pass per function: collect all `var` names (including nested blocks) and emit `name = JSUndefined` initializers at function top.

### Control Flow
- **For-loops**: C-style `for(init; test; update)` desugars to `init; while (test) { body; update; }`. **CRITICAL**: Rewrite `continue` to execute update first.
- **For-in**: Use `js_for_in_keys(expr)` runtime helper to enumerate dict keys, list indices as strings ('0', '1', ...), skipping array holes
- **Switch**: Transform to `while True` block with nested `if/elif/else` using strict equality; `break` exits the loop; error on `continue` inside switch
- **Continue/break**: Track loop depth/context to prevent incorrect update injection in nested loops

### Built-in Mappings

**Math**: Map `Math.*` to Python `math` module or built-ins (e.g., `Math.abs(x)` → `abs(x)`, `Math.sqrt(x)` → `math.sqrt(x)`, `Math.pow(x,y)` → `x ** y`)

**String**: Map methods to Python equivalents with edge case handling:
- `str.length` → `len(str)`, array `.length` → `len(list)`
- `str.charAt(i)` → `str[i:i+1]` (returns empty string for out-of-range)
- `str.charCodeAt(i)` → `ord(str[i])` or `float('nan')` for out-of-range
- `str.substring(s,e)` → runtime helper with clamping and swapping
- `str.replace(a,b)` → `str.replace(a,b,1)` (single replacement)

**Date**: `new Date(...)` → `JSDate(...)` runtime shim with core constructor overloads and methods

**Regex**: Literal `/.../flags` → `compile_js_regex("...", flags)` via helper. Support `i`, `m`, `s` flags; error on `g`, `y`, `u` with workarounds

**Console**: `console.log(...)` → `console_log(...)` runtime helper

### Runtime Helpers (`js_compat.py`)

Must provide:
- `JSUndefined`: Sentinel class (singleton) for JS `undefined` (distinct from `None` which is JS `null`)
- `js_truthy(x)`: JS truthiness (falsy: `''`, `0`, `None`, `JSUndefined`, `NaN`; truthy: `[]`, `{}`, etc.)
- `js_loose_eq(a,b)`, `js_loose_neq(a,b)`: Loose equality (`==`/`!=`) with type coercion (primitives only)
- `js_typeof(x)`: JS typeof operator (`JSUndefined` → `'undefined'`, `None` → `'object'`)
- `js_delete(base, keyOrIndex)`: Delete dict key or assign `JSUndefined` to array index (preserves length)
- `js_for_in_keys(x)`: Enumerate dict keys, list indices as strings, skipping holes (JSUndefined)
- `js_add(a,b)`: Handle `+` operator (number addition or string concatenation)
- `js_mod(a,b)`: JS remainder semantics (dividend sign, not divisor)
- `js_to_number(x)`: ToNumber coercion for unary `+` and arithmetic
- `js_substring(s, start, end)`: Handle negative clamping and swapping
- `js_char_code_at(s, i)`: Return `float('nan')` for out-of-range
- `compile_js_regex(pattern, flags)`: Convert JS regex to Python `re`
- `class JSException(Exception)`: Throw arbitrary values
- `class JSDate`: Date constructor and methods
- `console_log(*args)`: JS-style console.log formatting

## Error Handling

Fail fast with `UnsupportedNodeError` or `UnsupportedFeatureError` for any construct outside the defined subset. Error messages must include:
1. Node type and source location (line/column)
2. Why it failed (out of scope, unsupported)
3. What to change (suggestion or workaround)

Example: "Regex global flag 'g' is not supported. Use Python's re.findall() or re.finditer() as a workaround."

## Implementation Phases

1. **Skeleton + Core**: Project setup, AST infrastructure, literals, expressions, var/assignments, functions, return, UpdateExpression (++/--)
2. **Control Flow**: Var hoisting (JSUndefined), if/else, while, for (desugared with continue handling), for-in, break/continue, switch (strict equality)
3. **Library Mappings**: Member access (subscript), Math/String methods, array/string .length, console.log, import management
4. **Runtime Gaps**: Arithmetic coercion (js_add, js_mod, js_to_number), loose equality, typeof, delete (array holes), regex, JSDate
5. **Tests + Playground**: Golden tests, execution parity, error handling tests, CLI enhancements, documentation

## Development Notes

- Use `acorn.parse` with `{ ecmaVersion: 5, sourceType: 'script', locations: true, ranges: true }`
- Build Python AST with `@kriss-u/py-ast` to guarantee syntactic validity
- **Always** use dict subscripting for member access: `obj.prop` → `obj['prop']` (avoids attribute shadowing)
- Object literals: Support both identifier and string-literal keys; error on computed keys
- Switch: Require explicit `break`; consecutive empty cases are aliases; error on fall-through between non-empty cases
- Nested functions: Call-after-definition only (no hoisting)
- Imports: Deterministic order (stdlib first: `math`, `random`, `re`; then `from js_compat import ...`)
- See `IMPLEMENTATION.md` for detailed task breakdown and `plan.md` for complete transformation rules
