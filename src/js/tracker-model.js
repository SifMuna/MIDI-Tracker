/* ─── Tracker Data Model ──────────────────────────────────────────────────── */

/**
 * A single cell in the pattern grid.
 * note:     MIDI note number (0-127) or null
 * velocity: 1-127 or null
 * fx:       effect command string or null (e.g. "V50" = volume 50%)
 */
function makeCell() {
  return { note: null, velocity: 100, fx: null };
}

/**
 * An instrument track definition.
 */
function makeTrack(idx) {
  return {
    id:      idx,
    name:    'Track ' + (idx + 1),
    color:   trackColor(idx),
    wave:    'sawtooth',
    attack:  0.01,
    decay:   0.1,
    sustain: 0.7,
    release: 0.3,
    volume:  0.8,
    pan:     0,
    muted:   false,
    soloed:  false,
  };
}

/**
 * A pattern: rows × tracks grid of cells.
 */
function makePattern(length, numTracks, name) {
  const rows = [];
  for (let r = 0; r < length; r++) {
    const row = [];
    for (let t = 0; t < numTracks; t++) row.push(makeCell());
    rows.push(row);
  }
  return { name: name || 'Pattern 1', length, rows };
}

/**
 * Master song model.
 */
class TrackerModel {
  constructor() {
    this.bpm           = 120;
    this.tracks        = [];
    this.patterns      = [];
    this.arrangement   = [];   // array of pattern indices to play in order
    this.currentPattern = 0;

    // Bootstrap defaults
    for (let i = 0; i < 4; i++) this.tracks.push(makeTrack(i));
    this.patterns.push(makePattern(32, 4, 'Pattern 1'));
    this.arrangement = [0];
  }

  /* ── Pattern helpers ── */
  addPattern() {
    const p = makePattern(32, this.tracks.length, 'Pattern ' + (this.patterns.length + 1));
    this.patterns.push(p);
    return this.patterns.length - 1;
  }

  clonePattern(idx) {
    const src = this.patterns[idx];
    const p   = deepClone(src);
    p.name = src.name + ' (copy)';
    this.patterns.push(p);
    return this.patterns.length - 1;
  }

  deletePattern(idx) {
    if (this.patterns.length === 1) return false;
    this.patterns.splice(idx, 1);
    this.arrangement = this.arrangement
      .map(i => i === idx ? -1 : i > idx ? i - 1 : i)
      .filter(i => i >= 0);
    if (!this.arrangement.length) this.arrangement = [0];
    this.currentPattern = Math.min(this.currentPattern, this.patterns.length - 1);
    return true;
  }

  setPatternLength(idx, len) {
    const p = this.patterns[idx];
    if (len > p.length) {
      for (let r = p.length; r < len; r++) {
        const row = [];
        for (let t = 0; t < this.tracks.length; t++) row.push(makeCell());
        p.rows.push(row);
      }
    } else {
      p.rows.length = len;
    }
    p.length = len;
  }

  /* ── Track helpers ── */
  addTrack() {
    const t = makeTrack(this.tracks.length);
    this.tracks.push(t);
    // add column to all patterns
    this.patterns.forEach(p => {
      p.rows.forEach(row => row.push(makeCell()));
    });
    return this.tracks.length - 1;
  }

  /* ── Cell access ── */
  getCell(patIdx, row, track) {
    return this.patterns[patIdx].rows[row][track];
  }

  setCell(patIdx, row, track, data) {
    Object.assign(this.patterns[patIdx].rows[row][track], data);
  }

  clearCell(patIdx, row, track) {
    this.patterns[patIdx].rows[row][track] = makeCell();
  }

  /* ── Serialization ── */
  toJSON() {
    return JSON.stringify({
      bpm: this.bpm, tracks: this.tracks,
      patterns: this.patterns, arrangement: this.arrangement,
      currentPattern: this.currentPattern,
    }, null, 2);
  }

  fromJSON(str) {
    const d = JSON.parse(str);
    Object.assign(this, d);
  }
}
