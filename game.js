(() => {
'use strict';
// ---- js/music.js ----
// Pure music data: song structure -> per-16th-step event list. Shared by audio, visuals and level composer.

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10], harmonic: [0, 2, 3, 5, 7, 8, 11],
};

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

// 16-step drum/bass grids per style
const STYLES = {
  house:   { k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.', c: 'x.x.x.x.x.x.x.x.', b: '..x...x...x...x.', bl: 2 },
  synth:   { k: 'x.......x.x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', c: '', b: 'x.x.x.x.x.x.x.x.', bl: 2, oct: true },
  electro: { k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.', c: 'xxxxxxxxxxxxxxxx', b: 'x.xx.xx.x.xx.xx.', bl: 1 },
  dnb:     { k: 'x.........x.....', s: '....x.......x...', h: '..x...x...x...x.', c: 'x.x.x.x.x.x.x.x.', b: 'x.........x.....', bl: 6 },
  edm:     { k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.', c: 'xxxxxxxxxxxxxxxx', b: '.xxx.xxx.xxx.xxx', bl: 1 },
  hard:    { k: 'x...x...x...x.x.', s: '....x.......x...', h: '..x...x...x...x.', c: 'xxxxxxxxxxxxxxxx', b: '.x.x.x.x.x.x.x.x', bl: 1, oct: true },
};

// which instruments play in each section type, plus visual energy
const LAYERS = {
  intro: { pad: 1, hat: 1, arp: 1, e: 0.3 },
  verse: { kick: 1, hat: 1, bass: 1, arp: 1, pad: 1, e: 0.55 },
  build: { kick: 1, roll: 1, chat: 1, arp: 1, pad: 1, bass: 1, riser: 1, e: 0.7 },
  drop:  { kick: 1, snare: 1, hat: 1, chat: 1, bass: 1, lead: 1, stab: 1, crash: 1, e: 1 },
  break: { pad: 1, lead: 1, hat: 1, crash: 1, e: 0.3 },
  outro: { kick: 1, pad: 1, hat: 1, arp: 1, crash: 1, e: 0.45 },
};
const STAB = 'x..x..x...x.....';

function prepareSong(song, sections, bpm) {
  if (song.ev) return song;
  const sc = SCALES[song.scale], st = STYLES[song.style], r = rng(song.seed);
  const note = d => song.root + sc[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
  // 2-bar motif in scale degrees relative to the chord root, plus a variation for bars 3-4
  const motif = new Array(32).fill(null);
  let d = 4;
  for (let i = 0; i < 32; i++) {
    const p = i % 4 === 0 ? 0.8 : i % 2 === 0 ? 0.5 : (song.busy || 0.15);
    if (r() < p) { d = Math.max(0, Math.min(9, d + pick(r, [-2, -1, -1, 1, 1, 2, 0, 3, -3]))); motif[i] = d; }
  }
  if (motif[0] == null) motif[0] = 4;
  const motifB = motif.slice();
  for (let i = 16; i < 32; i++) if (motifB[i] != null) motifB[i] = Math.max(0, motifB[i] + pick(r, [0, 1, 2, -1]));
  motifB[24] = 7;

  const ev = [], secs = [];
  let bar = 0;
  sections.forEach((sec, si) => {
    const L = LAYERS[sec.m];
    secs.push({ step: ev.length, beat: ev.length / 4, m: sec.m, bars: sec.bars, e: L.e });
    for (let b = 0; b < sec.bars; b++, bar++) {
      const cd = song.prog[bar % song.prog.length];
      const chord = [0, 2, 4, 6].map(k => note(cd + k));
      for (let s = 0; s < 16; s++) {
        const X = pat => !!pat && pat[s] === 'x';
        const prog = (b * 16 + s) / (sec.bars * 16);
        const e = { si, s, bar, e: L.e + (sec.m === 'build' ? 0.3 * prog : 0) };
        if (L.kick) e.kick = (sec.m === 'build' || sec.m === 'outro') ? s % 4 === 0 : X(st.k);
        if (L.snare && X(st.s)) e.snare = 1;
        if (L.roll) {
          const sub = b < sec.bars / 2 ? 8 : b < sec.bars - 1 ? 4 : s < 8 ? 2 : 1;
          if ((s + (sub === 8 ? 4 : 0)) % sub === 0) e.roll = 0.25 + 0.75 * prog;
        }
        if (L.hat && X(st.h)) e.hat = 1;
        if (L.chat && X(st.c)) e.chat = 1;
        if (L.bass && X(st.b)) { e.bass = note(cd) - 24 + (st.oct && (s >> 1) % 2 ? 12 : 0); e.bl = st.bl; }
        const m = (bar % 4 < 2 ? motif : motifB)[(bar % 2) * 16 + s];
        if (m != null) e.mel = note(cd + m) + 12;
        if (L.lead && e.mel != null && (sec.m !== 'break' || s % 2 === 0)) e.lead = e.mel;
        if (L.arp) {
          const intro = sec.m === 'intro';
          if (!intro || s % 2 === 0) e.arp = note(cd + [0, 2, 4, 7][(intro ? s >> 1 : s) % 4]) + 12;
        }
        if (s === 0 && L.pad) e.pad = chord;
        if (L.stab && X(STAB)) e.stab = chord.slice(0, 3).map(n => n + 12);
        if (b === 0 && s === 0) {
          if (L.crash && si > 0) e.crash = 1;
          if (sec.m === 'drop') e.impact = 1;
          if (L.riser) e.riser = sec.bars * 16;
        }
        ev.push(e);
      }
    }
  });
  // lead note length = steps until next lead note (max 4)
  for (let i = 0; i < ev.length; i++) if (ev[i].lead != null) {
    let n = 1; while (n < 4 && i + n < ev.length && ev[i + n].lead == null) n++;
    ev[i].ll = n;
  }
  song.ev = ev; song.secs = secs; song.stepDur = 60 / bpm / 4; song.note = note;
  return song;
}

// Most recent melody pitch at or before step i (used to shape ship/wave paths)
function melodyAt(song, i) {
  for (let k = i; k >= 0 && k > i - 32; k--) if (song.ev[k] && song.ev[k].mel != null) return song.ev[k].mel;
  return song.root + 12;
}

// Visual envelopes derived from the same event list the audio uses
function musicEnv(song, t, bpm, loop) {
  if (!song || !song.ev) { // custom audio: plain beat pulse
    const sp = 60 / bpm, ph = ((t % sp) + sp) % sp;
    return { kick: Math.exp(-ph * 9), snare: 0, energy: 0.7, si: 0, m: 'drop', beat: t / sp };
  }
  const sd = song.stepDur, total = song.ev.length * sd;
  t = loop ? ((t % total) + total) % total : Math.max(0, Math.min(t, total - 1e-6));
  const i = Math.floor(t / sd);
  let kick = 0, snare = 0;
  for (let k = 0; k < 16 && i - k >= 0; k++) {
    const e = song.ev[i - k]; if (!e) continue;
    const dt = t - (i - k) * sd;
    if (!kick && e.kick) kick = Math.exp(-dt * 9);
    if (!snare && (e.snare || e.roll)) snare = Math.exp(-dt * 10) * (e.snare || e.roll);
  }
  const e = song.ev[Math.max(0, Math.min(i, song.ev.length - 1))];
  return { kick, snare, energy: e.e, si: e.si, m: song.secs[e.si].m, beat: t / (sd * 4) };
}

// ---- js/audio.js ----
// Web Audio synth + lookahead scheduler. Song time is derived from ctx.currentTime (the audio clock).

const AudioSys = (() => {
  let muted = false, ctx = null, master, musicVol, sfxVol, noise, impulse, run = null;
  let offset = 0; // user calibration, seconds

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9;
    master.connect(comp); comp.connect(ctx.destination);
    musicVol = ctx.createGain(); musicVol.connect(master);
    sfxVol = ctx.createGain(); sfxVol.connect(master);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    impulse = ctx.createBuffer(2, ctx.sampleRate * 2.2, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = impulse.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    }
  }

  function setVolumes(music, sfx) { if (!ctx) init(); musicVol.gain.value = music; sfxVol.gain.value = sfx; }
  function setMute(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.9; }
  function setOffset(ms) { offset = ms / 1000; }
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  // ---------- voices ----------
  function tone(dest, t, midi, dur, o) {
    const g = ctx.createGain(), fl = ctx.createBiquadFilter();
    fl.type = 'lowpass'; fl.Q.value = o.q || 1;
    fl.frequency.setValueAtTime(o.cut, t);
    if (o.cutEnd) fl.frequency.exponentialRampToValueAtTime(o.cutEnd, t + Math.max(0.02, dur));
    const a = o.a || 0.004, r = o.r || 0.08;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.v, t + a);
    g.gain.setValueAtTime(o.v * (o.sus == null ? 1 : o.sus), t + Math.max(a, dur));
    g.gain.exponentialRampToValueAtTime(0.0008, t + Math.max(a, dur) + r);
    fl.connect(g); g.connect(dest);
    for (const d of o.det || [0]) {
      const osc = ctx.createOscillator();
      osc.type = o.wave; osc.frequency.value = mtof(midi); osc.detune.value = d;
      osc.connect(fl); osc.start(t); osc.stop(t + dur + r + 0.05);
    }
    return g;
  }
  function noiseHit(dest, t, dur, v, type, freq, q, freqEnd) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; f.type = type; f.Q.value = q || 0.8;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
    return g;
  }
  function kick(dest, t, v) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(165, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.4);
    noiseHit(dest, t, 0.015, v * 0.4, 'highpass', 3000);
  }
  function snare(dest, t, v) {
    noiseHit(dest, t, 0.17, v * 0.7, 'highpass', 1400);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    g.gain.setValueAtTime(v * 0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.12);
  }

  // ---------- scheduler ----------
  function buildRun(song, opts) {
    const r = { song, opts, out: ctx.createGain(), loops: 0 };
    r.out.connect(musicVol);
    r.duck = ctx.createGain(); r.duck.connect(r.out);
    r.drums = ctx.createGain(); r.drums.gain.value = 0.9; r.drums.connect(r.out);
    const verb = ctx.createConvolver(); verb.buffer = impulse;
    const vg = ctx.createGain(); vg.gain.value = 0.22; verb.connect(vg); vg.connect(r.out);
    r.verb = verb;
    const dl = ctx.createDelay(1.5), fb = ctx.createGain(), dg = ctx.createGain(), df = ctx.createBiquadFilter();
    dl.delayTime.value = (song.stepDur || 0.125) * 3; fb.gain.value = 0.33; dg.gain.value = 0.22;
    df.type = 'lowpass'; df.frequency.value = 2500;
    dl.connect(df); df.connect(fb); fb.connect(dl); df.connect(dg); dg.connect(r.out);
    r.delay = dl;
    return r;
  }

  function playStep(r, i, t) {
    const e = r.song.ev[i]; if (!e) return;
    const sd = r.song.stepDur, S = r.song;
    if (e.kick) {
      kick(r.drums, t, 0.95);
      if (e.e > 0.6) { // sidechain pump
        r.duck.gain.cancelScheduledValues(t);
        r.duck.gain.setValueAtTime(0.35, t); r.duck.gain.linearRampToValueAtTime(1, t + sd * 3);
      }
    }
    if (e.snare) snare(r.drums, t, 0.55);
    if (e.roll) snare(r.drums, t, 0.12 + 0.4 * e.roll);
    if (e.hat) noiseHit(r.drums, t, 0.11, 0.13, 'highpass', 7500);
    if (e.chat) noiseHit(r.drums, t, 0.035, 0.07 + (e.s % 4 === 2 ? 0.04 : 0), 'highpass', 9000);
    if (e.bass != null) {
      const dur = e.bl * sd * 0.9;
      if (S.style === 'dnb') tone(r.duck, t, e.bass, dur, { wave: 'sawtooth', v: 0.32, cut: 900, cutEnd: 300, det: [-20, 20], q: 3 });
      else tone(r.duck, t, e.bass, dur, { wave: S.style === 'electro' || S.style === 'hard' ? 'square' : 'sawtooth', v: 0.3, cut: 1400, cutEnd: 250, q: 4, r: 0.05 });
      tone(r.duck, t, e.bass, dur, { wave: 'sine', v: 0.35, cut: 400 });
    }
    if (e.lead != null) {
      const g = tone(r.duck, t, e.lead, e.ll * sd * 0.95, {
        wave: S.lead || 'sawtooth', v: e.e < 0.5 ? 0.09 : 0.13, cut: 3200, cutEnd: 1600, det: [-9, 9], r: 0.15, sus: 0.7,
      });
      g.connect(r.delay); g.connect(r.verb);
    }
    if (e.arp != null) {
      const g = tone(r.duck, t, e.arp, sd * 0.8, { wave: 'square', v: 0.05 + 0.03 * e.e, cut: 1800 + 2500 * e.e, cutEnd: 500, r: 0.05 });
      g.connect(r.delay);
    }
    if (e.pad) for (const n of e.pad) {
      const g = tone(r.duck, t, n, sd * 15, { wave: 'sawtooth', v: 0.035, cut: 1100, det: [-12, 12], a: 0.25, r: 0.6 });
      g.connect(r.verb);
    }
    if (e.stab) for (const n of e.stab) {
      const g = tone(r.duck, t, n, sd * 1.2, { wave: 'sawtooth', v: 0.06, cut: 4000, cutEnd: 900, det: [-14, 0, 14], r: 0.1 });
      g.connect(r.verb);
    }
    if (e.crash) noiseHit(r.drums, t, 1.8, 0.22, 'highpass', 4500);
    if (e.impact) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.9);
      g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1);
      o.connect(g); g.connect(r.drums); o.start(t); o.stop(t + 1.05);
    }
    if (e.riser) {
      const d = e.riser * sd, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noise; s.loop = true; f.type = 'bandpass'; f.Q.value = 2;
      f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(9000, t + d);
      g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.18, t + d * 0.95); g.gain.linearRampToValueAtTime(0, t + d);
      s.connect(f); f.connect(g); g.connect(r.out); s.start(t); s.stop(t + d + 0.05);
    }
  }

  function schedule(r) {
    if (r !== run) return;
    const sd = r.song.stepDur, total = r.song.ev.length, horizon = ctx.currentTime + 0.15;
    for (;;) {
      if (r.next >= total) {
        if (!r.opts.loop) return;
        r.next = 0; r.loops++;
      }
      const tc = r.ctxStart + (r.loops * total + r.next) * sd - r.songStart;
      if (tc > horizon) return;
      if (tc >= ctx.currentTime - 0.01) playStep(r, r.next, tc);
      r.next++;
    }
  }

  // Start a song at song-time `from` (seconds). Works for any position: restarts, checkpoints, resume.
  function play(song, from, opts = {}) {
    init(); stop();
    const r = buildRun(song, opts);
    r.ctxStart = ctx.currentTime + 0.08; r.songStart = from;
    r.out.gain.value = opts.volume == null ? 1 : opts.volume;
    run = r;
    r.next = Math.max(0, Math.ceil(from / song.stepDur - 1e-6));
    // resume mid-bar: re-trigger the bar's pad chord so the harmony is present immediately
    const bar0 = Math.floor(r.next / 16) * 16;
    if (r.next > bar0 && song.ev[bar0] && song.ev[bar0].pad) {
      const left = (bar0 + 16 - r.next) * song.stepDur;
      for (const n of song.ev[bar0].pad) tone(r.duck, r.ctxStart, n, left, { wave: 'sawtooth', v: 0.035, cut: 1100, det: [-12, 12], a: 0.1, r: 0.5 }).connect(r.verb);
    }
    schedule(r);
    r.timer = setInterval(() => schedule(r), 25);
  }

  function stop(fade = 0.06) {
    if (!run) return;
    const r = run; run = null;
    clearInterval(r.timer);
    const t = ctx.currentTime;
    r.out.gain.cancelScheduledValues(t);
    r.out.gain.setValueAtTime(r.out.gain.value, t);
    r.out.gain.linearRampToValueAtTime(0, t + fade);
    setTimeout(() => r.out.disconnect(), (fade + 0.3) * 1000);
  }

  // current song position in seconds, compensated for output latency and user offset
  function time() {
    if (!run) return 0;
    const lat = ctx.outputLatency || ctx.baseLatency || 0;
    return ctx.currentTime - run.ctxStart + run.songStart - lat - offset;
  }
  const playing = () => !!run;
  const running = () => !!ctx && ctx.state === 'running';

  // ---------- sound effects ----------
  function sfx(name) {
    if (!ctx) return;
    const t = ctx.currentTime + 0.005, d = sfxVol;
    switch (name) {
      case 'death':
        noiseHit(d, t, 0.6, 0.6, 'lowpass', 4000, 1, 200);
        tone(d, t, 52, 0.25, { wave: 'square', v: 0.15, cut: 2000, cutEnd: 100 });
        break;
      case 'orb': tone(d, t, 84, 0.06, { wave: 'sine', v: 0.18, cut: 6000 }); tone(d, t + 0.05, 91, 0.08, { wave: 'sine', v: 0.12, cut: 6000 }); break;
      case 'pad': tone(d, t, 72, 0.12, { wave: 'triangle', v: 0.16, cut: 5000 }); break;
      case 'portal': noiseHit(d, t, 0.35, 0.18, 'bandpass', 600, 3, 5000); break;
      case 'coin': tone(d, t, 88, 0.08, { wave: 'square', v: 0.08, cut: 6000 }); tone(d, t + 0.08, 95, 0.25, { wave: 'square', v: 0.08, cut: 6000, r: 0.2 }); break;
      case 'click': tone(d, t, 79, 0.03, { wave: 'triangle', v: 0.12, cut: 6000 }); break;
      case 'check': tone(d, t, 76, 0.05, { wave: 'sine', v: 0.2, cut: 6000 }); tone(d, t + 0.06, 83, 0.1, { wave: 'sine', v: 0.2, cut: 6000 }); break;
      case 'tick': tone(d, t, 96, 0.02, { wave: 'square', v: 0.15, cut: 8000 }); break;
      case 'complete':
        [72, 76, 79, 84, 88].forEach((n, i) => tone(d, t + i * 0.09, n, 0.5, { wave: 'sawtooth', v: 0.07, cut: 3500, det: [-8, 8], r: 0.4 }));
        break;
    }
  }

  // tap-along calibration: plays a click track, returns the click times (ctx clock) via callback
  function clickTrack(bpm, beats) {
    init();
    const sp = 60 / bpm, t0 = ctx.currentTime + 0.5, times = [];
    for (let i = 0; i < beats; i++) {
      const t = t0 + i * sp; times.push(t);
      tone(sfxVol, t, i % 4 ? 84 : 96, 0.03, { wave: 'square', v: 0.2, cut: 8000 });
    }
    return times;
  }
  const now = () => (ctx ? ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0) : 0);

  return { setMute, init, play, stop, time, playing, running, sfx, setVolumes, setOffset, clickTrack, now };
})();

// ---- js/engine.js ----
// Pure gameplay simulation (no DOM). Player x is a function of song time, so obstacles placed
// on beats are reached exactly on those beats. Physics runs at a fixed 240 Hz step.

