// Tiny WebAudio blips. No assets. Safe to no-op before first gesture.
let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

function blip(freq: number, dur = 0.08, type: OscillatorType = 'square', vol = 0.04): void {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.value = vol;
  o.connect(g); g.connect(c.destination);
  o.start();
  o.stop(c.currentTime + dur);
}

export const sfx = {
  cursor() { blip(660, 0.05); },
  confirm() { blip(520, 0.07); blip(780, 0.07); },
  hit() { blip(140, 0.12, 'sawtooth', 0.06); },
  magic() { blip(880, 0.14, 'sine', 0.06); },
  heal() { blip(440, 0.1, 'sine'); setTimeout(() => blip(660, 0.12, 'sine'), 90); },
  win() { [523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, 0.12), i * 110)); },
  lose() { [330, 262, 196].forEach((f, i) => setTimeout(() => blip(f, 0.16), i * 140)); },
};
