import z from '@deepseek-ai/schemastery';
import { CacheManager, liveConfig } from './cache.js?v=0.5.0';
import { DEFAULTS } from './engine.js?v=0.5.0';
import { chooseDirectory } from './native-ui.js?v=0.5.0';

import { configurationDirectory, ensureConfiguration } from './extensions.js';

export const Config = z.object({
  configDirectory: z.string(),
  cacheDirectory: z.string().min(1).default(DEFAULTS.cacheDirectory).volatile(),
  ffmpegPath: z.string().default('ffmpeg'),
  ffprobePath: z.string().default('ffprobe'),
  ytDlpPath: z.string(),
  nodePath: z.string(),
  cookieFile: z.string(),
  proxy: z.string(),
  speechProvider: z.string().default('sensevoice-local'),
  maxHeight: z.number().default(720),
  frameWidth: z.number().default(1280),
  maxFrames: z.number().default(12),
  maxDownloadMB: z.number().default(1024),
  downloadTimeoutMs: z.number().default(300000),
  processTimeoutMs: z.number().default(60000),
  maxAudioSeconds: z.number().default(60)
});

export function setupCacheSettings(ctx, config) {
  const manager = new CacheManager({ config, cwd: ctx.workingDirectory.defaultDirectory || process.cwd() });
  ctx.inject(['settings'], scope => {
    manager.persist = async value => {
      await scope.settings.mutate(ctx.fiber.entry?.options.id || 'video-vision',
        [{ op: 'set', path: ['cacheDirectory'], value }]);
    };
    scope.effect(() => scope.settings.configure({ auto: false }, ctx.fiber));
  });
  ctx.inject(['connection'], scope => scope.effect(() => registerCacheTransport(scope.connection, manager)));
  return manager;
}

export function registerCacheTransport(connection, manager) {
  const disposers = [];
  for (const endpoint of ['list', 'relocate', 'pick-directory', 'reveal', 'reveal-configuration', 'extract', 'remove', 'clear']) {
    const method = 'video-vision/cache/' + endpoint;
    disposers.push(connection.fetch.register({
      path: '/api/' + method, methods: ['POST'], requestBody: 'buffered',
      async fetch(request) {
        if (!request.headers.get('content-type')?.startsWith('application/json')) return new Response('Expected JSON', { status: 415 });
        let body;
        try { body = await request.json(); } catch { return new Response('Invalid JSON', { status: 400 }); }
        if (body?.type !== 'client-request' || typeof body.rpcId !== 'string' || body.method !== method)
          return new Response('Invalid DSH RPC', { status: 400 });
        let result;
        try {
          request.signal.throwIfAborted();
          const p = body.payload || {};
          let value;
          if (endpoint === 'list') value = { ...await manager.list(), configurationDirectory: configurationDirectory(liveConfig(manager.config)) };
          if (endpoint === 'relocate') value = await manager.relocate(p.path);
          if (endpoint === 'pick-directory') value = await chooseDirectory(manager.root(), request.signal);
          if (endpoint === 'reveal') value = await manager.reveal(p.id, p.videos, request.signal);
          if (endpoint === 'reveal-configuration') {
            const path = await ensureConfiguration(liveConfig(manager.config));
            await manager.openFolder(path, request.signal);
            value = { path };
          }
          if (endpoint === 'extract') value = await manager.extract(p.id, p.file, request.signal);
          if (endpoint === 'remove') {
            if (p.confirm !== true) throw new Error('请确认删除。');
            value = await manager.remove(p.id, p.file);
          }
          if (endpoint === 'clear') {
            if (p.confirm !== true) throw new Error('请确认清空缓存。');
            value = await manager.clear();
          }
          result = { ok: true, value };
        } catch (e) {
          result = { ok: false, error: { code: 'video_vision_cache', message: e.message, details: { issues: [] } } };
        }
        return Response.json({ type: 'server-response', rpcId: body.rpcId, result });
      }
    }));
  }
  return () => { for (const dispose of disposers.reverse()) dispose(); };
}
