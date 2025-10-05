"""Test that runtime module exports are correct."""

from runtime import js_compat


def test_exports():
    """Verify __all__ exports."""
    assert 'JSUndefined' in js_compat.__all__
    assert 'js_truthy' in js_compat.__all__
    assert 'JSException' in js_compat.__all__


def test_imports():
    """Verify direct imports work."""
    from runtime.js_compat import JSUndefined, js_truthy, JSException

    assert JSUndefined is not None
    assert callable(js_truthy)
    assert issubclass(JSException, Exception)
