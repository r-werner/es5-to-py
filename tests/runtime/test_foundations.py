import pytest
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
