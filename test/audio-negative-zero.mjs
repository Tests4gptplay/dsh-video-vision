import assert from 'node:assert/strict';
import { analyzePcm } from '../lib/audio.js';

// JSON.stringify alone masks -0. Compare the original result with its round trip.
const check = value => assert.deepStrictEqual(value, JSON.parse(JSON.stringify(value)));
const pcm = (sample, seconds = 1) => {
  const buffer = Buffer.alloc(16000 * seconds * 2);
  for (let i = 0; i < buffer.length; i += 2) buffer.writeInt16LE(sample, i);
  return buffer;
};
for (const amplitude of [32767, -32767, 32766, -32766, -32768, 0, 1, -1, 16384, -16384]) {
  const result = analyzePcm(pcm(amplitude));
  check(result);
  if (Math.abs(amplitude) >= 32766) {
    assert.equal(result.peak_dbfs, 0);
    assert.equal(result.rms_dbfs, 0);
    assert.equal(result.level_timeline[0].rms_dbfs, 0);
  }
  if (amplitude === 0) assert.equal(result.peak_dbfs, -120);
  if (Math.abs(amplitude) === 16384) assert.equal(result.peak_dbfs, -6);
}
// Values immediately on either side of the one-decimal dB rounding boundary.
assert.equal(analyzePcm(pcm(32579)).peak_dbfs, -0.1);
assert.equal(analyzePcm(pcm(32580)).peak_dbfs, 0);
for (const seconds of [30, 60]) check(analyzePcm(pcm(32767, seconds)));
console.log('PASS: audio negative-zero regression (peak, RMS, timeline, silence, clipping, boundary, 30/60 seconds)');
