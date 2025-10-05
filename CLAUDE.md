# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Reference

- **Detailed implementation plan**: See `IMPLEMENTATION.md` for phase-by-phase tasks, checklists, and acceptance criteria
- **Transformation rules**: See `plan.md` for complete mapping rules
- **Python requirement**: Python ≥ 3.8 (walrus operator `:=` is required for assignment-in-expression and logical operators)

## Project Overview

ES5-to-Python transpiler: Converts a defined subset of ES5 JavaScript into executable Python code. This is a technology demo that handles core language features while explicitly failing fast on unsupported constructs.

**Three-stage pipeline:**
1. **Parse**: Use `acorn` parser (ES5 mode) to generate ESTree-compatible AST
2. **Transform**: Convert JavaScript AST to Python AST using `@kriss-u/py-ast` node builders
3. **Generate**: Unparse Python AST to source code

**Runtime library** (`js_compat.py`): Bridges semantic gaps between JavaScript and Python (truthiness, equality, typeof, delete, for-in, Date, regex).

## Critical Design Principles (READ FIRST)

These are the most critical correctness requirements that are easy to violate. **Always consult IMPLEMENTATION.md Critical Correctness Requirements section for the complete list.**

### 1. **Strict Equality Requires Runtime Helper**
**CRITICAL BUG**: Python `==` uses value equality; JS `===` uses identity for objects.
- `{} === {}` → `False` in JS, but `{} == {}` → `True` in Python
- **Must use** `js_strict_eq(a, b)` runtime helper for ALL `===` comparisons (including switch cases)
- Primitives use value equality; objects/arrays/functions use identity (`is`)
- Handle NaN: `NaN !== NaN` → `True`

### 2. **null vs undefined Are Different**
- `None` represents JS `null`
- `JSUndefined` (singleton sentinel) represents JS `undefined`
- Uninitialized vars → `JSUndefined`
- Global identifiers: `undefined` → `JSUndefined`, `NaN` → `float('nan')`, `Infinity` → `_js_math.inf` (aliased import)

