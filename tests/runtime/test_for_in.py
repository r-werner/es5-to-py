"""
Tests for js_for_in_keys() runtime helper.
"""

import sys
sys.path.insert(0, 'runtime')

from js_compat import js_for_in_keys, JSUndefined


def test_for_in_dict():
    """Dict: yield keys as strings."""
    obj = {'a': 1, 'b': 2, 'c': 3}
    keys = list(js_for_in_keys(obj))
    assert keys == ['a', 'b', 'c']


def test_for_in_dict_numeric_keys():
    """Dict with numeric keys: yield as strings."""
    obj = {1: 'one', 2: 'two', 3: 'three'}
    keys = list(js_for_in_keys(obj))
    assert keys == ['1', '2', '3']


def test_for_in_list():
    """List: yield indices as strings."""
    arr = [10, 20, 30]
    indices = list(js_for_in_keys(arr))
    assert indices == ['0', '1', '2']


def test_for_in_list_skip_holes():
    """List: skip holes (JSUndefined values)."""
    arr = [1, JSUndefined, 3]
    indices = list(js_for_in_keys(arr))
    assert indices == ['0', '2']  # Skip index 1


def test_for_in_list_all_holes():
    """List: all holes returns empty."""
    arr = [JSUndefined, JSUndefined, JSUndefined]
    indices = list(js_for_in_keys(arr))
    assert indices == []


def test_for_in_string():
    """String: yield indices as strings."""
    s = 'abc'
    indices = list(js_for_in_keys(s))
    assert indices == ['0', '1', '2']


def test_for_in_string_empty():
    """Empty string: no indices."""
    s = ''
    indices = list(js_for_in_keys(s))
    assert indices == []


def test_for_in_number():
    """Number: no enumeration."""
    indices = list(js_for_in_keys(42))
    assert indices == []


def test_for_in_none():
    """None: no enumeration."""
    indices = list(js_for_in_keys(None))
    assert indices == []


def test_for_in_undefined():
    """JSUndefined: no enumeration."""
    indices = list(js_for_in_keys(JSUndefined))
    assert indices == []


def test_for_in_empty_dict():
    """Empty dict: no keys."""
    obj = {}
    keys = list(js_for_in_keys(obj))
    assert keys == []


def test_for_in_empty_list():
    """Empty list: no indices."""
    arr = []
    indices = list(js_for_in_keys(arr))
    assert indices == []
