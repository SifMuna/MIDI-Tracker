/* ─── MIDI File Export ────────────────────────────────────────────────────── */

/**
 * Build a standard MIDI file (format 1) from the TrackerModel
 * and trigger a browser download.
 */
function exportMidi(model) {
  const ticksPerBeat = 480;
  const usPerBeat    = Math.round(60_000_000 / model.bpm);
  const tracks       = model.tracks;
  const pat          = model.patterns[model.currentPattern];

  /* ── Helper: write variable-length quantity ── */
  function vlq(n) {
    const buf = [];
    buf.push(n & 0x7F);
    n >>= 7;
    while (n > 0) { buf.unshift((n & 0x7F) | 0x80); n >>= 7; }
    return buf;
  }

  function u16be(n) { return [(n >> 8) & 0xFF, n & 0xFF]; }
  function u24be(n) { return [(n >> 16) & 0xFF, (n >> 8) & 0xFF, n & 0xFF]; }
  function u32be(n) { return [(n >> 24) & 0xFF, (n >> 16) & 0xFF, (n >> 8) & 0xFF, n & 0xFF]; }

  /* ── Build header chunk ── */
  const numTracks = tracks.length + 1; // +1 for tempo track
  const header = [
    0x4D,0x54,0x68,0x64,  // MThd
    ...u32be(6),           // chunk length
    ...u16be(1),           // format 1
    ...u16be(numTracks),
    ...u16be(ticksPerBeat),
  ];

  /* ── Tempo track ── */
  const tempoTrackData = [
    ...vlq(0), 0xFF, 0x51, 0x03, ...u24be(usPerBeat),  // Set tempo
    ...vlq(0), 0xFF, 0x2F, 0x00,                         // End of track
  ];
  const tempoTrack = [
    0x4D,0x54,0x72,0x6B,  // MTrk
    ...u32be(tempoTrackData.length),
    ...tempoTrackData,
  ];

  /* ── One MIDI track per tracker track ── */
  const ticksPerRow = ticksPerBeat / 4; // 1/16th note per row

  const midiTracks = tracks.map((track, tIdx) => {
    const ch      = tIdx % 16;
    const events  = [];

    // Track name meta
    const nameBytes = Array.from(track.name).map(c => c.charCodeAt(0));
    events.push({ tick: 0, data: [0xFF, 0x03, nameBytes.length, ...nameBytes] });

    pat.rows.forEach((row, rowIdx) => {
      const cell = row[tIdx];
      if (cell.note == null) return;

      const onTick  = rowIdx * ticksPerRow;
      const durRows = parseFloat(cell.fx) || 1;
      const offTick = onTick + Math.round(durRows * ticksPerRow) - 1;
      const vel     = clamp(cell.velocity || 100, 1, 127);

      events.push({ tick: onTick,  data: [0x90 | ch, cell.note, vel] });
      events.push({ tick: offTick, data: [0x80 | ch, cell.note, 0] });
    });

    // End of track
    const lastTick = pat.length * ticksPerRow;
    events.push({ tick: lastTick, data: [0xFF, 0x2F, 0x00] });

    // Sort by tick, then convert to delta times
    events.sort((a, b) => a.tick - b.tick || (a.data[0] === 0x90 ? -1 : 1));
    let prev = 0;
    const trackData = [];
    events.forEach(ev => {
      const delta = ev.tick - prev;
      prev = ev.tick;
      trackData.push(...vlq(delta), ...ev.data);
    });

    return [
      0x4D,0x54,0x72,0x6B,
      ...u32be(trackData.length),
      ...trackData,
    ];
  });

  /* ── Concatenate and download ── */
  const allBytes = [...header, ...tempoTrack, ...midiTracks.flat()];
  const buf      = new Uint8Array(allBytes);
  const blob     = new Blob([buf], { type: 'audio/midi' });
  const url      = URL.createObjectURL(blob);
  const a        = document.createElement('a');
  a.href         = url;
  a.download     = (model.patterns[model.currentPattern].name || 'pattern') + '.mid';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
