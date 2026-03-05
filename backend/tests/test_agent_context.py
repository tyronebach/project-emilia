from __future__ import annotations

from datetime import datetime

from services import direct_llm
from services.agent_context import load_canon_soul_md
from services.chat_context_runtime import time_of_day_bucket


def test_time_of_day_bucket_ranges() -> None:
    assert time_of_day_bucket(datetime(2026, 1, 1, 5, 0)) == "morning"
    assert time_of_day_bucket(datetime(2026, 1, 1, 12, 0)) == "afternoon"
    assert time_of_day_bucket(datetime(2026, 1, 1, 17, 0)) == "evening"
    assert time_of_day_bucket(datetime(2026, 1, 1, 2, 0)) == "night"


def test_direct_time_block_uses_shared_bucket(monkeypatch) -> None:
    monkeypatch.setattr(direct_llm, "time_of_day_bucket", lambda _dt: "dusk")
    block = direct_llm._get_time_block("UTC")
    assert "(dusk)" in block


def test_load_canon_soul_md_extracts_canon_section(tmp_path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir(parents=True, exist_ok=True)
    (workspace / "SOUL.md").write_text(
        """# SOUL.md
## Canon
### Identity
- **Name:** Emilia
## Personality
- Cheerful
""",
        encoding="utf-8",
    )

    canon = load_canon_soul_md(str(workspace))
    assert canon is not None
    assert "Name:** Emilia" in canon
    assert "Cheerful" not in canon
