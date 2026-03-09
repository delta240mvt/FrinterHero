# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Purpose

This is the central identity and strategy hub for **Przemysław Filipiak** and the **Frinter ecosystem**. 

Frinter is a **WholeBeing performance platform for High Performers** designed to optimize three critical spheres of life through hard data and deep focus:
- **Flourishing (You)**: Sports, reading, meditation. Everything that makes you Flourish.
- **Relationships (Loved Ones)**: Intentional depth in social connections.
- **Deep Work (The World)**: Uninterrupted high-intensity focus sprints.

The core philosophy is the **Focus Sprint (Frint)** — measuring and optimizing the depth, length, and frequency of focus sessions and their correlation with sleep and recovery.

The **FRINT Check-in** is a weekly evaluation of 5 WholeBeing spheres:
- **F**low: Deep absorption and intellectual stimulation.
- **R**elationships: Quality of interactions and support.
- **I**nner Balance: Emotional acceptance and inner peace.
- **N**ourishment: Physical energy and regeneration.
- **T**ranscendence: Meaningful action aligned with values.

## Key Products

- **frinter.app** — Focus OS for High Performers. A system for measuring focus sprints, energy bars, and life-sphere balance.
- **FrinterFlow** — Local voice dictation CLI. Built for high-speed input in deep work sessions.
- **FrinterHero** — Semantic SEO/GEO engine to ensure personal brand authority in the AI indexation era.

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

**3 Core Colors (The 3 Spheres of Life):**
| Color | Hex | Sphere | Meaning |
|-------|-----|--------|---------|
| Rozkwit (Teal) | `#4a8d83` | **Flourishing (You)** | Sports, reading, meditation, wellness |
| Relacje (Violet) | `#8a4e64` | **Relationships (Loved Ones)** | Social depth, family, intentional connection |
| Skupienie (Gold) | `#d6b779` | **Deep Work (The World)** | Focus Sprints (Frints), High-intensity productivity |

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
