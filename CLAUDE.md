# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Purpose

This is a documentation and strategy hub for the **Frinter ecosystem** — a personal productivity platform for founders. It contains design guidelines, product specs, and growth strategy docs. The main product is `frinter.app` (React + Vite + Express + PostgreSQL + Drizzle ORM + TanStack Query + Tailwind + Shadcn UI) hosted separately.

## Key Products

- **frinter.app** — Focus OS for founders (web app, production at `https://frinter.app`)
- **FrinterFlow** — Local voice dictation CLI tool distributed via PyPI (`uvx frinterflow`)

## FrinterFlow Dev Setup

```bash
git clone https://github.com/delta240mvt/FrinterHero.git
cd FrinterHero
python -m venv .venv
.venv/Scripts/activate        # Windows
source .venv/bin/activate     # macOS/Linux
pip install -e ".[dev]"
frinterflow
```

Run tests: `pytest tests/ -v`

Code style (run before committing):
```bash
black frinterflow/
ruff check frinterflow/
```

Build `.exe` (Windows standalone):
```bash
pyinstaller --onefile --windowed --name frinter-flow \
  --hidden-import=faster_whisper --hidden-import=sounddevice \
  --hidden-import=pynput.keyboard._win32 --hidden-import=pynput.mouse._win32 \
  frinterflow/main.py
```

## Brand Identity

**3 Core Colors (semantic):**
| Color | Hex | Meaning | CLI usage |
|-------|-----|---------|-----------|
| Rozkwit (Teal) | `#4a8d83` | Growth, journaling, health | Success messages |
| Relacje (Violet) | `#8a4e64` | Relationships, social | User-related logs |
| Praca Głęboka (Gold) | `#d6b779` | Deep work, focus | Focus mode, warnings |

**Frint_bot mascot:** Pixel-art robot — teal body, violet eyes, gold antenna. Built from 12×12 pixel matrices using tkinter Canvas rectangles.

**Typography:** Poppins (headings), Roboto (body), Courier Prime (mono/logs)

**Dark mode background:** `#1e293b` (not pure black — "midnight theme")

## FrinterFlow Architecture

Push-to-talk pipeline: `pynput` hotkey (Left CTRL+SHIFT) → `sounddevice` audio capture → temp `.wav` → `faster-whisper` local transcription → tkinter floating overlay + `~/frinterflow_log.txt`

Key config in `frinterflow/config.py`: `WHISPER_MODEL_SIZE`, `WHISPER_LANGUAGE`, `WHISPER_DEVICE`, `HOTKEY_TRIGGER`, `LOG_FILE`

Zero network calls after one-time model download. Model cached at `~/.cache/huggingface/hub/`.

## GEO Strategy (docs/geo-llm-seo-analiza-frinter.md)

Frinter uses a **Reverse RAG Loop** to build AI visibility:
1. Query AI APIs weekly with niche prompts
2. Analyze where Frinter is missing from answers
3. Generate high-density knowledge articles to fill gaps
4. Publish to locations AI crawlers index (`llms.txt`, blog, GitHub, Reddit)

Priority files to create in `apps/web/public/`: `llms.txt`, `llms-full.txt`, `robots.txt` (extended for GPTBot/Claude-Web/PerplexityBot), `sitemap.xml`. Schema markup (JSON-LD `SoftwareApplication`) goes in `apps/web/index.html`.
