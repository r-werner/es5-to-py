# Critical Correctness Requirements: Cross-Reference Analysis

## Executive Summary

This document maps all 35 Critical Correctness Requirements from IMPLEMENTATION.md to their corresponding Phase tasks, identifies gaps, and recommends additional tasks where needed.

**Key Findings:**
- **28 of 35** requirements have explicit Phase tasks
- **7 requirements** lack complete Phase coverage (need additional tasks)
- **4 requirements** need dedicated validator/checker tasks
- Several requirements have tasks scattered across multiple phases

---

## Complete Cross-Reference Mapping

### ✅ FULLY COVERED Requirements (28/35)

#### Critical #1: Python version requirement (Python ≥ 3.8)
**Phase Coverage:**
- **Phase 1.1 (Project Setup)**: Line 237 - Document Python ≥ 3.8 requirement
- **Phase 1.1**: Line 237 - Verify walrus operator support in `@kriss-u/py-ast`
- **Phase 5.7 (Documentation)**: Line 1562 - Document Python ≥ 3.8 required

#### Critical #2: Strict equality for objects/arrays/functions
**Phase Coverage:**
- **Phase 4.1 (Strict Equality Helper)**: Lines 1004-1037 - Implement `js_strict_eq`/`js_strict_neq` runtime helpers
- **Phase 4.1**: Line 1010 - Add strict equality validator/linter pass
- **Phase 4.1**: Line 1011 - Validator test
- **Phase 5.1 (Critical Tests)**: Line 1413 - Strict equality validator negative test

#### Critical #3: Global identifiers (NaN, Infinity, undefined)
**Phase Coverage:**
- **Phase 1.4 (Literals)**: Lines 304-308 - Map `undefined` → `JSUndefined`, `NaN` → `float('nan')`, `Infinity` → `_js_math.inf`
- **Phase 1.4**: Line 308 - Handle unary minus on Infinity

#### Critical #4: Return without expression
**Phase Coverage:**
- **Phase 1.6 (Functions)**: Lines 462-463 - Transform bare return → `return JSUndefined`
- **Phase 1.6**: Lines 476-478 - Tests for bare return

#### Critical #5: Continue in for-loops
**Phase Coverage:**
- **Phase 2.6 (For Loops)**: Lines 606-630 - Desugar for-loops with continue handling
- **Phase 2.6**: Lines 615-625 - Loop ID tagging and continue rewriting
- **Phase 5.1 (Critical Tests)**: Lines 1386-1394 - Tests for continue with SequenceExpression and nested loops

#### Critical #6: SequenceExpression (comma operator)
**Phase Coverage:**
- **Phase 1.8 (SequenceExpression)**: Lines 508-530 - Support in for-init/update only
- **Phase 1.8**: Lines 515-521 - Error on usage outside for-init/update context
- **Phase 5.1**: Line 1386 - Test for-update + continue with SequenceExpression

#### Critical #7: null vs undefined
**Phase Coverage:**
- **Phase 1.3 (Runtime)**: Lines 284-289 - Create `JSUndefined` sentinel (singleton)
- **Phase 2.1 (Var Hoisting)**: Lines 545-556 - Initialize vars to `JSUndefined`

#### Critical #8: Augmented assignment semantics
**Phase Coverage:**
- **Phase 1.5 (Assignments)**: Lines 407-440 - Implement augmented assignment with `js_add` for `+=`
- **Phase 1.5**: Lines 417-425 - Error on numeric-only ops with type mismatches
- **Phase 4.2 (Arithmetic Helpers)**: Lines 1049-1072 - Implement `js_add` runtime helper

#### Critical #9: delete on arrays
**Phase Coverage:**
- **Phase 4.7 (Delete Operator)**: Lines 1163-1188 - Implement `js_delete` with array hole handling
- **Phase 4.7**: Lines 1166-1171 - Assign `JSUndefined` instead of Python `del`

#### Critical #10: delete on identifiers - ERROR POLICY ⚠️
**Phase Coverage:**
- **Phase 4.7 (Delete Operator)**: Lines 1174-1177 - Error on delete identifier
- **Mentioned in**: Critical Requirement #10 (line 46)
**STATUS:** ✅ Covered (error policy explicit in Phase 4.7)

