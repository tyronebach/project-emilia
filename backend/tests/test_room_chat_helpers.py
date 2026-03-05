from __future__ import annotations

import pytest

from services.room_chat import has_workspace


@pytest.mark.parametrize(
    "value,expected",
    [
        (None, False),
        ("", False),
        ("   ", False),
        ("/tmp/workspace", True),
        (" /tmp/workspace ", True),
        (123, False),
    ],
)
def test_has_workspace(value: object, expected: bool) -> None:
    assert has_workspace(value) is expected