const SPEEDS = { slow: 8.4, normal: 10.4, fast: 12.96, faster: 15.6, fastest: 19.27 };
const PHYS = {
  STEP: 1 / 240, g: 87, jumpV: 19.6, maxFall: 28,
  shipAcc: 46, shipMax: 10.5, ballG: 72, ballMax: 24,
  robotV: 13, robotBoost: 0.22, coyote: 0.05, buffer: 0.1,
};
const APEX = PHYS.jumpV / PHYS.g;          // time from jump to apex (~0.225 s)
const AIR = 2 * APEX;                     // cube airtime
const HS = { cube: 0.5, robot: 0.5, ball: 0.5, ship: 0.36, wave: 0.24 };
const CORRIDOR = { ship: 9, wave: 9, ball: 6 };
const BUCKET = 4, EMPTY = [];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function makeTimeline(bpm, speeds) {
  const spb = 60 / bpm, segs = [];
  let x = 0, t = 0, v = SPEEDS[speeds[0][1]];
  segs.push({ t: 0, x: 0, v });
  for (let i = 1; i < speeds.length; i++) {
    const nt = speeds[i][0] * spb;
    x += v * (nt - t); t = nt; v = SPEEDS[speeds[i][1]];
    segs.push({ t, x, v });
  }
  const seg = t => { let s = segs[0]; for (const g of segs) { if (g.t <= t) s = g; else break; } return s; };
  return {
    spb, segs,
    xAt: t => { const s = seg(t); return s.x + s.v * (t - s.t); },
    vAt: t => seg(t).v,
    tAt: x => { let s = segs[0]; for (const g of segs) { if (g.x <= x) s = g; else break; } return s.t + (x - s.x) / s.v; },
  };
}

// Builder: place objects by beat. Used by the level composer.
function makeBuilder(bpm, speeds) {
  const tl = makeTimeline(bpm, speeds), objs = [];
  const B = {
    tl, objs, spb: tl.spb,
    t: b => b * tl.spb,
    x: b => tl.xAt(b * tl.spb),
    xt: t => tl.xAt(t),
    j: (b, d = APEX) => tl.xAt(b * tl.spb + d), // x at the apex of a jump pressed on beat b
    add: o => (objs.push(o), o),
    spike: (x, y = 0, flip = false, extra) => B.add(Object.assign({ k: 'spike', x, y, flip }, extra)),
    spikes(cx, n, y = 0, flip = false, extra) { for (let i = 0; i < n; i++) B.spike(cx + i - (n - 1) / 2, y, flip, extra); },
    block: (x1, x2, y1, y2, extra) => B.add(Object.assign({ k: 'block', x1, x2, y1, y2 }, extra)),
  };
  return B;
}