#### Critical #11: Switch case comparison (strict equality)
**Phase Coverage:**
- **Phase 2.8 (Switch Statements)**: Lines 661-769 - Switch with static validation
- **Phase 2.8**: Lines 665-676 - Static validation pass for fall-through
- **Phase 2.8**: Lines 695-703 - Use `js_strict_eq` for case matching

#### Critical #12: Strict equality edge cases (NaN, -0/+0)
**Phase Coverage:**
- **Phase 4.1**: Lines 1018-1025 - Handle NaN in `js_strict_eq`
- **Phase 4.15**: Line 1345 - Test NaN strict equality
- **Phase 5.7**: Line 1565 - Document -0 vs +0 limitation

#### Critical #13: js_truthy coverage (NaN as falsy)
**Phase Coverage:**
- **Phase 1.3 (Runtime)**: Lines 290-295 - Implement `js_truthy` with NaN check

#### Critical #14: String method edge cases
**Phase Coverage:**
- **Phase 3.6 (String Methods)**: Lines 904-933 - Map charAt, charCodeAt, substring with edge cases
- **Phase 3.6**: Lines 907-909 - charAt out-of-range handling
- **Phase 3.6**: Lines 911-913 - charCodeAt returns NaN for out-of-range
- **Phase 3.6**: Lines 915-918 - substring clamping and swapping

#### Critical #15: For-in keys (strings, skip holes)
**Phase Coverage:**
- **Phase 2.7 (For-In Loops)**: Lines 630-661 - Implement for-in with `js_for_in_keys`
- **Phase 2.7**: Lines 640-646 - Keys as strings, skip JSUndefined holes
- **Phase 4.12**: Lines 1312-1320 - Verify `js_for_in_keys` implementation

#### Critical #16: Member access (subscript)
**Phase Coverage:**
- **Phase 3.1 (Member Expression)**: Lines 781-828 - Default to subscript `obj['prop']`
- **Phase 3.1**: Lines 787-794 - Use subscript for reads and writes

#### Critical #17: Logical operators (preserve operand values)
**Phase Coverage:**
- **Phase 1.4**: Lines 342-376 - Transform logical operators with walrus pattern
- **Phase 1.4**: Lines 349-361 - Preserve original values with single-eval semantics

#### Critical #18: Break/Continue validation ⚠️
**Phase Coverage:**
- **Phase 2.4 (Break/Continue Validation)**: Lines 574-589 - Pre-pass to tag loop/switch ancestry
- **Phase 2.4**: Lines 575-586 - Validate break/continue usage
- **Phase 2.4**: Lines 583-586 - Loop ID tracking for continue
**STATUS:** ✅ Covered (dedicated pre-pass in Phase 2.4)

#### Critical #19: Error messages
**Phase Coverage:**
- **Phase 1.2**: Line 254 - Create error classes with source location formatting
- **Phase 5.7**: Lines 1544-1556 - Document error codes

#### Critical #20: AssignmentExpression used as expression (walrus)
**Phase Coverage:**
- **Phase 1.5**: Lines 389-406 - Transform AssignmentExpression with walrus operator
- **Phase 1.5**: Lines 395-403 - Handle all contexts (if/while/logical/ternary)

#### Critical #21: Single-evaluation of assignment/update targets
**Phase Coverage:**
- **Phase 1.5**: Lines 426-445 - Single-eval for member targets
- **Phase 1.5**: Lines 432-440 - Capture base/key in temps
- **Phase 1.7**: Lines 484-508 - UpdateExpression single-eval

#### Critical #22: SequenceExpression scope (for-init/update only)
**Phase Coverage:**
- **Phase 1.8**: Lines 508-530 - Limit to for-init/update contexts
- **Phase 1.8**: Lines 515-521 - Error outside for-init/update

#### Critical #23: Augmented assignment policy
**Phase Coverage:**
- Same as Critical #8 (cross-reference)

#### Critical #24: Augmented assignment single-evaluation
**Phase Coverage:**
- **Phase 1.5**: Lines 432-440 - Single-eval for augmented assignments
- **Phase 5.1**: Line 1395 - Test member-target single-eval under augassign

#### Critical #25: Bitwise operators (out of scope)
**Phase Coverage:**
- **Phase 5.7**: Line 1580 - Document bitwise operators out of scope
- **Phase 5.7**: Line 1558 - Error code guidance

