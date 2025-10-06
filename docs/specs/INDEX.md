# ES5-to-Python Transpiler: Implementation Roadmap

This directory contains self-contained milestone specifications for implementing the ES5-to-Python transpiler. Each spec can be implemented independently after its dependencies are complete.

## Overview

The transpiler is built in **9 milestones (S0–S9)**, each delivering a complete, testable increment of functionality.

## Dependency Graph

```
S0 (Foundations)
 ├─→ S1 (Pipeline)
 │    ├─→ S2 (Expressions I)
 │    ├─→ S3 (Assignment + Functions) ──→ S4 (Control Flow I)
 │    │                                    └─→ S5 (For + Sequence)
 │    │                                         └─→ S6 (Switch + For-in)
 │    └─→ S7 (Library + Methods)
 │         └─→ S8 (Regex + Type Ops)
 └─→ S9 (CLI/Tests/Docs) [requires all above]
```

## Milestones

### ✅ S0: Foundations + Runtime Core
**File**: `S0_foundations.md`
**Dependencies**: None
**Status**: Complete (2025-01-05)
**Deliverables**:
- `runtime/js_compat.py` with `JSUndefined`, `js_truthy`, `JSException`
- Aliased stdlib imports contract (`import math as _js_math`)
- Python ≥ 3.8 version check
- Smoke tests for runtime helpers (15/15 tests passing)
- Type hints and `__slots__` for code quality

**Estimated effort**: 1-2 days
**Actual effort**: 1 day

---

### ✅ S1: Pipeline Skeleton
**File**: `S1_pipeline.md`
**Dependencies**: S0
**Status**: Complete (2025-10-05)
**Deliverables**:
- Parser wrapper (`src/parser.ts`) using `acorn` with ES5 config
- Transformer scaffold (`src/transformer.ts`) with visitor pattern
- Generator (`src/generator.ts`) using `py-ast` (v1.9.0)
- Import manager (`src/import-manager.ts`) with aliased stdlib imports
- Identifier sanitizer (`src/identifier-sanitizer.ts`) with scope-aware mapping
- Error infrastructure (`src/errors.ts`)
- Minimal CLI (`src/cli.ts`)
- TypeScript configuration and Vitest setup
- Acceptance tests (10/10 tests passing)

**Estimated effort**: 2-3 days
**Actual effort**: 1 day

---

### ✅ S2: Core Expressions I
**File**: `S2_expressions_i.md`
**Dependencies**: S0, S1
**Status**: Complete (2025-10-05)
**Deliverables**:
- `Literal` nodes (string, number, boolean, null → `None`)
- `Identifier` nodes with global mappings (`undefined` → `JSUndefined`, `NaN` → `float('nan')`, `Infinity` → `math.inf`)
- `ArrayExpression`, `ObjectExpression` (identifier and string-literal keys only)
- Member access via subscript (`obj.prop` → `obj['prop']`)
- `.length` reads → `len()`
- Strict equality (`===`/`!==`) → `js_strict_eq()`/`js_strict_neq()`
- Comparison operators (`<`, `<=`, `>`, `>=`)
- Logical operators (`&&`, `||`) with walrus operator for single-eval
- Ternary (`?:`)

**Estimated effort**: 3-4 days
**Actual effort**: < 1 day

---

### ✅ S3: Assignment + Functions
**File**: `S3_assignment_functions.md`
**Dependencies**: S0, S1, S2
**Status**: Complete (2025-10-06)
**Deliverables**:
- `FunctionDeclaration` with parameters
- `ReturnStatement` (bare `return` → `return JSUndefined`)
- `VariableDeclaration` and `VariableDeclarator`
- `AssignmentExpression`: `=`, `+=` (with `js_add()`), numeric-only `-=`/`*=`/`/=`/`%=`
- Augmented assignment operators with arithmetic coercion (`js_sub`, `js_mul`, `js_div`, `js_mod`)
- Arithmetic operators (`+`, `-`, `*`, `/`, `%`) with proper ToNumber coercion
- Unary `+` operator for numeric coercion
- Nested functions (call-after-definition only; error on hoisting)
- Multi-statement program support

**Estimated effort**: 3-4 days
**Actual effort**: < 1 day

---

### ❌ S4: Control Flow I
**File**: `S4_control_flow_i.md`
**Dependencies**: S0, S1, S3
**Deliverables**:
- `IfStatement` with `js_truthy()` wrapping
- `WhileStatement`
- `BreakStatement`, `ContinueStatement`
- Pre-pass for loop/switch ancestry validation (error on `continue` in switch, `break` outside loop)

**Estimated effort**: 2-3 days

---

### ❌ S5: For + Sequence + Update
**File**: `S5_for_sequence_update.md`
**Dependencies**: S0, S1, S3, S4
**Deliverables**:
- C-style `for(init; test; update)` desugaring to `while` with continue-update injection
- Loop ID tagging to prevent incorrect update injection in nested loops
- `SequenceExpression` support in for-init/update contexts only
- `UpdateExpression` (`++`, `--`) in for-update clause (expression contexts optional)

**Estimated effort**: 3-4 days

---

### ❌ S6: Switch + For-in
**File**: `S6_switch_forin.md`
**Dependencies**: S0, S1, S3, S4
**Deliverables**:
- `SwitchStatement` transformation to `while True` block
- Switch discriminant caching in temp variable (single-evaluation)
- Strict equality (`js_strict_eq`) for case matching
- Static validation for fall-through between non-empty cases
- `ForInStatement` with `js_for_in_keys()` runtime helper (keys as strings, skip holes)

