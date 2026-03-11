# P023 — Session Recall: Lossless Compaction Chain

Status: proposed, not implemented as of 2026-03-11.

Current backend reality:
- `backend/services/compaction.py` writes only the latest `rooms.summary`
- top-of-mind recall searches memory files via `backend/services/memory/search.py`
- there is no `room_summary_history` table in `backend/db/connection.py`
- there are no `SESSION_RECALL_*` flags in `backend/config.py`

## Goal

Preserve old compaction outputs so the backend can recall prior session summaries instead of overwriting them forever.

## Proposed Shape

1. Add a `room_summary_history` table.
2. Write one history row each time compaction updates `rooms.summary`.
3. Embed those summary rows for recall search.
4. Extend top-of-mind recall to optionally blend memory-file hits with session-summary hits.

## Why It Is Separate From Existing Systems

- `rooms.summary` is the active short-context summary only.
- memory files capture durable facts and preferences.
- dreams capture relationship digestion.
- this proposal would preserve narrative session history, which the current backend discards.

## Main Open Tasks

1. Schema addition in `backend/db/connection.py`
2. Compaction write-path change in `backend/services/compaction.py`
3. New recall service under `backend/services/memory/`
4. Config flags in `backend/config.py`
5. Tests for compaction writes, retrieval quality, and top-of-mind merge behavior

## Constraints

- Keep the rollout additive.
- Do not replace memory files or dreams.
- Do not change current behavior when the feature is disabled.

<!-- TODO: When implementation starts, revalidate whether summary embeddings should reuse the existing memory embedder as-is or use a distinct storage/index path. -->