#### Critical #26: Global functions policy ⚠️
**Phase Coverage:**
- **Phase 4.2**: Lines 1038-1046 - Implement `js_isnan`, `js_isfinite` runtime helpers
- **Phase 5.1**: Line 1409 - Test isNaN/isFinite
- **Phase 5.7**: Lines 1528-1530, 1553-1555, 1589 - Document parseInt/parseFloat/Number/String/Boolean as out of scope
**STATUS:** ⚠️ PARTIAL - Needs explicit transform tasks (see Gap Analysis below)

#### Critical #27: Array and Object library methods
**Phase Coverage:**
- **Phase 3.7 (Minimal Array Methods)**: Lines 933-959 - Support push/pop only
- **Phase 3.7**: Lines 937-949 - Error on unsupported methods
- **Phase 5.7**: Lines 1581-1582 - Document limitations

#### Critical #28: Regex 'g' flag policy ⚠️
**Phase Coverage:**
- **Phase 3.5 (Regex Method Mapping)**: Lines 871-904 - Inline replace allowed, all other contexts error
- **Phase 3.5**: Lines 875-891 - Context validation
- **Phase 4.9 (Regex Literals)**: Lines 1211-1273 - Strip 'g' at compile time, context detection
- **Phase 5.1**: Lines 1396-1405, 1414 - Comprehensive 'g' flag validation tests
**STATUS:** ✅ Covered (extensive implementation and testing)

#### Critical #29: Identifier sanitization ⚠️
**Phase Coverage:**
- **Phase 1.2 (AST Infrastructure)**: Lines 255-271 - Create `identifier-sanitizer.ts` with scope-aware remapping
- **Phase 1.2**: Lines 257-270 - Build symbol table, remap references
- **Phase 1.4**: Line 306 - Apply sanitization to identifiers
- **Phase 5.1**: Line 1411 - Test identifier sanitization
**STATUS:** ✅ Covered (dedicated infrastructure in Phase 1.2)

#### Critical #30: Stdlib import aliasing ⚠️
**Phase Coverage:**
- **Phase 1.2**: Lines 273-276 - Import manager with aliasing
- **Phase 1.4**: Line 307 - Add aliased `_js_math` import
- **Phase 3.3**: Lines 835-853 - Math library mapping with aliased imports
- **Phase 3.9**: Lines 970-991 - Import manager finalization with aliasing
- **Phase 5.1**: Line 1412 - Test stdlib import aliasing
**STATUS:** ✅ Covered (comprehensive aliasing strategy)

#### Critical #31: Loose equality guardrails
**Phase Coverage:**
- **Phase 4.4 (Loose Equality)**: Lines 1104-1129 - Implement with error on objects/arrays
- **Phase 4.4**: Lines 1113-1120 - Error code `E_LOOSE_EQ_OBJECT`

#### Critical #32: typeof undeclared identifier ⚠️
**Phase Coverage:**
- **Phase 4.5 (Typeof Operator)**: Lines 1139-1148 - Exempt `typeof Identifier` from validation
- **Phase 4.5**: Line 1148 - Test typeof undeclared
- **Phase 4.8 (Unresolved Identifier Pre-pass)**: Lines 1197-1200 - Exception for typeof undeclared
- **Phase 5.1**: Line 1384 - Test typeof undeclared
**STATUS:** ✅ Covered (explicit exception in pre-pass)

#### Critical #33: void operator support ⚠️
**Phase Coverage:**
- **Phase 1.4**: Lines 383-386 - Tests for void operator
- **Phase 5.1**: Line 1385 - Test void operator
**STATUS:** ⚠️ PARTIAL - Tests exist but no explicit transform task (see Gap Analysis)

#### Critical #34: Function in block disallow ⚠️
**Phase Coverage:**
- **Phase 1.6 (Functions)**: Lines 448-457 - Validate function declarations in blocks
- **Phase 1.6**: Line 480 - Test function in block error
**STATUS:** ✅ Covered (validator in Phase 1.6)

#### Critical #35: Date.now() support ⚠️
**Phase Coverage:**
- **Phase 3.3 (Math Library)**: Lines 843-850 - Map `Date.now()` to `js_date_now()` runtime helper
- **Phase 4.11 (JSDate Class)**: Lines 1297-1302 - Implement `js_date_now()` runtime helper
- **Phase 5.1**: Line 1410 - Test Date.now()
**STATUS:** ✅ Covered (runtime helper + transform task)

---