function tunnelY(o, x) {
  const p = o.pts;
  if (x <= p[0][0]) return p[0];
  let lo = 0, hi = p.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p[m][0] <= x) lo = m; else hi = m; }
  const a = p[lo], b = p[hi], f = clamp((x - a[0]) / (b[0] - a[0] || 1), 0, 1);
  return [x, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

function blockDY(o, t) {
  let d = 0;
  if (o.move) d += o.move.amp * Math.sin((t / o.move.per) * 2 * Math.PI + (o.move.ph || 0));
  if (o.fall) { const p = clamp((t - o.fall.t0) / o.fall.dur, 0, 1); d += o.fall.h * (1 - p * p); }
  return d;
}
const popScale = (o, t) => (o.pop == null ? 1 : clamp((t - o.pop) / 0.15, 0, 1));

// L: { bpm, speeds, objs, lengthBeats, endBeat? }
function finalizeLevel(L) {
  L.tl = makeTimeline(L.bpm, L.speeds);
  L.duration = (L.endBeat || L.lengthBeats) * L.tl.spb;
  L.endX = L.tl.xAt(L.duration);
  L.buckets = [];
  L.objs.forEach((o, i) => {
    o.id = i;
    if (o.k === 'saw') { o.x1 = o.x - o.r; o.x2 = o.x + o.r; }
    else if (o.x1 == null || (o.k !== 'block' && o.k !== 'gap' && o.k !== 'tunnel' && o.k !== 'ceil')) { o.x1 = o.x - 0.6; o.x2 = o.x + 0.6; }
    for (let k = Math.max(0, Math.floor((o.x1 - 2) / BUCKET)); k <= Math.floor((o.x2 + 2) / BUCKET); k++) (L.buckets[k] || (L.buckets[k] = [])).push(o);
  });
  L.near = x => L.buckets[Math.floor(x / BUCKET)] || EMPTY;
  return L;
}

function newState(L) {
  return { t: 0, x: 0, y: HS.cube, vy: 0, mode: 'cube', grav: 1, ceil: Infinity, ground: true, coy: 0, buf: 0, robotT: 0, used: [], coins: 0, jumps: 0, dead: false, won: false, ev: 0 };
}
const cloneState = s => Object.assign({}, s, { used: s.used.slice() });

function launch(s, c, mult) {
  if (c === 'B') { s.grav = -s.grav; s.vy = -s.grav * 11; }
  else if (s.mode === 'ship') s.vy = s.grav * PHYS.shipMax * Math.min(1, mult);
  else if (s.mode !== 'wave') s.vy = s.grav * PHYS.jumpV * mult * (s.mode === 'ball' ? 0.8 : 1);
  s.ground = false; s.coy = 0; s.robotT = 0;
}

function applyPortal(s, o) {
  if (o.type === 'mode') {
    s.mode = o.v; s.ceil = o.ceil || Infinity; s.robotT = 0;
    if (s.ceil === Infinity) s.grav = 1;
    if (o.v === 'ship' || o.v === 'wave') s.vy = clamp(s.vy, -6, 6);
  } else if (o.type === 'grav') { if (s.grav !== o.v) { s.grav = o.v; s.vy *= 0.5; s.ground = false; s.coy = 0; } }
  else if (o.type === 'tele') { s.y = o.ty; s.vy = 0; }
  s.ev |= 1;
}
const die = (s, cause) => { s.dead = true; s.cause = cause; return s; };

// Advance one fixed step. `hold` = button down, `press` = new press this step.
// s.ev bit flags for visuals/sfx: 1 portal, 2 jump, 4 orb, 8 pad, 16 coin, 32 land
function step(L, s, hold, press) {
  const dt = PHYS.STEP;
  if (press) s.buf = PHYS.buffer; else if (s.buf > 0) s.buf -= dt;
  const px = s.x;
  s.t += dt; s.x = L.tl.xAt(s.t);
  const objs = L.near(s.x);
  for (const o of objs) if (o.k === 'portal' && o.x > px && o.x <= s.x) applyPortal(s, o);
  const wasGround = s.ground, onG = s.ground || s.coy > 0;
  switch (s.mode) {
    case 'cube':
      if (hold && onG) { s.vy = PHYS.jumpV * s.grav; s.ground = false; s.coy = 0; s.buf = 0; s.jumps++; s.ev |= 2; }
      s.vy -= PHYS.g * s.grav * dt;
      break;
    case 'robot':
      if (hold && onG) { s.vy = PHYS.robotV * s.grav; s.robotT = PHYS.robotBoost; s.ground = false; s.coy = 0; s.buf = 0; s.jumps++; s.ev |= 2; }
      else if (hold && s.robotT > 0) { s.robotT -= dt; s.vy = PHYS.robotV * s.grav; }
      else { s.robotT = 0; s.vy -= PHYS.g * s.grav * dt; }
      break;
    case 'ship':
      s.vy = clamp(s.vy + (hold ? 1 : -1) * PHYS.shipAcc * s.grav * dt, -PHYS.shipMax, PHYS.shipMax);
      break;
    case 'ball':
      if (s.buf > 0 && onG) { s.grav = -s.grav; s.vy = -s.grav * 5; s.buf = 0; s.ground = false; s.coy = 0; s.jumps++; s.ev |= 2; }
      s.vy = clamp(s.vy - PHYS.ballG * s.grav * dt, -PHYS.ballMax, PHYS.ballMax);
      break;
    case 'wave':
      s.vy = (hold ? 1 : -1) * s.grav * L.tl.vAt(s.t);
      break;
  }
  if ((s.mode === 'cube' || s.mode === 'robot') && s.vy * s.grav < -PHYS.maxFall) s.vy = -PHYS.maxFall * s.grav;
  const prevY = s.y;
  s.y += s.vy * dt;
  s.ground = false; if (s.coy > 0) s.coy -= dt;
  const hy = HS[s.mode], hx = s.mode === 'wave' ? 0.24 : 0.5;
  const phx = hx * 0.76, phy = hy * 0.76;

  let gap = false;
  for (const o of objs) if (o.k === 'gap' && s.x > o.x1 + 0.3 && s.x < o.x2 - 0.3) gap = true;
  if (!gap && s.y - hy < 0) { s.y = hy; if (s.vy < 0) s.vy = 0; if (s.grav === 1) land(s); }
  if (gap && s.y < -3) return die(s, 'fall');
  if (s.y + hy > s.ceil) { s.y = s.ceil - hy; if (s.vy > 0) s.vy = 0; if (s.grav === -1) land(s); }
  if (s.ceil === Infinity && s.y > 60) return die(s, 'lost');

  for (const o of objs) {
    if (o.x2 < s.x - hx || o.x1 > s.x + hx) continue;
    switch (o.k) {
      case 'block': {
        const dy = (o.move || o.fall) ? blockDY(o, s.t) : 0, by1 = o.y1 + dy, by2 = o.y2 + dy;
        if (s.x + hx <= o.x1 || s.x - hx >= o.x2 || s.y + hy <= by1 || s.y - hy >= by2) break;
        if (s.mode === 'wave') return die(s, 'block');
        const tol = Math.abs(s.vy * dt) + 0.15 + (o.move ? 0.12 : 0);
        const canTop = s.grav === 1 || s.mode === 'ship', canBot = s.grav === -1 || s.mode === 'ship';
        if (canTop && s.vy <= 0 && prevY - hy >= by2 - tol) { s.y = by2 + hy; s.vy = 0; if (s.grav === 1) land(s); }
        else if (canBot && s.vy >= 0 && prevY + hy <= by1 + tol) { s.y = by1 - hy; s.vy = 0; if (s.grav === -1) land(s); }
        else if (s.x + 0.3 > o.x1 && s.x - 0.3 < o.x2 && s.y + hy * 0.6 > by1 && s.y - hy * 0.6 < by2) return die(s, 'block');
        break;
      }
      case 'spike': {
        const h = 0.5 * popScale(o, s.t); if (h <= 0) break;
        const oy = o.y + (o.move ? blockDY(o, s.t) : 0);
        const y1 = o.flip ? oy - 0.05 - h : oy + 0.05, y2 = y1 + h;
        if (s.x + phx > o.x - 0.17 && s.x - phx < o.x + 0.17 && s.y + phy > y1 && s.y - phy < y2) return die(s, 'spike');
        break;
      }
      case 'saw': {
        const oy = o.y + (o.move ? blockDY(o, s.t) : 0);
        const cx = clamp(o.x, s.x - phx, s.x + phx), cy = clamp(oy, s.y - phy, s.y + phy);
        if ((cx - o.x) ** 2 + (cy - oy) ** 2 < (o.r * 0.8) ** 2) return die(s, 'saw');
        break;
      }
      case 'tunnel': {
        if (s.x < o.x1 || s.x > o.x2) break;
        for (const dx of [-phx, 0, phx]) {
          const c = tunnelY(o, s.x + dx);
          if (s.y - phy < c[1] - c[2] / 2 || s.y + phy > c[1] + c[2] / 2) return die(s, 'wall');
        }
        break;
      }
      case 'gate':
        if (s.t < o.t0 && Math.abs(s.x - o.x) < 0.2 + phx && s.y + phy > o.y1 && s.y - phy < o.y2) return die(s, 'gate');
        break;
      case 'pad': {
        if (s.used.includes(o.id) || Math.abs(s.x - o.x) > 0.5 + hx * 0.5) break;
        const hit = o.flip ? (s.y + hy > o.y - 0.4 && s.y < o.y) : (s.y - hy < o.y + 0.4 && s.y > o.y);
        if (hit) { s.used.push(o.id); launch(s, o.c, o.c === 'Y' ? 1.38 : 0.92); s.ev |= 8; }
        break;
      }
      case 'orb':
        if (s.buf > 0 && !s.used.includes(o.id) && (s.x - o.x) ** 2 + (s.y - o.y) ** 2 < 1.15 * 1.15) {
          s.used.push(o.id); s.buf = 0; launch(s, o.c, o.c === 'Y' ? 1 : 0.72); s.ev |= 4;
        }
        break;
      case 'coin':
        if (!(s.coins & (1 << o.n)) && (s.x - o.x) ** 2 + (s.y - o.y) ** 2 < 0.9 * 0.9) { s.coins |= 1 << o.n; s.ev |= 16; }
        break;
    }
  }
  if (s.ground && !wasGround) s.ev |= 32;
  if (s.x >= L.endX) s.won = true;
  return s;
}
function land(s) { s.ground = true; s.coy = PHYS.coyote; }

// ---- js/levels.js ----
// Level scores. Obstacles are placed on beats, usually derived from the song's own kick/bass/lead hits,
// so the course is choreographed by the music. tools/verify.js proves each one is beatable.

const THEMES = {
  neon: { sky: ['#0a0030', '#3a0f80'], ground: '#1b0b52', deco: 'city', hazard: '#ff4d8d',
    pal: { base: ['#ff3df2', '#27f3ff'], drop: ['#ffd23d', '#ff3df2'], brk: ['#27f3ff', '#8a6bff'] } },
  synth: { sky: ['#14002e', '#ff4a8d'], ground: '#1a0535', deco: 'synth', hazard: '#ffe14d',
    pal: { base: ['#ff9f1c', '#00f0ff'], drop: ['#ff3d81', '#ffe14d'], brk: ['#00f0ff', '#b46bff'] } },
  storm: { sky: ['#02081a', '#0d3050'], ground: '#06182c', deco: 'storm', hazard: '#ff5577',
    pal: { base: ['#4df3ff', '#ffee55'], drop: ['#ffee55', '#4df3ff'], brk: ['#7aa8ff', '#4df3ff'] } },
  grav: { sky: ['#04001a', '#240042'], ground: '#12012b', deco: 'bars', hazard: '#ff6a3d',
    pal: { base: ['#7dff4d', '#ff3df2'], drop: ['#ff3df2', '#7dff4d'], brk: ['#4dd2ff', '#7dff4d'] } },
  hyper: { sky: ['#00000f', '#00214d'], ground: '#00102a', deco: 'tunnel', hazard: '#ff2bd6',
    pal: { base: ['#00ffd5', '#ff2bd6'], drop: ['#ff2bd6', '#00ffd5'], brk: ['#5b8cff', '#00ffd5'] } },
  final: { sky: ['#0c0000', '#35000f'], ground: '#1a0006', deco: 'circuit', hazard: '#ffe14d',
    pal: { base: ['#ff2a2a', '#ffffff'], drop: ['#ffffff', '#ff2a2a'], brk: ['#ff7a2a', '#ff2a2a'] } },
};

function toolkit(B, song) {
  const spb = B.spb, ev = s => song.ev[s] || {};
  const T = { ev, rec: 0.8 };
  const jy = (b, d) => B.xt(b * spb + d);                // x at time offset d from beat b
  T.jmp = (b, n = 1, o) => B.spikes(B.j(b), n, 0, false, o);
  T.saw = (b, y = 0.2, r = 0.85, o) => B.add(Object.assign({ k: 'saw', x: B.x(b), y, r }, o));
  T.sawJ = (b, y = 0.2, r = 0.85, o) => B.add(Object.assign({ k: 'saw', x: B.j(b), y, r }, o));
  T.pop = (b, n = 1) => B.spikes(B.j(b), n, 0, false, { pop: b * spb + APEX - 0.7 });
  T.bob = (b, per = 2, ph = 0) => B.spike(B.j(b), 0.4, false, { move: { amp: 0.4, per: per * spb, ph } });
  T.hop = (b, h = 1, len) => {
    const x1 = jy(b, 0.12), v = B.tl.vAt(b * spb);
    return B.block(x1, x1 + (len || v * 0.28 + 1.3), 0, h);
  };
  T.gap = (b, w) => B.add({ k: 'gap', x1: B.j(b) - w / 2, x2: B.j(b) + w / 2 });
  T.pad = (b, c = 'Y', flip = false, y = 0) => B.add({ k: 'pad', x: B.x(b), y, c, flip });
  T.orb = (b, c, y, dx = 0) => B.add({ k: 'orb', x: B.x(b) + dx, y, c });
  T.orbJ = (b, c, y, dx = 0) => B.add({ k: 'orb', x: B.j(b) + dx, y, c });
  T.coin = (n, x, y) => B.add({ k: 'coin', x, y, n });
  T.portal = (b, type, v, o) => B.add(Object.assign({ k: 'portal', x: B.x(b) - (o && o.dx || 0), type, v }, o));
  T.mode = (b, v, ceil) => T.portal(b, 'mode', v, ceil ? { ceil } : null);
  T.grav = (b, v) => T.portal(b, 'grav', v);
  T.fall = (b, h = 1, len = 1.4) => { // wall that slams down just before the player arrives
    const x1 = B.j(b) - len / 2;
    return B.block(x1, x1 + len, 0, h, { fall: { t0: b * spb - 0.5, dur: 0.45, h: 6 } });
  };
  T.cj = (b, n, ceil) => B.spikes(B.j(b), n, ceil, true);   // ceiling spikes jumped (down) on beat b
  // Robot run: items are ['pil', beat, height, len] (pillar to climb) or ['sp', beat, n] (spikes)
  T.robot = (b0, b1, items) => {
    T.mode(b0, 'robot');
    for (const [w, b, a, c] of items) {
      const x = B.xt(b * spb + 0.22);
      if (w === 'pil') B.block(x, x + (c || 4), 0, a);
      else B.spikes(x + 1, a);
    }
    T.mode(b1, 'cube');
  };
  // jump on every song hit matching pred, at least `sep` beats apart. cnt = spikes per jump (cycled).
  T.onHits = (bar0, bar1, pred, sep, cnt, o) => T.hits(bar0 * 4, bar1 * 4, pred, sep, cnt, o);
  T.hits = (b0, b1, pred, sep, cnt, o) => {
    let last = -99, k = 0;
    const out = [];
    for (let s = Math.ceil(b0 * 4); s < b1 * 4; s++) {
      const b = s / 4;
      if (pred(ev(s), s) && b - last >= sep - 1e-6) {
        const n = cnt[k++ % cnt.length];
        if (typeof n === 'function') { const ex = n(b); out.push(b); last = B.tl.tAt(ex) / spb + T.rec - sep; continue; }
        if (n > 0) { T.jmp(b, n, o); out.push(b); }
        last = b;
      }
    }
    return out;
  };
  // ---- vertical-movement patterns: each returns the x where it ends ----
  // Stair climb up and back down (jump onto step 1, then hop each higher step)
  const vAt = b => B.tl.vAt(b * spb);                      // block sizes below scale with speed so timing stays human
  T.stairs = (b, hs = [1, 2, 2, 1], len = 0.27 * vAt(b)) => {
    let x = jy(b, 0.12);
    for (const h of hs) { B.block(x, x + len, 0, h); x += len; }
    return x;
  };
  // Platform that rides up and down over a pit: jump on, ride, jump off
  T.lift = (b, w = 0.43 * vAt(b), amp = 0.9, per = 4) => {
    const x1 = B.xt(b * spb + 0.2);
    B.add({ k: 'gap', x1: x1 - 1.5, x2: x1 + w + 2 });
    B.block(x1, x1 + w, 0.4, 1.0, { move: { amp, per: per * spb, ph: 0 } });
    return x1 + w + 2;
  };
  // Saw sliding up and down the lane
  T.sawBob = (b, amp = 1.1, per = 3) => {
    const x = B.j(b);
    // phase so the saw is sliding through the low part of its travel when the player crosses (a real, jumpable hazard)
    const ph = Math.asin(-0.64) - 2 * Math.PI * (b * spb + APEX) / (per * spb);
    B.add({ k: 'saw', x, y: 1.7, r: 0.8, move: { amp, per: per * spb, ph } });
    return x + 1;
  };
  // Floor spikes under a low hanging bar: jump must be well timed to stay under it
  T.ceilBar = (b, n = 2) => {
    const x = B.j(b), hw = n / 2 + 1.6;
    B.spikes(x, n); B.block(x - hw, x + hw, 3.6, 9);
    return x + hw;
  };
  // Floating platforms climbing up and down over a spike bed
  T.floaters = (b, tops = [1, 2, 3, 2, 1], len = 0.22 * vAt(b), gap = 0.16 * vAt(b)) => {
    let x = jy(b, 0.12); const x0 = x;
    for (const t of tops) { B.block(x, x + len, t - 0.4, t); x += len + gap; }
    x -= gap;
    for (let sx = x0 + len + 0.3; sx < x - len - 0.3; sx += 1) B.spike(sx, 0);
    return x;
  };
  // Widest pit the jump can cross at this speed: `half` is the timing window (+/- seconds) left to the player
  T.leap = (b, half = 0.08) => {
    const v = B.tl.vAt(b * spb), w = 0.6 + 0.45 * v - 2 * v * half, x = B.j(b);
    B.add({ k: 'gap', x1: x - w / 2, x2: x + w / 2 });
    return x + w / 2 + 0.5;
  };
  // Pit whose landing zone is guarded by spikes: jump the pit, then jump again at once
  T.leapSpike = (b, half = 0.08) => { const ex = T.leap(b, half); B.spikes(ex + 1.1, 2); return ex + 2.5; };
  // Spike, hop-block, spike with almost no breathing room
  T.chain = (b, n = 3) => {
    let x = B.j(b); B.spike(x, 0);
    const v = vAt(b), bx = B.xt(b * spb + 0.9); B.block(bx, bx + 0.25 * v, 0, 1); B.spike(bx + 0.25 * v + 0.13 * v, 0);
    return bx + 0.25 * v + 0.21 * v;
  };
  T.half = 0.09;
  T.P = { leapSpike: b => T.leapSpike(b, T.half), chain: b => T.chain(b), leap: b => T.leap(b, T.half), stairs: b => T.stairs(b), lift: b => T.lift(b), bob: b => T.sawBob(b), ceil: b => T.ceilBar(b, 2), float: b => T.floaters(b) };
  T.row = (b, n, dx = 0) => B.spikes(B.j(b) + dx, n);
  // melody -> y, normalised over a beat range
  const melRange = (b0, b1) => {
    let lo = 1e9, hi = -1e9;
    for (let s = Math.floor(b0 * 4); s < b1 * 4; s++) { const m = melodyAt(song, s); lo = Math.min(lo, m); hi = Math.max(hi, m); }
    return m => (m - lo) / (hi - lo || 1);
  };
  // Ship tunnel following the melody. o: {c:[lo,hi], h:[start,end], slope, saws:[beats], coin:[n,beat], tele:[{b,to}]}
  T.ship = (b0, b1, o = {}) => {
    const ceil = o.ceil || 10, [clo, chi] = o.c || [2.8, 6.2], [h0, h1] = o.h || [7, 5];
    const norm = melRange(b0, b1), pts = [], segs = [];
    const slope = o.slope || 0.55, sh = o.shift || [];
    T.mode(b0, 'ship', ceil);
    const bs = b0 + 1, be = b1 - 1.5;
    let cy = (clo + chi) / 2 - 0.4, px = B.x(bs);
    const secs = [];
    const cut = (o.tele || []).map(t => t.b).concat([1e9]);
    let ti = 0, cur = [];
    const centers = [];
    for (let b = bs; b <= be + 1e-6; b += 0.5) {
      const x = B.x(b);
      let target = clo + (chi - clo) * norm(melodyAt(song, Math.floor(b * 4)));
      const f = (b - bs) / (be - bs), h = h0 + (h1 - h0) * f;
      target = Math.max(h / 2 + 0.2, Math.min(ceil - h / 2 - 0.2, target));
      const dxm = x - px; cy += Math.max(-slope * dxm, Math.min(slope * dxm, target - cy)); px = x;
      if (ti < cut.length - 1 && b >= cut[ti]) { // teleport chamber: open space around the portal
        const tele = o.tele[ti++];
        secs.push(cur); cur = [];
        const xp = B.x(tele.b);
        T.portal(tele.b, 'tele', null, { ty: tele.to });
        cy = tele.to; px = xp + 1.2;
        cur.push([xp + 1.2, cy, h]);
        b = tele.b + 0.5 - 0.5; // resume sampling after the chamber
        continue;
      }
      cur.push([x, cy, h]); centers.push([b, cy, h]);
    }
    secs.push(cur);
    for (const p of secs) if (p.length > 1) B.add({ k: 'tunnel', x1: p[0][0], x2: p[p.length - 1][0], pts: p });
    const at = b => { let r = centers[0]; for (const c of centers) { if (c[0] <= b) r = c; } return r; };
    for (const sb of o.saws || []) { const c = at(sb), up = (Math.floor(sb * 2) % 2 === 0); B.add({ k: 'saw', x: B.x(sb), y: c[1] + (up ? 1 : -1) * (c[2] / 2 - 0.15), r: 0.85, spin: true }); }
    if (o.coin) { const c = at(o.coin[1]); T.coin(o.coin[0], B.x(o.coin[1]), c[1] + (o.coin[2] || 0)); }
    T.mode(b1, 'cube');
    return centers;
  };
  // Wave zigzag. o: {per, h:[a,b], mid, slope}
  T.wave = (b0, b1, o = {}) => {
    const ceil = o.ceil || 10, per = o.per || 2, [h0, h1] = o.h || [6.5, 5], mid = o.mid || 4.6, sl = o.slope || 0.9;
    T.mode(b0, 'wave', ceil);
    const bs = b0 + 1, be = b1 - 1.5, pts = [];
    const v = B.tl.vAt(bs * spb), amp = sl * v * (per / 2) * spb / 2;
    let up = 1; // first segment goes up
    const add = (b, y) => { const f = Math.max(0, (b - bs) / (be - bs)); pts.push([B.x(b), y, h0 + (h1 - h0) * f]); };
    add(bs, mid - amp * 0 + 0);
    for (let b = bs; b < be; b += per / 2) { add(b + per / 2, mid + up * amp * (up > 0 ? 1 : 1) * 0 + (up > 0 ? amp : -amp)); up = -up; }
    // start with a lead-in so the wave (starting low) is inside the tunnel
    B.add({ k: 'tunnel', x1: pts[0][0], x2: pts[pts.length - 1][0], pts });
    if (o.coin) T.coin(o.coin[0], pts[o.coin[1]][0], pts[o.coin[1]][1]);
    T.mode(b1, 'cube');
    return pts;
  };
  // Ball: floor/ceiling spikes alternate. seq: [[beat,'f'|'c', n]]
  T.ball = (b0, b1, seq, ceil = 6.5) => {
    T.mode(b0, 'ball', ceil);
    for (const [b, w, n = 1] of seq) {
      if (w === 'f') B.spikes(B.x(b), n, 0, false);
      else B.spikes(B.x(b), n, ceil, true);
    }
    T.mode(b1, 'cube');
  };
  return T;
}

// ---- helper: sections -> bar offsets ----
const SEC = (list) => list.map(([m, bars]) => ({ m, bars }));

const LEVELS = [
  // 1 ---------------------------------------------------------------------------------------------
  {
    id: 'neon', name: 'Neon Beginning', diff: 'Easy', stars: 2, bpm: 110, bars: 32, theme: 'neon',
    music: 'Glass Skyline',
    song: { style: 'house', scale: 'major', root: 57, seed: 11, prog: [0, 5, 3, 4], busy: 0.3 },
    sections: SEC([['intro', 4], ['verse', 8], ['build', 4], ['drop', 8], ['break', 4], ['drop', 4], ['outro', 2]]),
    speeds: [[0, 'slow'], [64, 'normal']],
    build(B, T) {
      const kick = e => e.kick, bass = e => e.bass != null, lead = e => e.lead != null;
      // intro: three gentle single spikes
      T.jmp(8); T.jmp(12); T.jmp(14);
      // verse A: one jump per two kicks
      T.onHits(4, 6, kick, 2, [1, 1]);
      T.jmp(24, 2); T.jmp(26); T.hop(28); T.coin(0, B.j(31), 3.1); T.jmp(31);
      // verse B: five-wide spike bed crossed with an orb tap
      T.row(32, 4, 2.4); T.orbJ(32, 'Y', 2.7);
      T.jmp(37, 3); T.hop(40); T.jmp(43, 2); T.jmp(45); T.gap(47, 3.2);
      // build: spikes every beat while the snare roll tightens, then a pad launches into the drop
      T.onHits(12, 13, kick, 2, [1]);
      T.jmp(54, 2);
      for (const b of [56, 57, 58, 59]) T.jmp(b);
      T.jmp(60.5, 2);
      T.pad(62.5, 'Y'); B.spikes(B.xt(62.5 * B.spb + 0.31), 3);
      // drop A: jumps follow the offbeat bass line
      T.onHits(16, 19, bass, 1.5, [1, 2, T.P.stairs, 1, 3]);
      T.gap(76, 3.5); T.coin(1, B.j(76), 2.9);
      T.hop(80); T.jmp(83.5, 2); T.jmp(86); T.hop(88); T.jmp(91, 3); T.jmp(93.5);
      // break: obstacles follow the lead melody, orbs hang over a spike bed
      T.onHits(24, 28, lead, 2, [1, 2, 1]);
      T.row(104, 4, 2.4); T.orbJ(104, 'Y', 2.7);
      // drop B
      T.onHits(28, 30, bass, 1.5, [2, 1, 3, 1]);
      T.hop(120); T.coin(2, B.j(122), 3.1); T.jmp(122, 2); T.gap(125, 3.5);
    },
  },
  // 2 ---------------------------------------------------------------------------------------------
  {
    id: 'pulse', name: 'Pulse Runner', diff: 'Normal', stars: 3, bpm: 125, bars: 36, theme: 'synth',
    music: 'Midnight Interstate',
    song: { style: 'synth', scale: 'minor', root: 57, seed: 22, prog: [0, 5, 2, 6], busy: 0.25, lead: 'sawtooth' },
    sections: SEC([['intro', 4], ['verse', 8], ['build', 4], ['drop', 8], ['break', 4], ['drop', 8], ['outro', 2]]),
    speeds: [[0, 'normal'], [64, 'fast'], [96, 'normal'], [112, 'fast']],
    build(B, T) {
      const kick = e => e.kick, bass = e => e.bass != null, lead = e => e.lead != null;
      for (const b of [8, 10, 12, 14]) T.jmp(b);
      T.onHits(4, 8, kick, 2, [1, 1, 2, T.P.bob]);
      T.sawJ(32, 0.2); T.hop(35); T.jmp(38, 2); T.coin(0, B.j(38), 3.1);
      T.pop(41); T.sawJ(43); T.jmp(45, 3);
      T.onHits(11, 12, kick, 2, [1]);
      // build
      T.jmp(48, 2); T.jmp(50); T.sawJ(52); T.jmp(54.5, 2); T.jmp(56.5); T.sawJ(58.5); T.pad(60.5, 'Y'); B.spikes(B.xt(60.5 * B.spb + 0.31), 5);
      T.hop(63);
      // drop A (fast): bass line
      T.onHits(16, 20, bass, 2, [2, T.P.stairs, 1, 3, T.P.bob, 2]);
      // ship through the cavern
      T.ship(80, 94, { c: [3, 6], h: [8, 6], saws: [86, 89], coin: [1, 91] });
      // break (normal): melody + pads and orbs
      T.onHits(24, 26, lead, 2, [1, 2]);
      T.pad(105, 'P'); T.hop(107); T.orbJ(109, 'Y', 2.7); T.row(109, 4, 2.4); T.jmp(111, 2);
      // drop B (fast): gravity-flip section then finale
      T.mode(112, 'cube', 8);
      T.grav(114, -1);
      B.spikes(B.x(117), 2, 8, true); B.spikes(B.x(121), 1, 8, true);
      T.grav(124, 1);
      T.mode(126, 'cube');
      T.onHits(32, 35, bass, 2, [2, T.P.lift, 3, T.P.float, 1]);
      T.sawJ(138); T.coin(2, B.j(138), 3.2);
    },
  },

  // 3 ---------------------------------------------------------------------------------------------
  {
    id: 'storm', name: 'Electric Storm', diff: 'Hard', stars: 5, bpm: 140, bars: 40, theme: 'storm',
    music: 'Voltage Cathedral',
    song: { style: 'electro', scale: 'harmonic', root: 55, seed: 33, prog: [0, 0, 5, 6], busy: 0.3, lead: 'square' },
    sections: SEC([['intro', 4], ['verse', 8], ['build', 4], ['drop', 8], ['break', 4], ['build', 4], ['drop', 8], ['outro', 2]]),
    speeds: [[0, 'normal'], [48, 'fast'], [96, 'normal'], [112, 'fast'], [128, 'faster']],
    build(B, T) {
      const kick = e => e.kick, bass = e => e.bass != null;
      T.jmp(8); T.sawJ(10); T.jmp(12, 2); T.jmp(14);
      T.onHits(4, 8, kick, 2, [1, 2, 3, T.P.bob]);
      T.fall(33); T.hop(35); T.sawJ(38); T.coin(0, B.j(38), 3.1);
      T.ship(40, 47, { c: [3, 6], h: [8, 6.5], saws: [44] });
      // build (fast)
      T.jmp(48, 2); T.sawJ(50); T.fall(52.5); T.jmp(55, 3); T.jmp(57); T.sawJ(59, 0.2, 0.85); T.jmp(61, 2);
      // drop A: ball hazards then gravity cube
      T.ball(64, 79, [[67, 'f', 1], [69, 'c', 1], [71, 'f', 2], [73, 'c', 1], [75, 'f', 1], [77, 'c', 2]], 6.5);
      T.mode(80, 'cube', 8);
      T.grav(82, -1); T.cj(85, 1, 8); T.cj(88, 2, 8); T.grav(90.5, 1); T.jmp(93, 2);
      T.mode(95, 'cube');
      // break (normal): wave with the melody
      T.wave(97, 111, { per: 2, h: [7, 5.5], mid: 4.6, coin: [1, 3] });
      // build (fast)
      T.jmp(113, 2); T.sawJ(115); T.fall(117.5); T.jmp(120, 3); T.jmp(122); T.sawJ(124); T.pad(126, 'Y'); B.spikes(B.xt(126 * B.spb + 0.3), 3);
      // drop B (faster): ship gauntlet then final cube runs
      T.ship(129, 145, { c: [3, 6.4], h: [7.5, 5.2], saws: [134, 137, 140], coin: [2, 142] });
      T.half = 0.1;
      T.onHits(36, 39, bass, 1.5, [2, T.P.ceil, 3, T.P.leap, T.P.stairs, T.P.bob]);
      T.sawJ(155);
    },
  },
  // 4 ---------------------------------------------------------------------------------------------
  {
    id: 'gravity', name: 'Gravity Shift', diff: 'Harder', stars: 7, bpm: 160, bars: 44, theme: 'grav',
    music: 'Orbital Decay',
    song: { style: 'dnb', scale: 'dorian', root: 52, seed: 44, prog: [0, 3, 6, 4], busy: 0.35, lead: 'sawtooth' },
    sections: SEC([['intro', 4], ['verse', 8], ['build', 4], ['drop', 8], ['break', 4], ['build', 4], ['drop', 8], ['drop', 4], ['outro', 2]]),
    speeds: [[0, 'normal'], [48, 'fast'], [96, 'normal'], [112, 'fast'], [160, 'faster']],
    build(B, T) {
      const kick = e => e.kick, bass = e => e.bass != null; T.rec = 0.6; T.half = 0.085;
      T.jmp(8); T.jmp(10); T.sawJ(12); T.jmp(14, 2);
      T.hits(16, 31, e => e.kick || e.snare, 1.5, [1, T.P.stairs, 2, T.P.leap, T.P.float, 1, 3]);
      T.mode(32, 'cube', 8);
      T.grav(34, -1); T.cj(37, 1, 8); T.cj(40, 2, 8); T.coin(0, B.j(40), 5.2); T.grav(42, 1); T.jmp(45, 2);
      T.mode(47, 'cube');
      // build (fast): robot run
      T.robot(48, 63, [['pil', 51, 2, 4], ['sp', 55, 2], ['pil', 58, 3, 4.5], ['sp', 62, 1]]);
      // drop A: wave then ball
      T.wave(66, 82, { per: 2, h: [6.5, 5.5], mid: 4.6, coin: [1, 5] });
      T.ball(83, 95, [[86, 'f', 1], [88, 'c', 1], [90, 'f', 2], [92, 'c', 1]], 6.5);
      // break (normal): ship with a teleport chamber
      T.ship(97, 111, { c: [3, 6.5], h: [7.5, 6], tele: [{ b: 104, to: 7 }], saws: [108], coin: [2, 109] });
      // build (fast): gravity cube
      T.mode(112, 'cube', 8);
      T.grav(114, -1); T.cj(117, 2, 8); T.grav(119, 1); T.jmp(122, 2); T.grav(124, -1); T.cj(127, 1, 8); T.grav(129, 1);
      T.mode(131, 'cube');
      // drop B
      T.hits(131.5, 141, bass, 1.5, [2, T.P.lift, 3, T.P.leap, T.P.ceil]);
      T.sawJ(142); T.ship(145, 159, { c: [3, 6.4], h: [7.5, 5.4], saws: [150, 153] });
      // final (faster): cube then ball
      T.hits(162, 173, bass, 1.5, [T.P.float, 2, T.P.leap, T.P.bob, 3]);
    },
  },
  // 5 ---------------------------------------------------------------------------------------------
  {
    id: 'hyper', name: 'Hyperdrive', diff: 'Insane', stars: 9, bpm: 175, bars: 48, theme: 'hyper',
    music: 'Warp Core',
    song: { style: 'edm', scale: 'minor', root: 59, seed: 55, prog: [5, 3, 0, 4], busy: 0.35, lead: 'sawtooth' },
    sections: SEC([['intro', 4], ['verse', 8], ['build', 4], ['drop', 12], ['break', 4], ['build', 4], ['drop', 12], ['outro', 2]]),
    speeds: [[0, 'fast'], [48, 'faster'], [112, 'fast'], [144, 'faster']],
    build(B, T) {
      const kick = e => e.kick, bass = e => e.bass != null; T.rec = 0.25; T.half = 0.05;
      T.jmp(8); T.jmp(10); T.sawJ(12); T.jmp(14, 2);
      T.hits(16, 30, kick, 1.5, [1, T.P.stairs, T.P.bob, T.P.leapSpike, T.P.chain, T.P.leap, 3]);
      T.ball(32, 39, [[34.5, 'f', 1], [36, 'c', 1], [37.5, 'f', 2]], 5.5);
      T.robot(40, 47, [['pil', 41.5, 2, 3.6], ['sp', 44, 2], ['pil', 45.5, 3, 3.2]]);
      T.ship(48, 63, { c: [3, 6.8], h: [5.6, 3.7], slope: 0.75, saws: [52, 53.5, 55, 56.5, 58, 59.5, 61] });
      T.wave(65, 81, { per: 0.95, h: [4.0, 3.0], mid: 4.6 });
      T.hits(83.5, 95.5, bass, 1.5, [T.P.float, T.P.leapSpike, T.P.lift, 3, T.P.chain, T.P.ceil]);
      T.ball(96, 110, [[98.5, 'f', 1], [99.75, 'c', 1], [101, 'f', 2], [102.25, 'c', 1], [103.5, 'f', 1], [104.75, 'c', 2], [106, 'f', 1], [107.25, 'c', 1]], 5.5);
      T.ship(113, 127, { c: [3, 6.5], h: [5.4, 3.8], slope: 0.75, tele: [{ b: 120, to: 7 }], saws: [115.5, 117, 118.5, 123, 124.5], coin: [0, 125] });
      T.mode(128, 'cube', 8);
      T.grav(130, -1); T.cj(133, 2, 8); T.grav(136, 1); T.jmp(139, 2); T.grav(141, -1); T.cj(143, 1, 8);
      T.mode(144, 'cube');
      T.wave(147, 163, { per: 0.95, h: [3.7, 2.8], mid: 4.6, coin: [1, 6] });
      const h5 = T.hits(166, 179, bass, 1.5, [T.P.stairs, 2, T.P.bob, 3, T.P.leapSpike, T.P.chain, T.P.ceil]); T.coin(2, B.j(h5[3]), 3.0);
      T.robot(180, 191, [['pil', 181.5, 2, 3.6], ['sp', 184, 2], ['pil', 186, 3, 3.6], ['sp', 189, 3]]);
    },
  },
  // 6 ---------------------------------------------------------------------------------------------
  {
    id: 'final', name: 'Final Frequency', diff: 'Extreme', stars: 11, bpm: 190, bars: 52, theme: 'final',
    music: 'Zero Hertz',
    song: { style: 'hard', scale: 'phrygian', root: 50, seed: 66, prog: [0, 1, 0, 6], busy: 0.4, lead: 'sawtooth' },
    sections: SEC([['intro', 4], ['verse', 8], ['build', 4], ['drop', 12], ['break', 4], ['build', 4], ['drop', 16], ['outro', 2]]),
    speeds: [[0, 'fast'], [48, 'faster'], [112, 'fast'], [128, 'faster'], [176, 'fastest']],
    build(B, T) {
      const kick = e => e.kick, bass = e => e.bass != null; T.rec = 0.9; T.half = 0.04;
      T.jmp(8); T.jmp(10); T.sawJ(12); T.jmp(14, 2);
      T.hits(16, 29, kick, 1.75, [1, T.P.bob, T.P.chain, T.P.leapSpike, T.P.stairs, T.P.leap]);
      T.ship(32, 47, { c: [3, 6.8], h: [5.6, 3.5], slope: 0.75, saws: [36.5, 38, 39.5, 41, 42.5, 44, 45.5] });
      T.robot(48, 63, [['pil', 51, 2, 4], ['sp', 55, 2], ['pil', 58, 3, 4.5], ['sp', 61, 1]]);
      T.wave(65, 83, { per: 0.9, h: [3.6, 2.7], mid: 4.6 });
      T.ball(84, 99, [[86.5, 'f', 1], [88, 'c', 1], [89.5, 'f', 2], [91, 'c', 1], [92.5, 'f', 1], [94, 'c', 2], [95.5, 'f', 1], [97, 'c', 2]], 5.5);
      T.onHits(25, 28, bass, 1.75, [T.P.float, T.P.chain, T.P.leapSpike, T.P.ceil, 3, T.P.lift]);
      T.ship(113, 127, { c: [3, 6.5], h: [5.2, 3.8], slope: 0.75, tele: [{ b: 120, to: 7 }], saws: [115.5, 117, 118.5, 123, 124.5], coin: [0, 125] });
      T.mode(128, 'cube', 8);
      T.grav(130, -1); T.cj(133, 2, 8); T.grav(136, 1); T.jmp(139, 2); T.grav(141, -1); T.cj(143, 1, 8); T.grav(145, 1);
      T.mode(147, 'cube');
      T.wave(149, 165, { per: 0.9, h: [3.4, 2.6], mid: 4.6, coin: [1, 6] });
      T.ship(167, 176, { c: [3, 6.8], h: [4.6, 3.6], slope: 0.75, saws: [169.5, 171, 172.5, 174] });
      const h6 = T.hits(176, 200, bass, 1.75, [T.P.lift, 2, T.P.ceil, 3, T.P.chain, T.P.leapSpike, T.P.float, T.P.bob, T.P.stairs]); T.coin(2, B.j(h6[4]), 3.0);
      T.sawJ(204, 0.2);
    },
  },
];

function buildLevel(def) {
  const song = def.song ? prepareSong(def.song, def.sections, def.bpm) : null;
  const B = makeBuilder(def.bpm, def.speeds);
  def.build(B, toolkit(B, song));
  const L = finalizeLevel({ bpm: def.bpm, speeds: def.speeds, objs: B.objs, lengthBeats: def.bars * 4 });
  L.def = def; L.song = song; L.theme = THEMES[def.theme]; L.id = def.id; L.name = def.name;
  return L;
}

// ---- js/save.js ----
// localStorage persistence + unlock rules. Every access is wrapped: storage may be blocked or full.

const ICONS = [
  { id: 'square', name: 'Cube', need: () => true, hint: '' },
  { id: 'round', name: 'Orb', need: () => true, hint: '' },
  { id: 'diamond', name: 'Diamond', need: s => done(s, 'neon'), hint: 'Complete Neon Beginning' },
  { id: 'hex', name: 'Hex', need: s => done(s, 'pulse'), hint: 'Complete Pulse Runner' },
  { id: 'tri', name: 'Prism', need: s => totalCoins(s) >= 5, hint: 'Collect 5 secret coins' },
  { id: 'star', name: 'Nova', need: s => done(s, 'gravity'), hint: 'Complete Gravity Shift' },
  { id: 'bolt', name: 'Bolt', need: s => done(s, 'hyper'), hint: 'Complete Hyperdrive' },
  { id: 'cross', name: 'Core', need: s => done(s, 'final'), hint: 'Complete Final Frequency' },
  { id: 'ring', name: 'Halo', need: s => totalCoins(s) >= 18, hint: 'Collect all 18 coins' },
];
const TRAILS = [
  { id: 'none', name: 'None', need: () => true, hint: '' },
  { id: 'line', name: 'Glow Line', need: () => true, hint: '' },
  { id: 'sparks', name: 'Sparks', need: s => s.stats.attempts >= 100, hint: 'Make 100 attempts' },
  { id: 'pixel', name: 'Pixels', need: s => totalCoins(s) >= 3, hint: 'Collect 3 secret coins' },
  { id: 'rainbow', name: 'Rainbow', need: s => done(s, 'storm'), hint: 'Complete Electric Storm' },
  { id: 'comet', name: 'Comet', need: s => LEVELS.every(l => done(s, l.id)), hint: 'Complete every level' },
];
const SWATCHES = ['#ff3df2', '#27f3ff', '#ffd23d', '#7dff4d', '#ff4d4d', '#8a6bff', '#ff9f1c', '#ffffff', '#00ffd5', '#ff2bd6', '#4d7dff', '#b0ff00', '#ff6a3d', '#12e0a0', '#e0e0ff', '#222244'];
const ACHIEVEMENTS = [
  { id: 'first', name: 'First Steps', desc: 'Complete any level', test: s => LEVELS.some(l => done(s, l.id)) },
  { id: 'coin3', name: 'Treasure Hunter', desc: 'Collect 3 secret coins', test: s => totalCoins(s) >= 3 },
  { id: 'coin18', name: 'Completionist', desc: 'Collect all 18 secret coins', test: s => totalCoins(s) >= 18 },
  { id: 'att100', name: 'Persistent', desc: 'Make 100 attempts', test: s => s.stats.attempts >= 100 },
  { id: 'die500', name: 'Glutton for Punishment', desc: 'Die 500 times', test: s => s.stats.deaths >= 500 },
  { id: 'storm', name: 'Weathered', desc: 'Complete Electric Storm', test: s => done(s, 'storm') },
  { id: 'half6', name: 'Halfway to Zero', desc: 'Reach 50% on Final Frequency', test: s => ((s.levels.final || {}).best || 0) >= 50 },
  { id: 'final', name: 'Final Frequency', desc: 'Complete Final Frequency', test: s => done(s, 'final') },
  { id: 'prac', name: 'Practice Makes Perfect', desc: 'Finish a level in practice mode', test: s => s.stats.practiceWins > 0 },
];
const done = (s, id) => !!(s.levels[id] && s.levels[id].done);
const bits = v => (v & 1) + ((v >> 1) & 1) + ((v >> 2) & 1);
const totalCoins = s => Object.values(s.levels).reduce((a, l) => a + bits(l.coins || 0), 0);

const Save = (() => {
  const KEY = 'gdr.save.v2';
  const SALT = 'np-7f3a91c2e4b86d05';
  // Signature over the saved JSON: hand-edited localStorage no longer matches and is discarded.
  // (Client-side only; it stops casual tampering, not a determined person reading the source.)
  const sign = str => {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    const t = str + SALT;
    for (let i = 0; i < t.length; i++) { const c = t.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  };
  const defaults = () => ({
    levels: {},
    stats: { attempts: 0, deaths: 0, jumps: 0, completions: 0, practiceAttempts: 0, practiceWins: 0, playMs: 0 },
    cust: { icon: 'square', c1: '#ff3df2', c2: '#27f3ff', trail: 'line' },
    settings: { music: 0.8, sfx: 0.7, offset: 0, mute: false, reduceFlash: false, reduceShake: false, quality: 'high' },
    ach: {},
  });
  let data = defaults();
  const merge = (a, b) => { for (const k in b) if (k in a) a[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' ? merge(a[k], b[k]) : b[k]; return a; };
  const num = (v, lo, hi, d = 0) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  // Re-derive everything that can be derived, and clamp the rest, so a signed-but-impossible save can't unlock things.
  function sane(d) {
    const out = defaults();
    let prev = true;
    LEVELS.forEach((def, i) => {
      const l = d.levels && d.levels[def.id]; if (!l) { prev = false; return; }
      const done = prev && l.done === true;
      out.levels[def.id] = { best: done ? 100 : Math.floor(num(l.best, 0, 99)), done, coins: done || l.coins ? (num(l.coins, 0, 7) | 0) : 0, attempts: num(l.attempts, 0, 1e9) | 0, practiceBest: num(l.practiceBest, 0, 100), practiceAttempts: num(l.practiceAttempts, 0, 1e9) | 0 };
      prev = done;
    });
    for (const k in out.stats) out.stats[k] = num(d.stats && d.stats[k], 0, 1e12);
    const s = d.settings || {};
    Object.assign(out.settings, { music: num(s.music, 0, 1, 0.8), sfx: num(s.sfx, 0, 1, 0.7), offset: Math.round(num(s.offset, -250, 250)), mute: !!s.mute, reduceFlash: !!s.reduceFlash, reduceShake: !!s.reduceShake, quality: s.quality === 'low' ? 'low' : 'high' });
    const c = d.cust || {}, hex = /^#[0-9a-f]{6}$/i;
    if (hex.test(c.c1)) out.cust.c1 = c.c1; if (hex.test(c.c2)) out.cust.c2 = c.c2;
    const ic = ICONS.find(x => x.id === c.icon), tr = TRAILS.find(x => x.id === c.trail);
    if (ic && ic.need(out)) out.cust.icon = ic.id; if (tr && tr.need(out)) out.cust.trail = tr.id;
    for (const a of ACHIEVEMENTS) if (d.ach && d.ach[a.id] && a.test(out)) out.ach[a.id] = d.ach[a.id];
    return out;
  }
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw.d === 'string' && raw.s === sign(raw.d)) data = sane(merge(defaults(), JSON.parse(raw.d)));
  } catch (e) { /* missing or tampered: start fresh */ }
  const flush = () => { try { const d = JSON.stringify(data); localStorage.setItem(KEY, JSON.stringify({ d, s: sign(d) })); } catch (e) { /* ignore */ } };
  const lv = id => data.levels[id] || (data.levels[id] = { best: 0, done: false, coins: 0, attempts: 0, practiceBest: 0 });
  const unlocked = i => i === 0 || done(data, LEVELS[i - 1].id);
  // returns newly earned achievements
  function check() {
    const fresh = [];
    for (const a of ACHIEVEMENTS) if (!data.ach[a.id] && a.test(data)) { data.ach[a.id] = Date.now(); fresh.push(a); }
    if (fresh.length) flush();
    return fresh;
  }
  const iconOk = id => ICONS.find(i => i.id === id).need(data);
  const trailOk = id => TRAILS.find(i => i.id === id).need(data);
  function reset() { data = defaults(); flush(); }
  return { get d() { return data; }, flush, lv, unlocked, check, iconOk, trailOk, reset };
})();

// ---- js/render.js ----
// Canvas renderer: parallax backgrounds, neon world, player, trails, particles. Everything beat-reactive
// reads from the `env` envelope derived from the same event list the synth plays.

const hex2rgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const TAU = Math.PI * 2;

// ---- icon shapes in a unit box (-0.5..0.5) ----
const ICON_PATHS = (() => {
  const P = {}, mk = f => { const p = new Path2D(); f(p); return p; };
  const poly = (p, pts) => { pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); p.closePath(); };
  P.square = mk(p => p.roundRect(-0.5, -0.5, 1, 1, 0.12));
  P.round = mk(p => p.arc(0, 0, 0.5, 0, TAU));
  P.diamond = mk(p => poly(p, [[0, 0.62], [0.62, 0], [0, -0.62], [-0.62, 0]]));
  P.hex = mk(p => poly(p, [0, 1, 2, 3, 4, 5].map(i => [Math.cos(i * TAU / 6) * 0.56, Math.sin(i * TAU / 6) * 0.56])));
  P.tri = mk(p => poly(p, [[0, 0.55], [0.58, -0.45], [-0.58, -0.45]]));
  P.star = mk(p => poly(p, Array.from({ length: 10 }, (_, i) => { const r = i % 2 ? 0.26 : 0.6, a = Math.PI / 2 + i * TAU / 10; return [Math.cos(a) * r, Math.sin(a) * r]; })));
  P.bolt = mk(p => poly(p, [[0.1, 0.62], [-0.35, -0.05], [-0.02, -0.05], [-0.12, -0.62], [0.38, 0.1], [0.04, 0.1]]));
  P.cross = mk(p => poly(p, [[-0.18, 0.55], [0.18, 0.55], [0.18, 0.18], [0.55, 0.18], [0.55, -0.18], [0.18, -0.18], [0.18, -0.55], [-0.18, -0.55], [-0.18, -0.18], [-0.55, -0.18], [-0.55, 0.18], [-0.18, 0.18]]));
  P.ring = mk(p => { p.arc(0, 0, 0.5, 0, TAU); p.moveTo(0.26, 0); p.arc(0, 0, 0.26, 0, TAU, true); });
  return P;
})();

function drawIcon(c, id, c1, c2, size = 1, glow = true) {
  const path = ICON_PATHS[id] || ICON_PATHS.square;
  c.save(); c.scale(size, size);
  const lw = 0.07;
  if (glow) { c.globalCompositeOperation = 'lighter'; c.strokeStyle = c1; c.globalAlpha = 0.25; c.lineWidth = lw * 3; c.stroke(path); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; }
  c.fillStyle = c1; c.fill(path, 'evenodd');
  c.save(); c.scale(0.55, 0.55); c.fillStyle = c2; c.globalAlpha = 0.9; c.fill(path, 'evenodd'); c.restore();
  c.lineWidth = lw; c.strokeStyle = 'rgba(255,255,255,0.85)'; c.stroke(path);
  c.restore();
}

// Draws the player in any mode; used by the game view and the customiser preview.
function drawPlayer(c, mode, cu, o) {
  const c1 = cu.c1, c2 = cu.c2, rot = o.rot || 0;
  c.save();
  if (mode === 'cube') { c.rotate(rot); drawIcon(c, cu.icon, c1, c2, 1); }
  else if (mode === 'ball') { c.rotate(rot); drawIcon(c, cu.icon === 'square' ? 'round' : cu.icon, c1, c2, 1); c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 0.06; c.beginPath(); c.arc(0, 0, 0.5, 0, TAU); c.stroke(); }
  else if (mode === 'robot') {
    const k = o.ground ? Math.sin(o.t * 22) * 0.12 : 0.18;
    c.fillStyle = c2; c.fillRect(-0.34, -0.5, 0.26, 0.28 + k); c.fillRect(0.08, -0.5, 0.26, 0.28 - k);
    c.save(); c.translate(0, 0.08); c.scale(0.9, 0.9); drawIcon(c, cu.icon, c1, c2, 1); c.restore();
  } else if (mode === 'ship') {
    c.rotate(o.tilt || 0);
    c.save(); c.translate(0, 0.16); drawIcon(c, cu.icon, c1, c2, 0.62, false); c.restore();
    c.fillStyle = c1; c.beginPath(); c.moveTo(-0.62, -0.1); c.lineTo(0.7, 0.0); c.lineTo(0.6, -0.26); c.lineTo(-0.5, -0.34); c.closePath(); c.fill();
    c.fillStyle = c2; c.beginPath(); c.moveTo(-0.62, -0.1); c.lineTo(-0.2, -0.05); c.lineTo(-0.1, -0.3); c.lineTo(-0.5, -0.34); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 0.05; c.stroke();
  } else if (mode === 'wave') {
    c.rotate(o.tilt || 0);
    c.globalCompositeOperation = 'lighter'; c.fillStyle = c1; c.globalAlpha = 0.35;
    c.beginPath(); c.moveTo(-0.5, 0.42); c.lineTo(0.62, 0); c.lineTo(-0.5, -0.42); c.closePath(); c.fill();
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.fillStyle = c1; c.beginPath(); c.moveTo(-0.42, 0.34); c.lineTo(0.55, 0); c.lineTo(-0.42, -0.34); c.closePath(); c.fill();
    c.fillStyle = c2; c.beginPath(); c.moveTo(-0.24, 0.16); c.lineTo(0.3, 0); c.lineTo(-0.24, -0.16); c.closePath(); c.fill();
    c.strokeStyle = '#fff'; c.lineWidth = 0.05; c.beginPath(); c.moveTo(-0.42, 0.34); c.lineTo(0.55, 0); c.lineTo(-0.42, -0.34); c.closePath(); c.stroke();
  }
  c.restore();
}

// ---- particles ----
const Particles = (() => {
  const list = [];
  let cap = 600;
  const add = p => { if (list.length < cap) list.push(p); };
  return {
    list, setCap: n => { cap = n; },
    burst(x, y, n, col, spd = 8, life = 0.6, size = 0.18, grav = 0) {
      for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = spd * (0.3 + Math.random() * 0.9); add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life * (0.6 + Math.random() * 0.6), size: size * (0.5 + Math.random()), col, g: grav, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 12 }); }
    },
    ring(x, y, col, r = 1.8, life = 0.45) { add({ x, y, vx: 0, vy: 0, life, max: life, size: r, col, ring: true, g: 0, rot: 0, vr: 0 }); },
    spark(x, y, vx, vy, col, life = 0.4, size = 0.14) { add({ x, y, vx, vy, life, max: life, size, col, g: 0, rot: 0, vr: 0 }); },
    update(dt) {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i]; p.life -= dt;
        if (p.life <= 0) { list[i] = list[list.length - 1]; list.pop(); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= p.g * dt; p.rot += p.vr * dt;
      }
    },
    draw(c, px) {
      c.globalCompositeOperation = 'lighter';
      for (const p of list) {
        const f = p.life / p.max;
        if (p.ring) { c.strokeStyle = rgba(p.col, f * 0.8); c.lineWidth = 0.12 * f + px; c.beginPath(); c.arc(p.x, p.y, p.size * (1 - f) + 0.2, 0, TAU); c.stroke(); continue; }
        c.fillStyle = rgba(p.col, Math.min(1, f * 1.4));
        const s = p.size * (0.4 + f * 0.6);
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillRect(-s / 2, -s / 2, s, s); c.restore();
      }
      c.globalCompositeOperation = 'source-over';
    },
    clear() { list.length = 0; },
  };
})();

