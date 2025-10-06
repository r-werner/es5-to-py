"""Tests for arithmetic operators and ToNumber coercion."""

import math
import pytest
from runtime.js_compat import (
    JSUndefined,
    js_to_number,
    js_add,
    js_sub,
    js_mul,
    js_div,
    js_mod,
)


class TestToNumber:
    """Test JavaScript ToNumber coercion."""

    def test_null_to_zero(self):
        """None (null) → 0"""
        assert js_to_number(None) == 0

    def test_undefined_to_nan(self):
        """JSUndefined → NaN"""
        assert math.isnan(js_to_number(JSUndefined))

    def test_boolean_coercion(self):
        """bool: True → 1, False → 0"""
        assert js_to_number(True) == 1
        assert js_to_number(False) == 0

    def test_number_passthrough(self):
        """int/float → return as-is"""
        assert js_to_number(5) == 5
        assert js_to_number(3.14) == 3.14
        assert js_to_number(-42) == -42

    def test_string_numeric(self):
        """String to number parsing"""
        assert js_to_number('5') == 5
        assert js_to_number('3.14') == 3.14
        assert js_to_number('-42') == -42
        assert js_to_number('1e3') == 1000

    def test_string_whitespace(self):
        """String with whitespace"""
        assert js_to_number('  5  ') == 5
        assert js_to_number('\t10\n') == 10

    def test_empty_string_to_zero(self):
        """Empty string → 0"""
        assert js_to_number('') == 0
        assert js_to_number('   ') == 0

    def test_string_parse_error_to_nan(self):
        """Invalid string → NaN"""
        assert math.isnan(js_to_number('hello'))
        assert math.isnan(js_to_number('5x'))


class TestJsAdd:
    """Test JavaScript + operator."""

    def test_string_concatenation(self):
        """If either operand is string → concat"""
        assert js_add('5', 2) == '52'
        assert js_add(2, '5') == '25'
        assert js_add('hello', ' world') == 'hello world'

    def test_null_string_concat(self):
        """null in string context → 'null'"""
        assert js_add('x', None) == 'xnull'
        assert js_add(None, 'x') == 'nullx'

    def test_undefined_string_concat(self):
        """undefined in string context → 'undefined'"""
        assert js_add('x', JSUndefined) == 'xundefined'
        assert js_add(JSUndefined, 'x') == 'undefinedx'

    def test_numeric_addition(self):
        """Both numeric → addition with coercion"""
        assert js_add(5, 3) == 8
        assert js_add(1.5, 2.5) == 4.0

    def test_null_addition(self):
        """null + number → number (null coerces to 0)"""
        assert js_add(None, 1) == 1
        assert js_add(5, None) == 5

    def test_string_coercion_in_add(self):
        """'5' - 2 is numeric, but '5' + 2 is string"""
        assert js_add('5', 3) == '53'


class TestJsSub:
    """Test JavaScript - operator."""

    def test_numeric_subtraction(self):
        """ToNumber coercion for both operands"""
        assert js_sub(10, 3) == 7
        assert js_sub('10', 3) == 7
        assert js_sub(10, '3') == 7
        assert js_sub('10', '3') == 7

    def test_null_subtraction(self):
        """null coerces to 0"""
        assert js_sub(5, None) == 5
        assert js_sub(None, 5) == -5

    def test_undefined_subtraction(self):
        """undefined coerces to NaN"""
        assert math.isnan(js_sub(5, JSUndefined))
        assert math.isnan(js_sub(JSUndefined, 5))


class TestJsMul:
    """Test JavaScript * operator."""

    def test_numeric_multiplication(self):
        """ToNumber coercion"""
        assert js_mul(5, 3) == 15
        assert js_mul('5', 3) == 15
        assert js_mul(5, '3') == 15

    def test_null_multiplication(self):
        """null * x → 0"""
        assert js_mul(None, 5) == 0
        assert js_mul(5, None) == 0


class TestJsDiv:
    """Test JavaScript / operator."""

    def test_numeric_division(self):
        """ToNumber coercion"""
        assert js_div(10, 2) == 5
        assert js_div('10', 2) == 5
        assert js_div(10, '2') == 5

    def test_division_by_zero(self):
        """Division by zero behavior"""
        assert js_div(1, 0) == math.inf
        assert js_div(-1, 0) == -math.inf
        assert math.isnan(js_div(0, 0))

    def test_infinity_division(self):
        """Infinity / x"""
        assert js_div(math.inf, 2) == math.inf
        assert math.isnan(js_div(math.inf, math.inf))


class TestJsMod:
    """Test JavaScript % operator (remainder)."""

    def test_remainder_positive(self):
        """Positive operands"""
        assert js_mod(7, 3) == 1
        assert js_mod(10, 4) == 2

    def test_remainder_negative_dividend(self):
        """CRITICAL: Negative dividend keeps sign (JS semantics)"""
        assert js_mod(-1, 2) == -1  # NOT 1 (Python modulo)
        assert js_mod(-7, 3) == -1

    def test_remainder_negative_divisor(self):
        """Negative divisor"""
        assert js_mod(7, -3) == 1  # Dividend sign
        assert js_mod(-7, -3) == -1

    def test_remainder_with_zero(self):
        """x % 0 → NaN"""
        assert math.isnan(js_mod(5, 0))

    def test_remainder_with_infinity(self):
        """Infinity % x → NaN, x % Infinity → x"""
        assert math.isnan(js_mod(math.inf, 2))
        assert js_mod(5, math.inf) == 5