## ❌ GAP ANALYSIS: Requirements Needing Additional Tasks

### 🔴 HIGH PRIORITY GAPS

#### Gap #1: Global Functions Transform Tasks (Critical #26)
**Current Coverage:** Runtime helpers exist (`js_isnan`, `js_isfinite`), documentation exists
**Missing:** Explicit transformer tasks for call detection and error handling

**Recommended New Tasks for Phase 3.2 (Call Expression Framework):**
```markdown
- [ ] ❌ Detect global function calls and handle per policy:
  - `isNaN(x)` → `js_isnan(x)` runtime helper
  - `isFinite(x)` → `js_isfinite(x)` runtime helper
  - `parseInt(str, radix)` → ERROR with code `E_PARSEINT_UNSUPPORTED`
  - `parseFloat(str)` → ERROR with code `E_PARSEFLOAT_UNSUPPORTED`
  - `Number(x)` → ERROR (suggest `js_to_number` or numeric coercion)
  - `String(x)` → ERROR (suggest string concatenation or template)
  - `Boolean(x)` → ERROR (suggest `js_truthy` or explicit comparison)
  - `RegExp(pattern, flags)` → ERROR with code `E_REGEXP_CONSTRUCTOR_UNSUPPORTED`
- [ ] ❌ Add import manager entries for `js_isnan`, `js_isfinite` when used
- [ ] ❌ Add tests for each global function (both supported and erroring)
```

#### Gap #2: void Operator Transform Task (Critical #33)
**Current Coverage:** Tests exist (Phase 1.4, Phase 5.1)
**Missing:** Explicit transform task

**Recommended New Task for Phase 1.4 (Literals and Basic Expressions):**
```markdown
- [ ] ❌ Transform `UnaryExpression` with operator `void`:
  - **Statement context**: `void expr;` → evaluate `expr` as statement, result is `JSUndefined`
  - **Expression context**: `void expr` → use walrus or temp pattern: `(__js_tmp := expr, JSUndefined)[-1]` or equivalent
  - Common usage: `void 0` → `JSUndefined` (idiomatic undefined literal)
  - Ensure side effects are preserved (expr must be evaluated)
- [ ] ❌ Test: `void 0` → `JSUndefined`
- [ ] ❌ Test: `void (x = 5)` → evaluates assignment, returns `JSUndefined`
- [ ] ❌ Test: `var result = void f();` → calls `f()`, assigns `JSUndefined` to result
```

#### Gap #3: Unary Plus Transform Task (Related to js_to_number)
**Current Coverage:** `js_to_number` runtime helper exists (Phase 4.2)
**Missing:** Transform task for unary `+` operator

**Recommended New Task for Phase 1.4 or Phase 4.2:**
```markdown
- [ ] ❌ Transform `UnaryExpression` with operator `+` (unary plus):
  - `+expr` → `js_to_number(expr)` runtime helper
  - Performs ToNumber coercion (same as `Number(x)` in JS)
  - Example: `+'123'` → `123`, `+true` → `1`, `+null` → `0`
- [ ] ❌ Test: `+'123'` → `123` (string to number)
- [ ] ❌ Test: `+true` → `1` (boolean to number)
- [ ] ❌ Test: `+null` → `0` (null to number)
```

---

### 🟡 MEDIUM PRIORITY GAPS

#### Gap #4: Validator Task Documentation Consolidation
**Current Coverage:** Validators exist for:
- Break/Continue (Phase 2.4)
- Switch fall-through (Phase 2.8)
- Strict equality (Phase 4.1)
- Function in block (Phase 1.6)
- Unresolved identifiers (Phase 4.8)

**Missing:** Consolidated validator architecture documentation

**Recommended New Section (could go in Phase 1.2 or new section):**
```markdown
### Validator Architecture and Execution Order
- [ ] ❌ Document validator pipeline execution order:
  1. **Pre-transform validators** (run on ESTree AST before transformation):
     - Unresolved identifier pre-pass (Phase 4.8)
     - Break/Continue ancestry tagging (Phase 2.4)
     - Function-in-block detection (Phase 1.6)
     - Switch fall-through static validation (Phase 2.8)
  2. **Transform-time validators** (run during transformation):
     - Regex 'g' flag context validation (Phase 4.9)
     - Loose equality object detection (Phase 4.4)
     - Global function call validation (Phase 3.2)
  3. **Post-transform validators** (run on Python AST after transformation):
     - Strict equality linter (Phase 4.1)
- [ ] ❌ Create validator registry/framework for extensibility
- [ ] ❌ Document validator error format and codes
```

