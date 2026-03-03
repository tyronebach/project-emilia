"""
Architecture boundary tests for Emilia standalone core.

Asserts that import boundaries between layers are respected:
  - Routers must not import from other routers
  - services/providers/* must not import from routers
  - services/memory/* must not import from routers
  - services/dreams/* must not import from routers
  - services/chat_runtime/* must not import from routers

These tests parse module source files directly so they catch coupling
before any runtime import would.
"""
import ast
import pathlib

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
ROUTERS_DIR = BACKEND_ROOT / "routers"


def _get_imports(source_path: pathlib.Path) -> list[str]:
    """Return all module names imported by *source_path*."""
    try:
        tree = ast.parse(source_path.read_text())
    except SyntaxError:
        return []

    imported: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                imported.append(alias.name)
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                imported.append(node.module)
    return imported


def _router_modules() -> list[str]:
    """Return module names for every router file."""
    return [f"routers.{p.stem}" for p in ROUTERS_DIR.glob("*.py") if p.stem != "__init__"]


def _check_no_router_import(source_file: pathlib.Path, label: str) -> None:
    """Assert that *source_file* does not import any router module."""
    imports = _get_imports(source_file)
    router_imports = [m for m in imports if m.startswith("routers.") or m == "routers"]
    assert not router_imports, (
        f"{label} ({source_file.name}) must not import from routers, "
        f"but found: {router_imports}"
    )


class TestRouterBoundaries:
    """Routers must not import from each other."""

    def test_routers_do_not_cross_import(self):
        router_files = list(ROUTERS_DIR.glob("*.py"))
        violations: list[str] = []

        for router_file in router_files:
            if router_file.stem == "__init__":
                continue
            imports = _get_imports(router_file)
            cross = [
                m for m in imports
                if (m.startswith("routers.") or m == "routers")
                and not m.endswith(router_file.stem)
            ]
            if cross:
                violations.append(f"{router_file.name} imports {cross}")

        assert not violations, "Router cross-imports found:\n" + "\n".join(violations)


class TestProviderBoundaries:
    """services/providers/* must not import from routers."""

    def test_providers_do_not_import_routers(self):
        providers_dir = BACKEND_ROOT / "services" / "providers"
        for py_file in providers_dir.glob("*.py"):
            _check_no_router_import(py_file, f"services/providers/{py_file.name}")


class TestMemoryBoundaries:
    """services/memory/* must not import from routers."""

    def test_memory_does_not_import_routers(self):
        memory_dir = BACKEND_ROOT / "services" / "memory"
        for py_file in memory_dir.glob("*.py"):
            _check_no_router_import(py_file, f"services/memory/{py_file.name}")


class TestDreamsBoundaries:
    """services/dreams/* must not import from routers."""

    def test_dreams_do_not_import_routers(self):
        dreams_dir = BACKEND_ROOT / "services" / "dreams"
        for py_file in dreams_dir.glob("*.py"):
            _check_no_router_import(py_file, f"services/dreams/{py_file.name}")


class TestChatRuntimeBoundaries:
    """services/chat_runtime/* must not import from routers."""

    def test_chat_runtime_does_not_import_routers(self):
        chat_runtime_dir = BACKEND_ROOT / "services" / "chat_runtime"
        for py_file in chat_runtime_dir.glob("*.py"):
            _check_no_router_import(py_file, f"services/chat_runtime/{py_file.name}")
