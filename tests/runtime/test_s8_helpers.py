"""
S8 Runtime Helpers - Tests for regex, typeof, delete, and loose equality
"""

import pytest
import re
from runtime.js_compat import (
    JSUndefined,
    compile_js_regex,
    js_typeof,
    js_delete,
    js_loose_eq,
    js_loose_neq,
)


# ============================================================================
# Regex Tests
# ============================================================================

def test_compile_js_regex_basic():
    """Test basic regex compilation."""
    regex = compile_js_regex('hello', '')
    assert regex.search('hello world') is not None
    assert regex.search('goodbye') is None


def test_compile_js_regex_ignorecase():
    """Test case-insensitive flag."""
    regex = compile_js_regex('hello', 'i')
    assert regex.search('HELLO') is not None
    assert regex.search('HeLLo') is not None


def test_compile_js_regex_multiline():
    """Test multiline flag."""
    regex = compile_js_regex('^test', 'm')
    text = 'line1\ntest\nline3'
    assert regex.search(text) is not None


def test_compile_js_regex_dotall():
    """Test dotall flag (. matches newline)."""
    regex = compile_js_regex('a.b', 's')
    assert regex.search('a\nb') is not None


def test_compile_js_regex_strip_global():
    """Test that 'g' flag is stripped without error."""
    regex = compile_js_regex('test', 'g')
    assert regex.search('test') is not None


def test_compile_js_regex_combined_flags():
    """Test multiple flags."""
    regex = compile_js_regex('hello', 'gi')
    assert regex.search('HELLO') is not None


def test_compile_js_regex_sticky_flag_error():
    """Test that 'y' (sticky) flag raises error."""
    with pytest.raises(ValueError, match="sticky flag 'y'"):
        compile_js_regex('test', 'y')


def test_compile_js_regex_unicode_flag_error():
    """Test that 'u' (unicode) flag raises error."""
    with pytest.raises(ValueError, match="unicode flag 'u'"):
        compile_js_regex('test', 'u')


# ============================================================================
# typeof Tests
# ============================================================================

def test_js_typeof_undefined():
    """Test typeof undefined."""
    assert js_typeof(JSUndefined) == 'undefined'


def test_js_typeof_null():
    """Test typeof null (returns 'object' in JS)."""
    assert js_typeof(None) == 'object'


def test_js_typeof_boolean():
    """Test typeof boolean."""
    assert js_typeof(True) == 'boolean'
    assert js_typeof(False) == 'boolean'


def test_js_typeof_number():
    """Test typeof number."""
    assert js_typeof(42) == 'number'
    assert js_typeof(3.14) == 'number'
    assert js_typeof(float('nan')) == 'number'
    assert js_typeof(float('inf')) == 'number'


def test_js_typeof_string():
    """Test typeof string."""
    assert js_typeof('hello') == 'string'
    assert js_typeof('') == 'string'


def test_js_typeof_object():
    """Test typeof object (dict)."""
    assert js_typeof({}) == 'object'
    assert js_typeof({'a': 1}) == 'object'


def test_js_typeof_array():
    """Test typeof array (returns 'object' in JS)."""
    assert js_typeof([]) == 'object'
    assert js_typeof([1, 2, 3]) == 'object'


def test_js_typeof_function():
    """Test typeof function."""
    def func():
        pass
    assert js_typeof(func) == 'function'
    assert js_typeof(lambda x: x) == 'function'


# ============================================================================
# delete Tests
# ============================================================================

def test_js_delete_dict_existing_key():
    """Test delete on existing dict key."""
    obj = {'a': 1, 'b': 2}
    result = js_delete(obj, 'a')
    assert result is True
    assert 'a' not in obj
    assert obj == {'b': 2}


def test_js_delete_dict_nonexistent_key():
    """Test delete on non-existent dict key."""
    obj = {'a': 1}
    result = js_delete(obj, 'b')
    assert result is True
    assert obj == {'a': 1}


