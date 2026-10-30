import { createHash } from 'node:crypto';
import { budgetRecovery, timeoutRecovery } from './budgets.js';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const round = (n, digits = 3) => Number(n.toFixed(digits));
const db = n => round(20 * Math.log10(Math.max(n, 1e-6)), 1);

export function wavFromPcm(pcm, sampleRate = 16000) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

// Mono s16le, measured from decoded audio. Event times use the video timeline.
export function analyzePcm(pcm, start = 0, sampleRate = 16000) {
  const hop = Math.round(sampleRate * 0.02), samples = Math.floor(pcm.length / 2);
  if (!samples) throw new Error('The selected audio range decoded no samples.');
  const rms = [], novelty = [], levels = [], pauses = [];
  let sum = 0, peak = 0, quietStart = null;
  for (let offset = 0; offset < samples; offset += hop) {
    let energy = 0;
    const count = Math.min(hop, samples - offset);
    for (let j = 0; j < count; j++) {
      const value = pcm.readInt16LE((offset + j) * 2) / 32768;
      energy += value * value;
      peak = Math.max(peak, Math.abs(value));
    }
    sum += energy;
    const value = Math.sqrt(energy / count);
    rms.push(value);
    novelty.push(Math.max(0, value - (rms.at(-2) ?? value)));
  }
  const duration = samples / sampleRate, step = hop / sampleRate;
  for (let i = 0; i < rms.length; i++) {
    if (db(rms[i]) < -45) { if (quietStart === null) quietStart = i; }
    else if (quietStart !== null) {
      if ((i - quietStart) * step >= 0.3)
        pauses.push({ start_seconds: round(start + quietStart * step), end_seconds: round(start + i * step) });
      quietStart = null;
    }
  }
  if (quietStart !== null && duration - quietStart * step >= 0.3)
    pauses.push({ start_seconds: round(start + quietStart * step), end_seconds: round(start + duration) });
  for (let i = 0; i < rms.length; i += 50) {
    const slice = rms.slice(i, i + 50);
    levels.push({ seconds: round(start + i * step), rms_dbfs: db(Math.sqrt(slice.reduce((n, v) => n + v * v, 0) / slice.length)) });
  }
  const averageRms = rms.reduce((n, v) => n + v, 0) / rms.length;
  const modulation = Math.sqrt(rms.reduce((n, v) => n + (v - averageRms) ** 2, 0) / rms.length) / Math.max(averageRms, 1e-6);
  const mean = novelty.reduce((n, v) => n + v, 0) / novelty.length;
  const deviation = Math.sqrt(novelty.reduce((n, v) => n + (v - mean) ** 2, 0) / novelty.length);
  const attacks = [];
  for (let i = 2; i < novelty.length - 2; i++) {
    const value = novelty[i];
    if (value <= Math.max(0.001, averageRms * 0.08, mean + deviation * 0.5) ||
        value < Math.max(...novelty.slice(i - 2, i + 3))) continue;
    const event = { seconds: round(start + i * step), strength: value };
    const last = attacks.at(-1);
    if (last && event.seconds - last.seconds < 0.12) {
      if (value > last.strength) attacks[attacks.length - 1] = event;
    } else attacks.push(event);
  }
  const correlations = [];
  for (let lag = Math.floor(60 / (180 * step)); lag <= Math.ceil(60 / (60 * step)); lag++) {
    let product = 0, left = 0, right = 0;
    for (let i = lag; i < novelty.length; i++) {
      const a = novelty[i] - mean, b = novelty[i - lag] - mean;
      product += a * b; left += a * a; right += b * b;
    }
    correlations.push({ lag, score: left * right > 0 ? product / Math.sqrt(left * right) : 0 });
  }
  const candidates = correlations.filter((c, i, all) =>
    c.score > 0.15 && c.score >= (all[i - 1]?.score ?? 0) && c.score >= (all[i + 1]?.score ?? 0)
  ).map(c => ({ bpm: round(60 / (c.lag * step), 1), periodicity: round(c.score) }))
    .sort((a, b) => b.periodicity - a.periodicity || Math.abs(a.bpm - 120) - Math.abs(b.bpm - 120)).slice(0, 3);
  const silent = db(Math.sqrt(sum / samples)) < -60;
  const periodic = !silent && modulation >= 0.08 && duration >= 8 && attacks.length >= 8 && candidates[0]?.periodicity >= 0.2;
  const strongest = [...attacks].sort((a, b) => b.strength - a.strength).slice(0, 32).sort((a, b) => a.seconds - b.seconds);
  return {
    source: 'decoded-audio-signal', method: '20ms RMS envelope and onset autocorrelation',
    start_seconds: round(start), end_seconds: round(start + duration), duration_seconds: round(duration),
    sample_rate: sampleRate, rms_dbfs: db(Math.sqrt(sum / samples)), peak_dbfs: db(peak), silent,
    quiet_range_count: pauses.length, quiet_ranges_truncated: pauses.length > 32,
    onset_count: attacks.length, prominent_onsets_truncated: attacks.length > 32,
    ...((pauses.length > 32 || attacks.length > 32) ? { detail_hint: 'Use action=audio with a narrower start_seconds/end_seconds range for more detail.' } : {}),
    tempo: { state: periodic ? 'estimated' : 'no-stable-pulse', bpm: periodic ? candidates[0].bpm : null,
      candidates: periodic ? candidates : [], timing_resolution_seconds: step,
      interpretation: 'Pulse estimates and audio attacks for editing; compare with the song and nearby frames when choosing cuts.' },
    level_timeline: levels, quiet_ranges: pauses.slice(0, 32), prominent_onsets_seconds: strongest.map(a => a.seconds)
  };
}

