"""
Internal dream scheduler and runtime for Emilia standalone core.

Runs periodic reflection jobs that update lived_experience and log
relationship dimension deltas — no external cron dependency.

Sub-modules:
  scheduler — find agents due for a dream run
  runtime   — execute a dream reflection job

Phase A: module skeleton only.
"""
