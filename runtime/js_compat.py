"""
JavaScript Compatibility Runtime Library

Provides runtime helpers to bridge semantic gaps between JavaScript and Python.
This module is imported by all transpiled code.
"""

from typing import Union
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

def js_to_number(x: object) -> Union[float, int]:
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
        # String concatenation (coerce both to strings with JS ToString semantics)
        def to_js_string(x: object) -> str:
            if x is JSUndefined:
                return 'undefined'
            if x is None:
                return 'null'
            if isinstance(x, bool):
                return 'true' if x else 'false'
            return str(x)

        return to_js_string(a) + to_js_string(b)
    # Numeric addition
    return js_to_number(a) + js_to_number(b)


def js_sub(a: object, b: object) -> Union[float, int]:
    """JavaScript - operator (ToNumber coercion)."""
    return js_to_number(a) - js_to_number(b)


def js_mul(a: object, b: object) -> Union[float, int]:
    """JavaScript * operator (ToNumber coercion)."""
    return js_to_number(a) * js_to_number(b)


def js_div(a: object, b: object) -> Union[float, int]:
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


def js_mod(a: object, b: object) -> Union[float, int]:
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
# S8: Regex Helpers
# ============================================================================

import re as _js_re

def compile_js_regex(pattern: str, flags_str: str):
    """
    Compile JS regex to Python re pattern.

    - Strip 'g' flag (Python has no global flag; handled by count in .sub())
    - Map flags: i → IGNORECASE, m → MULTILINE, s → DOTALL
    - Error on y (sticky), u (unicode)

    Args:
        pattern: Regex pattern string
        flags_str: JS flags string (e.g., 'gi', 'im')

    Returns:
        re.Pattern: Compiled Python regex

    Raises:
        ValueError: If unsupported flags are used
    """
    # Strip 'g' flag (handled by count parameter in re.sub)
    flags_str = flags_str.replace('g', '')

    if 'y' in flags_str:
        raise ValueError("Regex sticky flag 'y' is not supported.")
    if 'u' in flags_str:
        raise ValueError("Regex unicode flag 'u' is not supported.")

    flags = 0
    if 'i' in flags_str:
        flags |= _js_re.IGNORECASE
    if 'm' in flags_str:
        flags |= _js_re.MULTILINE
    if 's' in flags_str:
        flags |= _js_re.DOTALL

    return _js_re.compile(pattern, flags)


# ============================================================================
# S8: Type Operator (typeof)
# ============================================================================

def js_typeof(x: object) -> str:
    """
    JavaScript typeof operator.

    Returns:
        - 'undefined' for JSUndefined
        - 'object' for None (null)
        - 'boolean' for bool
        - 'number' for int/float
        - 'string' for str
        - 'object' for list/dict
        - 'function' for callable
        - 'object' for everything else
    """
    if x is JSUndefined:
        return 'undefined'
    if x is None:
        return 'object'
    if isinstance(x, bool):
        return 'boolean'
    if isinstance(x, (int, float)):
        return 'number'
    if isinstance(x, str):
        return 'string'
    if isinstance(x, (list, dict)):
        return 'object'
    if callable(x):
        return 'function'
    return 'object'


# ============================================================================
# S8: Delete Operator
# ============================================================================

def js_delete(base: object, key: object) -> bool:
    """
    JavaScript delete operator.

    - Dict: remove key if exists
    - List: assign JSUndefined to create hole (don't use del, which shifts elements)
    - Returns True in all cases (JS behavior)

    Args:
        base: Object to delete from
        key: Property key or index

    Returns:
        bool: Always True (JS delete always returns true for deletable properties)
    """
    if isinstance(base, dict):
        if key in base:
            del base[key]
        return True

    if isinstance(base, list):
        # Don't use del (shifts elements); assign JSUndefined to create hole
        try:
            idx = int(key) if isinstance(key, str) else key
            if 0 <= idx < len(base):
                base[idx] = JSUndefined
        except (ValueError, TypeError):
            pass
        return True

    return True  # Non-deletable properties


# ============================================================================
# S8: Loose Equality
# ============================================================================

def js_loose_eq(a: object, b: object) -> bool:
    """
    JavaScript loose equality (==).

    Supported:
    - null == undefined → True
    - Same type → value equality
    - Number and string → coerce string to number
    - Boolean → coerce to number

    NOT supported (error):
    - Object/array comparisons (ToPrimitive too complex)

    Args:
        a: Left operand
        b: Right operand

    Returns:
        bool: True if loosely equal

    Raises:
        TypeError: If comparing objects/arrays
    """
    # Reject objects/arrays
    if isinstance(a, (list, dict)) or isinstance(b, (list, dict)):
        raise TypeError("Loose equality with objects/arrays is not supported. Use strict equality (===).")

    # NaN handling
    if isinstance(a, float) and _js_math.isnan(a):
        return False
    if isinstance(b, float) and _js_math.isnan(b):
        return False

    # null == undefined
    if (a is None and b is JSUndefined) or (a is JSUndefined and b is None):
        return True

    # Same type
    if type(a) == type(b):
        return a == b

    # Number and string
    if isinstance(a, (int, float)) and isinstance(b, str):
        return a == js_to_number(b)
    if isinstance(a, str) and isinstance(b, (int, float)):
        return js_to_number(a) == b

    # Boolean coercion
    if isinstance(a, bool):
        return js_loose_eq(1 if a else 0, b)
    if isinstance(b, bool):
        return js_loose_eq(a, 1 if b else 0)

    return False


