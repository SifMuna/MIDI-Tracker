/* ─── Piano Roll Editor ───────────────────────────────────────────────────── */

class PianoRoll {
  constructor(canvasEl) {
    this.canvas  = canvasEl;
    this.ctx     = canvasEl.getContext('2d');
    this.notes   = [];   // { midi, step, duration, velocity }
    this.steps   = 32;   // total horizontal steps
    this.cellW   = 28;   // px per step
    this.keyH    = 14;   // px per semitone
    this.keysW   = 40;   // piano keyboard width
    this.minMidi = 21;   // A0
    this.maxMidi = 108;  // C8
    this.pianoH  = (this.maxMidi - this.minMidi + 1) * this.keyH;
    this.defaultDuration  = 1;
    this.defaultVelocity  = 100;
    this._drag   = null; // current drag state
    this._dirty  = true;
    this._onChanged = null;

    this._bindEvents();
  }

  get totalH() { return this.pianoH; }
  get totalW() { return this.keysW + this.steps * this.cellW; }

  resize() {
    this.canvas.width  = this.totalW;
    this.canvas.height = this.totalH;
    this._dirty = true;
    this.draw();
  }

  /* ── Set notes from cell data ── */
  loadFromCells(cells) {
    this.notes = [];
    cells.forEach((cell, step) => {
      if (cell.note != null) {
        this.notes.push({
          midi:     cell.note,
          step:     step,
          duration: parseFloat(cell.fx) || this.defaultDuration,
          velocity: cell.velocity || 100,
        });
      }
    });
    this._dirty = true;
    this.draw();
  }

  /* ── Export notes back to cells array ── */
  exportCells(numSteps) {
    const cells = [];
    for (let i = 0; i < numSteps; i++) {
      cells.push({ note: null, velocity: 100, fx: null });
    }
    this.notes.forEach(n => {
      if (n.step < numSteps) {
        cells[n.step] = { note: n.midi, velocity: n.velocity, fx: String(n.duration) };
      }
    });
    return cells;
  }

  /* ── Drawing ── */
  draw() {
    const ctx  = this.ctx;
    const W    = this.canvas.width;
    const H    = this.canvas.height;
    const kW   = this.keysW;
    const cW   = this.cellW;
    const kH   = this.keyH;
    const low  = this.minMidi;
    const high = this.maxMidi;
    const rows = high - low + 1;

    ctx.clearRect(0, 0, W, H);

    // ── Grid background ──
    for (let m = low; m <= high; m++) {
      const y    = (high - m) * kH;
      const name = NOTE_NAMES[m % 12];
      const isBlack = name.includes('#');
      ctx.fillStyle = isBlack ? '#1a1a2a' : '#22223a';
      ctx.fillRect(kW, y, W - kW, kH);

      // Horizontal line
      ctx.strokeStyle = '#2a2a4a';
      ctx.lineWidth = (m % 12 === 0) ? 1.5 : 0.5;
      ctx.beginPath(); ctx.moveTo(kW, y + kH); ctx.lineTo(W, y + kH); ctx.stroke();
    }

    // ── Vertical grid lines (steps) ──
    for (let s = 0; s <= this.steps; s++) {
      const x = kW + s * cW;
      ctx.strokeStyle = (s % 16 === 0) ? '#e94560' : (s % 4 === 0) ? '#3a3a6a' : '#25253a';
      ctx.lineWidth = (s % 16 === 0) ? 1.5 : 0.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();

      // Step label every 4
      if (s % 4 === 0) {
        ctx.fillStyle = '#555';
        ctx.font = '9px monospace';
        ctx.fillText(s + 1, x + 2, 9);
      }
    }

    // ── Piano keys ──
    for (let m = low; m <= high; m++) {
      const y    = (high - m) * kH;
      const name = NOTE_NAMES[m % 12];
      const isBlack = name.includes('#');
      ctx.fillStyle = isBlack ? '#333' : '#ddd';
      ctx.fillRect(0, y, isBlack ? kW * 0.6 : kW - 1, kH - 1);

      if (!isBlack) {
        ctx.fillStyle = '#666';
        ctx.font = '8px monospace';
        ctx.fillText(name + (Math.floor(m / 12) - 1), 2, y + kH - 3);
      }

      // C markers
      if (m % 12 === 0) {
        ctx.fillStyle = '#e94560';
        ctx.fillRect(kW - 3, y, 3, kH - 1);
      }
    }

    // ── Notes ──
    this.notes.forEach(n => {
      const y   = (high - n.midi) * kH;
      const x   = kW + n.step * cW;
      const nW  = Math.max(cW * n.duration - 2, 4);
      const vel = clamp(n.velocity / 127, 0.3, 1);
      const col = `hsl(265, 60%, ${Math.round(20 + vel * 40)}%)`;
      ctx.fillStyle = col;
      ctx.fillRect(x + 1, y + 1, nW, kH - 2);

      ctx.fillStyle = '#fff';
      ctx.font      = '8px monospace';
      if (nW > 20) ctx.fillText(midiToName(n.midi), x + 3, y + kH - 3);
    });

    this._dirty = false;
  }

  /* ── Event handling ── */
  _bindEvents() {
    this.canvas.addEventListener('mousedown', e => this._onMouseDown(e));
    this.canvas.addEventListener('mousemove', e => this._onMouseMove(e));
    this.canvas.addEventListener('mouseup',   e => this._onMouseUp(e));
    this.canvas.addEventListener('contextmenu', e => { e.preventDefault(); this._onRightClick(e); });
  }

  _getCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x    = e.clientX - rect.left;
    const y    = e.clientY - rect.top;
    const step = Math.floor((x - this.keysW) / this.cellW);
    const midi = this.maxMidi - Math.floor(y / this.keyH);
    return { x, y, step, midi };
  }

  _noteAt(step, midi) {
    return this.notes.find(n => n.midi === midi && n.step === step);
  }

  _onMouseDown(e) {
    e.preventDefault();
    const { step, midi } = this._getCoords(e);
    if (step < 0 || step >= this.steps) return;
    if (midi < this.minMidi || midi > this.maxMidi) return;

    const existing = this._noteAt(step, midi);
    if (existing) {
      this._drag = { mode: 'remove', note: existing };
    } else {
      const n = { midi, step, duration: this.defaultDuration, velocity: this.defaultVelocity };
      this.notes.push(n);
      this._drag = { mode: 'add', note: n };
    }
    this._dirty = true;
    this.draw();
    if (this._onChanged) this._onChanged();
  }

  _onMouseMove(e) {
    if (!this._drag || this._drag.mode !== 'add') return;
    const { step } = this._getCoords(e);
    const endStep  = Math.max(step, this._drag.note.step);
    this._drag.note.duration = endStep - this._drag.note.step + 1;
    this._dirty = true;
    this.draw();
  }

  _onMouseUp(e) {
    if (this._drag?.mode === 'remove') {
      const idx = this.notes.indexOf(this._drag.note);
      if (idx >= 0) this.notes.splice(idx, 1);
      this._dirty = true;
      this.draw();
      if (this._onChanged) this._onChanged();
    }
    this._drag = null;
  }

  _onRightClick(e) {
    const { step, midi } = this._getCoords(e);
    const n = this._noteAt(step, midi);
    if (n) {
      this.notes.splice(this.notes.indexOf(n), 1);
      this._dirty = true;
      this.draw();
      if (this._onChanged) this._onChanged();
    }
  }

  clear() {
    this.notes = [];
    this._dirty = true;
    this.draw();
    if (this._onChanged) this._onChanged();
  }
}
