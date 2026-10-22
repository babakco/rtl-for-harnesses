# RTL for AI Harnesses

Persian/Arabic RTL patches, the Vazirmatn font, and build/verify/restore tooling
for macOS AI coding harnesses — in one reproducible, safety-first repository.

This repository consolidates 15 independent projects under one structure
without rewriting any tested RTL logic. Each harness stays self-contained, and a
dependency-free CLI orchestrates builds and verification.

> **Developer:** [Mehdi Ravanbakhsh](AUTHORS.md)

## Publication status

This repository is public: anyone may clone or fork it and use the patches.
Write access is limited to the owner; external users cannot commit or push to
this repository. The owner performs updates.

Repository: <https://github.com/babakco/rtl-for-harnesses>

## Harnesses

| Harness | slug | Source app | RTL output | Method | Profile |
|---|---|---|---|---|---|
| [DeepSeek Harness](harnesses/deepseek-harness/README.md) | `deepseek-harness` | `/Applications/DeepSeek Harness.app` | `/Applications/DeepSeek Harness-RTL.app` | `electron-asar` | shared |
| [MiniMax Code](harnesses/minimax-code/README.md) | `minimax-code` | `/Applications/MiniMax Code.app` | `/Applications/MiniMax Code-RTL.app` | `electron-asar-preload` | separate |
| [OpenCode](harnesses/opencode/README.md) | `opencode` | `/Applications/OpenCode.app` | `/Applications/OpenCode-RTL.app` | `electron-asar` | shared |
| [WorkBuddy AI](harnesses/workbuddy-ai/README.md) | `workbuddy-ai` | `/Applications/WorkBuddy AI.app` | `/Applications/WorkBuddy AI RTL.app` | `electron-asar-surgical` | shared |
| [ZCode](harnesses/zcode/README.md) | `zcode` | `/Applications/ZCode.app` | `/Applications/ZCode-RTL.app` | `electron-asar` | shared |
| [Freebuff](harnesses/freebuff/README.md) | `freebuff` | `/Applications/Freebuff.app` | `/Applications/Freebuff-RTL.app` | `electron-asar` | shared |
| [Codex (ChatGPT desktop)](harnesses/codex/README.md) | `codex` | `/Applications/ChatGPT.app` | `$HOME/Applications/ChatGPT-RTL.app` | `electron-asar-framework` | shared |
| [Kimi](harnesses/kimi/README.md) | `kimi` | `/Applications/Kimi.app` | `/Applications/Kimi RTL.app` | `electron-asar-preload` | shared |
| [Zed](harnesses/zed/README.md) | `zed` | `/Applications/Zed.app` | `/Applications/Zed-RTL.app` | `native-source-rust` | shared |
| [Google Antigravity](harnesses/antigravity/README.md) | `antigravity` | `/Applications/Antigravity.app` | `/Applications/Antigravity RTL.app` | `electron-asar-preload` | shared |
| [Qoder](harnesses/qoder/README.md) | `qoder` | `/Applications/Qoder.app` | `/Applications/Qoder-RTL.app` | `electron-asar-surgical` | shared |
| [Cline](harnesses/cline/README.md) | `cline` | `/Applications/Cline.app` | `$HOME/Applications/Cline RTL.app` | `tauri-source` | separate |
| [Xiaomi MiMo AI](harnesses/xiaomi-mimo/README.md) | `xiaomi-mimo` | `/Applications/Xiaomi MiMo AI.app` | `/Applications/Xiaomi MiMo AI-RTL.app` | `electron-asar` | shared |
| [GitHub Copilot](harnesses/github-copilot/README.md) | `github-copilot` | `/Applications/GitHub Copilot.app` | `/Applications/GitHub Copilot.app` | `webkit-dylib` | shared |
| [Claude Desktop](harnesses/claude-desktop/README.md) | `claude-desktop` | `/Applications/Claude.app` | `$HOME/Applications/Claude-RTL.app` | `electron-asar` | shared |
| [Cursor](harnesses/cursor/README.md) | `cursor` | `/Applications/Cursor.app` | `/Applications/Cursor-RTL.app` | `electron-unpacked` | shared |

Documented versions and the last verification are recorded in `manifest.json`
and each harness README. Your installed version may be newer; run
`./rtl-harness detect` to see the difference.

## Requirements

- macOS (GitHub Copilot's bundled dylib is arm64; rebuild it on Intel).
- Node.js 18+ for the CLI.
- Source builds: Xcode Command Line Tools, Rust/Cargo (Zed), Bun and network
  (Cline).
- Some patches need `python3`, `npx`, `codesign`, or `plutil`.

```bash
./rtl-harness doctor
```

## Quick start

```bash
git clone https://github.com/babakco/rtl-for-harnesses.git
cd rtl-for-harnesses
./rtl-harness doctor
./rtl-harness detect
./rtl-harness list
```

Build a copy-mode harness:

```bash
./rtl-harness build zcode --yes
./rtl-harness verify zcode
open "/Applications/ZCode-RTL.app"
```

Preview without executing:

```bash
./rtl-harness build zcode --dry-run
```

In-place build (GitHub Copilot only, explicit consent):

```bash
./rtl-harness build github-copilot --yes --allow-in-place
```

## Agent mode

Read [`AGENTS.md`](AGENTS.md) first. Then use
[`docs/agent-playbook.md`](docs/agent-playbook.md) and the harness README.
Never run an in-place patch without explicit user consent. Never run OpenCode
without `--rtl-app`.

## Safety

Copy mode is the default. GitHub Copilot is the only in-place harness; it
creates a backup at `$HOME/CopilotRTLBackup/GitHub Copilot.app` and can be
restored with `uninstall.sh`. Zed must be built from Rust source; the installed
bundle clone is only a font/identity fallback. Shared-profile harnesses must
not run at the same time as their originals. Rebuild after every upstream app
update.

See [`docs/safety.md`](docs/safety.md).

## Repository layout

```text
rtl-harness              # CLI
manifest.json            # 15-harness registry
harnesses/<slug>/        # code, payload, fonts, tests, README
docs/                    # architecture, safety, privacy, troubleshooting
scripts/check-repo.mjs   # privacy and integrity checker
```

## Documentation

- [`README.md`](README.md) — Persian primary documentation
- [`docs/support-matrix.md`](docs/support-matrix.md)
- [`docs/architecture.md`](docs/architecture.md)
- [`docs/agent-playbook.md`](docs/agent-playbook.md)
- [`docs/safety.md`](docs/safety.md)
- [`docs/troubleshooting.md`](docs/troubleshooting.md)
- [`docs/updating.md`](docs/updating.md)
- [`docs/privacy.md`](docs/privacy.md)

## License and credits

MIT, copyright **Mehdi Ravanbakhsh**. Vazirmatn is SIL OFL 1.1. The upstream
Claude Desktop attribution is preserved in [`NOTICE.md`](NOTICE.md). This
project is unofficial and not affiliated with any vendor.

---

Developed by **Mehdi Ravanbakhsh** — [AUTHORS.md](AUTHORS.md)
