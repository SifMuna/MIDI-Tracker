/* ─── MIDI File Import ─────────────────────────────────────────────────────── */

/**
 * Parse a standard MIDI file (format 0 or 1) and load it into the TrackerModel.
 * Creates a new pattern and new tracks for each MIDI track/channel found.
 * Returns the index of the newly created pattern.
 */
function importMidi(model, arrayBuffer) {
  const view = new DataView(arrayBuffer);
  let pos = 0;

  function readU8()  { return view.getUint8(pos++); }
  function readU16() { const v = view.getUint16(pos); pos += 2; return v; }
  function readU32() { const v = view.getUint32(pos); pos += 4; return v; }
  function readStr(n) {
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(readU8());
    return s;
  }
  function readVLQ() {
    let val = 0, b;
    do { b = readU8(); val = (val << 7) | (b & 0x7F); } while (b & 0x80);
    return val;
  }

  /* ── Header ── */
  if (readStr(4) !== 'MThd') throw new Error('Not a valid MIDI file');
  readU32(); // header length (always 6)
  const format   = readU16();
  const nTracks  = readU16();
  const division = readU16();
  if (division & 0x8000) throw new Error('SMPTE timecode not supported');
  const ticksPerBeat = division || 480;

  let bpm = 120;
  const rawTracks = [];

  /* ── Parse each MTrk chunk ── */
  for (let t = 0; t < nTracks; t++) {
    if (pos + 8 > arrayBuffer.byteLength) break;
    if (readStr(4) !== 'MTrk') throw new Error('Expected MTrk chunk');
    const chunkLen = readU32();
    const trackEnd = pos + chunkLen;

    let tick = 0, runningStatus = 0, trackName = null;
    const events = [];

    while (pos < trackEnd) {
      tick += readVLQ();

      let status = view.getUint8(pos);
      if (status & 0x80) { runningStatus = status; pos++; }
      else status = runningStatus;

      const cmd = status & 0xF0;
      const ch  = status & 0x0F;

      if (status === 0xFF) {
        /* Meta event */
        const metaType = readU8();
        const metaLen  = readVLQ();
        if (metaType === 0x51 && metaLen === 3) {
          /* Set Tempo */
          const us = (readU8() << 16) | (readU8() << 8) | readU8();
          bpm = Math.round(60_000_000 / us);
        } else if (metaType === 0x03) {
          /* Track Name */
          trackName = readStr(metaLen);
        } else {
          pos += metaLen;
        }
      } else if (status === 0xF0 || status === 0xF7) {
        /* SysEx */
        pos += readVLQ();
      } else if (cmd === 0x90) {
        const note = readU8(), vel = readU8();
        events.push({ tick, type: vel > 0 ? 'on' : 'off', ch, note, vel });
      } else if (cmd === 0x80) {
        const note = readU8(); readU8();
        events.push({ tick, type: 'off', ch, note });
      } else if (cmd === 0xA0 || cmd === 0xB0 || cmd === 0xE0) {
        readU8(); readU8(); /* 2-byte data */
      } else if (cmd === 0xC0 || cmd === 0xD0) {
        readU8(); /* 1-byte data */
      }
    }
    pos = trackEnd;
    rawTracks.push({ name: trackName, events });
  }

  /* ── Split into instrument tracks ── */
  const ticksPerStep = ticksPerBeat / 4; // 1 step = 1/16th note

  let instrTracks;
  if (format === 0) {
    /* Format 0: one track, split by MIDI channel */
    const byChannel = {};
    (rawTracks[0]?.events || []).forEach(e => {
      if (e.type !== 'on' && e.type !== 'off') return;
      const key = e.ch;
      if (!byChannel[key]) byChannel[key] = { name: `Ch ${e.ch + 1}`, events: [] };
      byChannel[key].events.push(e);
    });
    instrTracks = Object.values(byChannel);
  } else {
    /* Format 1: first track is usually tempo-only, rest are instrument tracks */
    instrTracks = rawTracks.filter(t => t.events.some(e => e.type === 'on'));
  }

  if (instrTracks.length === 0) throw new Error('No notes found in MIDI file');

  /* ── Determine pattern length from max note step ── */
  let maxStep = 31;
  instrTracks.forEach(({ events }) => {
    events.forEach(e => {
      if (e.type === 'on') {
        maxStep = Math.max(maxStep, Math.round(e.tick / ticksPerStep));
      }
    });
  });
  const patLen = Math.min(Math.ceil((maxStep + 4) / 4) * 4, 128);

  /* ── Create new pattern ── */
  const patIdx = model.addPattern();
  model.patterns[patIdx].name = 'Imported';
  model.setPatternLength(patIdx, patLen);

  /* ── Create tracker tracks and fill cells ── */
  instrTracks.slice(0, 16).forEach(({ name, events }) => {
    const tIdx = model.addTrack();
    model.tracks[tIdx].name = name || `MIDI ${tIdx + 1}`;

    /* Match note-on to note-off to determine duration */
    const pending = {}; // `ch,note` -> { tick, vel }
    events.forEach(e => {
      const key = `${e.ch},${e.note}`;
      if (e.type === 'on') {
        pending[key] = { tick: e.tick, vel: e.vel };
      } else if (pending[key]) {
        const on   = pending[key];
        const step = Math.round(on.tick / ticksPerStep);
        /* Round duration to nearest quarter step */
        const dur  = Math.max(Math.round((e.tick - on.tick) / ticksPerStep * 4) / 4, 0.25);
        if (step < patLen) {
          model.setCell(patIdx, step, tIdx, {
            note: e.note, velocity: on.vel, fx: String(dur),
          });
        }
        delete pending[key];
      }
    });

    /* Any unterminated note-ons get default duration */
    Object.entries(pending).forEach(([key, on]) => {
      const step = Math.round(on.tick / ticksPerStep);
      if (step < patLen) {
        model.setCell(patIdx, step, tIdx, {
          note: parseInt(key.split(',')[1]), velocity: on.vel, fx: '1',
        });
      }
    });
  });

  model.bpm = clamp(bpm, 20, 300);
  model.currentPattern = patIdx;
  return patIdx;
}