// ---- backgrounds ----
const BG = {
  city(c, w, h, cam, t, env, P) {
    for (let i = 0; i < 60; i++) { // stars
      const x = (hash(i) * w * 1.4 - cam * 3) % (w * 1.4), y = hash(i + 99) * h * 0.65;
      c.fillStyle = `rgba(255,255,255,${0.2 + 0.5 * hash(i + 7) * (0.6 + 0.4 * Math.sin(t * 2 + i))})`; c.fillRect(((x % w) + w) % w, y, 2, 2);
    }
    for (let layer = 0; layer < 3; layer++) {
      const par = 0.12 + layer * 0.14, bw = 70 + layer * 30, base = h * (0.74 + layer * 0.04), off = cam * par;
      const i0 = Math.floor(off / bw);
      for (let i = i0 - 1; i < i0 + w / bw + 2; i++) {
        const bh = (0.18 + hash(i * 3 + layer * 17) * 0.4) * h * (1 - layer * 0.12) * (1 + 0.04 * env.kick * (layer + 1)), x = i * bw - off;
        c.fillStyle = rgba(mix([10, 0, 40], P.c1, 0.1 + layer * 0.06), 1);
        c.fillRect(x, base - bh, bw - 6, bh + h);
        c.fillStyle = rgba(layer % 2 ? P.c2 : P.c1, 0.25 + 0.3 * env.kick * (layer === 2 ? 1 : 0.3));
        for (let wy = base - bh + 10; wy < base - 10; wy += 16) for (let wx = x + 8; wx < x + bw - 16; wx += 14) if (hash(wx * 0.3 + wy + i) > 0.55) c.fillRect(wx, wy, 6, 8);
      }
    }
  },
  synth(c, w, h, cam, t, env, P) {
    const hy = h * 0.62, sr = Math.min(w, h) * 0.26, sx = w * 0.62;
    const g = c.createLinearGradient(0, hy - sr, 0, hy + sr); g.addColorStop(0, rgba([255, 230, 90], 1)); g.addColorStop(1, rgba(P.c1, 1));
    c.save(); c.beginPath(); c.arc(sx, hy, sr * (1 + 0.03 * env.kick), 0, TAU); c.clip(); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(20,0,40,.9)'; for (let i = 0; i < 7; i++) c.fillRect(sx - sr, hy + i * sr * 0.14 - sr * 0.05 + ((t * 8) % 8) * 0.0, sr * 2, 2 + i * 1.6);
    c.restore();
    for (let layer = 0; layer < 2; layer++) {
      c.fillStyle = rgba(mix([20, 0, 50], P.c2, 0.15 + layer * 0.15), 1); c.beginPath(); c.moveTo(0, h);
      const off = cam * (0.08 + layer * 0.1), step = 90;
      for (let x = -step; x < w + step * 2; x += step) { const i = Math.floor((x + off) / step); c.lineTo(x - (off % step), hy + 20 - (hash(i + layer * 31) * 0.28 + 0.06) * h * (1 - layer * 0.35)); }
      c.lineTo(w, h); c.fill();
    }
    c.strokeStyle = rgba(P.c2, 0.18 + 0.25 * env.kick); c.lineWidth = 1;
    for (let i = 0; i < 12; i++) { const y = hy + Math.pow(i / 12, 2) * (h - hy); c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    for (let i = -10; i < 22; i++) { const x = ((i * 90 - cam * 0.6) % (w + 900)); c.beginPath(); c.moveTo(w / 2 + (x - w / 2) * 0.1, hy); c.lineTo(x * 1.8 - w * 0.4, h); c.stroke(); }
  },
  storm(c, w, h, cam, t, env, P) {
    for (let layer = 0; layer < 3; layer++) {
      const off = cam * (0.05 + layer * 0.06), step = 160;
      c.fillStyle = rgba(mix([6, 16, 30], P.c1, 0.05 + layer * 0.03), 0.9);
      for (let i = Math.floor(off / step) - 1; i < Math.floor(off / step) + w / step + 2; i++) {
        const x = i * step - off, y = h * (0.12 + layer * 0.1 + hash(i + layer * 9) * 0.1);
        c.beginPath(); c.ellipse(x + 60, y, 130 + hash(i) * 40, 38 + layer * 10, 0, 0, TAU); c.fill();
      }
    }
    c.strokeStyle = rgba(P.c1, 0.28); c.lineWidth = 1; c.beginPath();
    for (let i = 0; i < 70; i++) { const x = (hash(i) * (w + 200) - t * 160 - cam * 2) % (w + 200), y = ((hash(i + 5) * h + t * 900) % h); const xx = ((x % (w + 200)) + w + 200) % (w + 200) - 100; c.moveTo(xx, y); c.lineTo(xx - 6, y + 22); }
    c.stroke();
    if (env.snare > 0.45 && env.energy > 0.5) { // lightning
      const sx = hash(Math.floor(t * 3)) * w; c.strokeStyle = rgba([255, 255, 255], env.snare); c.lineWidth = 3; c.beginPath(); c.moveTo(sx, 0);
      let x = sx, y = 0; for (let i = 0; i < 9; i++) { x += (hash(i + Math.floor(t * 8)) - 0.5) * 70; y += h * 0.1; c.lineTo(x, y); } c.stroke();
    }
  },
  bars(c, w, h, cam, t, env, P) {
    const n = Math.ceil(w / 34), base = h * 0.85;
    for (let i = 0; i < n; i++) {
      const f = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * (2 + hash(i) * 3) + i)), hgt = h * 0.55 * f * (0.35 + env.energy * 0.65 + env.kick * 0.5);
      c.fillStyle = rgba(i % 3 ? P.c1 : P.c2, 0.16 + 0.1 * env.kick); c.fillRect(i * 34 + 2, base - hgt, 28, hgt);
      c.fillStyle = rgba(P.c2, 0.5); c.fillRect(i * 34 + 2, base - hgt - 4, 28, 3);
    }
    c.strokeStyle = rgba(P.c1, 0.15 + 0.15 * env.kick); c.lineWidth = 2;
    for (let k = 0; k < 4; k++) { const r = ((t * 120 + k * 150) % 600); c.beginPath(); c.arc(w * 0.5 - (cam * 0.1 % 40), h * 0.4, r, 0, TAU); c.stroke(); }
  },
  tunnel(c, w, h, cam, t, env, P) {
    const cx = w * 0.5, cy = h * 0.45, N = 14, R = Math.hypot(w, h) * 0.7;
    for (let i = N; i >= 0; i--) {
      const f = ((i + t * 1.6 * (0.8 + env.energy)) % N) / N, r = Math.pow(f, 2.2) * R + 8, a = f * (0.7 + 0.3 * env.kick);
      c.strokeStyle = rgba(i % 2 ? P.c1 : P.c2, a * 0.55); c.lineWidth = 1 + f * 5; c.beginPath();
      for (let k = 0; k < 6; k++) { const an = k * TAU / 6 + t * 0.2; c[k ? 'lineTo' : 'moveTo'](cx + Math.cos(an) * r, cy + Math.sin(an) * r); } c.closePath(); c.stroke();
    }
    c.strokeStyle = rgba(P.c2, 0.25); c.lineWidth = 1; c.beginPath();
    for (let i = 0; i < 40; i++) { const an = hash(i) * TAU, f = ((t * (0.8 + hash(i + 3)) + hash(i + 9)) % 1); c.moveTo(cx + Math.cos(an) * R * f * 0.2, cy + Math.sin(an) * R * f * 0.2); c.lineTo(cx + Math.cos(an) * R * f, cy + Math.sin(an) * R * f); }
    c.stroke();
  },
  circuit(c, w, h, cam, t, env, P) {
    c.strokeStyle = rgba(P.c1, 0.2 + 0.2 * env.kick); c.lineWidth = 2;
    const off = cam * 0.3, st = 120;
    for (let i = Math.floor(off / st) - 1; i < off / st + w / st + 2; i++) {
      const x = i * st - off; c.beginPath();
      for (let j = 0; j < 6; j++) { const y = hash(i * 7 + j) * h; c.moveTo(x, y); c.lineTo(x + st * (0.4 + hash(i + j) * 0.5), y); c.lineTo(x + st * 0.9, y + (hash(i * 3 + j) - 0.5) * 120); }
      c.stroke(); c.fillStyle = rgba(P.c2, 0.4); c.fillRect(x - 3, hash(i * 5) * h - 3, 6, 6);
    }
    if (env.kick > 0.3) { c.fillStyle = rgba(P.c1, 0.1 * env.kick); for (let i = 0; i < 4; i++) c.fillRect(hash(Math.floor(t * 6) + i) * w, hash(i * 3 + Math.floor(t * 6)) * h, 200, 14); }
    c.strokeStyle = rgba(P.c1, 0.3 + 0.3 * env.kick); c.lineWidth = 3 + env.kick * 6; c.beginPath(); c.arc(w * 0.5, h * 0.45, h * 0.3 + env.kick * 20, 0, TAU); c.stroke();
    c.lineWidth = 1; c.beginPath(); c.arc(w * 0.5, h * 0.45, h * 0.36, t, t + 4); c.stroke();
  },
};

