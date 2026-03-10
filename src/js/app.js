/* ─── Application Entry Point ─────────────────────────────────────────────── */

(async () => {
  /* ── Instantiate core objects ── */
  const model   = new TrackerModel();
  const engine  = new AudioEngine();
  await engine.init();

  const seq     = new Sequencer(model, engine);
  const prCanvas = document.getElementById('piano-roll-canvas');
  const pr      = new PianoRoll(prCanvas);
  const ui      = new TrackerUI(model, seq, engine, pr);

  /* ── Wire up Save / Load via localStorage ── */
  const STORAGE_KEY = 'midi-tracker-song';

  function saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, model.toJSON());
    } catch (e) {
      console.warn('Save failed:', e);
    }
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) { model.fromJSON(raw); return true; }
    } catch (e) {
      console.warn('Load failed:', e);
    }
    return false;
  }

  // Auto-save every 30 seconds
  setInterval(saveToStorage, 30_000);

  // Save on page unload
  window.addEventListener('beforeunload', saveToStorage);

  /* ── Load persisted song or demo ── */
  const loaded = loadFromStorage();
  if (!loaded) _loadDemoSong(model);

  /* ── Initialise UI ── */
  ui.init();

  /* ── Expose globals for debugging ── */
  window.app = { model, engine, seq, ui, save: saveToStorage, load: loadFromStorage };

  console.log('%cMIDI Tracker loaded. Use window.app to access internals.', 'color:#e94560;font-weight:bold');
})();

/* ─── Demo Song ───────────────────────────────────────────────────────────── */
function _loadDemoSong(model) {
  // Simple 4/4 beat pattern
  model.bpm = 128;

  // Track names and patches
  const configs = [
    { name: 'Bass',    wave: 'sine',     volume: 0.9, attack: 0.01, decay: 0.15, sustain: 0.2, release: 0.1  },
    { name: 'Lead',    wave: 'sawtooth', volume: 0.7, attack: 0.02, decay: 0.1,  sustain: 0.8, release: 0.3  },
    { name: 'Pad',     wave: 'triangle', volume: 0.5, attack: 0.2,  decay: 0.3,  sustain: 0.7, release: 0.5  },
    { name: 'Arp',     wave: 'square',   volume: 0.4, attack: 0.01, decay: 0.05, sustain: 0.3, release: 0.1  },
  ];
  configs.forEach((cfg, i) => Object.assign(model.tracks[i], cfg));

  const pat = model.patterns[0];
  pat.name  = 'Intro';

  // Bass line — C2/G2 pumping on beats
  const bassNotes = [36,36,null,36, null,36,null,36, 43,43,null,43, null,43,null,43,
                     36,36,null,36, null,36,null,36, 38,38,null,38, null,null,38,null];
  bassNotes.forEach((n, r) => { if (n != null) pat.rows[r][0] = { note: n, velocity: 110, fx: null }; });

  // Lead — simple arpeggio
  const leadNotes = [60,null,64,null, 67,null,64,null, 60,null,62,null, 65,null,62,null,
                     60,null,64,null, 67,null,71,null, 69,null,67,null, 65,null,null,null];
  leadNotes.forEach((n, r) => { if (n != null) pat.rows[r][1] = { note: n, velocity: 90, fx: null }; });

  // Pad — long chords every 8 rows
  [[0,48],[8,47],[16,48],[24,50]].forEach(([r, n]) => {
    pat.rows[r][2] = { note: n, velocity: 70, fx: '8' };
  });

  // Arp — 16th note roll
  const arpSeq = [72,76,79,76, 72,76,79,76, 71,74,77,74, 71,74,77,74,
                  72,76,79,76, 72,76,79,76, 69,72,76,72, 69,72,76,72];
  arpSeq.forEach((n, r) => { pat.rows[r][3] = { note: n, velocity: 80, fx: null }; });
}