#### Gap #5: Assignment Target Sanitization
**Current Coverage:** Identifier sanitization exists (Phase 1.2), applied to declarations/references
**Missing:** Explicit guidance on assignment target handling

**Clarification Needed in Phase 1.2:**
```markdown
- [ ] ❌ **Assignment target handling**:
  - For `Identifier` assignment targets → apply sanitization (same as references)
  - For `MemberExpression` assignment targets → property keys NOT sanitized (subscript access)
  - Example: `class = 5;` (assignment) → `class_js = 5;`
  - Example: `obj.class = 5;` (member assignment) → `obj['class'] = 5;` (property key unchanged)
```

---

### 🟢 LOW PRIORITY / NICE-TO-HAVE

#### Gap #6: Error Code Validation Tests
**Current Coverage:** Error codes documented (Phase 5.7)
**Missing:** Automated tests that verify error codes are used correctly

**Recommended New Task for Phase 5.3 (Unsupported Feature Tests):**
```markdown
- [ ] ❌ Add error code validation tests:
  - For each documented error code, ensure at least one test triggers it
  - Verify error messages include expected format (node type, location, why, what to change)
  - Add negative test: ensure valid code does NOT trigger errors
```

#### Gap #7: Import Manager Unused Import Detection
**Current Coverage:** Import manager documented (Phase 3.9)
**Missing:** Automated detection of unused imports

**Recommended Enhancement for Phase 3.9:**
```markdown
- [ ] ❌ Add lint/test for unused imports:
  - Track which imports are actually referenced in generated code
  - Error or warn if import added but never referenced
  - Prevents bloat in generated code
- [ ] ❌ Test: Code without Math methods → no `import math as _js_math`
- [ ] ❌ Test: Code without regex → no `import re as _js_re`
```

---

## Validator/Checker Task Summary

Requirements that have or need dedicated validator/checker tasks:

### ✅ Have Validators (4 requirements)
1. **Critical #18 (Break/Continue validation)** → Phase 2.4 pre-pass ✅
2. **Critical #11 (Switch fall-through)** → Phase 2.8 static validation ✅
3. **Critical #34 (Function in block)** → Phase 1.6 validator ✅
4. **Critical #2 (Strict equality)** → Phase 4.1 post-transform validator ✅

### ⚠️ Need Additional Validators (3 requirements)
1. **Critical #26 (Global functions)** → Need transform-time validator for call detection
2. **Critical #28 (Regex 'g' flag)** → Has context validator in Phase 4.9, but could benefit from pre-pass
3. **Critical #32 (typeof undeclared)** → Has exception in unresolved identifier pre-pass (Phase 4.8) ✅

---

## Recommendations by Priority

### Immediate Action Required (Before Implementation)
1. **Add Global Functions Transform Tasks** (Gap #1) to Phase 3.2
2. **Add void Operator Transform Task** (Gap #2) to Phase 1.4
3. **Add Unary Plus Transform Task** (Gap #3) to Phase 1.4 or 4.2

### Important for Robustness (Can be added during implementation)
4. **Add Validator Architecture Documentation** (Gap #4) - helps developers understand pre-pass execution
5. **Clarify Assignment Target Sanitization** (Gap #5) in Phase 1.2

### Nice-to-Have (Can be deferred to polish phase)
6. **Add Error Code Validation Tests** (Gap #6) to Phase 5.3
7. **Add Unused Import Detection** (Gap #7) to Phase 3.9

---

## Summary Statistics

- **Total Critical Requirements:** 35
- **Fully Covered:** 28 (80%)
- **Partially Covered (need tasks):** 3 (Critical #26, #33, unary +)
- **Coverage with gaps:** 7 (20%)
- **Dedicated Validators:** 4 existing, 0 additional needed (all covered)
- **High Priority Gaps:** 3
- **Medium Priority Gaps:** 2
- **Low Priority Gaps:** 2

**Overall Assessment:** The IMPLEMENTATION.md has excellent coverage of Critical Correctness Requirements. Most gaps are minor omissions (missing transform tasks where tests already exist) rather than fundamental design issues. The 3 high-priority gaps are straightforward to address and should be added before starting implementation.
