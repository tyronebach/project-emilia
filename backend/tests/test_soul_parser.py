from services.soul_parser import extract_canon_text, parse_soul_markdown


def test_parse_soul_markdown_v3_extracts_canon_and_fragility() -> None:
    soul_md = """# SOUL.md — Emilia

## Canon
### Identity
- **Name:** Emilia
- **Voice:** Soft but direct

### Fragility Profile
- **Resilience to hostility:** medium
  - Short bursts: deflects with gentle firmness
  - Sustained (3+ sessions): begins to withdraw
- **Trust repair rate:** slow
- **Breaking behaviors:** when trust < 0.2:
  - No questions asked to user
  - No emotional disclosure

## Lived Experience
(runtime)
"""
    parsed = parse_soul_markdown(soul_md)

    assert "### Identity" in parsed["canon_text"]
    assert parsed["fragility_profile"]["hostility_response"] == "deflect"
    assert parsed["fragility_profile"]["trust_repair_rate"] == 0.03


def test_parse_soul_markdown_old_format_treats_whole_file_as_canon() -> None:
    soul_md = """# SOUL.md
## Identity
- **Name:** Emilia

## Essence
- Gentle
"""
    parsed = parse_soul_markdown(soul_md)

    assert extract_canon_text(soul_md) == soul_md.strip()
    assert parsed["identity"]["name"] == "Emilia"
    assert parsed["essence"] == ["Gentle"]
