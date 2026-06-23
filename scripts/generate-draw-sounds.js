/**
 * Synthesizes the two gacha (뽑기) landing sound effects as WAV files,
 * since the project has no audio asset pipeline. Run with:
 *   node scripts/generate-draw-sounds.js
 */
const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;

function note(freq, durationSec, { amp = 0.5, attack = 0.01, release = 0.12, harmonic = 0.25 } = {}) {
  const n = Math.round(SAMPLE_RATE * durationSec);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.min(t / attack, 1) * Math.min((durationSec - t) / release, 1);
    const wave = Math.sin(2 * Math.PI * freq * t) + harmonic * Math.sin(2 * Math.PI * freq * 2 * t);
    out[i] = amp * Math.max(env, 0) * wave;
  }
  return out;
}

function concat(...buffers) {
  const total = buffers.reduce((sum, b) => sum + b.length, 0);
  const out = new Float64Array(total);
  let offset = 0;
  for (const b of buffers) { out.set(b, offset); offset += b.length; }
  return out;
}

// overlap-add two buffers so notes blend instead of clicking
function mixAt(base, addition, atSample) {
  const out = base.slice();
  for (let i = 0; i < addition.length; i++) {
    const idx = atSample + i;
    if (idx < out.length) out[idx] += addition[i];
  }
  return out;
}

function writeWav(filePath, samples) {
  const n = samples.length;
  const buffer = Buffer.alloc(44 + n * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + n * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  fs.writeFileSync(filePath, buffer);
}

// Normal draw: a friendly two-note "ding-dong" pop (E5 -> G5)
function buildNormal() {
  const a = note(659.25, 0.16, { amp: 0.45, attack: 0.005, release: 0.1 });
  const b = note(783.99, 0.22, { amp: 0.45, attack: 0.005, release: 0.16 });
  let buf = new Float64Array(Math.round(SAMPLE_RATE * 0.32));
  buf = mixAt(buf, a, 0);
  buf = mixAt(buf, b, Math.round(SAMPLE_RATE * 0.09));
  return buf;
}

// Special draw: a bright ascending fanfare arpeggio with sparkle (C5-E5-G5-C6)
function buildSpecial() {
  const freqs = [523.25, 659.25, 783.99, 1046.5];
  const step = 0.1;
  let buf = new Float64Array(Math.round(SAMPLE_RATE * (step * freqs.length + 0.35)));
  freqs.forEach((f, i) => {
    const n = note(f, 0.45, { amp: 0.42, attack: 0.005, release: 0.32, harmonic: 0.35 });
    buf = mixAt(buf, n, Math.round(SAMPLE_RATE * step * i));
  });
  const sparkle = note(2093, 0.5, { amp: 0.12, attack: 0.02, release: 0.4, harmonic: 0.6 });
  buf = mixAt(buf, sparkle, Math.round(SAMPLE_RATE * step * (freqs.length - 1)));
  return buf;
}

const outDir = path.join(__dirname, '..', 'public', 'sounds');
fs.mkdirSync(outDir, { recursive: true });
writeWav(path.join(outDir, 'draw-normal.wav'), buildNormal());
writeWav(path.join(outDir, 'draw-special.wav'), buildSpecial());
console.log('Generated public/sounds/draw-normal.wav and draw-special.wav');
