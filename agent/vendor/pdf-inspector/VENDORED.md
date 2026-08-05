# pdf-inspector — vendored upstream copy

This directory is a **tracked vendor copy** of the upstream
[firecrawl/pdf-inspector](https://github.com/firecrawl/pdf-inspector) repository
at tag `v0.2.6` (MIT). It is committed as plain source — **not** a git submodule —
so ABSO can track and push it to `origin main`.

## Runtime wiring choice

- **Runtime dependency:** `pdf-inspector` is installed from the **PyPI wheel**
  (added to `agent/requirements.txt`). Prebuilt wheels cover CPython >=3.8 on
  Linux (x86_64/aarch64), macOS, and Windows, so the `python:3.11-slim` Docker
  image installs it with no Rust toolchain required.
- The vendored source here is the **tracked upstream reference** for license,
  version pinning, and future audits. It is not built by ABSO.

If a future environment ever needs to build from this vendored source instead
(e.g. no PyPI wheel for a platform), install a Rust toolchain and run
`pip install maturin && maturin develop --release` from this directory, and add
the equivalent build steps to `agent/Dockerfile`.

## Refresh procedure

To update the vendor copy:

```bash
git clone https://github.com/firecrawl/pdf-inspector.git /tmp/pdf-inspector
cd /tmp/pdf-inspector && git checkout v<new-version>
rm -rf /tmp/pdf-inspector/.git /tmp/pdf-inspector/.github
cp -r /tmp/pdf-inspector/. agent/vendor/pdf-inspector/
# then prune as documented below and bump the version in agent/requirements.txt
```

## What was stripped (keeps the repo lean)

- `.git/` and `.github/` (nested git-related dirs — required by ABSO policy)
- `tests/fixtures/` and `tests/snapshots/` (large binary PDF fixtures; the
  vendored `tests/` dir was removed because its tests reference those fixtures)
- `napi/`, `wasm/`, `site/`, `scripts/` (non-Python bindings/tooling)

Everything needed to build and inspect the Python binding is kept: `src/`,
`external/` (runtime CMap data), `Cargo.toml`, `pyproject.toml`,
`pdf_inspector.pyi`, `docs/`, `LICENSE`, `SECURITY.md`, and the upstream
`README.md`/`AGENTS.md`/`CLAUDE.md`.

## Attribution

Upstream: https://github.com/firecrawl/pdf-inspector — MIT License (see `LICENSE`).
Built by Firecrawl.