def test_js_delete_array_create_hole():
    """Test delete on array creates hole with JSUndefined."""
    arr = [1, 2, 3, 4]
    result = js_delete(arr, 1)
    assert result is True
    assert arr[1] is JSUndefined
    assert len(arr) == 4  # Length preserved


def test_js_delete_array_string_index():
    """Test delete with string index."""
    arr = [1, 2, 3]
    result = js_delete(arr, '1')
    assert result is True
    assert arr[1] is JSUndefined


def test_js_delete_array_out_of_bounds():
    """Test delete with out-of-bounds index."""
    arr = [1, 2, 3]
    result = js_delete(arr, 10)
    assert result is True
    assert arr == [1, 2, 3]  # No change


def test_js_delete_array_negative_index():
    """Test delete with negative index (no-op in JS)."""
    arr = [1, 2, 3]
    result = js_delete(arr, -1)
    assert result is True
    assert arr == [1, 2, 3]  # No change


def test_js_delete_other_types():
    """Test delete on non-dict/array returns True."""
    assert js_delete('string', 0) is True
    assert js_delete(42, 'prop') is True


# ============================================================================
# Loose Equality Tests
# ============================================================================

def test_js_loose_eq_null_undefined():
    """Test null == undefined."""
    assert js_loose_eq(None, JSUndefined) is True
    assert js_loose_eq(JSUndefined, None) is True


def test_js_loose_eq_null_null():
    """Test null == null."""
    assert js_loose_eq(None, None) is True


def test_js_loose_eq_undefined_undefined():
    """Test undefined == undefined."""
    assert js_loose_eq(JSUndefined, JSUndefined) is True


def test_js_loose_eq_same_type():
    """Test same type comparisons."""
    assert js_loose_eq(5, 5) is True
    assert js_loose_eq(5, 6) is False
    assert js_loose_eq('hello', 'hello') is True
    assert js_loose_eq('hello', 'world') is False
    assert js_loose_eq(True, True) is True


def test_js_loose_eq_number_string():
    """Test number and string coercion."""
    assert js_loose_eq(5, '5') is True
    assert js_loose_eq('5', 5) is True
    assert js_loose_eq(10, '10') is True
    assert js_loose_eq(5, '6') is False


def test_js_loose_eq_boolean_coercion():
    """Test boolean coercion."""
    assert js_loose_eq(True, 1) is True
    assert js_loose_eq(False, 0) is True
    assert js_loose_eq(1, True) is True
    assert js_loose_eq(True, 2) is False


def test_js_loose_eq_nan():
    """Test NaN comparisons."""
    assert js_loose_eq(float('nan'), float('nan')) is False
    assert js_loose_eq(float('nan'), 5) is False


def test_js_loose_eq_object_error():
    """Test that comparing objects raises error."""
    with pytest.raises(TypeError, match="Loose equality with objects/arrays"):
        js_loose_eq({}, {})


def test_js_loose_eq_array_error():
    """Test that comparing arrays raises error."""
    with pytest.raises(TypeError, match="Loose equality with objects/arrays"):
        js_loose_eq([], [])


def test_js_loose_eq_mixed_object_error():
    """Test that comparing value with object raises error."""
    with pytest.raises(TypeError, match="Loose equality with objects/arrays"):
        js_loose_eq(5, {})
    with pytest.raises(TypeError, match="Loose equality with objects/arrays"):
        js_loose_eq([], 'string')


def test_js_loose_neq():
    """Test loose inequality."""
    assert js_loose_neq(5, '6') is True
    assert js_loose_neq(5, '5') is False
    assert js_loose_neq(None, JSUndefined) is False


def test_js_loose_eq_edge_cases():
    """Test edge cases."""
    # Empty string and 0
    assert js_loose_eq('', 0) is True
    # String with spaces
    assert js_loose_eq('  5  ', 5) is True
    # null with other values
    assert js_loose_eq(None, 0) is False
    assert js_loose_eq(None, '') is False