### 3. **Bare Return Yields undefined**
- `return;` (without expression) → `return JSUndefined` (NOT Python's implicit `None`)
- JS bare return yields `undefined`, not `null`

### 4. **Walrus Operator Strategy (Python ≥ 3.8 Required)**
- Assignment in expression context uses walrus operator: `if (x = y)` → `if js_truthy(x := y)`
- Logical operators use walrus for single-eval: `a && b` → `(b if js_truthy(_temp := a) else _temp)`
- **SequenceExpression**: Supported ONLY in for-init/update (e.g., `for(i=0, j=0; ...; i++, j++)`)
- No fallback mode; Python 3.8+ is mandatory

### 5. **Member Access Always Uses Subscript**
- `obj.prop` → `obj['prop']` for ALL property access (reads AND writes)
- Avoids attribute shadowing; consistent for dicts
- Exception: `.length` property detection → `len()`

### 6. **Switch Discriminant Must Be Cached**
- Evaluate discriminant once and store in temp variable
- Prevents re-evaluation if discriminant has side effects
- Use strict equality (`js_strict_eq`) for ALL case matching

### 7. **Continue in For-Loops Must Execute Update**
- C-style `for(init; test; update)` desugars to `while` loop
- **CRITICAL**: Rewrite `continue` to execute update before jumping to test
- Use loop ID tagging to prevent incorrect update injection in nested loops

## Common Pitfalls to Avoid

### Anti-Patterns That Break Semantics

❌ **DON'T** use Python `==` for `===` comparisons
```python
# WRONG: {} == {} is True in Python
if obj1 == obj2:

# RIGHT: Use runtime helper
if js_strict_eq(obj1, obj2):
```

❌ **DON'T** use `None` for uninitialized variables
```python
# WRONG: JS undefined becomes Python null
x = None

# RIGHT: Use JSUndefined sentinel
x = JSUndefined
```

❌ **DON'T** use attribute access for object properties
```python
# WRONG: Shadows Python dict methods
obj.prop = value

# RIGHT: Use subscript access
obj['prop'] = value
```

❌ **DON'T** forget to cache switch discriminant
```python
# WRONG: Re-evaluates side effects
while True:
    if js_strict_eq(getSomeValue(), case1):

# RIGHT: Cache discriminant
_switch_disc = getSomeValue()
while True:
    if js_strict_eq(_switch_disc, case1):
```

❌ **DON'T** delete array elements with Python `del`
```python
# WRONG: Python shifts elements, changes length
del arr[1]

# RIGHT: Create hole, preserve length
arr[1] = JSUndefined
```

## Supported ES5 Subset

**In scope:**
- Function declarations (nested functions: call-after-definition only)
- Statements: `var`, assignments, `if`/`else`, `while`, `for`, `for-in`, `switch`, `return`, `throw`, `break`, `continue`
- Expressions: ternary, logical, comparison, arithmetic, member access, calls, unary, literals
- Arrays `[]`, objects `{}` (identifier and string-literal keys only)
- Constructor: `new Date()` only

**Out of scope (fail fast with error codes):**
- `this`, prototypes, classes, `let`/`const`, closures beyond lexical nesting
- `try`/`catch`/`finally`, `with`, `for..of`, dynamic object keys
- Function declarations inside blocks (Annex B behavior)
- Bitwise operators
- Array methods: `shift`, `unshift`, `splice`, `map`, `filter`, `reduce`, `forEach`, etc. (only `push` single-arg and `pop` supported)
- Object methods: `Object.keys`, `Object.values`, `Object.assign`, etc.
- Regex methods `match`/`exec` (only `.test()` and `.replace()` supported)
- Regex `g` flag (allowed ONLY in `String.prototype.replace` context)
- `in` operator, `instanceof` operator
- See IMPLEMENTATION.md for complete list with error codes

## Key Transformation Rules

### Variable Hoisting
- Two-pass per function: collect all `var` names (including nested blocks)
- Emit `name = JSUndefined` initializers at function top

### Control Flow
- **For-loops**: Desugar to `while` with continue rewriting
- **For-in**: Use `js_for_in_keys()` helper (yields strings, skips holes)
- **Switch**: Transform to `while True` block; static validation detects fall-through

### Built-in Mappings
- **Math**: Map to aliased Python `math` module (`Math.sqrt(x)` → `_js_math.sqrt(x)`, `Infinity` → `_js_math.inf`)
- **String**: Map methods with edge cases (`charAt(i)` → `str[i:i+1]`)
- **Date**: `new Date()` → `JSDate()`, `Date.now()` → `js_date_now()` (milliseconds since epoch)
- **Array**: `push(x)` → `append(x)` (single arg only), `pop()` → `pop()`
- **Operators**: `+` → `js_add()`, `%` → `js_mod()`, `===` → `js_strict_eq()`, `==` → `js_loose_eq()`
- **Special**: `void expr` → evaluate expr, return `JSUndefined`; `typeof undeclaredVar` → `'undefined'` (no error)

### Import Management
- **Aliased imports** to avoid collisions: `import math as _js_math`, `import random as _js_random`, `import re as _js_re`, `import time as _js_time`
- Deterministic order: stdlib first (aliased), then runtime imports
- No unused imports

## Where to Find What

| Need | Location |
|------|----------|
| Phase-by-phase implementation tasks | `IMPLEMENTATION.md` Phases 1-5 |
| Critical correctness requirements (complete list) | `IMPLEMENTATION.md` Critical Correctness section |
| Detailed transformation rules | `plan.md` Section 4 |
| Runtime API specifications | `IMPLEMENTATION.md` Phase 4 |
| Test requirements and golden tests | `IMPLEMENTATION.md` Phase 5 |
| Error codes and messages | `IMPLEMENTATION.md` Critical Correctness #19 and Phase 5.4 |
| Known limitations | `IMPLEMENTATION.md` Phase 5.7 |
| Math/String mapping tables | `plan.md` Section 5 |

## Development Workflow

1. **Before implementing any feature**: Check IMPLEMENTATION.md Critical Correctness Requirements
2. **During implementation**: Follow phase-by-phase tasks in IMPLEMENTATION.md
3. **For transformation details**: Consult plan.md mapping tables
4. **For error handling**: Use error codes from IMPLEMENTATION.md
5. **Testing**: Follow test matrix in IMPLEMENTATION.md Phase 5

## Quick Commands

```bash
# Parse JavaScript (use acorn with ES5 config)
acorn.parse(code, { ecmaVersion: 5, sourceType: 'script', locations: true, ranges: true })

# Build Python AST (use @kriss-u/py-ast)
# Unparse to Python source
```

## Implementation Status

See `IMPLEMENTATION.md` for task checkboxes and progress tracking:
- ❌ Not Started
- 🔄 In Progress
- ✅ Complete

---

**Remember**: This is a technology demo prioritizing correctness over performance. When in doubt, consult IMPLEMENTATION.md for the authoritative detailed plan.
