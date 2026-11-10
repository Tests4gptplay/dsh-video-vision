import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// These two failures are emitted by DSH's SenseVoice HTTP admission and WAV
// admission respectively. Other failures are not converted into retries.
function isSizeRejection(error) {
  const seen = new Set();
  for (let cause = error; cause && typeof cause === 'object' && !seen.has(cause); cause = cause.cause) {
    seen.add(cause);
    if (cause.message === 'Invalid speech audio size' || cause.message === 'Speech audio exceeds the worker byte limit') return true;
  }
  return false;
}

/** Transcribe a complete PCM interval, splitting only windows rejected by the provider. */
export async function recognizeWindows(folder, clip, speech, state, language, signal, encode) {
  const segments = [];
  let splits = 0;
  const sampleBytes = 2; // engine.audioClip produces DSH's mono PCM16 WAV input.
  const windowBytes = 15 * clip.sampleRate * sampleBytes; // Existing recognition batching, not a clip limit.
  const recognize = async (pcm, offset) => {
    signal.throwIfAborted();
    const key = createHash('sha256').update(state.provider + '\n' + language + '\n' + clip.sampleRate + ':1\n').update(pcm).digest('hex').slice(0, 24);
    const path = join(folder, 'speech-' + key + '.json');
    let text, cached = false;
    try { text = JSON.parse(await readFile(path, 'utf8')).text; cached = typeof text === 'string'; }
    catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
    if (!cached) {
      try {
        const spec = speech.resolve({ audio: encode(pcm, clip.sampleRate), providerId: state.provider, language });
        const result = await speech.transcribe(spec, signal);
        text = String(result.text ?? '');
        await writeFile(path, JSON.stringify({ text, provider: state.provider, language }), 'utf8');
      } catch (error) {
        signal.throwIfAborted();
        const half = Math.floor(pcm.length / (2 * sampleBytes)) * sampleBytes;
        if (!isSizeRejection(error) || !half) throw error;
        splits++;
        return [...await recognize(pcm.subarray(0, half), offset), ...await recognize(pcm.subarray(half), offset + half)];
      }
    }
    const start = clip.start + offset / (clip.sampleRate * sampleBytes);
    return [{ start_seconds: start, end_seconds: start + pcm.length / (clip.sampleRate * sampleBytes), text, cached }];
  };
  for (let offset = 0; offset < clip.pcm.length; offset += windowBytes) {
    segments.push(...await recognize(clip.pcm.subarray(offset, offset + windowBytes), offset));
  }
  return { state: 'available', source: 'speech-recognition', provider: state.provider, language,
    start_seconds: clip.start, end_seconds: clip.end, timing: 'recognition-windows',
    ...(splits ? { provider_byte_limit_adapted: true, provider_splits: splits } : {}),
    text: segments.map(segment => segment.text).join('\n'), segments };
}
