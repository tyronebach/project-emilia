"""Architecture boundary tests for the standalone core redesign."""

from __future__ import annotations

import ast
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]


def _python_files(relative_dir: str) -> list[Path]:
    return sorted(
        path for path in (BACKEND_DIR / relative_dir).rglob("*.py")
        if path.name != "__pycache__"
    )


def _imported_modules(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    modules: set[str] = set()

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                modules.add(alias.name)
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                modules.add(node.module)

    return modules


def _assert_no_imports(paths: list[Path], forbidden_prefixes: tuple[str, ...]) -> None:
    violations: list[str] = []

    for path in paths:
        modules = _imported_modules(path)
        for module in modules:
            if module.startswith(forbidden_prefixes):
                rel_path = path.relative_to(BACKEND_DIR)
                violations.append(f"{rel_path}: {module}")

    assert not violations, "Forbidden imports found:\n" + "\n".join(sorted(violations))


def test_routers_do_not_import_other_routers() -> None:
    router_files = _python_files("routers")
    _assert_no_imports(router_files, ("routers.", "backend.routers."))


def test_provider_services_do_not_import_routers() -> None:
    _assert_no_imports(
        _python_files("services/providers"),
        ("routers", "routers.", "backend.routers."),
    )


def test_memory_services_do_not_import_routers() -> None:
    _assert_no_imports(
        _python_files("services/memory"),
        ("routers", "routers.", "backend.routers."),
    )


def test_dream_services_do_not_import_routers() -> None:
    _assert_no_imports(
        _python_files("services/dreams"),
        ("routers", "routers.", "backend.routers."),
    )
