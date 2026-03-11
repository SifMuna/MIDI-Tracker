/* ─── UI Renderer ─────────────────────────────────────────────────────────── */

class TrackerUI {
  constructor(model, sequencer, engine, pianoRoll) {
    this.model      = model;
    this.seq        = sequencer;
    this.engine     = engine;
    this.pianoRoll  = pianoRoll;
    this.selTrack   = 0;
    this.selRow     = 0;
    this.noteInput  = new NoteInputBuffer();
    this._activeRow = -1;
    this._prTarget  = null; // { patIdx, trackIdx }
    this._history   = [];   // undo stack (max 50)
  }

  /* ── Bootstrap ── */
  init() {
    this._buildPatternSelect();
    this._buildTrackList();
    this._buildPatternGrid();
    this._buildArrangement();
    this._loadTrackProps();
    this._bindToolbar();
    this._bindKeyboard();
    this._bindInstProps();
    this._bindPianoRoll();
    this._updateMidiStatus();

    this.seq.onRowChange = (row, patIdx) => this._onPlayheadRow(row, patIdx);
    this.seq.onStop      = () => this._onSeqStop();
  }

  /* ── Pattern select dropdown ── */
  _buildPatternSelect() {
    const sel = document.getElementById('pattern-select');
    sel.innerHTML = '';
    this.model.patterns.forEach((p, i) => {
      const opt   = document.createElement('option');
      opt.value   = i;
      opt.text    = p.name;
      if (i === this.model.currentPattern) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.onchange = () => {
      this.model.currentPattern = parseInt(sel.value, 10);
      this._buildPatternGrid();
      document.getElementById('pattern-length').value = this.model.patterns[this.model.currentPattern].length;
    };
    document.getElementById('pattern-length').value = this.model.patterns[this.model.currentPattern].length;
  }

  /* ── Track list sidebar ── */
  _buildTrackList() {
    const ul = document.getElementById('track-list');
    ul.innerHTML = '';
    this.model.tracks.forEach((track, i) => {
      const li  = document.createElement('li');
      li.dataset.idx = i;
      if (i === this.selTrack) li.classList.add('selected');
      if (track.muted)         li.classList.add('muted');

      const dot  = document.createElement('span');
      dot.className   = 'track-color-dot';
      dot.style.background = track.color;

      const name = document.createElement('span');
      name.className  = 'track-name';
      name.textContent = track.name;

      li.appendChild(dot);
      li.appendChild(name);
      li.addEventListener('click', () => { this.selTrack = i; this._buildTrackList(); this._loadTrackProps(); this._highlightSelectedTrack(); });
      ul.appendChild(li);
    });
  }

  _highlightSelectedTrack() {
    document.querySelectorAll('#track-list li').forEach((li, i) => {
      li.classList.toggle('selected', i === this.selTrack);
    });
    document.querySelectorAll('.track-column').forEach((col, i) => {
      col.querySelectorAll('.track-header').forEach(h => {
        h.style.outline = (i === this.selTrack) ? '2px solid var(--accent)' : 'none';
      });
    });
  }

  /* ── Pattern grid ── */
  _buildPatternGrid() {
    const patIdx = this.model.currentPattern;
    const pat    = this.model.patterns[patIdx];
    const editor = document.getElementById('pattern-editor');
    const rowNums = document.getElementById('row-numbers');
    editor.innerHTML  = '';
    rowNums.innerHTML = '';

    // Build row numbers
    for (let r = 0; r < pat.length; r++) {
      const div = document.createElement('div');
      div.className = 'row-num' + (r % 16 === 0 ? ' bar' : r % 4 === 0 ? ' beat' : '');
      div.textContent = r.toString(16).toUpperCase().padStart(2, '0');
      div.dataset.row = r;
      rowNums.appendChild(div);
    }

    // Build columns
    this.model.tracks.forEach((track, tIdx) => {
      const col = document.createElement('div');
      col.className = 'track-column';
      col.dataset.track = tIdx;

      // Header
      const hdr = document.createElement('div');
      hdr.className   = 'track-header';
      hdr.style.borderBottom = '2px solid ' + track.color;
      hdr.innerHTML   = `<span style="color:${track.color}">▮</span><span>${track.name}</span>`;
      hdr.title = 'Click to open Piano Roll for this track';
      hdr.addEventListener('click', () => { this.selTrack = tIdx; this._openPianoRoll(patIdx, tIdx); });
      col.appendChild(hdr);

      // Cells
      for (let r = 0; r < pat.length; r++) {
        const cell = pat.rows[r][tIdx];
        const div  = document.createElement('div');
        div.className   = 'cell' + (cell.note != null ? ' has-note' : '');
        div.dataset.row   = r;
        div.dataset.track = tIdx;

        const noteSpan = document.createElement('span');
        noteSpan.className   = 'note-label';
        noteSpan.textContent = cell.note != null ? midiToName(cell.note) : '···';

        const velSpan  = document.createElement('span');
        velSpan.className  = 'vel-label';
        velSpan.textContent = cell.note != null ? velToHex(cell.velocity) : '';

        const fxSpan   = document.createElement('span');
        fxSpan.className   = 'fx-label';
        fxSpan.textContent  = cell.fx || '';

        div.appendChild(noteSpan);
        div.appendChild(velSpan);
        div.appendChild(fxSpan);

        div.addEventListener('click', e => {
          e.stopPropagation();
          this.selRow   = r;
          this.selTrack = tIdx;
          this._selectCell(r, tIdx);
        });
        div.addEventListener('dblclick', e => {
          e.stopPropagation();
          this._openPianoRoll(patIdx, tIdx);
        });

        col.appendChild(div);
      }
      editor.appendChild(col);
    });

    this._highlightSelectedTrack();
    this._selectCell(this.selRow, this.selTrack);
  }

  _refreshCell(patIdx, row, trackIdx) {
    const cell  = this.model.getCell(patIdx, row, trackIdx);
    const cols  = document.querySelectorAll('.track-column');
    const col   = cols[trackIdx];
    if (!col) return;
    const divs  = col.querySelectorAll('.cell');
    const div   = divs[row];
    if (!div) return;

    div.classList.toggle('has-note', cell.note != null);
    div.querySelector('.note-label').textContent = cell.note != null ? midiToName(cell.note) : '···';
    div.querySelector('.vel-label').textContent  = cell.note != null ? velToHex(cell.velocity) : '';
    div.querySelector('.fx-label').textContent   = cell.fx || '';
  }

  _selectCell(row, track) {
    document.querySelectorAll('.cell.selected').forEach(el => el.classList.remove('selected'));
    const cols = document.querySelectorAll('.track-column');
    const col  = cols[track];
    if (!col) return;
    const cells = col.querySelectorAll('.cell');
    const cell  = cells[row];
    if (cell) { cell.classList.add('selected'); cell.scrollIntoView({ block: 'nearest' }); }
  }

  _onPlayheadRow(row, patIdx) {
    // Clear previous active row
    document.querySelectorAll('.cell.active-row, .row-num.active-row').forEach(el => el.classList.remove('active-row'));
    // Set new active row
    document.querySelectorAll(`.cell[data-row="${row}"]`).forEach(el => el.classList.add('active-row'));
    document.querySelectorAll(`.row-num[data-row="${row}"]`).forEach(el => el.classList.add('active-row'));
    // Update status
    document.getElementById('playhead-pos').textContent = 'Row: ' + row.toString(16).toUpperCase().padStart(2,'0');
  }

  /* ── Arrangement panel ── */
  _buildArrangement() {
    const list = document.getElementById('arrangement-list');
    list.innerHTML = '';
    this.model.arrangement.forEach((patIdx, arrPos) => {
      const item = document.createElement('div');
      item.className = 'arrangement-item';
      item.innerHTML = `
        <span class="arr-idx">${arrPos + 1}.</span>
        <span class="arr-name">${this.model.patterns[patIdx]?.name || '?'}</span>
        <button class="arr-del" data-pos="${arrPos}" title="Remove">&#x2715;</button>`;
      item.addEventListener('click', e => {
        if (e.target.classList.contains('arr-del')) {
          this.model.arrangement.splice(arrPos, 1);
          this._buildArrangement();
        } else {
          this.model.currentPattern = patIdx;
          this._buildPatternSelect();
          this._buildPatternGrid();
        }
      });
      list.appendChild(item);
    });
  }

  /* ── Instrument properties ── */
  _loadTrackProps() {
    const t = this.model.tracks[this.selTrack];
    if (!t) return;
    document.getElementById('inst-name').value    = t.name;
    document.getElementById('inst-wave').value    = t.wave;
    document.getElementById('inst-attack').value  = t.attack;
    document.getElementById('inst-decay').value   = t.decay;
    document.getElementById('inst-sustain').value = t.sustain;
    document.getElementById('inst-release').value = t.release;
    document.getElementById('inst-volume').value  = t.volume;
    document.getElementById('inst-pan').value     = t.pan;
    this._updateInstLabels(t);
    document.getElementById('btn-mute-track').classList.toggle('muted',  t.muted);
    document.getElementById('btn-solo-track').classList.toggle('soloed', t.soloed);
  }

  _updateInstLabels(t) {
    document.getElementById('inst-attack-val').textContent  = parseFloat(t.attack).toFixed(2)  + 's';
    document.getElementById('inst-decay-val').textContent   = parseFloat(t.decay).toFixed(2)   + 's';
    document.getElementById('inst-sustain-val').textContent = parseFloat(t.sustain).toFixed(2);
    document.getElementById('inst-release-val').textContent = parseFloat(t.release).toFixed(2) + 's';
    document.getElementById('inst-volume-val').textContent  = parseFloat(t.volume).toFixed(2);
    document.getElementById('inst-pan-val').textContent     = parseFloat(t.pan).toFixed(2);
  }

  _bindInstProps() {
    const rangeIds = ['attack','decay','sustain','release','volume','pan'];
    rangeIds.forEach(id => {
      const el = document.getElementById('inst-' + id);
      el.addEventListener('input', () => {
        const t = this.model.tracks[this.selTrack];
        if (t) { t[id] = parseFloat(el.value); this._updateInstLabels(t); }
      });
    });

    document.getElementById('inst-wave').addEventListener('change', e => {
      const t = this.model.tracks[this.selTrack];
      if (t) t.wave = e.target.value;
    });

    document.getElementById('btn-apply-inst').addEventListener('click', () => {
      const t = this.model.tracks[this.selTrack];
      if (!t) return;
      t.name = document.getElementById('inst-name').value || t.name;
      t.wave = document.getElementById('inst-wave').value;
      this._buildTrackList();
      this._buildPatternGrid();
      this._status('Applied instrument: ' + t.name);
    });

    document.getElementById('btn-mute-track').addEventListener('click', () => {
      const t = this.model.tracks[this.selTrack];
      if (!t) return;
      t.muted = !t.muted;
      document.getElementById('btn-mute-track').classList.toggle('muted', t.muted);
      this._buildTrackList();
    });

    document.getElementById('btn-solo-track').addEventListener('click', () => {
      const t = this.model.tracks[this.selTrack];
      if (!t) return;
      t.soloed = !t.soloed;
      document.getElementById('btn-solo-track').classList.toggle('soloed', t.soloed);
    });
  }

  /* ── Toolbar bindings ── */
  _bindToolbar() {
    document.getElementById('btn-play-pattern').addEventListener('click', () => {
      if (this.seq.playing) return;
      this.seq.startPattern();
      this._updatePlayState();
      this._status('Playing pattern…');
    });
    document.getElementById('btn-play-song').addEventListener('click', () => {
      if (this.seq.playing) return;
      if (!this.model.arrangement.length) { this._status('Add patterns to Song Arrangement first'); return; }
      this.seq.startSong();
      this._updatePlayState();
      this._status('Playing song…');
    });
    document.getElementById('btn-stop').addEventListener('click', () => {
      this.seq.stop(); // onStop callback handles UI cleanup
      this._status('Stopped');
    });
    document.getElementById('btn-undo').addEventListener('click', () => this._undo());
    document.getElementById('btn-record').addEventListener('click', () => {
      const btn = document.getElementById('btn-record');
      btn.classList.toggle('active');
      this._status(btn.classList.contains('active') ? 'Recording' : 'Record off');
    });

    document.getElementById('bpm').addEventListener('change', e => {
      this.model.bpm = clamp(parseInt(e.target.value, 10) || 120, 20, 300);
      e.target.value = this.model.bpm;
    });

    document.getElementById('pattern-length').addEventListener('change', e => {
      const len = clamp(parseInt(e.target.value, 10) || 32, 4, 128);
      this.model.setPatternLength(this.model.currentPattern, len);
      e.target.value = len;
      this._buildPatternGrid();
    });

    document.getElementById('btn-add-pattern').addEventListener('click', () => {
      const idx = this.model.addPattern();
      this.model.currentPattern = idx;
      this._buildPatternSelect();
      this._buildPatternGrid();
      this._status('Added pattern ' + (idx + 1));
    });

    document.getElementById('btn-clone-pattern').addEventListener('click', () => {
      const idx = this.model.clonePattern(this.model.currentPattern);
      this.model.currentPattern = idx;
      this._buildPatternSelect();
      this._buildPatternGrid();
      this._status('Cloned pattern');
    });

    document.getElementById('btn-del-pattern').addEventListener('click', () => {
      if (!this.model.deletePattern(this.model.currentPattern)) {
        this._status('Cannot delete last pattern'); return;
      }
      this._buildPatternSelect();
      this._buildPatternGrid();
      this._buildArrangement();
      this._status('Deleted pattern');
    });

    document.getElementById('btn-add-track').addEventListener('click', () => {
      this.model.addTrack();
      this._buildTrackList();
      this._buildPatternGrid();
      this._status('Added track');
    });

    document.getElementById('btn-arrange-add').addEventListener('click', () => {
      this.model.arrangement.push(this.model.currentPattern);
      this._buildArrangement();
    });

    document.getElementById('btn-export-midi').addEventListener('click', () => {
      exportMidi(this.model);
      this._status('Exported MIDI');
    });

    document.getElementById('btn-import-midi').addEventListener('click', () => {
      document.getElementById('midi-file-input').click();
    });

    document.getElementById('midi-file-input').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      e.target.value = ''; // reset so same file can be re-imported
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          this._pushUndo({ type: 'import', state: JSON.parse(this.model.toJSON()) });
          importMidi(this.model, ev.target.result);
          document.getElementById('bpm').value = this.model.bpm;
          this._buildPatternSelect();
          this._buildTrackList();
          this._buildPatternGrid();
          this._buildArrangement();
          this._loadTrackProps();
          this._status('Imported: ' + file.name);
        } catch (err) {
          this._status('Import failed: ' + err.message);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  /* ── Keyboard input ── */
  _bindKeyboard() {
    document.addEventListener('keydown', e => {
      // Ignore when focused on an input/select
      if (['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)) return;

      // Ctrl+Z — undo
      if (e.ctrlKey && e.code === 'KeyZ') { e.preventDefault(); this._undo(); return; }

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (this.seq.playing) {
            this.seq.stop();
            this._status('Stopped');
          } else {
            this.seq.startPattern();
            this._updatePlayState();
            this._status('Playing pattern…');
          }
          break;

        case 'ArrowDown':
          e.preventDefault();
          this.selRow = Math.min(this.selRow + 1, this.model.patterns[this.model.currentPattern].length - 1);
          this._selectCell(this.selRow, this.selTrack);
          break;

        case 'ArrowUp':
          e.preventDefault();
          this.selRow = Math.max(this.selRow - 1, 0);
          this._selectCell(this.selRow, this.selTrack);
          break;

        case 'ArrowRight':
          e.preventDefault();
          this.selTrack = Math.min(this.selTrack + 1, this.model.tracks.length - 1);
          this._selectCell(this.selRow, this.selTrack);
          this._buildTrackList();
          this._loadTrackProps();
          break;

        case 'ArrowLeft':
          e.preventDefault();
          this.selTrack = Math.max(this.selTrack - 1, 0);
          this._selectCell(this.selRow, this.selTrack);
          this._buildTrackList();
          this._loadTrackProps();
          break;

        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          this._pushUndo({ type: 'cell', patIdx: this.model.currentPattern, row: this.selRow, trackIdx: this.selTrack,
            cell: { ...this.model.getCell(this.model.currentPattern, this.selRow, this.selTrack) } });
          this.model.clearCell(this.model.currentPattern, this.selRow, this.selTrack);
          this._refreshCell(this.model.currentPattern, this.selRow, this.selTrack);
          break;

        case 'Enter':
          e.preventDefault();
          this._openPianoRoll(this.model.currentPattern, this.selTrack);
          break;

        default: {
          // Note input via keyboard
          const result = this.noteInput.push(e.key);
          if (result) {
            const patIdx = this.model.currentPattern;
            const vel    = 100;
            this._pushUndo({ type: 'cell', patIdx, row: this.selRow, trackIdx: this.selTrack,
              cell: { ...this.model.getCell(patIdx, this.selRow, this.selTrack) } });
            this.model.setCell(patIdx, this.selRow, this.selTrack, { note: result.midi, velocity: vel });
            this._refreshCell(patIdx, this.selRow, this.selTrack);
            // Preview note
            const track = this.model.tracks[this.selTrack];
            if (track) this.engine.playNote(track, result.midi, this.engine.currentTime + 0.01, 0.3);
            // Advance row
            this.selRow = Math.min(this.selRow + 1, this.model.patterns[patIdx].length - 1);
            this._selectCell(this.selRow, this.selTrack);
          }
          break;
        }
      }
    });
  }

  /* ── Piano Roll ── */
  _bindPianoRoll() {
    document.getElementById('btn-close-piano-roll').addEventListener('click', () => this._closePianoRoll());
    document.getElementById('btn-pr-ok').addEventListener('click', () => this._closePianoRoll());
    document.getElementById('btn-pr-clear').addEventListener('click', () => this.pianoRoll.clear());

    document.getElementById('pr-velocity').addEventListener('input', e => {
      this.pianoRoll.defaultVelocity = parseInt(e.target.value, 10);
      document.getElementById('pr-velocity-val').textContent = e.target.value;
    });
    document.getElementById('pr-duration').addEventListener('change', e => {
      this.pianoRoll.defaultDuration = parseFloat(e.target.value);
    });

    // Close on backdrop click
    document.getElementById('piano-roll-modal').addEventListener('click', e => {
      if (e.target === document.getElementById('piano-roll-modal')) this._closePianoRoll();
    });
  }

  _openPianoRoll(patIdx, trackIdx) {
    this._prTarget = { patIdx, trackIdx };
    const pat   = this.model.patterns[patIdx];
    const track = this.model.tracks[trackIdx];

    // Snapshot entire track column before any edits
    this._pushUndo({ type: 'track', patIdx, trackIdx,
      cells: pat.rows.map(row => ({ ...row[trackIdx] })) });

    document.getElementById('piano-roll-title').textContent =
      `Piano Roll — ${track.name} — ${pat.name}`;

    // Load track cells as piano roll data (use row as step)
    const cells = pat.rows.map(row => row[trackIdx]);
    this.pianoRoll.steps = pat.length;
    this.pianoRoll.resize();
    this.pianoRoll.loadFromCells(cells);

    // Apply changes immediately as the user draws notes
    this.pianoRoll._onChanged = () => {
      if (!this._prTarget) return;
      const { patIdx: pIdx, trackIdx: tIdx } = this._prTarget;
      const p = this.model.patterns[pIdx];
      this.pianoRoll.exportCells(p.length).forEach((cell, rowIdx) => {
        this.model.setCell(pIdx, rowIdx, tIdx, cell);
      });
      this._refreshTrackCells(pIdx, tIdx);
    };

    document.getElementById('piano-roll-modal').classList.remove('hidden');
  }

  _closePianoRoll() {
    document.getElementById('piano-roll-modal').classList.add('hidden');
    this.pianoRoll._onChanged = null;
    this._prTarget = null;
  }

  /* Refresh only the cells in one track column — used for live piano roll updates */
  _refreshTrackCells(patIdx, trackIdx) {
    const pat = this.model.patterns[patIdx];
    for (let r = 0; r < pat.length; r++) {
      this._refreshCell(patIdx, r, trackIdx);
    }
  }

  /* ── Undo ── */
  _pushUndo(entry) {
    this._history.push(entry);
    if (this._history.length > 50) this._history.shift();
  }

  _undo() {
    const entry = this._history.pop();
    if (!entry) { this._status('Nothing to undo'); return; }
    if (entry.type === 'cell') {
      this.model.patterns[entry.patIdx].rows[entry.row][entry.trackIdx] = entry.cell;
      this._refreshCell(entry.patIdx, entry.row, entry.trackIdx);
    } else if (entry.type === 'track') {
      const pat = this.model.patterns[entry.patIdx];
      entry.cells.forEach((cell, r) => { pat.rows[r][entry.trackIdx] = cell; });
      this._refreshTrackCells(entry.patIdx, entry.trackIdx);
    } else if (entry.type === 'import') {
      this.model.fromJSON(JSON.stringify(entry.state));
      document.getElementById('bpm').value = this.model.bpm;
      this._buildPatternSelect();
      this._buildTrackList();
      this._buildPatternGrid();
      this._buildArrangement();
      this._loadTrackProps();
    }
    this._status('Undo');
  }

  /* ── Play state ── */
  _updatePlayState() {
    document.getElementById('btn-play-pattern').classList.toggle('active', this.seq.playing && this.seq.mode === 'pattern');
    document.getElementById('btn-play-song').classList.toggle('active',    this.seq.playing && this.seq.mode === 'song');
  }

  _onSeqStop() {
    document.querySelectorAll('.cell.active-row, .row-num.active-row').forEach(el => el.classList.remove('active-row'));
    this._updatePlayState();
  }

  /* ── Misc ── */
  _updateMidiStatus() {
    setTimeout(() => {
      document.getElementById('midi-status').textContent = this.engine.midiStatusText();
    }, 500);
  }

  _status(msg) {
    document.getElementById('status-msg').textContent = msg;
  }
}
