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
# Arithmetic and Coercion
# ============================================================================

def js_to_number(x: object) -> float | int:
    """
    JavaScript ToNumber coercion.

    Rules:
    - None (null) → 0
    - JSUndefined → NaN
    - bool: True → 1, False → 0
    - int/float → return as-is
    - str → parse as number (trim whitespace, empty → 0, parse errors → NaN)
    - Otherwise → NaN

    Limitations (documented):
    - Hex literals ('0x1A') not supported
    - Octal literals not supported
    """
    if x is None:
        return 0
    if x is JSUndefined:
        return float('nan')
    if isinstance(x, bool):
        return 1 if x else 0
    if isinstance(x, (int, float)):
        return x
    if isinstance(x, str):
        s = x.strip()
        if s == '':
            return 0
        try:
            # Try int first, then float
            if '.' in s or 'e' in s.lower():
                return float(s)
            return int(s)
        except ValueError:
            return float('nan')
    return float('nan')


def js_add(a: object, b: object) -> object:
    """
    JavaScript + operator.

    - If either operand is string → string concatenation
    - Otherwise → numeric addition with ToNumber coercion
    """
    if isinstance(a, str) or isinstance(b, str):
        # String concatenation (coerce both to strings)
        a_str = 'undefined' if a is JSUndefined else str(a) if a is not None else 'null'
        b_str = 'undefined' if b is JSUndefined else str(b) if b is not None else 'null'
        return a_str + b_str
    # Numeric addition
    return js_to_number(a) + js_to_number(b)


def js_sub(a: object, b: object) -> float | int:
    """JavaScript - operator (ToNumber coercion)."""
    return js_to_number(a) - js_to_number(b)


def js_mul(a: object, b: object) -> float | int:
    """JavaScript * operator (ToNumber coercion)."""
    return js_to_number(a) * js_to_number(b)


def js_div(a: object, b: object) -> float | int:
    """
    JavaScript / operator (ToNumber coercion).

    Handles division by zero:
    - 1/0 → Infinity
    - -1/0 → -Infinity
    - 0/0 → NaN
    """
    num_a = js_to_number(a)
    num_b = js_to_number(b)

    if num_b == 0:
        if num_a > 0:
            return _js_math.inf
        elif num_a < 0:
            return -_js_math.inf
        else:
            return float('nan')  # 0/0 → NaN

    return num_a / num_b


def js_mod(a: object, b: object) -> float | int:
    """
    JavaScript % operator (remainder, not modulo).

    JS remainder keeps dividend sign:
    - JS: -1 % 2 → -1 (dividend sign)
    - Python: -1 % 2 → 1 (divisor sign)

    Formula: a - (b * trunc(a / b))
    """
    num_a = js_to_number(a)
    num_b = js_to_number(b)

    if _js_math.isnan(num_a) or _js_math.isnan(num_b) or num_b == 0:
        return float('nan')

    if _js_math.isinf(num_a):
        return float('nan')

    if _js_math.isinf(num_b):
        return num_a

    return num_a - (num_b * _js_math.trunc(num_a / num_b))


# ============================================================================
# Exports
# ============================================================================

__all__ = [
    'JSUndefined',
    'js_truthy',
    'JSException',
    'js_strict_eq',
    'js_strict_neq',
    'js_to_number',
    'js_add',
    'js_sub',
    'js_mul',
    'js_div',
    'js_mod',
]