**Estimated effort**: 3-4 days

---

### ❌ S7: Library + Methods
**File**: `S7_library_methods.md`
**Dependencies**: S0, S1, S2
**Deliverables**:
- Math library mappings (aliased `_js_math`): `Math.sqrt()`, `Math.pow()` → `**`, `Math.abs()`, etc.
- `Date.now()` → `JSDate.now()` (UTC timezone)
- `console.log()` → `console_log()` runtime helper
- String methods: `charAt()`, `charCodeAt()`, `substring()`, `toUpperCase()`, etc.
- Array methods ambiguity policy (document supported subset)
- Import manager finalization (deterministic order, no unused imports)

**Estimated effort**: 3-4 days

---

### ❌ S8: Regex + Type Ops + Loose Eq
**File**: `S8_regex_typeops_looseeq.md`
**Dependencies**: S0, S1, S2
**Deliverables**:
- Regex literal compilation: `/.../flags` → `compile_js_regex(pattern, flags)`
- Regex flag policy: `i`/`m`/`s` supported; error on `g`/`y`/`u`
- `regex.test()` → `bool(regex.search())`
- `str.replace(regex, repl)` → `regex.sub(repl, str, count=1)`
- `typeof` operator → `js_typeof()` (including undeclared identifier special-case)
- `delete` operator → `js_delete()` (dict key removal, array hole creation)
- Loose equality (`==`/`!=`) → `js_loose_eq()`/`js_loose_neq()` with guardrails (error on objects/arrays)

**Estimated effort**: 3-4 days

---

### ❌ S9: CLI/Test Harness/Docs
**File**: `S9_cli_tests_docs.md`
**Dependencies**: All above
**Deliverables**:
- CLI flags: `--output`, `--run`, `--verbose`
- Golden test suite (`tests/golden/`)
- Parity harness (Node.js vs Python execution comparison)
- Error code table documentation
- README with usage instructions, supported subset, known limitations
- Migration guide (unsupported features → alternatives)

**Estimated effort**: 4-5 days

---

## Total Estimated Effort

**28-35 days** (single developer, sequential implementation)

With parallel work:
- **Track 1**: S0 → S1 → S2 → S7 → S8
- **Track 2**: S0 → S1 → S3 → S4 → S5 → S6
- **Track 3**: S9 (after both tracks complete)

**Parallel estimate**: ~18-22 days (2 developers)

---

## How to Use These Specs

### For Sequential Implementation
1. Start with S0 (Foundations)
2. Complete each spec in order, marking checkboxes as you go
3. Run acceptance tests before moving to next spec
4. Each spec's "Done Criteria" must be satisfied

### For Parallel Implementation
1. Assign specs to developers based on dependency graph
2. Each developer reads only their assigned spec (and the repeated invariants)
3. Coordinate only on spec boundaries (e.g., S3 outputs must match S4 inputs)
4. Integration happens naturally as specs are completed

### For Picking Up Mid-Project
1. Find the first incomplete spec in INDEX.md
2. Read only that spec's invariants block and scope section
3. Implement, test, mark complete
4. Move to next spec

---

## Global Invariants (Repeated in Every Spec)

Every spec repeats these 8 critical invariants at the top:

1. **Python ≥ 3.8**: Walrus operator (`:=`) required; no fallback mode
2. **Strict equality**: Use `js_strict_eq()` for `===`; never Python `==` for object/array comparisons
3. **null vs undefined**: `None` is `null`; `JSUndefined` (singleton) is `undefined`; uninitialized vars → `JSUndefined`
4. **Member access**: Always via subscript (`obj['prop']`); exception: `.length` reads → `len()`
5. **Identifier sanitization**: `_js` suffix for reserved words; scope-aware remapping; property keys not sanitized
6. **Aliased stdlib imports**: `import math as _js_math`, `import random as _js_random`, `import re as _js_re`, `import time as _js_time` only
7. **Return semantics**: Bare `return` → `return JSUndefined` (NOT Python's implicit `None`)
8. **Temp naming**: `__js_tmp<n>` for temps, `__js_switch_disc_<id>` for switch discriminants

---

## Reference Documents

- **CLAUDE.md**: High-level guidance for AI assistants; critical design principles
- **IMPLEMENTATION.md**: Original monolithic plan (kept as reference; superseded by split specs)
- **plan.md**: Complete transformation rules and mapping tables

---

## Progress Tracking

Update this section as specs are completed:

- [x] S0: Foundations + Runtime Core ✅ (2025-01-05)
- [x] S1: Pipeline Skeleton ✅ (2025-10-05)
- [x] S2: Core Expressions I ✅ (2025-10-05)
- [x] S3: Assignment + Functions ✅ (2025-10-06)
- [ ] S4: Control Flow I
- [ ] S5: For + Sequence + Update
- [ ] S6: Switch + For-in
- [ ] S7: Library + Methods
- [ ] S8: Regex + Type Ops + Loose Eq
- [ ] S9: CLI/Test Harness/Docs

**Current Status**: S0, S1, S2, and S3 complete, ready for S4
**Last Updated**: 2025-10-06
**Progress**: 4/9 specs complete (44%)
