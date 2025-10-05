# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Reference

- **Implementation roadmap**: See `docs/specs/INDEX.md` for milestone overview and dependency graph
- **Milestone specs**: See `docs/specs/S0_foundations.md` through `S9_cli_tests_docs.md` for self-contained implementation guides
- **Transformation rules**: See `plan.md` for complete mapping rules
- **Original detailed plan**: See `IMPLEMENTATION.md` (kept as reference; superseded by split specs)
- **Python requirement**: Python ≥ 3.8 (walrus operator `:=` is required)

---

## Project Overview

ES5-to-Python transpiler: Converts a defined subset of ES5 JavaScript into executable Python code. This is a technology demo that handles core language features while explicitly failing fast on unsupported constructs.

**Three-stage pipeline:**
1. **Parse**: Use `acorn` parser (ES5 mode) to generate ESTree-compatible AST
2. **Transform**: Convert JavaScript AST to Python AST using `@kriss-u/py-ast` node builders
3. **Generate**: Unparse Python AST to source code

**Runtime library** (`js_compat.py`): Bridges semantic gaps between JavaScript and Python (truthiness, equality, typeof, delete, for-in, Date, regex).

---

## Top 3 Critical Principles (Most Dangerous to Violate)

### 1. Strict Equality Requires Runtime Helper
**CRITICAL BUG**: Python `==` uses value equality; JS `===` uses identity for objects.
- `{} === {}` → `False` in JS, but `{} == {}` → `True` in Python
- **Must use** `js_strict_eq(a, b)` for ALL `===` comparisons (including switch cases)

### 2. null vs undefined Are Different
- `None` represents JS `null`
- `JSUndefined` (singleton) represents JS `undefined`
- Uninitialized vars → `JSUndefined`
- Global identifiers: `undefined` → `JSUndefined`, `NaN` → `float('nan')`, `Infinity` → `math.inf`

### 3. Member Access Always Uses Subscript
- `obj.prop` → `obj['prop']` for ALL property access (reads AND writes)
- Avoids attribute shadowing; consistent for dicts
- Exception: `.length` property detection → `len()`

**See Critical Invariants block (8 principles) repeated at the top of every spec (S0-S9) for complete list.**

---

## Top 3 Anti-Patterns (Most Common Mistakes)

### ❌ DON'T use Python `==` for `===`
```python
# WRONG: {} == {} is True in Python
if obj1 == obj2:

# RIGHT: Use runtime helper
if js_strict_eq(obj1, obj2):
```

### ❌ DON'T use `None` for uninitialized variables
```python
# WRONG: JS undefined becomes Python null
x = None

# RIGHT: Use JSUndefined sentinel
x = JSUndefined
```

### ❌ DON'T use attribute access for properties
```python
# WRONG: Shadows Python dict methods
obj.prop = value

# RIGHT: Use subscript access
obj['prop'] = value
```

**See "Notes for Implementers" in each spec for detailed anti-pattern examples and edge cases.**

---

## Supported ES5 Subset

**In scope:**
- Function declarations (nested: call-after-definition only)
- Statements: `var`, assignments, `if`/`else`, `while`, `for`, `for-in`, `switch`, `return`, `throw`, `break`, `continue`
- Expressions: ternary, logical, comparison, arithmetic, member access, calls, unary, literals
- Arrays `[]`, objects `{}` (identifier and string-literal keys only)
- Constructor: `new Date()` only

**Out of scope (fail fast with error codes):**
- `this`, prototypes, classes, `let`/`const`, closures beyond lexical nesting
- `try`/`catch`/`finally`, `with`, `for..of`, dynamic object keys
- Bitwise operators, array/object methods (`push`, `map`, `Object.keys`, etc.)
- `in` operator, `instanceof` operator
- Regex methods `match`/`exec` (only `.test()` and `.replace()` supported)

**See `docs/specs/INDEX.md` for complete scope breakdown by milestone.**

---

## Where to Find What

| Need | Location |
|------|----------|
| **Implementation roadmap** | `docs/specs/INDEX.md` |
| **Milestone specs (S0-S9)** | `docs/specs/S0_foundations.md` through `S9_cli_tests_docs.md` |
| Foundations & runtime helpers | `docs/specs/S0_foundations.md` |
| Pipeline skeleton | `docs/specs/S1_pipeline.md` |
| Core expressions & operators | `docs/specs/S2_expressions_i.md` |
| Assignment & functions | `docs/specs/S3_assignment_functions.md` |
| Control flow (if/while/break/continue) | `docs/specs/S4_control_flow_i.md` |
| For-loops, sequence expressions, ++/-- | `docs/specs/S5_for_sequence_update.md` |
| Switch & for-in | `docs/specs/S6_switch_forin.md` |
| Library mappings (Math, String, Date, console) | `docs/specs/S7_library_methods.md` |
| Regex, typeof, delete, loose equality | `docs/specs/S8_regex_typeops_looseeq.md` |
| CLI, tests, documentation | `docs/specs/S9_cli_tests_docs.md` |
| **Detailed transformation rules** | `plan.md` Section 4 |
| **Math/String mapping tables** | `plan.md` Section 5 |
| **Original monolithic plan (reference)** | `IMPLEMENTATION.md` (superseded by split specs) |

---

## Getting Started

### For Sequential Implementation (Recommended)
1. Read `docs/specs/INDEX.md` for dependency graph and roadmap
2. Start with `docs/specs/S0_foundations.md` (runtime helpers)
3. Progress through S1-S9; each spec is self-contained with Critical Invariants repeated at top

### For Parallel Implementation
1. Check dependency graph in `docs/specs/INDEX.md`
2. Example parallel tracks:
   - Track 1: S0 → S1 → S2 → S7 → S8
   - Track 2: S0 → S1 → S3 → S4 → S5 → S6

### For AI Assistants
1. Read the relevant spec's **Critical Invariants block** (8 bullets, repeated in every spec)
2. Follow the spec's detailed requirements and acceptance tests
3. Consult `plan.md` for transformation mapping tables
4. Use error codes defined in the spec

---

**Remember**: This is a technology demo prioritizing correctness over performance. Each spec in `docs/specs/` is self-contained and implementable in isolation. When in doubt, consult the relevant spec for detailed guidance.
