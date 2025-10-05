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
