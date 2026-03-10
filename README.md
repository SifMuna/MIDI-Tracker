# MIDI Tracker

A browser-based music tracker inspired by classic tracker software (FastTracker, MilkyTracker), built with vanilla HTML/CSS/JavaScript using the Web Audio API and Web MIDI API.

## Features

- **Pattern-based sequencer** — compose music in 16-step patterns with up to 128 rows
- **Multi-track editing** — add as many synthesizer tracks as you need
- **Per-track synthesis** — sine, square, sawtooth, and triangle oscillators with full ADSR envelopes, volume, and stereo panning
- **Piano Roll editor** — click-to-draw notes with adjustable velocity and duration; right-click to erase
- **Keyboard note input** — type note names directly into the grid (e.g. `C4`, `G#3`) with arrow-key navigation
- **Playback engine** — accurate lookahead scheduler for glitch-free playback
- **Web MIDI output** — automatically routes notes to any connected MIDI device
- **Song arrangement** — chain patterns into a full arrangement
- **MIDI export** — export any pattern as a standard `.mid` file
- **Auto-save** — song state persists in `localStorage` and restores on reload
- **Demo song** — a pre-loaded 128 BPM electronic demo to get started

## Usage

Open `index.html` in a modern browser (Chrome/Edge recommended for MIDI support). No build step or server required.

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Stop |
| `Arrow keys` | Navigate grid |
| `A–G` then `#`/`b` then `0–9` | Enter a note (e.g. `C`, `#`, `4` → C#4) |
| `Delete` / `Backspace` | Clear cell |
| `Enter` | Open Piano Roll for current track |

### Mouse

- **Single click** on a cell to select it
- **Double-click** on a cell to open Piano Roll
- **Click** a track header to open Piano Roll for the full track
- In the Piano Roll: **left-click drag** to draw/extend notes, **right-click** to erase

## Project Structure

```
MIDI-Tracker/
├── index.html
└── src/
    ├── styles/
    │   └── main.css
    └── js/
        ├── utils.js          # Music math helpers, note name conversion
        ├── tracker-model.js  # Song data model (tracks, patterns, cells)
        ├── audio-engine.js   # Web Audio synthesis + sequencer scheduling
        ├── piano-roll.js     # Canvas-based piano roll editor
        ├── midi-export.js    # Standard MIDI file writer
        ├── ui.js             # DOM rendering and event handling
        └── app.js            # Entry point + demo song loader
```