function drawBackground(c, theme, w, h, cam, t, env, P) {
  const g = c.createLinearGradient(0, 0, 0, h), br = 0.12 * env.kick + 0.05 * env.energy;
  g.addColorStop(0, rgba(mix(hex2rgb(theme.sky[0]), P.c1, br), 1)); g.addColorStop(1, rgba(mix(hex2rgb(theme.sky[1]), P.c2, br * 0.8), 1));
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  BG[theme.deco](c, w, h, cam, t, env, P);
}

// ---- main renderer ----
const Render = (() => {
  let cv, c, W = 0, H = 0, sc = 40, camX = 0, camY = -1.6, viewH = 12;
  const P = { c1: [255, 61, 242], c2: [39, 243, 255] };
  const st = { rot: 0, tilt: 0, trail: [], flash: 0, shake: 0, lastMode: 'cube', ceils: null, lastL: null, pulseSec: -1, bgT: 0, wasGround: true, ambT: 0 };

  function init(canvas) { cv = canvas; c = cv.getContext('2d', { alpha: false }); resize(); addEventListener('resize', resize); }
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, Save.d.settings.quality === 'low' ? 1 : 2);
    W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    st.dpr = dpr; sc = Math.min(H / viewH, W / 18);
  }
  function prepare(L) { // ceiling segments from portals
    if (st.lastL === L) return; st.lastL = L; st.ceils = [];
    const ps = L.objs.filter(o => o.k === 'portal' && o.type === 'mode').sort((a, b) => a.x - b.x);
    let cur = null;
    for (const p of ps) { if (cur) { cur.x2 = p.x; st.ceils.push(cur); cur = null; } if (p.ceil) cur = { x1: p.x, x2: L.endX + 50, y: p.ceil }; }
    if (cur) st.ceils.push(cur);
    Particles.clear(); st.trail.length = 0;
  }
  const kick = (x, y, n, col, spd, life, size, g) => { if (Save.d.settings.quality !== 'low' || n < 12) Particles.burst(x, y, n, col, spd, life, size, g); };

  function reset(L) { st.trail.length = 0; st.rot = 0; st.tilt = 0; st.flash = 0; Particles.clear(); camX = -4; camY = -1.6; }
  function addShake(a) { if (!Save.d.settings.reduceShake) st.shake = Math.max(st.shake, a); }
  function addFlash(a) { if (!Save.d.settings.reduceFlash) st.flash = Math.max(st.flash, a); }

  function deathFx(s) { const col = P.c1; kick(s.x, s.y, 36, col, 11, 0.8, 0.28, 18); kick(s.x, s.y, 20, P.c2, 7, 0.6, 0.2, 10); Particles.ring(s.x, s.y, [255, 255, 255], 3.2, 0.5); addShake(0.7); addFlash(0.5); }
  function winFx(s) { for (let i = 0; i < 80; i++) Particles.burst(s.x + 6 + Math.random() * 6, 3 + Math.random() * 6, 1, i % 2 ? P.c1 : P.c2, 9, 1.6, 0.25, 7); Particles.ring(s.x + 4, s.y, P.c2, 7, 0.9); addFlash(0.6); }

  // G: {L, s, env, t (display time), dt, dead, won, practice, cps, cu, running}
  function frame(G) {
    const { L, s, env, dt } = G, th = L.theme, cu = Save.d.cust;
    prepare(L);
    // palette follows the musical section
    const key = env.m === 'drop' ? 'drop' : env.m === 'break' ? 'brk' : 'base', tgt = th.pal[key];
    const k = Math.min(1, dt * 3);
    P.c1 = mix(P.c1, hex2rgb(tgt[0]), k); P.c2 = mix(P.c2, hex2rgb(tgt[1]), k);
    if (G.running && env.si !== st.pulseSec) { // section change
      if (st.pulseSec >= 0 && env.m === 'drop') { addShake(0.8); addFlash(0.7); kick(camX + 5, 4, 40, P.c1, 14, 1, 0.3, 4); }
      else if (st.pulseSec >= 0) { addFlash(0.25); }
      st.pulseSec = env.si;
    }
    // camera
    const viewW = W / sc, aboveH = H / sc;
    let tx = s.x - viewW * 0.3, ty;
    if (s.ceil !== Infinity) ty = (s.ceil - aboveH) / 2 + 0.2; else ty = Math.max(-1.7, s.y - aboveH * 0.62);
    if (s.ceil === Infinity && aboveH > 12.5) ty = Math.max(ty, -(aboveH - 11) * 0.5 - 1.2 + 1);
    camX += (tx - camX) * Math.min(1, dt * 14); if (G.firstFrame) camX = tx;
    camY += (ty - camY) * Math.min(1, dt * 5); if (G.firstFrame) camY = ty;
    const shk = st.shake; st.shake = Math.max(0, st.shake - dt * 2.5);
    const sx = shk > 0 ? (Math.random() - 0.5) * shk * 0.5 : 0, sy = shk > 0 ? (Math.random() - 0.5) * shk * 0.5 : 0;
    st.flash = Math.max(0, st.flash - dt * 2.2);
    st.bgT += dt;

    // player visual state
    const mode = s.mode;
    if (mode === 'cube') { if (!s.ground) st.rot += dt * 9 * -s.grav * 1; else { const q = Math.round(st.rot / (Math.PI / 2)) * Math.PI / 2; st.rot += (q - st.rot) * Math.min(1, dt * 30); } }
    else if (mode === 'ball') st.rot += dt * 9 * s.grav * -1;
    else st.rot = 0;
    const vx = L.tl.vAt(s.t);
    st.tilt += ((mode === 'wave' ? Math.atan2(s.vy, vx) : -Math.atan2(s.vy, vx * 1.6) * 0.9) - st.tilt) * Math.min(1, dt * 24);
    if (s.ground && !st.wasGround && !G.dead) kick(s.x, s.y - 0.5 * s.grav, 4, [255, 255, 255], 3, 0.3, 0.12, 6);
    st.wasGround = s.ground;
    if (st.lastMode !== mode) { st.lastMode = mode; Particles.ring(s.x, s.y, P.c2, 3, 0.5); kick(s.x, s.y, 14, P.c2, 8, 0.5, 0.18); addShake(0.3); }
    if (s.ev & 2) kick(s.x, s.y - 0.4 * s.grav, 5, P.c1, 3, 0.3, 0.14, 8);
    if (s.ev & 4) { Particles.ring(s.x, s.y, [255, 230, 90], 2.2, 0.4); G.sfx && G.sfx('orb'); }
    if (s.ev & 8) { Particles.ring(s.x, s.y - 0.5, [255, 230, 90], 2.6, 0.4); kick(s.x, s.y, 10, [255, 230, 90], 6, 0.4, 0.15); G.sfx && G.sfx('pad'); }
    if (s.ev & 16) { kick(s.x, s.y, 16, [255, 210, 40], 8, 0.7, 0.2); Particles.ring(s.x, s.y, [255, 210, 40], 3, 0.6); G.sfx && G.sfx('coin'); }
    if (s.ev & 1 && G.sfx) G.sfx('portal');
    s.ev = 0;
    // trail
    if (!G.dead && G.running) { st.trail.push({ x: s.x, y: s.y, t: G.t }); if (st.trail.length > 90) st.trail.shift(); }
    // ambient beat particles
    st.ambT -= dt;
    if (st.ambT <= 0 && Save.d.settings.quality !== 'low') { st.ambT = 0.07 / (0.4 + env.energy); Particles.spark(camX + Math.random() * viewW, camY - 1 + Math.random() * aboveH * 0.4, -1.5, 1.5 + env.energy * 2, Math.random() < 0.5 ? P.c1 : P.c2, 1.6, 0.09 + Math.random() * 0.06); }
    Particles.update(dt);

    // ---- draw ----
    const d = st.dpr;
    c.setTransform(d, 0, 0, d, 0, 0);
    drawBackground(c, th, W, H, camX * 10, st.bgT, env, { c1: P.c1, c2: P.c2 });
    c.setTransform(d * sc, 0, 0, -d * sc, d * (-(camX + sx) * sc), d * (H + (camY + sy) * sc));
    const px = 1 / sc, x0 = camX - 2, x1 = camX + viewW + 2, topY = camY + aboveH + 2;
    drawWorld(G, x0, x1, topY, px, env);
    drawTrail(G, cu, px);
    if (!G.dead) {
      const hy = mode === 'ship' || mode === 'wave' ? 0 : 0;
      c.save(); c.translate(s.x, s.y + hy);
      if (s.grav < 0 && (mode === 'cube' || mode === 'robot' || mode === 'ship')) c.scale(1, -1);
      drawPlayer(c, mode, cu, { rot: st.rot, tilt: st.tilt, ground: s.ground, t: G.t });
      c.restore();
      if (G.showHitbox) { c.strokeStyle = '#0f0'; c.lineWidth = px * 2; const hs = HS[mode], hx = mode === 'wave' ? 0.24 : 0.5; c.strokeRect(s.x - hx, s.y - hs, hx * 2, hs * 2); }
    }
    Particles.draw(c, px);
    c.setTransform(d, 0, 0, d, 0, 0);
    if (st.flash > 0) { c.fillStyle = rgba(mix(P.c1, [255, 255, 255], 0.6), st.flash * 0.35); c.fillRect(0, 0, W, H); }
    // vignette pulse
    // "ATTEMPT N" painted on the course just ahead of the start line, scrolling away as you run
    const ax = (2 - camX) * sc;
    if (G.attempt && ax > -sc * 14 && ax < W) {
      c.save(); c.font = `900 ${Math.round(sc * 1.5)}px "Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif`; c.textBaseline = 'middle'; c.lineJoin = 'round';
      c.lineWidth = sc * 0.28; c.strokeStyle = 'rgba(8,2,30,.85)'; c.fillStyle = '#fff';
      const ty = H * 0.3, t1 = `ATTEMPT ${G.attempt}`; c.strokeText(t1, ax, ty); c.fillText(t1, ax, ty);
      c.font = `800 ${Math.round(sc * 0.62)}px "Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif`; c.fillStyle = rgba(P.c2, 1);
      const t2 = L.name.toUpperCase(); c.lineWidth = sc * 0.14; c.strokeText(t2, ax + 4, ty + sc * 1.35); c.fillText(t2, ax + 4, ty + sc * 1.35);
      c.restore();
    }
    const vg = c.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    c.fillStyle = vg; c.fillRect(0, 0, W, H);
  }

  function neonLine(x1, y1, x2, y2, col, px, a = 1) {
    c.globalCompositeOperation = 'lighter'; c.strokeStyle = rgba(col, 0.22 * a); c.lineWidth = px * 9; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    c.globalCompositeOperation = 'source-over'; c.strokeStyle = rgba(mix(col, [255, 255, 255], 0.55), a); c.lineWidth = px * 2.5; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  }

  function drawWorld(G, x0, x1, topY, px, env) {
    const { L, s } = G, th = L.theme, t = G.t, bot = camY - 2, pulse = 1 + 0.07 * env.kick;
    const c1 = P.c1, c2 = P.c2, haz = hex2rgb(th.hazard), gcol = hex2rgb(th.ground);
    // collect gaps in view
    const seen = new Set(), vis = [];
    for (let k = Math.floor(x0 / 4); k <= Math.floor(x1 / 4); k++) for (const o of L.buckets[k] || []) if (!seen.has(o.id)) { seen.add(o.id); vis.push(o); }
    const gaps = vis.filter(o => o.k === 'gap').sort((a, b) => a.x1 - b.x1);
    let gx = x0;
    c.fillStyle = rgba(mix(gcol, c1, 0.1 * env.kick), 1);
    const slab = (a, b, y1, y2, edge) => {
      if (b <= a) return; c.fillStyle = rgba(mix(gcol, c1, 0.08 + 0.1 * env.kick), 1); c.fillRect(a, y1, b - a, y2 - y1);
      neonLine(a, edge, b, edge, c1, px);
      c.strokeStyle = rgba(c1, 0.12); c.lineWidth = px; c.beginPath();
      const dir = edge === 0 ? -1 : 1;
      for (let gxl = Math.floor(a); gxl < b; gxl++) { c.moveTo(gxl, edge); c.lineTo(gxl, edge + dir * 3); }
      c.stroke();
    };
    for (const g of gaps) { slab(gx, Math.min(g.x1, x1), bot, 0, 0); gx = Math.max(gx, g.x2); }
    slab(gx, x1, bot, 0, 0);
    for (const g of gaps) { c.fillStyle = rgba(haz, 0.08); c.fillRect(g.x1, bot, g.x2 - g.x1, -bot); neonLine(g.x1, 0, g.x1, bot, haz, px, 0.6); neonLine(g.x2, 0, g.x2, bot, haz, px, 0.6); }
    for (const cs of st.ceils) if (cs.x2 > x0 && cs.x1 < x1) {
      const a = Math.max(cs.x1, x0), b = Math.min(cs.x2, x1);
      c.fillStyle = rgba(mix(gcol, c1, 0.08 + 0.1 * env.kick), 1); c.fillRect(a, cs.y, b - a, topY - cs.y); neonLine(a, cs.y, b, cs.y, c1, px);
    }
    // speed gates + finish
    for (const sg of L.tl.segs) if (sg.x > x0 && sg.x < x1 && sg.t > 0) {
      const f = L.def ? Object.keys(SPEEDS).indexOf((L.speeds.find(e => Math.abs(e[0] * L.tl.spb - sg.t) < 1e-6) || [0, 'normal'])[1]) : 1;
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i <= f; i++) { c.strokeStyle = rgba(c2, 0.8); c.lineWidth = px * 4; c.beginPath(); const xx = sg.x + i * 0.45; c.moveTo(xx - 0.4, 2.4); c.lineTo(xx, 3.4); c.lineTo(xx - 0.4, 4.4); c.stroke(); }
      c.globalCompositeOperation = 'source-over';
    }
    if (L.endX > x0 && L.endX < x1 + 5) {
      for (let i = 0; i < 24; i++) { c.fillStyle = i % 2 ? '#fff' : '#111'; c.fillRect(L.endX, i * 0.5, 0.5, 0.5); c.fillStyle = i % 2 ? '#111' : '#fff'; c.fillRect(L.endX + 0.5, i * 0.5, 0.5, 0.5); }
      neonLine(L.endX, 0, L.endX, 14, c2, px); neonLine(L.endX + 1, 0, L.endX + 1, 14, c1, px);
    }
    for (const cp of G.cps || []) { // practice checkpoints
      c.save(); c.translate(cp.x, 0.6); c.rotate(Math.PI / 4); c.fillStyle = 'rgba(80,255,140,.85)'; c.fillRect(-0.28, -0.28, 0.56, 0.56); c.restore();
      neonLine(cp.x, 0, cp.x, 1.5, [80, 255, 140], px, 0.7);
    }
    // objects
    for (const o of vis) {
      switch (o.k) {
        case 'block': {
          const dy = (o.move || o.fall) ? blockDY(o, t) : 0, y1 = o.y1 + dy, y2 = o.y2 + dy, w = o.x2 - o.x1, h = y2 - y1;
          c.fillStyle = rgba(mix(gcol, c1, 0.18), 1); c.fillRect(o.x1, y1, w, h);
          c.fillStyle = rgba(c1, 0.12 + 0.12 * env.kick); c.fillRect(o.x1 + 0.08, y1 + 0.08, w - 0.16, h - 0.16);
          c.strokeStyle = rgba(c1, 0.35); c.lineWidth = px; c.beginPath();
          for (let gx2 = Math.ceil(o.x1); gx2 < o.x2; gx2++) { c.moveTo(gx2, y1); c.lineTo(gx2, y2); }
          for (let gy = Math.ceil(y1); gy < y2; gy++) { c.moveTo(o.x1, gy); c.lineTo(o.x2, gy); } c.stroke();
          c.globalCompositeOperation = 'lighter'; c.strokeStyle = rgba(c1, 0.3); c.lineWidth = px * 8; c.strokeRect(o.x1, y1, w, h);
          c.globalCompositeOperation = 'source-over'; c.strokeStyle = rgba(mix(c1, [255, 255, 255], 0.6), 1); c.lineWidth = px * 2.5; c.strokeRect(o.x1, y1, w, h);
          break;
        }
        case 'spike': {
          const sp = popScale(o, t), dy = o.move ? blockDY(o, t) : 0, oy = o.y + dy, f = o.flip ? -1 : 1, hh = 0.5 * Math.max(sp, 0.18) * pulse;
          c.save(); c.translate(o.x, oy); c.scale(1, f);
          c.fillStyle = rgba(mix(haz, [0, 0, 0], 0.65), 1); c.beginPath(); c.moveTo(-0.4, 0); c.lineTo(0, hh * 1.0); c.lineTo(0.4, 0); c.closePath(); c.fill();
          c.globalCompositeOperation = 'lighter'; c.strokeStyle = rgba(haz, 0.35); c.lineWidth = px * 8; c.stroke();
          c.globalCompositeOperation = 'source-over'; c.strokeStyle = rgba(mix(haz, [255, 255, 255], 0.5), sp < 1 ? 0.5 : 1); c.lineWidth = px * 2.5; c.stroke();
          c.restore();
          break;
        }
        case 'saw': {
          const dy = o.move ? blockDY(o, t) : 0, r = o.r * (1 + 0.05 * env.kick), n = 10;
          c.save(); c.translate(o.x, o.y + dy); c.rotate(t * 7 * (o.x % 2 > 1 ? -1 : 1));
          c.beginPath(); for (let i = 0; i < n * 2; i++) { const a = i * Math.PI / n, rr = i % 2 ? r * 0.72 : r; c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath();
          c.fillStyle = rgba(mix(haz, [0, 0, 0], 0.7), 1); c.fill();
          c.globalCompositeOperation = 'lighter'; c.strokeStyle = rgba(haz, 0.35); c.lineWidth = px * 9; c.stroke();
          c.globalCompositeOperation = 'source-over'; c.strokeStyle = rgba(mix(haz, [255, 255, 255], 0.5), 1); c.lineWidth = px * 2.5; c.stroke();
          c.beginPath(); c.arc(0, 0, r * 0.22, 0, TAU); c.fillStyle = rgba(haz, 1); c.fill();
          c.restore();
          break;
        }
        case 'tunnel': {
          const pts = o.pts, top = 40;
          c.beginPath(); c.moveTo(pts[0][0], pts[0][1] + pts[0][2] / 2); for (const p of pts) c.lineTo(p[0], p[1] + p[2] / 2); c.lineTo(pts[pts.length - 1][0], top); c.lineTo(pts[0][0], top); c.closePath();
          c.fillStyle = rgba(mix(gcol, c1, 0.15), 1); c.fill();
          c.beginPath(); c.moveTo(pts[0][0], pts[0][1] - pts[0][2] / 2); for (const p of pts) c.lineTo(p[0], p[1] - p[2] / 2); c.lineTo(pts[pts.length - 1][0], -10); c.lineTo(pts[0][0], -10); c.closePath(); c.fill();
          for (const sgn of [1, -1]) {
            c.beginPath(); pts.forEach((p, i) => c[i ? 'lineTo' : 'moveTo'](p[0], p[1] + sgn * p[2] / 2));
            c.globalCompositeOperation = 'lighter'; c.strokeStyle = rgba(c1, 0.3); c.lineWidth = px * 9; c.stroke();
            c.globalCompositeOperation = 'source-over'; c.strokeStyle = rgba(mix(c1, [255, 255, 255], 0.6), 1); c.lineWidth = px * 2.5; c.stroke();
          }
          break;
        }
        case 'pad': {
          const col = o.c === 'Y' ? [255, 225, 70] : [255, 90, 200], y = o.y, f = o.flip ? -1 : 1;
          c.save(); c.translate(o.x, y); c.scale(1, f);
          c.fillStyle = rgba(col, 1); c.beginPath(); c.moveTo(-0.5, 0); c.lineTo(-0.35, 0.22 * pulse); c.lineTo(0.35, 0.22 * pulse); c.lineTo(0.5, 0); c.closePath(); c.fill();
          c.globalCompositeOperation = 'lighter'; c.fillStyle = rgba(col, 0.25); c.beginPath(); c.arc(0, 0.1, 0.8 + 0.1 * env.kick, 0, TAU); c.fill(); c.restore(); c.globalCompositeOperation = 'source-over';
          break;
        }
        case 'orb': {
          const col = o.c === 'Y' ? [255, 225, 70] : o.c === 'P' ? [255, 90, 200] : [70, 170, 255], r = 0.42 * (1 + 0.12 * env.kick);
          c.globalCompositeOperation = 'lighter'; c.fillStyle = rgba(col, 0.2); c.beginPath(); c.arc(o.x, o.y, r * 2.2, 0, TAU); c.fill(); c.globalCompositeOperation = 'source-over';
          c.fillStyle = rgba(col, 1); c.beginPath(); c.arc(o.x, o.y, r, 0, TAU); c.fill();
          c.strokeStyle = rgba(col, 0.9); c.lineWidth = px * 2.5; c.beginPath(); c.arc(o.x, o.y, r * 1.5 + 0.1 * Math.sin(t * 6), 0, TAU); c.stroke();
          break;
        }
        case 'coin': {
          if (G.coinMask & (1 << o.n)) break;
          const w = Math.abs(Math.cos(t * 3 + o.n)) * 0.4 + 0.1;
          c.globalCompositeOperation = 'lighter'; c.fillStyle = 'rgba(255,200,40,.25)'; c.beginPath(); c.arc(o.x, o.y, 0.9, 0, TAU); c.fill(); c.globalCompositeOperation = 'source-over';
          c.fillStyle = '#ffd23d'; c.beginPath(); c.ellipse(o.x, o.y, w, 0.42, 0, 0, TAU); c.fill(); c.strokeStyle = '#fff3b0'; c.lineWidth = px * 2.5; c.stroke();
          break;
        }
        case 'portal': {
          const col = o.type === 'mode' ? ({ cube: [80, 255, 120], ship: [255, 80, 200], ball: [255, 150, 40], wave: [60, 220, 255], robot: [210, 210, 230] })[o.v]
            : o.type === 'grav' ? (o.v < 0 ? [170, 90, 255] : [255, 230, 70]) : [255, 140, 40];
          const cy = o.type === 'tele' ? 3.5 : (o.ceil ? o.ceil / 2 : 3.2), hh = o.ceil ? Math.min(o.ceil / 2 + 0.3, 5.5) : 3.4;
          c.save(); c.translate(o.x, cy);
          c.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 3; i++) { c.strokeStyle = rgba(col, 0.2 + 0.2 * (1 - i / 3)); c.lineWidth = px * (14 - i * 4); c.beginPath(); c.ellipse(0, 0, 0.55 + i * 0.05 + 0.1 * env.kick, hh, 0, 0, TAU); c.stroke(); }
          c.globalCompositeOperation = 'source-over'; c.strokeStyle = rgba(mix(col, [255, 255, 255], 0.5), 1); c.lineWidth = px * 3; c.beginPath(); c.ellipse(0, 0, 0.55, hh, 0, 0, TAU); c.stroke();
          c.fillStyle = rgba(col, 0.9); c.font = 'bold 0.5px sans-serif';
          if (o.type === 'grav') { c.beginPath(); const d = o.v < 0 ? 1 : -1; c.moveTo(-0.2, -0.2 * d); c.lineTo(0, 0.25 * d); c.lineTo(0.2, -0.2 * d); c.closePath(); c.fill(); }
          c.restore();
          if (o.type === 'tele') { c.strokeStyle = rgba([255, 140, 40], 1); c.lineWidth = px * 3; c.beginPath(); c.ellipse(o.x + 1.2, o.ty, 0.5, 1.2, 0, 0, TAU); c.stroke(); }
          break;
        }
      }
    }
  }

  function drawTrail(G, cu, px) {
    const tr = st.trail, s = G.s;
    if (tr.length < 2) return;
    const c1 = hex2rgb(cu.c1), c2 = hex2rgb(cu.c2);
    const style = s.mode === 'wave' ? 'wave' : cu.trail;
    if (style === 'none') return;
    c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.lineJoin = 'round';
    if (style === 'wave') {
      c.strokeStyle = rgba(c1, 0.35); c.lineWidth = 0.5; c.beginPath(); tr.forEach((p, i) => c[i ? 'lineTo' : 'moveTo'](p.x, p.y)); c.stroke();
      c.strokeStyle = rgba(mix(c1, [255, 255, 255], 0.7), 0.95); c.lineWidth = 0.2; c.stroke();
    } else if (style === 'line' || style === 'comet' || style === 'rainbow') {
      for (let i = 1; i < tr.length; i++) {
        const f = i / tr.length, a = tr[i - 1], b = tr[i];
        c.strokeStyle = style === 'rainbow' ? `hsla(${(b.t * 220 + i * 3) % 360},100%,60%,${f * 0.8})` : rgba(style === 'comet' ? mix(c2, c1, f) : c1, f * 0.7);
        c.lineWidth = (style === 'comet' ? 0.7 : 0.4) * f + 0.05; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
      }
    } else if (style === 'sparks' || style === 'pixel') {
      for (let i = 0; i < tr.length; i += 3) {
        const f = i / tr.length, p = tr[i], j = Math.sin(p.t * 40 + i) * 0.25;
        c.fillStyle = rgba(i % 6 ? c1 : c2, f * 0.9);
        const sz = style === 'pixel' ? 0.22 * f + 0.05 : 0.1 * f + 0.03;
        c.fillRect(p.x - sz / 2, p.y + j - sz / 2, sz, sz);
      }
    }
    c.globalCompositeOperation = 'source-over'; c.lineCap = 'butt';
  }

  // static themed picture for level-select cards and previews
  function drawThemeCard(canvas, themeKey, t = 0) {
    const th = THEMES[themeKey], g = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    const pal = { c1: hex2rgb(th.pal.base[0]), c2: hex2rgb(th.pal.base[1]) };
    const env = { kick: 0.4 + 0.4 * Math.sin(t * 4) ** 2, snare: 0, energy: 0.7, m: 'drop' };
    drawBackground(g, th, w, h, t * 120, t, env, pal);
    g.fillStyle = rgba(hex2rgb(th.ground), 1); g.fillRect(0, h * 0.82, w, h);
    g.strokeStyle = rgba(pal.c1, 1); g.lineWidth = 2; g.beginPath(); g.moveTo(0, h * 0.82); g.lineTo(w, h * 0.82); g.stroke();
    const hz = hex2rgb(th.hazard); g.fillStyle = rgba(hz, 1);
    for (let i = 0; i < 3; i++) { const x = w * (0.3 + i * 0.22); g.beginPath(); g.moveTo(x - 8, h * 0.82); g.lineTo(x, h * 0.82 - 16); g.lineTo(x + 8, h * 0.82); g.fill(); }
  }
  function menuFrame(themeKey, env, t, dt) {
    const th = THEMES[themeKey], tgt = th.pal.base, k = Math.min(1, dt * 3), d = st.dpr;
    P.c1 = mix(P.c1, hex2rgb(env.m === 'drop' ? th.pal.drop[0] : tgt[0]), k); P.c2 = mix(P.c2, hex2rgb(env.m === 'drop' ? th.pal.drop[1] : tgt[1]), k);
    c.setTransform(d, 0, 0, d, 0, 0);
    drawBackground(c, th, W, H, t * 140, t, env, { c1: P.c1, c2: P.c2 });
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(0, 0, W, H);
    // a cube hopping along a floor of spikes, one hop per second
    const gy = H * 0.9, cu = Save.d.cust, ph = t % 1, cx = W * 0.2, u = Math.max(30, Math.min(54, H * 0.06)), gap = u * 5.5;
    c.fillStyle = 'rgba(10,3,40,.92)'; c.fillRect(0, gy, W, H - gy);
    c.strokeStyle = rgba(P.c1, 1); c.lineWidth = 3; c.beginPath(); c.moveTo(0, gy); c.lineTo(W, gy); c.stroke();
    c.fillStyle = rgba(hex2rgb(th.hazard), 1); c.strokeStyle = '#fff'; c.lineWidth = 2;
    for (let m = -4; m < W / gap + 2; m++) { const x = cx + gap * (0.5 - ph) + gap * m; c.beginPath(); c.moveTo(x - u * 0.45, gy); c.lineTo(x, gy - u * 0.9); c.lineTo(x + u * 0.45, gy); c.closePath(); c.fill(); c.stroke(); }
    c.save(); c.translate(cx, gy - u * 0.5 - 4 * ph * (1 - ph) * u * 2.2); c.rotate(ph * Math.PI); drawIcon(c, cu.icon, cu.c1, cu.c2, u); c.restore();
  }
  const setViewH = v => { viewH = v; resize(); };
  return { init, resize, frame, menuFrame, reset, deathFx, winFx, addShake, addFlash, drawThemeCard, P, st, setViewH, get size() { return { W, H, sc, viewH }; }, get cam() { return { x: camX, y: camY }; } };
})();

