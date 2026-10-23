// Script to generate a clean, audible notification chime WAV file
const fs = require('fs');
const path = require('path');

const sampleRate = 44100;
const duration = 0.55; // 550ms
const numSamples = Math.floor(sampleRate * duration);

// 16-bit mono PCM
const bytesPerSample = 2;
const blockAlign = bytesPerSample;
const byteRate = sampleRate * blockAlign;
const dataSize = numSamples * blockAlign;

const buffer = Buffer.alloc(44 + dataSize);

// RIFF header
buffer.write('RIFF', 0);
buffer.writeUInt32LE(36 + dataSize, 4);
buffer.write('WAVE', 8);

// 'fmt ' subchunk
buffer.write('fmt ', 12);
buffer.writeUInt32LE(16, 16); // subchunk1 size (16 for PCM)
buffer.writeUInt16LE(1, 20);  // PCM format
buffer.writeUInt16LE(1, 22);  // mono (1 channel)
buffer.writeUInt32LE(sampleRate, 24);
buffer.writeUInt32LE(byteRate, 28);
buffer.writeUInt16LE(blockAlign, 32);
buffer.writeUInt16LE(16, 34); // 16 bits per sample

// 'data' subchunk
buffer.write('data', 36);
buffer.writeUInt32LE(dataSize, 40);

// Generate two-tone Office / chime sound
// Tone 1: 659.25 Hz (E5) from 0 to 0.15s
// Tone 2: 880 Hz (A5) from 0.12 to 0.55s
for (let i = 0; i < numSamples; i++) {
  const t = i / sampleRate;
  let sample = 0;

  // First chime bell (starts at t=0)
  if (t < 0.25) {
    const env1 = Math.exp(-t * 18);
    sample += Math.sin(2 * Math.PI * 659.25 * t) * env1 * 0.6;
    sample += Math.sin(2 * Math.PI * 1318.5 * t) * env1 * 0.15; // harmonic
  }

  // Second chime bell (starts at t=0.12)
  if (t >= 0.10) {
    const t2 = t - 0.10;
    const env2 = Math.exp(-t2 * 9);
    sample += Math.sin(2 * Math.PI * 880 * t2) * env2 * 0.8;
    sample += Math.sin(2 * Math.PI * 1760 * t2) * env2 * 0.2; // harmonic
  }

  // Clamp and convert to 16-bit integer
  sample = Math.max(-1, Math.min(1, sample));
  const intSample = Math.floor(sample * 32767);
  buffer.writeInt16LE(intSample, 44 + i * 2);
}

const dir = path.join(__dirname, 'public', 'sounds');
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

fs.writeFileSync(path.join(dir, 'chime.wav'), buffer);
console.log('Successfully generated chime.wav (' + buffer.length + ' bytes)');
