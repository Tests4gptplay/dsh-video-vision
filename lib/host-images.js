import { readFile, stat, mkdir, rename, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { run } from './process.js';

/** Read actual image dimensions without loading the raster into JavaScript memory. */
async function dimensions(engine, path, signal) {
  const info = JSON.parse(await run(engine.config.ffprobePath, ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'json', path], dirname(path), signal,
    engine.config.processTimeoutMs, 'attachment-probe'));
  const { width, height } = info.streams?.[0] || {};
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0)
    throw new Error('The decoded video frame has no readable dimensions.');
  return { width, height };
}

function positiveLimit(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : Infinity;
}

/** Prepare a separate input copy according to this attachment service's published policy.
 * Source files, saved user settings, and DSH/model policies are never overwritten.
 * Batch-upload counts are not treated as tool-result frame-count limits: DSH's
 * model adapter owns complete-request budgeting and logged image offload.
 */
export async function attachFrame(engine, asset, frame, attachments, signal) {
  signal.throwIfAborted();
  const limits = attachments.imageLimits || {};
  const original = await dimensions(engine, frame.path, signal);
  const originalStat = await stat(frame.path);
  const maxBytes = positiveLimit(limits.maxImageBytes);
  const maxPixels = positiveLimit(limits.maxImagePixels);
  const maxSide = positiveLimit(limits.maxImageDimension);
  const accepted = Array.isArray(limits.mediaTypes) ? limits.mediaTypes : [frame.media_type || 'image/jpeg'];
  let mediaType = frame.media_type || 'image/jpeg';
  let scale = Math.min(1, maxSide / original.width, maxSide / original.height,
    Math.sqrt(maxPixels / (original.width * original.height)));
  let width = Math.max(1, Math.floor(original.width * scale));
  let height = Math.max(1, Math.floor(original.height * scale));
  let path = frame.path;
  const needsCopy = width !== original.width || height !== original.height || originalStat.size > maxBytes || !accepted.includes(mediaType);
  if (needsCopy) {
    // Prefer the requested format when it fits. JPEG is an existing video-frame
    // representation, and reduces encoded size when an actual byte limit requires it.
    if (!accepted.includes(mediaType) || originalStat.size > maxBytes) {
      mediaType = ['image/jpeg', 'image/png', 'image/webp'].find(type => accepted.includes(type));
    }
    if (!mediaType || !['image/jpeg', 'image/png', 'image/webp'].includes(mediaType)) {
      throw Object.assign(new Error('The mounted attachment service accepts no frame format supported by this decoder.'), { code: 'UNSUPPORTED_IMAGE_TYPE' });
    }
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mediaType];
    const folder = join(dirname(frame.path), 'host-inputs');
    await mkdir(folder, { recursive: true });
    while (true) {
      signal.throwIfAborted();
      const key = createHash('sha256').update(JSON.stringify([frame.path, originalStat.size, originalStat.mtimeMs,
        width, height, mediaType, maxBytes])).digest('hex').slice(0, 24);
      path = join(folder, key + '.' + extension);
      let result = await stat(path).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
      if (!result?.size) {
        const temporary = join(folder, `${randomUUID()}.${extension}`);
        try {
          await run(engine.config.ffmpegPath, ['-nostdin', '-v', 'error', '-y', '-threads', '1', '-i', frame.path,
            '-frames:v', '1', '-an', '-vf', `scale=${width}:${height}`,
            ...(mediaType === 'image/jpeg' ? ['-pix_fmt', 'yuvj444p', '-q:v', '2'] :
              mediaType === 'image/png' ? ['-pix_fmt', 'rgb24'] : ['-c:v', 'libwebp', '-quality', '90']),
            '-threads', '1', temporary], folder, signal, engine.config.processTimeoutMs, 'attachment-convert');
          result = await stat(temporary);
          if (!result.size) throw new Error('The host-compatible frame is empty.');
          await rename(temporary, path);
        } finally { await rm(temporary, { force: true }); }
      }
      if (result.size <= maxBytes) break;
      // This loop is driven solely by the current host limit, with strictly
      // decreasing integer dimensions. No image-resolution tier or retry cap.
      if (width === 1 && height === 1) {
        throw Object.assign(new Error(`The host maxImageBytes=${maxBytes} cannot hold a one-pixel ${mediaType} image.`), { code: 'IMAGE_TOO_LARGE' });
      }
      scale = Math.min(0.95, Math.sqrt(maxBytes / result.size) * 0.95);
      const nextWidth = Math.max(1, Math.floor(width * scale));
      const nextHeight = Math.max(1, Math.floor(height * scale));
      await rm(path, { force: true });
      width = nextWidth; height = nextHeight;
    }
  }
  signal.throwIfAborted();
  const data = await readFile(path);
  // Genuine storage, permissions and invalid-image errors propagate. They are
  // not turned into a path-only success or a claim that the model saw a frame.
  frame.image = await attachments.saveImage({ data, mediaType, name: `${asset.id}-${frame.seconds}s.${mediaType.split('/')[1]}` });
  signal.throwIfAborted();
  frame.attachment_delivery = {
    state: 'attached', source_dimensions: original, submitted_dimensions: { width, height },
    submitted_bytes: data.byteLength, submitted_media_type: mediaType,
    adapted_to_host: needsCopy, attachment_dimensions: { width: frame.image.width, height: frame.image.height },
    ...(needsCopy ? { compatible_path: path } : {})
  };
}