// ---- js/game.js ----
// Play session: owns the simulation state, the audio-locked clock, input, practice checkpoints and results.
// The sim is driven by the audio clock: each frame it steps to the song's current position, so music and
// obstacles cannot drift. Input is timestamped on that same clock and applied at the right physics step.

const Game = (() => {
  const G = {
    L: null, s: null, mode: 'idle', practice: false, cps: [], clock: 0, firstFrame: true, showHitbox: false,
    q: [], hold: false, press: false, wall: 0, deadT: 0, attempt: 0, runStart: 0, runCoins: 0,
    env: { kick: 0, snare: 0, energy: 0.5, si: 0, m: 'verse' }, autoCP: false, lastCP: 0, winT: 0, endInfo: null,
  };
  const volume = () => 1;
  G.sfx = n => AudioSys.sfx(n);

  G.load = (L, practice = false) => {
    G.L = L; G.practice = practice; G.cps = []; G.attempt = 0;
    Render.setViewH(12);
    G.begin(true);
  };

  function audioStart(from) {
    const L = G.L;
    AudioSys.play(L.song, from);
  }

  // Begin an attempt (from start, or from the last checkpoint in practice)
  G.begin = (fresh = false) => {
    const L = G.L, cp = G.practice && G.cps.length ? G.cps[G.cps.length - 1] : null;
    G.s = cp ? cloneState(cp.state) : newState(L);
    G.s.dead = false; G.s.won = false;
    G.q.length = 0; G.hold = Input.down(); G.press = false;
    G.mode = 'play'; G.deadT = 0; G.winT = 0; G.runStart = G.s.x;
    AudioSys.setVolumes(Save.d.settings.music, Save.d.settings.sfx); AudioSys.setOffset(Save.d.settings.offset);
    audioStart(G.s.t);
    G.clock = G.s.t - 0.1; G.wall = performance.now();
    G.attempt++;
    const lv = Save.lv(L.id);
    if (G.practice) { Save.d.stats.practiceAttempts++; lv.practiceAttempts = (lv.practiceAttempts || 0) + 1; } else { Save.d.stats.attempts++; lv.attempts++; }
    Render.reset(L); if (fresh || !cp) G.firstFrame = true;
    UI.hudShow(G);
  };

  G.restart = () => { if (G.mode === 'win' || G.mode === 'idle') G.cps.length = 0; G.begin(); };
  G.fullRestart = () => { G.cps.length = 0; G.begin(true); };
  G.pause = () => {
    if (G.mode !== 'play' && G.mode !== 'dead') return;
    if (G.mode === 'dead') { UI.pauseShow(G); G.mode = 'pausedDead'; return; }
    AudioSys.stop(0.03); G.mode = 'pause'; UI.pauseShow(G);
  };
  G.resume = () => {
    if (G.mode === 'pausedDead') { G.mode = 'dead'; UI.pauseHide(); return; }
    if (G.mode !== 'pause') return;
    UI.pauseHide(); G.mode = 'countdown'; G.cd = 1.2;
  };
  G.exit = () => { AudioSys.stop(0.15); G.mode = 'idle'; Particles.clear(); UI.hudHide(); };

  G.checkpoint = () => {
    if (!G.practice || G.mode !== 'play') return;
    G.cps.push({ x: G.s.x, state: cloneState(G.s) }); AudioSys.sfx('check'); UI.hudPractice(G);
  };
  G.removeCheckpoint = () => { if (G.practice && G.cps.length) { G.cps.pop(); AudioSys.sfx('tick'); UI.hudPractice(G); } };

  // ---- input ----
  G.input = down => {
    AudioSys.init();
    const t = G.clock + (performance.now() - G.wall) / 1000;
    if (G.mode === 'play') { G.q.push({ t, down }); }
    else if (G.mode === 'dead' && down && G.deadT > 0.2) G.restart();
    else if (G.mode === 'countdown' && down) { /* ignore */ }
  };

  function pct() { return Math.max(0, Math.min(100, (G.s.x / G.L.endX) * 100)); }

  function die() {
    const s = G.s, L = G.L;
    G.mode = 'dead'; G.deadT = 0; AudioSys.stop(0.1); AudioSys.sfx('death'); Render.deathFx(s);
    const p = pct();
    Save.d.stats.deaths++; Save.d.stats.jumps += s.jumps;
    G.runCoins = s.coins;
    const lv = Save.lv(L.id);
    if (G.practice) lv.practiceBest = Math.max(lv.practiceBest || 0, p);
    else lv.best = Math.max(lv.best, Math.floor(p));
    Save.flush(); UI.deadShow(G, p);
    for (const a of Save.check()) UI.toast(a);
  }

  function win() {
    const s = G.s, L = G.L;
    G.mode = 'win'; G.winT = 0; AudioSys.sfx('complete'); Render.winFx(s);
    Save.d.stats.jumps += s.jumps;
    let newCoins = 0;
    const lv = Save.lv(L.id);
    if (G.practice) { Save.d.stats.practiceWins++; lv.practiceBest = 100; }
    else {
      Save.d.stats.completions++; lv.done = true; lv.best = 100;
      newCoins = bits(s.coins & ~(lv.coins || 0)); lv.coins = (lv.coins || 0) | s.coins;
    }
    Save.flush();
    UI.winShow(G, { coins: s.coins, newCoins, attempts: G.attempt, time: s.t });
    for (const a of Save.check()) UI.toast(a);
    G.winVx = L.tl.vAt(s.t);
  }

  G.update = dt => {
    const L = G.L, s = G.s;
    Save.d.stats.playMs += dt * 1000;
    if (G.mode === 'countdown') {
      G.cd -= dt; UI.countdown(Math.ceil(G.cd * 2.5));
      if (G.cd <= 0) { UI.countdown(0); audioStart(s.t); G.clock = s.t - 0.1; G.wall = performance.now(); G.mode = 'play'; G.q.length = 0; G.hold = Input.down(); }
    } else if (G.mode === 'play') {
      // blocked/suspended audio (no user gesture yet): fall back to a free-running clock instead of freezing
      const aud = AudioSys.playing() && AudioSys.running() ? AudioSys.time() : G.clock + dt;
      G.clock += dt;
      const err = aud - G.clock;
      if (Math.abs(err) > 0.06) G.clock = aud; else G.clock += err * 0.12; // phase-lock to the audio clock
      G.wall = performance.now();
      let n = 0;
      while (s.t + PHYS.STEP <= G.clock && !s.dead && !s.won && n++ < 160) {
        let press = false;
        while (G.q.length && G.q[0].t <= s.t + PHYS.STEP) { const e = G.q.shift(); if (e.down && !G.hold) press = true; G.hold = e.down; }
        step(L, s, G.hold, press);
      }
      if (s.dead) die();
      else if (s.won) win();
      else if (G.autoCP && G.practice && s.ground && s.t - G.lastCP > 2.5 && s.mode === 'cube') { G.lastCP = s.t; G.checkpoint(); }
      UI.hudUpdate(pct(), G);
    } else if (G.mode === 'dead') {
      G.deadT += dt;
      if (G.deadT > (G.practice ? 0.55 : 0.9) && !Input.down()) G.restart();
      else if (G.deadT > 1.6) G.restart();
    } else if (G.mode === 'win') {
      G.winT += dt; G.clock += dt; s.t += dt; s.x += G.winVx * dt * 1.2; s.y += dt * 4; s.vy = 4; s.grav = 1;
    }
  };

  G.view = dt => {
    const L = G.L, s = G.s;
    const live = G.mode === 'play' || G.mode === 'win';
    const t = G.mode === 'win' ? (AudioSys.playing() ? AudioSys.time() : G.clock) : (live ? G.clock : s.t);
    G.env = musicEnv(L.song, t, L.bpm, false);
    G.t = t; G.dt = dt; G.dead = G.mode === 'dead' || G.mode === 'pausedDead'; G.running = G.mode === 'play' || G.mode === 'win' || G.mode === 'countdown';
    G.coinMask = s.coins | (G.mode === 'dead' ? 0 : 0);
    Render.frame(G);
    G.firstFrame = false;
  };
  G.pct = pct;
  return G;
})();

