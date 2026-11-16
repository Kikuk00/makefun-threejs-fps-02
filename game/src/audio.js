// Procedural sound: every effect is synthesised with WebAudio, so the game ships no
// audio files and makes no network request. One shared noise buffer is reused for
// every shot and explosion; oscillators cover beeps, clicks and the plant tone.
export function createAudio() {
  let context = null;
  let noise = null;
  let master = null;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume().catch(() => {});
      return context;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
      const length = context.sampleRate * 0.5;
      noise = context.createBuffer(1, length, context.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      context = null;
    }
    return context;
  }

  function burst(when, duration, filterFreq, gainValue, type = 'lowpass') {
    const ctx = ensure();
    if (!ctx || !noise) return;
    const source = ctx.createBufferSource();
    source.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(when, Math.random() * 0.3);
    source.stop(when + duration);
  }

  function tone(when, freq, duration, gainValue, type = 'square') {
    const ctx = ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    osc.connect(gain).connect(master);
    osc.start(when);
    osc.stop(when + duration);
  }

  return {
    unlock() {
      ensure();
    },
    shot(kind) {
      const ctx = ensure();
      if (!ctx) return;
      const now = ctx.currentTime;
      if (kind === 'shotgun') burst(now, 0.22, 900, 0.9);
      else if (kind === 'sniper') burst(now, 0.3, 2400, 0.9);
      else if (kind === 'smg') burst(now, 0.09, 1800, 0.55);
      else burst(now, 0.14, 1400, 0.7);
      tone(now, kind === 'sniper' ? 90 : 140, 0.08, 0.25, 'sawtooth');
    },
    distantShot() {
      const ctx = ensure();
      if (!ctx) return;
      burst(ctx.currentTime, 0.12, 500, 0.22);
    },
    dryFire() {
      const ctx = ensure();
      if (!ctx) return;
      tone(ctx.currentTime, 1400, 0.03, 0.12);
    },
    reload() {
      const ctx = ensure();
      if (!ctx) return;
      const now = ctx.currentTime;
      tone(now, 500, 0.05, 0.15);
      tone(now + 0.35, 700, 0.05, 0.15);
      tone(now + 0.7, 900, 0.05, 0.2);
    },
    hit(kill) {
      const ctx = ensure();
      if (!ctx) return;
      tone(ctx.currentTime, kill ? 880 : 660, 0.07, 0.2, 'sine');
    },
    hurt() {
      const ctx = ensure();
      if (!ctx) return;
      burst(ctx.currentTime, 0.15, 300, 0.5);
    },
    explosion() {
      const ctx = ensure();
      if (!ctx) return;
      const now = ctx.currentTime;
      burst(now, 0.9, 220, 1.0);
      tone(now, 55, 0.7, 0.5, 'sine');
    },
    beep(planted) {
      const ctx = ensure();
      if (!ctx) return;
      tone(ctx.currentTime, planted ? 1200 : 950, 0.09, 0.18, 'sine');
    },
    plantDone() {
      const ctx = ensure();
      if (!ctx) return;
      const now = ctx.currentTime;
      tone(now, 700, 0.12, 0.2, 'sine');
      tone(now + 0.14, 1050, 0.18, 0.2, 'sine');
    },
    round() {
      const ctx = ensure();
      if (!ctx) return;
      const now = ctx.currentTime;
      tone(now, 520, 0.1, 0.2, 'sine');
      tone(now + 0.12, 780, 0.16, 0.2, 'sine');
    },
    buy() {
      const ctx = ensure();
      if (!ctx) return;
      tone(ctx.currentTime, 990, 0.06, 0.15, 'sine');
    },
  };
}
