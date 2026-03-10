/* ─── Musical Utilities ───────────────────────────────────────────────────── */

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

/**
 * Convert MIDI note number to name+octave string (e.g. 60 → "C4").
 */
function midiToName(midi) {
  if (midi == null || midi < 0) return '---';
  const oct = Math.floor(midi / 12) - 1;
  return NOTE_NAMES[midi % 12] + oct;
}

/**
 * Convert note name string to MIDI number (e.g. "C4" → 60).
 * Returns null if invalid.
 */
function nameToMidi(str) {
  if (!str || str === '---') return null;
  const m = str.match(/^([A-Ga-g][#b]?)(-?\d+)$/);
  if (!m) return null;
  let name = m[1].toUpperCase();
  const oct = parseInt(m[2], 10);
  let idx = NOTE_NAMES.indexOf(name);
  if (idx < 0) {
    // handle flats
    const flatMap = {DB:'C#', EB:'D#', FB:'E', GB:'F#', AB:'G#', BB:'A#', CB:'B'};
    name = flatMap[name.replace('B','b').toUpperCase()];
    idx  = NOTE_NAMES.indexOf(name);
  }
  if (idx < 0) return null;
  return (oct + 1) * 12 + idx;
}

/**
 * Convert MIDI note number to Hz frequency.
 */
function midiToHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Format a velocity (0-127) to a compact 2-digit hex string.
 */
function velToHex(v) {
  return v.toString(16).toUpperCase().padStart(2, '0');
}

/**
 * Deep clone a plain object/array.
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Generate a pleasant track color from an index.
 */
const TRACK_COLORS = [
  '#e94560','#533483','#4fc3f7','#66bb6a','#ffa726',
  '#ab47bc','#26c6da','#d4e157','#ff7043','#8d6e63',
];
function trackColor(idx) {
  return TRACK_COLORS[idx % TRACK_COLORS.length];
}

/**
 * Clamp value between lo and hi.
 */
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/**
 * Generate a random integer in [lo, hi].
 */
function randInt(lo, hi) { return Math.floor(Math.random() * (hi - lo + 1)) + lo; }

/**
 * Note name keyboard input parser.
 * Accepts keys: a-g (notes), # (sharp), 0-9 (octave), Delete/Backspace (clear).
 * Returns { note, done } or null.
 */
class NoteInputBuffer {
  constructor() { this.buf = ''; }
  push(key) {
    const k = key.toLowerCase();
    if (['a','b','c','d','e','f','g'].includes(k)) {
      this.buf = k.toUpperCase();
      return null;
    }
    if (k === '#' && this.buf.length === 1) { this.buf += '#'; return null; }
    if (k === 'b' && this.buf.length === 1) { this.buf += 'b'; return null; }
    if (/^\d$/.test(k) && this.buf.length >= 1) {
      const note = this.buf + k;
      const midi = nameToMidi(note);
      this.buf = '';
      if (midi != null) return { note, midi, done: true };
      return null;
    }
    return null;
  }
  clear() { this.buf = ''; }
}