// ---- input wiring ----
const Input = (() => {
  const keys = new Set();
  let pointer = false;
  const isJump = k => k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W';
  const down = () => keys.size > 0 || pointer;
  addEventListener('keydown', e => {
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (isJump(e.key)) { e.preventDefault(); if (!e.repeat) { const was = down(); keys.add(e.key); if (!was) Game.input(true); } }
    else if (e.key === 'Escape') { UI.escape(); }
    else if ((e.key === 'm' || e.key === 'M') && !e.repeat) UI.toggleMute();
    else if ((e.key === 'r' || e.key === 'R') && !e.repeat && ['play', 'dead'].includes(Game.mode)) Game.restart();
    else if ((e.key === 'z' || e.key === 'Z') && !e.repeat) Game.checkpoint();
    else if ((e.key === 'x' || e.key === 'X') && !e.repeat) Game.removeCheckpoint();
  });
  addEventListener('keyup', e => { if (keys.delete(e.key) && !down()) Game.input(false); });
  const cv = document.getElementById('game');
  cv.addEventListener('pointerdown', e => { e.preventDefault(); const was = down(); pointer = true; if (!was) Game.input(true); });
  addEventListener('pointerup', () => { if (pointer) { pointer = false; if (!down()) Game.input(false); } });
  addEventListener('blur', () => { keys.clear(); pointer = false; if (Game.mode === 'play') Game.pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && Game.mode === 'play') Game.pause(); });
  return { down };
})();

// ---- js/ui.js ----
// DOM UI: menus, level select, customiser, settings, stats, HUD, pause/death/win overlays.

