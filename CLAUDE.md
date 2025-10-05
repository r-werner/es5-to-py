# CLAUDE.md

This file provides high-level guidance to Claude Code when working with this ES5-to-Python transpiler.

**For detailed implementation tasks, requirements, and checklists, see `IMPLEMENTATION.md`.**

## Project Overview

ES5-to-Python transpiler: Converts a defined subset of ES5 JavaScript into executable Python code. This is a technology demo that prioritizes **correctness over performance** and **fails fast** on unsupported constructs.

**Requirements**:
- Python ≥ 3.7 (default statement-temp mode)
- Python ≥ 3.8 (for optional `--use-walrus` mode)
- Node.js (for acorn parser)

## Architecture

Three-stage pipeline:

1. **Parse**: `acorn` (ES5 mode) → ESTree AST
2. **Transform**: ESTree AST → Python AST (via `@kriss-u/py-ast`)
3. **Generate**: Python AST → Python source code

**Key Components**:
- **Transformer**: ESTree visitor with two-pass var hoisting and control flow desugaring
- **Import Manager**: Tracks and injects imports (`math`, `random`, `re`, `js_compat`) only when needed
- **Runtime Library** (`js_compat.py`): Bridges JS/Python semantic gaps

## Scope

**Supported (ES5 subset)**:
- Functions (nested, call-after-definition only), var declarations (hoisted)
- Control flow: if/else, while, for (C-style and for-in), switch/case, break/continue, return, throw
- Expressions: ternary, logical, comparison, arithmetic, member/index access, calls, unary operators, literals
- Data: strings, numbers, booleans, null, regex literals, arrays, objects (simple keys only)
- Built-ins: Math.*, String methods, new Date(), console.log

**Not Supported (errors with helpful messages)**:
- ES6+ features: let/const, classes, arrow functions, destructuring, etc.
- Advanced ES5: this, prototypes, closures (beyond lexical nesting), try/catch, with
- Operators: bitwise (`|`, `&`, `^`, etc.), in, instanceof
- Methods: Array methods (push, map, etc.), Object methods (Object.keys, etc.)
- Dynamic keys, computed properties, switch fall-through between non-empty cases

**See `IMPLEMENTATION.md` for complete scope details and error codes.**

## Critical Correctness Gotchas

These are the **most error-prone** semantic differences between JS and Python. Always keep these in mind:

1. **Strict equality for objects/arrays is broken in Python**
   - **THE BUG**: Python `==` uses value equality; JS `===` uses identity for objects
   - `{} === {}` → `False` in JS, but `{} == {}` → `True` in Python
   - **SOLUTION**: Use `js_strict_eq(a, b)` helper for ALL `===` comparisons (including switch cases)
   - Primitives use value equality; objects/arrays/functions use identity (`is`)

2. **null vs undefined are different values**
   - `None` = JS `null`, `JSUndefined` = JS `undefined` (distinct sentinel)
   - Uninitialized vars → `JSUndefined`, bare `return;` → `return JSUndefined`
   - Global identifiers: `undefined` → `JSUndefined`, `NaN` → `float('nan')`, `Infinity` → `math.inf`

3. **Logical operators return operands, not booleans**
   - `'a' && 0` → `0` (not `False`), `0 || 'x'` → `'x'` (not `True`)
   - Default: statement-temp lifting; optional: walrus operator with `--use-walrus`

4. **For-loop continue must execute update**
   - `for(init; test; update)` desugars to while loop
   - **CRITICAL**: Rewrite `continue` to execute update first (use loop ID tagging)

5. **Member access uses subscript by default**
   - `obj.prop` → `obj['prop']` (reads AND writes) to avoid attribute shadowing
   - Exception: `.length` property detection

6. **Switch uses strict equality and caches discriminant**
   - Case matching uses `js_strict_eq` (not Python `==`)
   - Discriminant evaluated once and cached in temp variable

7. **Assignment in expressions requires lifting**
   - `if (x = y)` → `x = y; if js_truthy(x): ...` (statement-temp default)
   - Alternative: walrus operator with `--use-walrus` (Python ≥ 3.8)

**See `IMPLEMENTATION.md` for complete list of 32 critical requirements.**

## Transformation Strategy

**Key Principles**:
- **Two-pass var hoisting**: Collect all `var` names, emit `name = JSUndefined` initializers at function top
- **Control flow desugaring**: For-loops → while loops; switch → `while True` + if/elif/else
- **Default to subscript**: `obj.prop` → `obj['prop']` (avoids attribute/method shadowing)
- **Runtime helpers over inline code**: Keep transformer simple, bridge gaps in `js_compat.py`
- **Statement-temp default**: Lift assignments/sequences to statements (Python 3.7+); walrus is optional
- **Deterministic imports**: Only import what's used; stdlib first (`math`, `random`, `re`), then `js_compat`

## Error Handling Philosophy

**Fail fast** on unsupported features with **actionable error messages**:
1. What failed (node type, feature)
2. Why (out of scope)
3. How to fix (suggestion or workaround)
4. Error code (e.g., `E_BITWISE_UNSUPPORTED`)

Example: `"Bitwise OR operator (|) is not supported. Use Math.floor() to truncate or arithmetic equivalents. [E_BITWISE_UNSUPPORTED]"`

**See `IMPLEMENTATION.md` for complete error code reference (13 codes).**

## Runtime Library (`js_compat.py`)

**Core helpers** (see `IMPLEMENTATION.md` for complete API):
- `JSUndefined`: Singleton sentinel for JS `undefined` (distinct from `None` = null)
- `js_truthy(x)`: JS truthiness (empty arrays/objects are truthy, NaN is falsy)
- `js_strict_eq(a,b)`: Strict equality with identity checks for objects/arrays
- `js_loose_eq(a,b)`: Loose equality (primitives only; errors on objects)
- `js_typeof(x)`: JS typeof operator
- `js_add(a,b)`: String concat or numeric addition
- `js_mod(a,b)`: JS remainder (dividend sign)
- `js_delete(base, key)`: Delete with array hole support
- `js_for_in_keys(x)`: Enumerate keys as strings, skip holes
- `compile_js_regex(pattern, flags)`: Regex literal compiler
- `JSDate`, `JSException`, `console_log`, string helpers, etc.

## Quick Reference

**Parser**: `acorn` with `{ ecmaVersion: 5, sourceType: 'script', locations: true, ranges: true }`

**AST Builder**: `@kriss-u/py-ast` for guaranteed syntactic validity

**Temp Variables**: Use `__js_tmp<n>` prefix to avoid collisions

**Import Order**: stdlib first (`import math`, `import random`, `import re`), then `from js_compat import ...`

**CLI Flags**: `--use-walrus`, `--output <file>`, `--run`, `--verbose`

## Where to Look

- **IMPLEMENTATION.md**: Complete implementation checklist, all 32 critical requirements, error codes, phase-by-phase tasks
- **plan.md**: Detailed transformation rules and semantic mappings
- **This file**: High-level architecture, critical gotchas, quick reference
