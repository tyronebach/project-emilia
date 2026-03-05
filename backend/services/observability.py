"""Lightweight structured observability helpers."""
from __future__ import annotations

import logging
from typing import Any


def log_metric(logger: logging.Logger, name: str, **fields: Any) -> None:
    safe_fields = {k: v for k, v in fields.items() if v is not None}
    logger.info("[Metric] %s %s", name, safe_fields)
