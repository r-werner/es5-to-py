# S0: Foundations + Runtime Core

**Status**: ❌ Not Started
**Dependencies**: None
**Estimated Effort**: 1-2 days

---

## Critical Invariants (Repeated in Every Spec)

These invariants apply to **all** specs. Every feature must respect these rules:

1. **Python ≥ 3.8**: Walrus operator (`:=`) required; no fallback mode
2. **Strict equality**: Use `js_strict_eq()` for `===`; never Python `==` for object/array comparisons
3. **null vs undefined**: `None` is `null`; `JSUndefined` (singleton) is `undefined`; uninitialized vars → `JSUndefined`
4. **Member access**: Always via subscript (`obj['prop']`); exception: `.length` reads → `len()`
5. **Identifier sanitization**: `_js` suffix for reserved words; scope-aware remapping; property keys not sanitized
6. **Aliased stdlib imports**: `import math as _js_math`, `import random as _js_random`, `import re as _js_re`, `import time as _js_time` only
7. **Return semantics**: Bare `return` → `return JSUndefined` (NOT Python's implicit `None`)
8. **Temp naming**: `__js_tmp<n>` for temps, `__js_switch_disc_<id>` for switch discriminants

---

## Overview

This spec establishes the runtime library foundation that all other specs depend on. It provides the **minimal set of runtime helpers** needed to bridge JavaScript and Python semantics.

**Goal**: Create `runtime/js_compat.py` with core helpers and establish import contracts.

---

## Scope

### In Scope

**Runtime Helpers** (`runtime/js_compat.py`):
1. `JSUndefined` sentinel (singleton)
2. `js_truthy(x)` - JS truthiness semantics
3. `JSException(value)` - Throw arbitrary values
4. Module structure with `__all__` export list

**Import Contracts**:
- Aliased stdlib imports policy
- Python version check (≥ 3.8)

**Tests**:
- Smoke tests for each runtime helper
- Python version validation

### Out of Scope (Deferred to Later Specs)

- `js_strict_eq()` / `js_strict_neq()` → S2
- `js_loose_eq()` / `js_loose_neq()` → S8
- `js_typeof()` → S8
- `js_delete()` → S8
- `js_for_in_keys()` → S6
- `js_add()`, `js_mod()`, `js_to_number()` → S3
- String helpers (`js_substring()`, `js_char_code_at()`) → S7
- Regex helpers (`compile_js_regex()`) → S8
- `JSDate` class → S7
- `console_log()` → S7

---

## Project Scaffolding

To make this spec executable in isolation, set up a minimal Python package and test harness:

- Create directories:
  - `runtime/`
  - `tests/runtime/`
- Create `runtime/__init__.py` (empty file) so `runtime` is an importable package.
- Add `requirements-dev.txt` with:
  ```
  pytest>=7,<9
  ```
- Optional but recommended: `pytest.ini` at the repo root to ensure imports work without PYTHONPATH tweaks:
  ```ini
  [pytest]
  pythonpath = .
  ```

How to run:
```bash
pip install -r requirements-dev.txt
pytest -q
```

---

## Runtime Helpers

### 1. `JSUndefined` Sentinel

**Purpose**: Represent JavaScript `undefined` (distinct from Python `None` which represents `null`).

**Implementation Requirements**:
```python
class _JSUndefined:
    """Sentinel for JavaScript undefined (distinct from None/null)."""
    def __repr__(self):
        return 'undefined'

    def __bool__(self):
        return False  # undefined is falsy

# Singleton instance (CRITICAL: only one instance ever created)
JSUndefined = _JSUndefined()
```

**Critical Correctness**:
- **Must be singleton**: All checks use identity (`is JSUndefined`), not equality
- **Never instantiate again**: Module-level constant prevents bugs in sets/dicts
- **Distinct from `None`**: `None` represents JS `null`; `JSUndefined` represents JS `undefined`

**Usage Examples**:
```python
# Uninitialized variable
x = JSUndefined

# Check if undefined
if x is JSUndefined:
    print("x is undefined")

# NOT equal to null
assert JSUndefined is not None
assert None is not JSUndefined
```

---

### 2. `js_truthy(x)`

**Purpose**: Implement JavaScript truthiness rules (different from Python's).

**Implementation Requirements**:
```python
import math as _js_math

def js_truthy(x):
    """
    JavaScript truthiness semantics.

    Falsy values:
    - '' (empty string)
    - 0 (zero)
    - -0 (negative zero, same as 0 in Python)
    - None (null)
    - JSUndefined (undefined)
    - NaN (float('nan'))

    Truthy values:
    - [] (empty list - CRITICAL: truthy in JS, falsy in Python)
    - {} (empty dict - CRITICAL: truthy in JS, falsy in Python)
    - All other values (non-empty strings, non-zero numbers, objects)

    Returns:
        bool: True if value is truthy in JavaScript, False otherwise
    """
    # Check NaN explicitly (NaN is falsy in JS)
    if isinstance(x, float) and _js_math.isnan(x):
        return False

    # JSUndefined is falsy
    if x is JSUndefined:
        return False

    # None (null) is falsy
    if x is None:
        return False

    # Empty string is falsy
    if x == '':
        return False

    # Zero is falsy (covers 0, 0.0, -0)
    if x == 0:
        return False

    # Everything else is truthy (including empty list/dict)
    return True
```

**Critical Correctness**:
- **Empty dict/list are truthy**: `js_truthy([])` → `True`, `js_truthy({})` → `True`
- **NaN is falsy**: Must use `math.isnan()` check for float values
- **JSUndefined check before None**: Order matters for correct semantics

**Test Cases**:
```python
# Falsy values
assert js_truthy('') == False
assert js_truthy(0) == False
assert js_truthy(None) == False
assert js_truthy(JSUndefined) == False
assert js_truthy(float('nan')) == False

# Truthy values
assert js_truthy([]) == True  # CRITICAL: empty list is truthy
assert js_truthy({}) == True  # CRITICAL: empty dict is truthy
assert js_truthy('hello') == True
assert js_truthy(1) == True
assert js_truthy(-1) == True
assert js_truthy([1, 2, 3]) == True
assert js_truthy({'a': 1}) == True
```

---

### 3. `JSException` Class

**Purpose**: Allow throwing arbitrary values (not just exceptions) as in JavaScript.

**Implementation Requirements**:
```python
class JSException(Exception):
    """
    Exception class for JavaScript throw statements.

    JavaScript allows throwing any value (strings, numbers, objects).
    Python only allows throwing exceptions, so we wrap arbitrary values.

    Attributes:
        value: The thrown JavaScript value (can be any type)
    """
    def __init__(self, value):
        self.value = value
        super().__init__(repr(value))

    def __repr__(self):
        return f'JSException({self.value!r})'
```

**Usage Examples**:
```python
# Throw a string
raise JSException('error message')

# Throw a number
raise JSException(42)

# Throw an object
raise JSException({'code': 500, 'message': 'Server error'})

# Catching (outside transpiled code, for testing)
try:
    raise JSException('test')
except JSException as e:
    assert e.value == 'test'
```

---

### 4. Module Structure

**File**: `runtime/js_compat.py`

**Complete Module Template**:
```python
"""
JavaScript Compatibility Runtime Library

Provides runtime helpers to bridge semantic gaps between JavaScript and Python.
This module is imported by all transpiled code.
"""

import math as _js_math

# ============================================================================
# Sentinel for JavaScript undefined
# ============================================================================

class _JSUndefined:
    """Sentinel for JavaScript undefined (distinct from None/null)."""
    def __repr__(self):
        return 'undefined'

    def __bool__(self):
        return False

# Singleton instance (NEVER create another instance)
JSUndefined = _JSUndefined()


# ============================================================================
# Truthiness
# ============================================================================

def js_truthy(x):
    """JavaScript truthiness semantics. See docstring above."""
    if isinstance(x, float) and _js_math.isnan(x):
        return False
    if x is JSUndefined:
        return False
    if x is None:
        return False
    if x == '':
        return False
    if x == 0:
        return False
    return True


# ============================================================================
# Exception Handling
# ============================================================================

class JSException(Exception):
    """Exception class for JavaScript throw statements."""
    def __init__(self, value):
        self.value = value
        super().__init__(repr(value))

    def __repr__(self):
        return f'JSException({self.value!r})'


# ============================================================================
# Exports
# ============================================================================

__all__ = [
    'JSUndefined',
    'js_truthy',
    'JSException',
]
```

---

## Import Policy

### Aliased Stdlib Imports Contract

**Rule**: All stdlib imports must use aliased names to avoid shadowing transpiled code.

**Rationale**: JavaScript code may use variable names like `math`, `random`, `re`. Aliasing prevents conflicts.

**Required Aliases**:
```python
import math as _js_math
import random as _js_random
import re as _js_re
import time as _js_time
```

**Usage in Transpiled Code**:
```python
# JavaScript: Math.sqrt(x)
# Python: _js_math.sqrt(x)

# JavaScript: Math.random()
# Python: _js_random.random()
```

**Forbidden**:
```python
# WRONG: Do not mix aliased and non-aliased imports
import math as _js_math
from math import sqrt  # FORBIDDEN: No direct imports

# WRONG: Do not use non-aliased imports
import math  # FORBIDDEN: Must be aliased
```

---

## Python Version Check

**Requirement**: Python ≥ 3.8 (walrus operator `:=` is mandatory)

**Implementation** (in CLI, not runtime):
```python
import sys

if sys.version_info < (3, 8):
    print("Error: Python 3.8 or higher is required (walrus operator support)", file=sys.stderr)
    sys.exit(1)
```

**Rationale**: Walrus operator (`:=`) is used for:
- Assignment in expression contexts
- Logical operators with single-eval semantics
- SequenceExpression support

No fallback mode is provided; Python 3.8+ is mandatory.

---

## Error Codes

This spec introduces no error codes (S0 is runtime-only, no transpiler logic).

---

## Acceptance Tests

### Test File: `tests/runtime/test_foundations.py`

```python
import pytest
import math
from runtime.js_compat import JSUndefined, js_truthy, JSException

class TestJSUndefined:
    def test_singleton(self):
        """JSUndefined is a singleton."""
        assert JSUndefined is JSUndefined

    def test_repr(self):
        """JSUndefined repr is 'undefined'."""
        assert repr(JSUndefined) == 'undefined'

    def test_distinct_from_none(self):
        """JSUndefined is distinct from None."""
        assert JSUndefined is not None
        assert None is not JSUndefined

    def test_falsy(self):
        """JSUndefined is falsy."""
        assert not JSUndefined
        assert bool(JSUndefined) == False


class TestJSTruthy:
    def test_falsy_values(self):
        """Falsy values return False."""
        assert js_truthy('') == False
        assert js_truthy(0) == False
        assert js_truthy(0.0) == False
        assert js_truthy(None) == False
        assert js_truthy(JSUndefined) == False
        assert js_truthy(float('nan')) == False
        assert js_truthy(False) == False

    def test_truthy_values(self):
        """Truthy values return True."""
        assert js_truthy('hello') == True
        assert js_truthy(1) == True
        assert js_truthy(-1) == True
        assert js_truthy(True) == True

    def test_empty_containers_truthy(self):
        """CRITICAL: Empty lists and dicts are truthy in JavaScript."""
        assert js_truthy([]) == True
        assert js_truthy({}) == True

    def test_non_empty_containers(self):
        """Non-empty containers are truthy."""
        assert js_truthy([1, 2, 3]) == True
        assert js_truthy({'a': 1}) == True

    def test_nan_falsy(self):
        """NaN is falsy."""
        assert js_truthy(float('nan')) == False


class TestJSException:
    def test_throw_string(self):
        """Can throw strings."""
        with pytest.raises(JSException) as exc_info:
            raise JSException('error message')
        assert exc_info.value.value == 'error message'

    def test_throw_number(self):
        """Can throw numbers."""
        with pytest.raises(JSException) as exc_info:
            raise JSException(42)
        assert exc_info.value.value == 42

    def test_throw_object(self):
        """Can throw objects."""
        obj = {'code': 500, 'message': 'Server error'}
        with pytest.raises(JSException) as exc_info:
            raise JSException(obj)
        assert exc_info.value.value == obj

    def test_repr(self):
        """JSException repr includes value."""
        exc = JSException('test')
        assert 'test' in repr(exc)
```

### Test File: `tests/runtime/test_imports.py`

```python
"""Test that runtime module exports are correct."""

from runtime import js_compat

def test_exports():
    """Verify __all__ exports."""
    assert 'JSUndefined' in js_compat.__all__
    assert 'js_truthy' in js_compat.__all__
    assert 'JSException' in js_compat.__all__

def test_imports():
    """Verify direct imports work."""
    from runtime.js_compat import JSUndefined, js_truthy, JSException

    assert JSUndefined is not None
    assert callable(js_truthy)
    assert issubclass(JSException, Exception)
```

---

## Done Criteria

- [ ] `runtime/js_compat.py` exists with correct module structure
- [ ] `JSUndefined` singleton implemented and tested
- [ ] `js_truthy()` function implemented with all edge cases tested
- [ ] `JSException` class implemented and tested
- [ ] Module `__all__` exports defined
- [ ] All acceptance tests pass
- [ ] Python version check documented (implementation deferred to S9 CLI)
- [ ] Aliased stdlib imports policy documented

---

## Dependencies for Next Specs

After completing S0, the following specs can begin:
- **S1** (Pipeline Skeleton): Uses `JSUndefined` for literal transformations
- **All other specs**: Depend on S0 runtime helpers

---

## Notes for Implementers

1. **Singleton correctness**: `JSUndefined` must NEVER be instantiated more than once. Use `is` checks, not `==`.

2. **js_truthy edge cases**: The most common bug is forgetting that empty containers are truthy in JS but falsy in Python.

3. **Testing**: Run tests with `pytest tests/runtime/test_foundations.py -v`

4. **No transformer logic**: S0 is runtime-only. No AST transformations, no parser, no generator.

5. **Documentation**: Add docstrings to all functions explaining JavaScript semantics vs Python.

---

## Timeline

**Day 1**:
- [ ] Create `runtime/js_compat.py`
- [ ] Implement `JSUndefined`, `js_truthy()`, `JSException`
- [ ] Write acceptance tests

**Day 2**:
- [ ] Run tests and fix bugs
- [ ] Document import policy
- [ ] Review and mark S0 complete
