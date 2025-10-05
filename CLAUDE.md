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
- **Assignment in expression context** uses walrus operator (Python `NamedExpr` AST node):
  - `if (x = y)` → `if js_truthy(x := y): ...`
  - `f(x = y)` → `f(x := y)` (walrus directly in argument)
  - `a && (x = y)` → `((x := y) if js_truthy(__js_tmp1 := a) else __js_tmp1)`
- **Logical operators** use walrus for **single-evaluation guarantee**:
  - `a && b` → `(b if js_truthy(__js_tmp1 := a) else __js_tmp1)`
  - `a || b` → `(__js_tmp1 if js_truthy(__js_tmp1 := a) else b)`
  - Left operand evaluated exactly once via walrus assignment to temp
  - Returns original operand values (not booleans)
- **SequenceExpression**: Supported ONLY in for-init/update (e.g., `for(i=0, j=0; ...; i++, j++)`)
- No fallback mode; Python 3.8+ is mandatory

### 5. **Member Access Always Uses Subscript**
- `obj.prop` → `obj['prop']` for ALL property access (reads AND writes)
- Avoids attribute shadowing; consistent for dicts
- Exception: `.length` property detection → `len()`

### 6. **Identifier Sanitization with Consistent Remapping**
- Python keywords/literals collide with JS identifiers: `class`, `from`, `None`, `True`, `False`, etc.
- **Policy**: Append `_js` suffix if collision (e.g., `class` → `class_js`)
- **Apply to**: Variable names, function names, parameters
- **Do NOT apply to**: Object property keys (use subscript: `obj['class']`)
- **CRITICAL - Reference consistency**: Build scope-aware symbol table
  - `var class = 5; return class;` → `class_js = 5; return class_js;` (ALL references remapped)
  - `function from() {} from();` → `def from_js(): ... from_js();` (declaration + call sites)
  - Use two-pass: collect declarations → build mapping → remap all references

### 7. **Switch Discriminant Must Be Cached**
- Evaluate discriminant once and store in temp variable
- Prevents re-evaluation if discriminant has side effects
- Use strict equality (`js_strict_eq`) for ALL case matching

### 8. **Continue in For-Loops Must Execute Update**
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

❌ **DON'T** forget to remap ALL identifier references
```python
# WRONG: Only declaration sanitized, reference missed
# Input: var class = 5; return class;
class_js = 5
return class  # WRONG: Should be class_js

# RIGHT: ALL references remapped consistently
class_js = 5
return class_js
```

## Supported ES5 Subset

**In scope:**
- Function declarations (nested functions: call-after-definition only)
- Statements: `var`, assignments, `if`/`else`, `while`, `for`, `for-in`, `switch`, `return`, `throw`, `break`, `continue`
- Expressions: ternary, logical, comparison, arithmetic, member access, calls, unary, literals
- Arrays `[]`, objects `{}` (identifier and string-literal keys only)
- Constructor: `new Date()` only

**Out of scope (fail fast with error codes):**
- `this`, prototypes, classes, `let`/`const`, closures, `try`/`catch`, `with`, `for..of`
- Bitwise operators, most array/object methods (only `push` single-arg and `pop` supported)
- `in` operator, `instanceof` operator
- Array `.length` assignment (exception: `arr.length = 0` → `arr.clear()` supported as common clear pattern)
- See IMPLEMENTATION.md Section 1 (lines 35-190) for complete list with error codes

## Quick Transformation Reference

**See IMPLEMENTATION.md Phases 1-4 for complete transformation rules. Key highlights:**

- **Hoisting**: Two-pass per function, emit `name = JSUndefined` at function top
- **For-loops**: Desugar to `while`; continue must execute update first
- **Switch**: Transform to `while True` block with strict equality matching
- **Member access**: Always use subscript `obj['prop']` (not attribute access)
- **Operators**: All binary arithmetic use runtime helpers with ToNumber coercion: `+` → `js_add()`, `-` → `js_sub()`, `*` → `js_mul()`, `/` → `js_div()`, `%` → `js_mod()`, `===` → `js_strict_eq()`
- **Arrays**: `push(x)` → `append(x)`, `pop()` → `js_array_pop()` (with array type detection)
- **Imports**: Aliased stdlib (`import math as _js_math`), then runtime imports, deterministic order

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

## Implementation Workflow

1. **Start here**: Read Critical Correctness Requirements in IMPLEMENTATION.md (lines 7-190)
2. **Follow phases**: IMPLEMENTATION.md Phases 1-5 for step-by-step tasks
3. **Check mappings**: plan.md for complete transformation tables
4. **Track progress**: Update checkboxes in IMPLEMENTATION.md (❌ → 🔄 → ✅)

---

**Remember**: This is a technology demo prioritizing correctness over performance. When in doubt, consult IMPLEMENTATION.md for the authoritative detailed plan.