export function automaticAudioRange(asset, args, frames, maximum = 60) {
  const times = frames.map(f => f.seconds);
  if (!times.length) return null;
  const start = args.start_seconds ?? Math.min(...times);
  const requestedEnd = args.end_seconds ?? (args.timestamps?.length > 1 ? Math.max(...times) : start + 30);
  // A visual overview can span the whole film; audio coverage stays explicit and bounded.
  const end = Math.min(asset.duration, start + maximum, start + 30, Math.max(start + 0.01, requestedEnd));
  return { start, end };
}

export async function transcribeClip(engine, asset, clip, speech, speechState, language, signal) {
  if (!speechState.available || !['ready', 'standby'].includes(speechState.state))
    return { state: 'needs-provider', source: 'speech-recognition', provider: speechState.provider,
      next_action: 'Prepare this recognizer in DSH voice settings, then use transcribe on this range.' };
  const segments = [];
  const segmentSamples = 15 * clip.sampleRate;
  for (let offset = 0; offset < clip.pcm.length; offset += segmentSamples * 2) {
    signal.throwIfAborted();
    const pcm = clip.pcm.subarray(offset, offset + segmentSamples * 2);
    const key = createHash('sha256').update(speechState.provider + '\n' + language + '\n').update(pcm).digest('hex').slice(0, 24);
    const path = join(engine.folder(asset.id), 'speech-' + key + '.json');
    let text, cached = false;
    try { text = JSON.parse(await readFile(path, 'utf8')).text; cached = typeof text === 'string'; }
    catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
    if (!cached) {
      const spec = speech.resolve({ audio: wavFromPcm(pcm, clip.sampleRate), providerId: speechState.provider, language });
      const result = await speech.transcribe(spec, signal);
      text = String(result.text ?? '');
      await writeFile(path, JSON.stringify({ text, provider: speechState.provider, language }), 'utf8');
    }
    const start = clip.start + offset / (clip.sampleRate * 2);
    segments.push({ start_seconds: round(start), end_seconds: round(start + pcm.length / (clip.sampleRate * 2)), text, cached });
  }
  return { state: 'available', source: 'speech-recognition', provider: speechState.provider, language,
    start_seconds: clip.start, end_seconds: clip.end, timing: 'recognition-windows',
    text: segments.map(s => s.text).join('\n'), segments };
}

export async function inspectAudio(engine, asset, args, speech, speechState, signal) {
  let clip;
  try { clip = await engine.audioClip(asset, args.start_seconds, args.end_seconds, signal); }
  catch (error) {
    signal.throwIfAborted();
    return { state: error.code === 'NO_AUDIO' ? 'no-audio' : 'unavailable', reason: error.message,
      ...(budgetRecovery(error) || timeoutRecovery(error)),
      requested_range_seconds: [args.start_seconds ?? 0, args.end_seconds ?? Math.min((args.start_seconds ?? 0) + 30, asset.duration)] };
  }
  const analysis = analyzePcm(clip.pcm, clip.start, clip.sampleRate);
  let transcript = { state: 'not-requested', source: 'speech-recognition' };
  if (args.audio_mode !== 'analyze') {
    if (analysis.silent) transcript = { state: 'silent', source: 'speech-recognition', text: '', segments: [] };
    else {
      try { transcript = await transcribeClip(engine, asset, clip, speech, speechState, args.language ?? 'auto', signal); }
      catch (error) {
        signal.throwIfAborted();
        transcript = { state: 'unavailable', source: 'speech-recognition', reason: error.message,
          ...(budgetRecovery(error) || timeoutRecovery(error)) };
      }
    }
  }
  return { state: 'available', source_kind: clip.sourceKind, clip_path: clip.path,
    analyzed_range_seconds: [clip.start, clip.end], next_start_seconds: clip.end < asset.duration ? clip.end : null,
    analysis, transcript };
}
