"""
Tests for S7 runtime helpers: String, Array, Date, and Console helpers.
"""
import sys
sys.path.insert(0, 'runtime')

from js_compat import (
    JSUndefined,
    js_char_code_at,
    js_substring,
    js_array_pop,
    js_date_now,
    console_log,
)
import math
import time


# ============================================================================
# String Helpers
# ============================================================================

def test_char_code_at_in_range():
    assert js_char_code_at('abc', 0) == ord('a')
    assert js_char_code_at('abc', 1) == ord('b')
    assert js_char_code_at('abc', 2) == ord('c')


def test_char_code_at_out_of_range():
    assert math.isnan(js_char_code_at('abc', 3))
    assert math.isnan(js_char_code_at('abc', -1))
    assert math.isnan(js_char_code_at('abc', 10))


def test_char_code_at_nan_index():
    assert math.isnan(js_char_code_at('abc', float('nan')))


def test_substring_basic():
    assert js_substring('hello', 1, 4) == 'ell'
    assert js_substring('hello', 0, 5) == 'hello'


def test_substring_swap():
    # substring swaps if start > end
    assert js_substring('hello', 4, 1) == 'ell'


def test_substring_clamp_negative():
    # Negative values are clamped to 0
    assert js_substring('hello', -1, 3) == 'hel'
    assert js_substring('hello', 1, -1) == 'h'


def test_substring_no_end():
    # If end is None, use string length
    assert js_substring('hello', 2, None) == 'llo'
    assert js_substring('hello', 0, None) == 'hello'


def test_substring_undefined_end():
    # If end is JSUndefined, use string length
    assert js_substring('hello', 2, JSUndefined) == 'llo'


def test_substring_out_of_range():
    # Clamp to string length
    assert js_substring('hello', 1, 100) == 'ello'
    assert js_substring('hello', 100, 200) == ''


# ============================================================================
# Array Helpers
# ============================================================================

def test_array_pop_non_empty():
    arr = [1, 2, 3]
    assert js_array_pop(arr) == 3
    assert arr == [1, 2]


def test_array_pop_empty():
    arr = []
    result = js_array_pop(arr)
    assert result is JSUndefined
    assert arr == []


def test_array_pop_single_element():
    arr = [42]
    assert js_array_pop(arr) == 42
    assert arr == []


# ============================================================================
# Date Helpers
# ============================================================================

def test_date_now():
    # Date.now() should return milliseconds since epoch
    now = js_date_now()
    assert isinstance(now, int)
    assert now > 0

    # Should be close to current time (within 1 second)
    expected = int(time.time() * 1000)
    assert abs(now - expected) < 1000


# ============================================================================
# Console Helpers
# ============================================================================

def test_console_log_basic(capsys):
    console_log('hello', 'world')
    captured = capsys.readouterr()
    assert captured.out == 'hello world\n'


def test_console_log_numbers(capsys):
    console_log(1, 2, 3)
    captured = capsys.readouterr()
    assert captured.out == '1 2 3\n'


def test_console_log_undefined(capsys):
    console_log(JSUndefined)
    captured = capsys.readouterr()
    assert captured.out == 'undefined\n'


def test_console_log_null(capsys):
    console_log(None)
    captured = capsys.readouterr()
    assert captured.out == 'null\n'


def test_console_log_boolean(capsys):
    console_log(True, False)
    captured = capsys.readouterr()
    assert captured.out == 'true false\n'


def test_console_log_mixed(capsys):
    console_log('result:', 42, True, None, JSUndefined)
    captured = capsys.readouterr()
    assert captured.out == 'result: 42 true null undefined\n'