const UI = (() => {
  const $ = id => document.getElementById(id);
  const scr = $('screens');
  const DIFF_COL = { Easy: '#7dff4d', Normal: '#27f3ff', Hard: '#ffd23d', Harder: '#ff9f1c', Insane: '#ff3df2', Extreme: '#ff3b3b', Custom: '#b0a0ff' };
  const MENU = { bpm: 100, song: { style: 'synth', scale: 'minor', root: 57, seed: 7, prog: [0, 5, 3, 4], busy: 0.2 }, sections: [{ m: 'intro', bars: 2 }, { m: 'verse', bars: 4 }, { m: 'drop', bars: 4 }, { m: 'break', bars: 2 }] };
  let menuSong = null, menuOn = false, cur = 'main', t = 0, levelCache = {}, custTab = 'cube', prevT = 0, cal = null;
  const getLevel = i => levelCache[LEVELS[i].id] || (levelCache[LEVELS[i].id] = buildLevel(LEVELS[i]));
  // ---------- icons (inline SVG, currentColor) ----------
  const svg = b => `<svg class="ic" viewBox="0 0 24 24">${b}</svg>`;
  const I = {
    play: svg('<path d="M7 4.5v15l13-7.5z"/>'),
    pause: svg('<rect x="6" y="4.5" width="4.2" height="15" rx="1.2"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.2"/>'),
    retry: svg('<path d="M12 4a8 8 0 1 0 7.6 10.5h-2.3A5.8 5.8 0 1 1 12 6.2c1.5 0 2.9.6 3.9 1.5L13 10.6h7V3.6l-2.4 2.4A8 8 0 0 0 12 4z"/>'),
    levels: svg('<rect x="4" y="4" width="7" height="7" rx="1.6"/><rect x="13" y="4" width="7" height="7" rx="1.6"/><rect x="4" y="13" width="7" height="7" rx="1.6"/><rect x="13" y="13" width="7" height="7" rx="1.6"/>'),
    gear: svg('<circle cx="12" cy="12" r="5.4" fill="none" stroke="currentColor" stroke-width="3.2"/><circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="3.3 3.34"/>'),
    cube: svg('<rect x="4" y="4" width="16" height="16" rx="3.2"/><rect x="8.4" y="8.4" width="7.2" height="7.2" rx="1.2" fill="#000" opacity=".35"/>'),
    bars: svg('<rect x="4" y="12" width="4.6" height="8" rx="1.3"/><rect x="9.7" y="5.5" width="4.6" height="14.5" rx="1.3"/><rect x="15.4" y="9" width="4.6" height="11" rx="1.3"/>'),
    back: svg('<path d="M14.6 4.4 7 12l7.6 7.6 2.3-2.3L11.6 12l5.3-5.3z"/>'),
    lock: svg('<path d="M7 10V8a5 5 0 0 1 10 0v2h1.5A1.5 1.5 0 0 1 20 11.5v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5v-8A1.5 1.5 0 0 1 5.5 10zm2.3 0h5.4V8a2.7 2.7 0 0 0-5.4 0z"/>'),
    star: svg('<path d="M12 2.4l2.9 6.3 6.8.8-5.1 4.6 1.4 6.7-6-3.4-6 3.4 1.4-6.7L2.3 9.5l6.8-.8z"/>'),
    sound: svg('<path d="M4 9.5v5h3.6l4.9 4V5.5l-4.9 4z"/><path d="M15.5 8.6a4.6 4.6 0 0 1 0 6.8M17.8 6.3a8 8 0 0 1 0 11.4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>'),
    mute: svg('<path d="M4 9.5v5h3.6l4.9 4V5.5l-4.9 4z"/><path d="M15.5 9.5l5 5m0-5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
    trophy: svg('<path d="M7 3h10v2.4h3V8a4 4 0 0 1-3.5 4A5 5 0 0 1 13 14.8V17h3v3H8v-3h3v-2.2A5 5 0 0 1 7.5 12 4 4 0 0 1 4 8V5.4h3zM6 7.6V8a1.9 1.9 0 0 0 1 1.6V7.6zm11 0v2A1.9 1.9 0 0 0 18 8v-.4z"/>'),
  };
  const logoLine = word => `<div class="logo-line">${[...word].map((c, i) => `<span style="animation-delay:${i * 0.12}s">${c}</span>`).join('')}</div>`;

  const fmtT = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  function menuMusic() {
    if (menuOn) return;
    if (!menuSong) menuSong = prepareSong(MENU.song, MENU.sections, MENU.bpm);
    AudioSys.init(); AudioSys.setVolumes(Save.d.settings.music, Save.d.settings.sfx); AudioSys.setOffset(Save.d.settings.offset);
    AudioSys.play(menuSong, 0, { loop: true, volume: 0.75 }); menuOn = true;
  }
  const wake = () => { AudioSys.init(); if (['main', 'levels', 'custom', 'settings', 'stats'].includes(cur) && Game.mode === 'idle') menuMusic(); };
  addEventListener('keydown', e => {
    if (cur !== 'levels' || Game.mode !== 'idle') return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { selIdx = (selIdx + (e.key === 'ArrowRight' ? 1 : -1) + LEVELS.length) % LEVELS.length; levels(); }
    else if ((e.key === 'Enter') && Save.unlocked(selIdx)) startLevel(selIdx, false);
  });
  addEventListener('pointerdown', wake, true);
  addEventListener('keydown', wake, true);

  function show(name) {
    cur = name; $('hud').classList.add('hidden'); $('pause').classList.add('hidden'); $('win').classList.add('hidden');
    scr.innerHTML = '';
    if (name === 'none') return;
    ({ main, levels, custom, settings, stats })[name]();
    if (Game.mode === 'idle' && AudioSys.playing() === false) menuOn = false;
    if (Game.mode === 'idle') menuMusic();
  }
  const back = (to = 'main') => `<button class="back dark" data-act="go" data-to="${to}">${I.back} Back</button>`;

  // ---------- main ----------
  function main() {
    scr.innerHTML = `<div class="screen center">
      <div class="logo">${logoLine('NEON')}${logoLine('PULSE')}</div>
      <div class="logo-sub">RHYTHM PLATFORMER</div>
      <div class="menu-main">
        <button class="side dark" data-act="go" data-to="custom" title="Customize">${I.cube}<small>ICONS</small></button>
        <button class="play-big" data-act="go" data-to="levels" aria-label="Play">${I.play}</button>
        <button class="side dark" data-act="go" data-to="stats" title="Stats">${I.bars}<small>STATS</small></button>
      </div>
      <div class="menu-bottom"><button class="round sm dark" data-act="go" data-to="settings" title="Settings" aria-label="Settings">${I.gear}</button></div>
      <div class="tap-hint">Jump: Space / ↑ / W / click / tap &nbsp;·&nbsp; Esc pause &nbsp;·&nbsp; R restart &nbsp;·&nbsp; M mute</div></div>`;
  }

  // ---------- levels (one big card at a time) ----------
  let selIdx = 0;
  function levels() {
    const d = Save.d, def = LEVELS[selIdx], lv = d.levels[def.id] || {}, ok = Save.unlocked(selIdx), col = DIFF_COL[def.diff];
    const bar = (cls, label, v) => `<div class="bar ${cls}"><i style="width:${v}%"></i><b><span>${label}</span><span>${Math.floor(v)}%</span></b></div>`;
    scr.innerHTML = `<div class="screen">${back()}<div class="title-bar"><h2 class="stroke">SELECT LEVEL</h2></div>
      <div class="car"><button class="arrow dark" data-act="nav" data-d="-1" aria-label="Previous">${I.back}</button>
        <div class="lvcard" style="--ac:${col}"><canvas width="760" height="220" data-theme="${def.theme}"></canvas>
          <div class="lvbody"><div class="lvname stroke">${selIdx + 1}. ${def.name}</div>
            <div class="badge-row"><span class="diff" style="--dc:${col};color:${col}"><span class="gem">${I.star}</span>${def.diff}</span><span class="stars-n">${I.star} ${def.stars}</span>${lv.done ? '<span class="done-badge">COMPLETE</span>' : ''}</div>
            <div class="music">♪ ${def.music} &nbsp;·&nbsp; ${def.bpm} BPM</div>
            <div class="bars">${bar('', 'NORMAL', lv.best || 0)}${bar('prac', 'PRACTICE', lv.practiceBest || 0)}</div>
            <div class="coin-row">${[0, 1, 2].map(n => `<span class="coin ${(lv.coins || 0) & (1 << n) ? '' : 'off'}"></span>`).join('')}</div>
            <div class="lv-btns"><button class="primary big" data-act="play" data-i="${selIdx}">${I.play} Play</button><button class="big dark" data-act="practice" data-i="${selIdx}">Practice</button></div></div>
          ${ok ? '' : `<div class="lock">${I.lock}Complete<br>${esc(LEVELS[selIdx - 1].name)}<br>to unlock</div>`}</div>
        <button class="arrow dark flip" data-act="nav" data-d="1" aria-label="Next">${I.back}</button></div>
      <div class="dots">${LEVELS.map((_, i) => `<i class="${i === selIdx ? 'on' : ''}" data-act="sel" data-i="${i}"></i>`).join('')}</div></div>`;
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function startLevel(i, practice) {
    AudioSys.init(); menuOn = false; scr.innerHTML = ''; cur = 'none';
    Game.load(getLevel(i), practice);
  }
  // ---------- customise ----------
  function custom() {
    const c = Save.d.cust;
    const icons = ICONS.map(ic => { const ok = Save.iconOk(ic.id); return `<div class="pick ${c.icon === ic.id ? 'on' : ''} ${ok ? '' : 'locked'}" data-act="icon" data-id="${ic.id}" title="${ok ? ic.name : ic.hint}"><canvas width="108" height="108" data-icon="${ic.id}"></canvas>${ok ? ic.name : '🔒 ' + ic.hint}</div>`; }).join('');
    const trails = TRAILS.map(tr => { const ok = Save.trailOk(tr.id); return `<div class="pick ${c.trail === tr.id ? 'on' : ''} ${ok ? '' : 'locked'}" data-act="trail" data-id="${tr.id}" title="${ok ? tr.name : tr.hint}">${ok ? tr.name : '🔒 ' + tr.hint}</div>`; }).join('');
    const sw = k => SWATCHES.map(s => `<div class="sw ${c[k] === s ? 'on' : ''}" style="background:${s}" data-act="color" data-k="${k}" data-c="${s}"></div>`).join('') + `<input type="color" value="${c[k]}" data-act="colorpick" data-k="${k}">`;
    scr.innerHTML = `<div class="screen">${back()}<div class="title-bar"><h2 class="stroke">CUSTOMIZE</h2></div><div class="cust-wrap">
      <div><canvas id="cust-prev" width="560" height="440"></canvas><div class="tabs">${['cube', 'ship', 'ball', 'wave', 'robot'].map(m => `<button class="${m === custTab ? 'on' : ''}" data-act="tab" data-m="${m}">${m}</button>`).join('')}</div></div>
      <div><div class="panel"><h3>ICON</h3><div class="grid-pick">${icons}</div></div>
        <div class="panel"><h3>PRIMARY COLOR</h3><div class="swatches">${sw('c1')}</div><h3 style="margin-top:14px">SECONDARY COLOR</h3><div class="swatches">${sw('c2')}</div></div>
        <div class="panel"><h3>TRAIL</h3><div class="grid-pick">${trails}</div></div></div></div></div>`;
    scr.querySelectorAll('canvas[data-icon]').forEach(cv => { const g = cv.getContext('2d'); g.translate(54, 54); drawIcon(g, cv.dataset.icon, c.c1, c.c2, 70); });
  }

  // ---------- settings ----------
  function settings() {
    const s = Save.d.settings;
    const sl = (k, label, min, max, step, unit) => `<div class="row"><label>${label}</label><input type="range" min="${min}" max="${max}" step="${step}" value="${s[k]}" data-act="slider" data-k="${k}"><span class="val" id="v-${k}">${unit(s[k])}</span></div>`;
    const ck = (k, label) => `<div class="row"><label class="chk"><input type="checkbox" data-act="check" data-k="${k}" ${s[k] ? 'checked' : ''}> ${label}</label></div>`;
    scr.innerHTML = `<div class="screen">${back()}<div class="title-bar"><h2 class="stroke">SETTINGS</h2></div>
      <div class="panel"><h3>AUDIO</h3>${sl('music', 'Music volume', 0, 1, 0.05, v => Math.round(v * 100) + '%')}${sl('sfx', 'Effects volume', 0, 1, 0.05, v => Math.round(v * 100) + '%')}
        ${sl('offset', 'Audio offset', -250, 250, 5, v => v + ' ms')}
        <div class="row"><span class="lbl">Calibration</span><button data-act="calibrate" id="cal-btn">Tap-along calibration</button><span id="cal-msg" style="color:var(--dim)">Positive = music arrives later than visuals.</span></div></div>
      <div class="panel"><h3>GRAPHICS &amp; ACCESSIBILITY</h3>
        <div class="row"><label>Quality</label><select data-act="quality"><option value="high" ${s.quality === 'high' ? 'selected' : ''}>High (particles, 2x sharpness)</option><option value="low" ${s.quality === 'low' ? 'selected' : ''}>Low (faster)</option></select></div>
        ${ck('mute', 'Mute all sound (shortcut: M)')}${ck('reduceFlash', 'Reduce flashing (no beat flashes)')}${ck('reduceShake', 'Reduce screen shake')}</div>
      <div class="panel"><h3>DATA</h3><div class="row"><button data-act="reset">Reset all progress</button></div></div></div>`;
  }

  // ---------- stats ----------
  function stats() {
    const d = Save.d, st = d.stats;
    const rows = LEVELS.map(def => { const l = d.levels[def.id] || {}; return `<tr><td>${def.name}</td><td>${l.best || 0}%</td><td>${l.done ? '✔' : '–'}</td><td>${bits(l.coins || 0)}/3</td><td>${l.attempts || 0}</td><td>${l.practiceAttempts || 0}</td></tr>`; }).join('');
    const ach = ACHIEVEMENTS.map(a => `<div class="ach ${d.ach[a.id] ? '' : 'off'}"><span class="tro">${d.ach[a.id] ? I.trophy : I.lock}</span><div><b>${a.name}</b><br><span style="color:var(--dim)">${a.desc}</span></div></div>`).join('');
    scr.innerHTML = `<div class="screen">${back()}<div class="title-bar"><h2 class="stroke">STATISTICS</h2></div>
      <div class="panel"><div class="stat-grid">${[['Attempts', st.attempts], ['Deaths', st.deaths], ['Jumps', st.jumps], ['Completions', st.completions], ['Practice runs', st.practiceAttempts], ['Secret coins', totalCoins(d) + '/18'], ['Play time', fmtT(st.playMs / 1000)]].map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('')}</div></div>
      <div class="panel"><h3>LEVELS</h3><table><tr><th>Level</th><th>Best</th><th>Done</th><th>Coins</th><th>Attempts</th><th>Practice</th></tr>${rows}</table></div>
      <div class="panel"><h3>ACHIEVEMENTS</h3>${ach}</div></div>`;
  }

  // ---------- delegated clicks ----------
  scr.addEventListener('click', async e => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const a = el.dataset.act, i = +el.dataset.i, s = Save.d.settings;
    AudioSys.sfx('click');
    switch (a) {
      case 'go': show(el.dataset.to); break;
      case 'nav': selIdx = (selIdx + +el.dataset.d + LEVELS.length) % LEVELS.length; levels(); break;
      case 'sel': selIdx = i; levels(); break;
      case 'play': if (Save.unlocked(i)) startLevel(i, false); break;
      case 'practice': if (Save.unlocked(i)) startLevel(i, true); break;
      case 'tab': custTab = el.dataset.m; custom(); break;
      case 'icon': if (Save.iconOk(el.dataset.id)) { Save.d.cust.icon = el.dataset.id; Save.flush(); custom(); } break;
      case 'trail': if (Save.trailOk(el.dataset.id)) { Save.d.cust.trail = el.dataset.id; Save.flush(); custom(); } break;
      case 'color': Save.d.cust[el.dataset.k] = el.dataset.c; Save.flush(); custom(); break;
      case 'calibrate': calibrate(); break;
      case 'reset': if (confirm('Erase all progress, settings and customization?')) { Save.reset(); show('main'); } break;
    }
  });
  scr.addEventListener('input', e => {
    const el = e.target, a = el.dataset.act, s = Save.d.settings;
    if (a === 'slider') {
      s[el.dataset.k] = +el.value; const v = $('v-' + el.dataset.k);
      v.textContent = el.dataset.k === 'offset' ? el.value + ' ms' : Math.round(el.value * 100) + '%';
      AudioSys.setVolumes(s.music, s.sfx); AudioSys.setOffset(s.offset); Save.flush();
    } else if (a === 'colorpick') { Save.d.cust[el.dataset.k] = el.value; Save.flush(); }
    else if (a === 'check') { if (el.dataset.k === 'mute') setMute(el.checked); else { s[el.dataset.k] = el.checked; Save.flush(); } }
    else if (a === 'quality') { s.quality = el.value; Particles.setCap(el.value === 'low' ? 150 : 600); Render.resize(); Save.flush(); }
  });
  scr.addEventListener('change', e => { if (e.target.dataset.act === 'colorpick') custom(); });

  function calibrate() {
    const bpm = 100, beats = 12; const times = AudioSys.clickTrack(bpm, beats);
    cal = { times, taps: [] }; $('cal-msg').textContent = 'Tap Space / click on every click…';
    $('cal-btn').disabled = true;
    const tap = ev => {
      if (ev.type === 'keydown' && ev.key !== ' ') return;
      const n = AudioSys.now(); cal.taps.push(n);
    };
    addEventListener('keydown', tap); addEventListener('pointerdown', tap);
    setTimeout(() => {
      removeEventListener('keydown', tap); removeEventListener('pointerdown', tap);
      const ds = cal.taps.map(tp => { const c = cal.times.reduce((b, x) => Math.abs(x - tp) < Math.abs(b - tp) ? x : b, cal.times[0]); return tp - c; }).filter(d => Math.abs(d) < 0.3);
      if (ds.length >= 4) { ds.sort((a, b) => a - b); const med = ds[ds.length >> 1]; Save.d.settings.offset = Math.max(-250, Math.min(250, Math.round(med * 1000))); Save.flush(); AudioSys.setOffset(Save.d.settings.offset); settings(); const m = $('cal-msg'); if (m) m.textContent = `Offset set to ${Save.d.settings.offset} ms.`; }
      else { $('cal-msg').textContent = 'Not enough taps - try again.'; $('cal-btn').disabled = false; }
    }, (beats * 60 / bpm + 1) * 1000);
  }

  // ---------- menu background loop ----------
  function menuBg(dt) {
    t += dt;
    let env = { kick: 0.15 + 0.1 * Math.sin(t * 2), snare: 0, energy: 0.6, m: 'verse', si: 0 };
    if (menuOn && menuSong && AudioSys.playing()) env = musicEnv(menuSong, AudioSys.time(), MENU.bpm, true);
    const th = cur === 'levels' ? 'neon' : ['neon', 'synth', 'storm', 'grav', 'hyper', 'final'][Math.floor(t / 14) % 6];
    Render.menuFrame(th, env, t, dt);
    document.documentElement.style.setProperty('--p', 1 + env.kick * 0.12);
    if ((prevT += dt) > 0.07) {
      prevT = 0;
      if (cur === 'levels') scr.querySelectorAll('canvas[data-theme]').forEach(cv => Render.drawThemeCard(cv, cv.dataset.theme, t));
      if (cur === 'custom') drawCustPreview(env);
    }
  }
  function drawCustPreview(env) {
    const cv = $('cust-prev'); if (!cv) return; const g = cv.getContext('2d'), c = Save.d.cust;
    g.clearRect(0, 0, cv.width, cv.height); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, cv.width, cv.height);
    g.strokeStyle = c.c1; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 330); g.lineTo(cv.width, 330); g.stroke();
    const bob = custTab === 'cube' || custTab === 'robot' ? Math.abs(Math.sin(t * 3)) * 70 : Math.sin(t * 2) * 20;
    const wave = custTab === 'wave';
    g.save();
    if (c.trail !== 'none' || wave) { // little trail preview
      g.globalCompositeOperation = 'lighter'; g.strokeStyle = c.c1; g.globalAlpha = 0.6; g.lineWidth = wave ? 14 : 8; g.beginPath();
      for (let i = 0; i < 40; i++) { const tt = t - i * 0.025, x = 280 - i * 6, y = 280 - (custTab === 'cube' || custTab === 'robot' ? Math.abs(Math.sin(tt * 3)) * 70 : Math.sin(tt * 2) * 20) - (wave ? Math.abs(((tt * 1.5) % 1) - 0.5) * 120 : 0); g[i ? 'lineTo' : 'moveTo'](x, y); }
      g.stroke(); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    g.translate(280, 280 - bob - (wave ? Math.abs((t * 1.5 % 1) - 0.5) * 120 : 0)); g.scale(90, -90); g.scale(1, -1);
    drawPlayer(g, custTab, c, { rot: custTab === 'cube' ? t * 4 : custTab === 'ball' ? t * 5 : 0, tilt: wave ? (((t * 1.5) % 1) < 0.5 ? -0.78 : 0.78) : Math.sin(t * 2) * 0.2, ground: Math.sin(t * 3) > 0.2, t });
    g.restore();
  }

  // ---------- HUD & overlays ----------
  function hudShow(G) {
    cur = 'none'; scr.innerHTML = ''; menuOn = false;
    $('hud').classList.remove('hidden'); $('pause').classList.add('hidden'); $('win').classList.add('hidden'); $('death-msg').classList.add('hidden');
    $('hud-name').textContent = G.L.name.toUpperCase() + (G.practice ? ' · PRACTICE' : '');
    $('hud-att').textContent = 'Attempt ' + G.attempt; hudUpdate(G.pct(), G); hudPractice(G);
    $('hud-practice').classList.toggle('hidden', !G.practice);
    document.documentElement.style.setProperty('--c1', '#' + G.L.theme.pal.base[0].slice(1)); document.documentElement.style.setProperty('--c2', G.L.theme.pal.base[1]);
  }
  const hudHide = () => { $('hud').classList.add('hidden'); $('pause').classList.add('hidden'); $('win').classList.add('hidden'); $('death-msg').classList.add('hidden'); };
  let lastPct = -1;
  function hudUpdate(p) { const r = Math.floor(p); if (r !== lastPct) { lastPct = r; $('hud-fill').style.width = p + '%'; $('hud-pct').textContent = r + '%'; } }
  function hudPractice(G) { $('cp-count').textContent = G.cps.length ? `${G.cps.length} checkpoint${G.cps.length > 1 ? 's' : ''}` : 'no checkpoint'; }
  let lastCd = -1;
  function countdown(n) { if (n === lastCd) return; lastCd = n; const e = $('countdown'); e.textContent = n > 0 ? n : ''; e.style.animation = 'none'; void e.offsetWidth; e.style.animation = ''; }
  function deadShow(G, p) {
    const m = $('death-msg'), lv = Save.lv(G.L.id);
    m.innerHTML = `<b>${Math.floor(p)}%</b><span>${G.practice ? 'Practice' : 'Best ' + lv.best + '%'} · Attempt ${G.attempt}</span>`; m.classList.remove('hidden');
    setTimeout(() => { if (Game.mode !== 'dead') m.classList.add('hidden'); }, 100);
    $('hud-att').textContent = 'Attempt ' + (G.attempt + 1);
  }
  function pauseShow(G) {
    const s = Save.d.settings, p = $('pause');
    p.innerHTML = `<div class="card panel"><h2 class="stroke">PAUSED</h2>
      <div class="pause-btns"><div class="btn-label"><button class="round dark" id="p-exit" aria-label="Levels">${I.levels}</button>LEVELS</div>
        <div class="btn-label"><button class="round lg primary" id="p-res" aria-label="Resume">${I.play}</button>RESUME</div>
        <div class="btn-label"><button class="round hot" id="p-rst" aria-label="Restart">${I.retry}</button>RESTART</div></div>
      <div class="row"><label>Music</label><input type="range" min="0" max="1" step="0.05" value="${s.music}" id="p-mus"></div>
      <div class="row"><label>Effects</label><input type="range" min="0" max="1" step="0.05" value="${s.sfx}" id="p-sfx"></div></div>`;
    p.classList.remove('hidden');
    $('p-res').onclick = () => Game.resume(); $('p-rst').onclick = () => { pauseHide(); Game.mode = 'play'; Game.fullRestart(); };
    $('p-exit').onclick = exitLevel;
    $('p-mus').oninput = e => { s.music = +e.target.value; AudioSys.setVolumes(s.music, s.sfx); Save.flush(); };
    $('p-sfx').oninput = e => { s.sfx = +e.target.value; AudioSys.setVolumes(s.music, s.sfx); Save.flush(); };
  }
  const pauseHide = () => $('pause').classList.add('hidden');
  function exitLevel() {
    Game.exit(); pauseHide(); $('win').classList.add('hidden');
    document.documentElement.style.setProperty('--c1', '#ff3df2'); document.documentElement.style.setProperty('--c2', '#27f3ff');
    show('levels');
  }
  function winShow(G, info) {
    const w = $('win'), idx = LEVELS.findIndex(l => l.id === G.L.id), next = idx >= 0 && idx < LEVELS.length - 1 && !G.practice, n = G.L.def ? G.L.def.stars : 0;
    w.innerHTML = `<div class="card panel"><div class="stars">${G.practice ? '' : I.star.repeat(Math.min(5, Math.ceil(n / 2)))}</div>
      <h2 class="stroke">${G.practice ? 'PRACTICE COMPLETE' : 'LEVEL COMPLETE!'}</h2>
      <div class="result-grid"><span>Level</span><b>${esc(G.L.name)}</b><span>Attempts</span><b>${info.attempts}</b><span>Time</span><b>${fmtT(info.time)}</b>
      <span>Coins</span><b class="coin-row" style="margin:0;font-size:1.2rem;gap:6px">${[0, 1, 2].map(k => `<span class="coin ${info.coins & (1 << k) ? '' : 'off'}"></span>`).join('')}</b><span>Jumps</span><b>${G.s.jumps}</b></div>
      ${G.practice ? '<div style="color:var(--dim)">Practice runs do not count as completions.</div>' : ''}
      <div class="win-btns"><button id="w-exit" class="dark">${I.levels} Levels</button><button id="w-rep" class="hot">${I.retry} Replay</button>${next ? `<button id="w-next" class="primary">Next ${I.play}</button>` : ''}</div></div>`;
    setTimeout(() => { if (Game.mode === 'win') w.classList.remove('hidden'); }, 1200);
    $('w-rep').onclick = () => { w.classList.add('hidden'); Game.fullRestart(); };
    $('w-exit').onclick = exitLevel;
    if (next) $('w-next').onclick = () => { w.classList.add('hidden'); Game.exit(); selIdx = idx + 1; startLevel(idx + 1, false); };
  }
  function toast(a) {
    const d = document.createElement('div'); d.className = 'toast'; d.innerHTML = `<b>🏆 ${esc(a.name)}</b>${esc(a.desc)}`;
    $('toasts').appendChild(d); setTimeout(() => d.remove(), 4200);
  }
  function escape() {
    if (['play', 'dead'].includes(Game.mode)) Game.pause();
    else if (['pause', 'pausedDead'].includes(Game.mode)) Game.resume();
    else if (Game.mode === 'win') exitLevel();
    else if (cur !== 'main' && cur !== 'none') show(cur === 'levels' || cur === 'custom' || cur === 'settings' || cur === 'stats' ? 'main' : 'main');
  }

  function setMute(m) {
    Save.d.settings.mute = m; Save.flush(); AudioSys.setMute(m);
    $('mute-btn').innerHTML = m ? I.mute : I.sound;
    const ck = document.querySelector('[data-k="mute"]'); if (ck) ck.checked = m;
  }
  const toggleMute = () => setMute(!Save.d.settings.mute);
  $('mute-btn').onclick = () => { AudioSys.init(); toggleMute(); };
  setMute(Save.d.settings.mute);
  $('hud-pause').innerHTML = I.pause; $('hud-pause').onclick = () => Game.pause();
  $('cp-add').onclick = () => Game.checkpoint(); $('cp-del').onclick = () => Game.removeCheckpoint();
  $('cp-auto').onchange = e => { Game.autoCP = e.target.checked; };
  $('hud-practice').addEventListener('pointerdown', e => e.stopPropagation());

  return { show, menuBg, hudShow, hudHide, hudUpdate, hudPractice, countdown, deadShow, pauseShow, pauseHide, winShow, toast, escape, exitLevel, toggleMute, init: () => show('main') };
})();

// ---- js/main.js ----
// Boot + the single animation loop.
Render.init(document.getElementById('game'));
Particles.setCap(Save.d.settings.quality === 'low' ? 150 : 600);
UI.init();

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000)); last = now;
  try {
    if (Game.mode !== 'idle') { Game.update(dt); Game.view(dt); }
    else UI.menuBg(dt);
  } catch (e) { console.error(e); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
addEventListener('resize', () => Render.resize());

})();
