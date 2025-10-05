"""Tests for js_strict_eq and js_strict_neq runtime helpers."""

import pytest
from runtime.js_compat import JSUndefined, js_strict_eq, js_strict_neq


class TestStrictEquality:
    """Test JavaScript strict equality (===) semantics."""

    def test_nan_not_equal_to_nan(self):
        """NaN !== NaN → False in JS"""
        assert js_strict_eq(float('nan'), float('nan')) is False
        assert js_strict_neq(float('nan'), float('nan')) is True

    def test_null_equals_null(self):
        """null === null → True"""
        assert js_strict_eq(None, None) is True
        assert js_strict_neq(None, None) is False

    def test_undefined_equals_undefined(self):
        """undefined === undefined → True"""
        assert js_strict_eq(JSUndefined, JSUndefined) is True
        assert js_strict_neq(JSUndefined, JSUndefined) is False

    def test_null_not_equal_undefined(self):
        """null !== undefined"""
        assert js_strict_eq(None, JSUndefined) is False
        assert js_strict_neq(None, JSUndefined) is True

    def test_primitives_value_equality(self):
        """Primitives use value equality"""
        assert js_strict_eq(5, 5) is True
        assert js_strict_eq('hello', 'hello') is True
        assert js_strict_eq(True, True) is True
        assert js_strict_eq(False, False) is True

    def test_primitives_type_mismatch(self):
        """Different types are not equal"""
        assert js_strict_eq(5, '5') is False
        assert js_strict_eq(1, True) is False
        assert js_strict_eq(0, False) is False

    def test_object_identity(self):
        """Objects/arrays use identity, not value equality"""
        obj1 = {'a': 1}
        obj2 = {'a': 1}
        assert js_strict_eq(obj1, obj1) is True  # Same object
        assert js_strict_eq(obj1, obj2) is False  # Different objects
        assert js_strict_neq(obj1, obj2) is True

    def test_array_identity(self):
        """Arrays use identity, not value equality"""
        arr1 = [1, 2, 3]
        arr2 = [1, 2, 3]
        assert js_strict_eq(arr1, arr1) is True  # Same array
        assert js_strict_eq(arr1, arr2) is False  # Different arrays
        assert js_strict_neq(arr1, arr2) is True

    def test_function_identity(self):
        """Functions use identity"""
        func1 = lambda x: x + 1
        func2 = lambda x: x + 1
        assert js_strict_eq(func1, func1) is True
        assert js_strict_eq(func1, func2) is False

    def test_empty_objects_not_equal(self):
        """CRITICAL: {} === {} is false in JS"""
        assert js_strict_eq({}, {}) is False
        assert js_strict_neq({}, {}) is True

    def test_empty_arrays_not_equal(self):
        """CRITICAL: [] === [] is false in JS"""
        assert js_strict_eq([], []) is False
        assert js_strict_neq([], []) is True

    def test_zero_values(self):
        """+0 === -0 in JS (we don't distinguish)"""
        assert js_strict_eq(0, -0) is True
        assert js_strict_eq(0.0, -0.0) is True

    def test_int_float_equality(self):
        """CRITICAL: 1 === 1.0 is true in JS (numeric type compatibility)"""
        assert js_strict_eq(1, 1.0) is True
        assert js_strict_neq(1, 1.0) is False
        assert js_strict_eq(0, 0.0) is True
        assert js_strict_eq(42, 42.0) is True
        assert js_strict_eq(-5, -5.0) is True
