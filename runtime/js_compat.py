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
    __slots__ = ()

    def __repr__(self) -> str:
        return 'undefined'

    def __bool__(self) -> bool:
        return False

# Singleton instance (NEVER create another instance)
JSUndefined = _JSUndefined()


# ============================================================================
# Truthiness
# ============================================================================

def js_truthy(x: object) -> bool:
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


# ============================================================================
# Exception Handling
# ============================================================================

class JSException(Exception):
    """
    Exception class for JavaScript throw statements.

    JavaScript allows throwing any value (strings, numbers, objects).
    Python only allows throwing exceptions, so we wrap arbitrary values.

    Attributes:
        value: The thrown JavaScript value (can be any type)
    """
    def __init__(self, value: object) -> None:
        self.value = value
        super().__init__(repr(value))

    def __repr__(self) -> str:
        return f'JSException({self.value!r})'


# ============================================================================
# Strict Equality
# ============================================================================

def js_strict_eq(a: object, b: object) -> bool:
    """
    JavaScript strict equality (===) semantics.

    Key rules:
    - NaN === NaN → False (therefore NaN !== NaN is True)
    - null === null → True (identity check: a is None and b is None)
    - undefined === undefined → True (identity check: a is JSUndefined and b is JSUndefined)
    - Numbers (int/float): value equality (1 === 1.0 is True; bool excluded from numeric bucket)
    - Primitives (str, bool): value equality
    - Objects/arrays/functions (dict, list, callable): identity (a is b)

    Note: -0 vs +0 distinction not implemented (acceptable for demo).
    """
    # NaN handling: NaN !== NaN in JavaScript
    if isinstance(a, float) and _js_math.isnan(a):
        return False
    if isinstance(b, float) and _js_math.isnan(b):
        return False

    # null/undefined identity
    if a is None and b is None:
        return True
    if a is JSUndefined and b is JSUndefined:
        return True

    # Numbers: int/float mix allowed (bool excluded)
    # In JS, 1 === 1.0 is true
    if type(a) in (int, float) and type(b) in (int, float):
        return float(a) == float(b)

    # Type mismatch otherwise → False
    if type(a) is not type(b):
        return False

    # Primitives (excluding numbers handled above)
    if isinstance(a, (str, bool)):
        return a == b

    # Objects/arrays/functions: identity
    return a is b


def js_strict_neq(a: object, b: object) -> bool:
    """JavaScript strict inequality (!==)."""
    return not js_strict_eq(a, b)


# ============================================================================
# Exports
# ============================================================================

__all__ = [
    'JSUndefined',
    'js_truthy',
    'JSException',
    'js_strict_eq',
    'js_strict_neq',
]
