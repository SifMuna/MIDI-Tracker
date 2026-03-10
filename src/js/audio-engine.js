/* ─── Audio Engine (Web Audio API) ───────────────────────────────────────── */

class AudioEngine {
  constructor() {
    this.ctx        = null;
    this.masterGain = null;
    this.midiAccess = null;
    this.midiOutput = null;
    this._scheduled = [];  // { source, gainNode, stopAt }
  }

  async init() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.85;
    this.masterGain.connect(this.ctx.destination);

    // Try to get MIDI access
    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      const outputs   = [...this.midiAccess.outputs.values()];
      this.midiOutput = outputs[0] || null;
    } catch (e) {
      console.warn('MIDI not available:', e.message);
    }
    return this;
  }

  midiStatusText() {
    if (!this.midiAccess) return 'MIDI: unavailable';
    const outputs = [...this.midiAccess.outputs.values()];
    if (!outputs.length) return 'MIDI: no outputs';
    return 'MIDI: ' + outputs.map(o => o.name).join(', ');
  }

  /* ── Resume context after user gesture ── */
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  /* ── Play a single note using Web Audio synthesis ── */
  playNote(track, midiNote, startTime, duration) {
    if (!this.ctx || track.muted) return;
    const hz   = midiToHz(midiNote);
    const now  = startTime;

    // Oscillator
    const osc  = this.ctx.createOscillator();
    osc.type   = track.wave === 'custom' ? 'sawtooth' : track.wave;
    osc.frequency.value = hz;

    // Envelope
    const env  = this.ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(track.volume, now + track.attack);
    env.gain.linearRampToValueAtTime(track.volume * track.sustain, now + track.attack + track.decay);
    env.gain.setValueAtTime(track.volume * track.sustain, now + duration - track.release);
    env.gain.linearRampToValueAtTime(0, now + duration + track.release);

    // Pan
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = clamp(track.pan, -1, 1);

    osc.connect(env);
    env.connect(panner);
    panner.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + duration + track.release + 0.05);
    this._scheduled.push({ osc, stopAt: now + duration + track.release + 0.1 });

    // Also send to MIDI output if available
    if (this.midiOutput && midiNote >= 0 && midiNote <= 127) {
      const ch      = 0;
      const vel     = 100;
      const msStart = (startTime - this.ctx.currentTime) * 1000;
      const msEnd   = msStart + duration * 1000;
      this.midiOutput.send([0x90 | ch, midiNote, vel], performance.now() + Math.max(0, msStart));
      this.midiOutput.send([0x80 | ch, midiNote, 0],   performance.now() + Math.max(0, msEnd));
    }
  }

  /* ── Stop all currently playing notes ── */
  stopAll() {
    this._scheduled.forEach(({ osc }) => {
      try { osc.stop(); } catch (_) {}
      try { osc.disconnect(); } catch (_) {}
    });
    this._scheduled = [];

    if (this.midiOutput) {
      // All notes off on all channels
      for (let ch = 0; ch < 16; ch++) {
        this.midiOutput.send([0xB0 | ch, 123, 0]);
      }
    }
  }

  get currentTime() { return this.ctx ? this.ctx.currentTime : 0; }
}

/* ─── Sequencer ───────────────────────────────────────────────────────────── */

class Sequencer {
  constructor(model, engine) {
    this.model    = model;
    this.engine   = engine;
    this.playing  = false;
    this.row      = 0;
    this.arrIdx   = 0;   // index into arrangement
    this._timer   = null;
    this._startAt = 0;
    this._nextRow = 0;
    this._lookAhead = 0.1;  // seconds ahead to schedule
    this._schedInterval = 25; // ms polling interval

    this.onRowChange = null; // callback(row, patternIdx)
  }

  get bpm()          { return this.model.bpm; }
  get secPerRow()    { return 60 / this.bpm / 4; }  // 1/16th note per row
  get currentPat()   { return this.model.patterns[this.model.currentPattern]; }

  start() {
    if (this.playing) return;
    this.engine.resume();
    this.playing  = true;
    this.row      = 0;
    this._startAt = this.engine.currentTime + 0.05;
    this._nextRow = this._startAt;
    this._schedule();
  }

  stop() {
    this.playing = false;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    this.engine.stopAll();
    this.row = 0;
    if (this.onRowChange) this.onRowChange(0, this.model.currentPattern);
  }

  _schedule() {
    if (!this.playing) return;
    const deadline = this.engine.currentTime + this._lookAhead;

    while (this._nextRow < deadline) {
      this._fireRow(this._nextRow);
      this._nextRow += this.secPerRow;
    }
    this._timer = setTimeout(() => this._schedule(), this._schedInterval);
  }

  _fireRow(startTime) {
    const patIdx = this.model.currentPattern;
    const pat    = this.model.patterns[patIdx];
    if (!pat) return;

    const rowIdx = this.row;
    const tracks = this.model.tracks;

    // Check for any soloed tracks
    const hasSolo = tracks.some(t => t.soloed);

    pat.rows[rowIdx].forEach((cell, tIdx) => {
      const track = tracks[tIdx];
      if (!track) return;
      if (track.muted) return;
      if (hasSolo && !track.soloed) return;
      if (cell.note == null) return;

      const vel = (cell.velocity || 100) / 127;
      const dur = this.secPerRow * 3.5;  // hold ~3.5 rows
      this.engine.playNote({ ...track, volume: track.volume * vel }, cell.note, startTime, dur);
    });

    // Notify UI on next animation frame approximation
    const capturedRow = rowIdx;
    const delay = Math.max(0, (startTime - this.engine.currentTime) * 1000 - 10);
    setTimeout(() => {
      if (this.playing && this.onRowChange) this.onRowChange(capturedRow, patIdx);
    }, delay);

    // Advance row
    this.row = (rowIdx + 1) % pat.length;
  }
}