def js_loose_neq(a: object, b: object) -> bool:
    """JavaScript loose inequality (!=)."""
    return not js_loose_eq(a, b)


# ============================================================================
# For-in Enumeration
# ============================================================================

def js_for_in_keys(obj):
    """
    JavaScript for-in enumeration.

    CRITICAL: ALL keys are yielded as strings to match JS for-in behavior.

    - Dict: yield keys converted to strings
    - List: yield indices as strings ('0', '1', ...), skip holes (JSUndefined)
    - String: yield indices as strings
    - Otherwise: empty iterator (no enumeration)

    Args:
        obj: Object to enumerate

    Yields:
        str: Keys/indices as strings
    """
    if isinstance(obj, dict):
        # Dict: yield keys as strings
        for key in obj:
            yield str(key)
    elif isinstance(obj, list):
        # List: yield indices as strings, skip holes
        for i, val in enumerate(obj):
            if val is not JSUndefined:  # Skip holes
                yield str(i)
    elif isinstance(obj, str):
        # String: yield indices as strings
        for i in range(len(obj)):
            yield str(i)
    # Otherwise: no iteration (empty generator)


# ============================================================================
# S7: Math Helpers
# ============================================================================

def js_round(x: Union[int, float]) -> int:
    """
    JavaScript Math.round() - rounds to nearest integer.

    CRITICAL: Python's round() uses banker's rounding (round half to even),
    but JS uses round half towards positive infinity (round half up).

    Examples:
    - JS: Math.round(0.5) → 1, Math.round(-0.5) → -0 (which is 0)
    - JS: Math.round(2.5) → 3, Math.round(-2.5) → -2
    - Python: round(0.5) → 0, round(2.5) → 2 (banker's rounding)

    JS behavior: always round .5 towards +Infinity
    """
    num = js_to_number(x)

    if _js_math.isnan(num) or _js_math.isinf(num):
        return num

    # JS rounds .5 towards +Infinity (upward)
    return int(_js_math.floor(num + 0.5))


# ============================================================================
# S7: String Helpers
# ============================================================================

def js_char_code_at(s: str, i: Union[int, float]) -> float:
    """
    JavaScript String.charCodeAt().
    Returns the UTF-16 code unit at the given index.
    Returns NaN for out-of-range indices.
    """
    i_num = js_to_number(i)
    if _js_math.isnan(i_num):
        return float('nan')
    i_int = int(i_num)
    if 0 <= i_int < len(s):
        return float(ord(s[i_int]))
    return float('nan')


def js_substring(s: str, start: Union[int, float], end: Union[int, float, None] = None) -> str:
    """
    JavaScript String.substring().
    - Clamps negative values to 0
    - Swaps start/end if start > end
    - If end is None/undefined, uses string length
    """
    start_num = js_to_number(start)
    if _js_math.isnan(start_num):
        start_num = 0

    if end is None or end is JSUndefined:
        end_num = len(s)
    else:
        end_num = js_to_number(end)
        if _js_math.isnan(end_num):
            end_num = 0

    # Clamp to [0, len(s)]
    start_int = max(0, min(int(start_num), len(s)))
    end_int = max(0, min(int(end_num), len(s)))

    # Swap if start > end
    if start_int > end_int:
        start_int, end_int = end_int, start_int

    return s[start_int:end_int]


# ============================================================================
# S7: Array Helpers
# ============================================================================

def js_array_pop(arr: list) -> object:
    """
    JavaScript Array.pop().
    Returns JSUndefined for empty arrays (not None).
    """
    if len(arr) > 0:
        return arr.pop()
    return JSUndefined


# ============================================================================
# S7: Date Helpers
# ============================================================================

def js_date_now() -> int:
    """
    JavaScript Date.now().
    Returns milliseconds since Unix epoch (1970-01-01T00:00:00Z).
    """
    import time as _js_time
    return int(_js_time.time() * 1000)


# ============================================================================
# S7: Console Helpers
# ============================================================================

def console_log(*args) -> None:
    """
    JavaScript console.log().
    Prints arguments separated by spaces (JS-style).
    """
    # Convert each arg to string using JS ToString semantics
    def to_js_string(x: object) -> str:
        if x is JSUndefined:
            return 'undefined'
        if x is None:
            return 'null'
        if isinstance(x, bool):
            return 'true' if x else 'false'
        return str(x)

    print(' '.join(to_js_string(arg) for arg in args))


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
    'compile_js_regex',
    'js_typeof',
    'js_delete',
    'js_loose_eq',
    'js_loose_neq',
    'js_for_in_keys',
    'js_round',
    'js_char_code_at',
    'js_substring',
    'js_array_pop',
    'js_date_now',
    'console_log',
]
