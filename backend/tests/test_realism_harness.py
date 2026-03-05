from __future__ import annotations

import json
from pathlib import Path


def test_realism_fixture_schema_is_stable():
    fixture_path = Path(__file__).parent / "fixtures" / "realism" / "baseline_weekly.json"
    payload = json.loads(fixture_path.read_text(encoding="utf-8"))

    assert isinstance(payload, dict)
    assert payload["schema_version"] == 1
    assert isinstance(payload["timeline"], list)
    assert payload["timeline"]

    first = payload["timeline"][0]
    assert {"day", "user", "agent"}.issubset(first.keys())
