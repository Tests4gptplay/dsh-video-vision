window.__ModuleLoader__.load({
  id: 'dsh-video-vision',
  factory: require => {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useState, useRef } = React;
    const css = `
      .vv-settings{color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.6;min-width:0;padding:2px 0 24px}
      .vv-settings *{box-sizing:border-box}
      .vv-settings h2{font-size:21px;font-weight:650;margin:0 0 3px}
      .vv-settings h3{font-size:14px;font-weight:600;margin:0}
      .vv-sub{color:var(--dsw-alias-label-secondary);font-size:12px}
      .vv-card{border:1px solid var(--dsw-alias-border-l2,#c8cbd3);border-radius:14px;padding:16px;margin-top:14px;background:var(--dsw-alias-background-secondary,rgba(255,255,255,.08))}
      .vv-row{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
      .vv-actions{display:flex;gap:7px;flex-wrap:wrap;align-items:center}
      .vv-settings button,.vv-link{font:inherit;line-height:1.4;border:1px solid var(--dsw-alias-border-l2,#b9becb);border-radius:8px;padding:7px 11px;background:transparent;color:inherit;cursor:pointer;text-decoration:none;white-space:nowrap}
      .vv-settings button:hover:not(:disabled),.vv-link:hover{background:rgba(110,125,180,.12)}
      .vv-settings button:focus-visible,.vv-settings input:focus-visible,.vv-settings summary:focus-visible,.vv-link:focus-visible{outline:2px solid #6e83c1;outline-offset:2px}
      .vv-settings button:disabled{opacity:.45;cursor:default}
      .vv-settings .vv-primary{background:#596fa9;border-color:#596fa9;color:white}
      .vv-settings .vv-danger{color:#c33e4c;border-color:rgba(195,62,76,.35)}
      .vv-settings input{width:100%;min-width:0;background:transparent;color:inherit;border:1px solid var(--dsw-alias-border-l2,#c8cbd3);border-radius:8px;padding:9px 10px;font:inherit;margin:7px 0}
      .vv-stats{display:flex;gap:26px;flex-wrap:wrap;padding:10px 0 0}
      .vv-stat strong{font-size:24px;line-height:1.3;font-weight:650;display:block}
      .vv-stat span{font-size:12px;color:var(--dsw-alias-label-secondary)}
      .vv-item{padding:15px 0;border-top:1px solid var(--dsw-alias-border-l2,#c8cbd3)}
      .vv-item:first-child{border-top:0;padding-top:4px}
      .vv-title{font-weight:600;overflow-wrap:anywhere}
      .vv-path{font-family:ui-monospace,Consolas,monospace;overflow-wrap:anywhere;font-size:11px}
      .vv-badge{font-size:11px;border-radius:5px;padding:2px 6px;background:rgba(110,125,180,.13)}
      .vv-settings details{margin-top:10px}
      .vv-settings summary{cursor:pointer;color:var(--dsw-alias-label-secondary)}
      .vv-file{display:flex;align-items:center;gap:8px;border-top:1px solid var(--dsw-alias-border-l2,#c8cbd3);padding:8px 0}
      .vv-file-name{flex:1;min-width:0;overflow-wrap:anywhere;font-size:12px}
      .vv-file button{padding:4px 8px;font-size:12px}
      .vv-notice{padding:11px 13px;border-radius:9px;margin-top:12px;background:rgba(100,135,180,.13);overflow-wrap:anywhere}
      .vv-error{color:#c33e4c;background:rgba(195,62,76,.09)}
      .vv-confirm{border:1px solid rgba(195,62,76,.4);padding:13px;border-radius:10px;margin-top:12px}
      .vv-empty{text-align:center;padding:25px 8px;color:var(--dsw-alias-label-secondary)}
    `;
    function size(bytes) {
      if (bytes < 1024) return bytes + ' B';
      const n = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 4);
      return (bytes / 1024 ** n).toFixed(n > 1 ? 2 : 1) + ' ' + ['B', 'KB', 'MB', 'GB', 'TB'][n];
    }
    function duration(value) {
      const n = Math.floor(value || 0);
      return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0');
    }
    function VideoSettings({ rpc }) {
      const [data, setData] = useState(null);
      const [cachePath, setCachePath] = useState('');
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState('');
      const [notice, setNotice] = useState('');
      const [confirm, setConfirm] = useState(null);
      const confirmationRef = useRef(null);
      useEffect(() => { confirmationRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [confirm]);
      const [search, setSearch] = useState('');
      async function reload() {
        const result = await rpc('list');
        setData(result);
        return result;
      }
      useEffect(() => { let alive = true;
        rpc('list').then(result => {
          if (alive) { setData(result); setCachePath(result.root); }
        }).catch(e => { if (alive) setError(e.message); });
        return () => { alive = false; };
      }, []);
      async function act(endpoint, payload, message) {
        setBusy(true); setError(''); setNotice(''); setConfirm(null);
        try {
          const value = await rpc(endpoint, payload);
          if (endpoint === 'relocate') setCachePath(value.root);
          await reload();
          setNotice(value.retained?.length ? '新位置已启用，旧目录中有文件仍被占用：' + value.retained.join('、') : message);
        } catch (e) { setError(e.message); }
        finally { setBusy(false); }
      }
      const blocked = busy;
      const button = (label, onClick, options = {}) => h('button', { type: 'button', disabled: blocked, onClick, ...options }, label);
      async function setDirectory() {
        setError(''); setNotice('');
        try {
          const picker = window.__DSH_DIRECTORY_PICKER__;
          const selected = picker?.pick ? { path: await picker.pick() } : await rpc('pick-directory');
          if (selected.path && !selected.canceled) await act('relocate', { path: selected.path }, '缓存目录已设置。');
        } catch (e) { setError(e.message); }
      }
      async function openFolder(payload = {}) {
        setError(''); setNotice('');
        try { await rpc('reveal', payload); }
        catch (e) { setError(e.message); }
      }
      async function extraction(entry, file) {
        setError(''); setNotice('');
        try {
          const result = await rpc('extract', { id: entry.id, file });
          if (!result.canceled) setNotice('已保存到：' + result.path);
        } catch (e) { setError(e.message); }
      }
      function askDelete(entry, file) {
        setConfirm({ endpoint: 'remove', payload: { id: entry.id, file, confirm: true },
          text: file ? '删除缓存文件「' + file + '」？' : '删除「' + entry.title + '」的全部缓存？' });
      }
      const entries = (data?.entries || []).filter(e => (e.title + ' ' + e.id + ' ' + e.source).toLowerCase().includes(search.toLowerCase()));
      return h('section', { className: 'vv-settings', 'aria-label': '视频视觉设置' },
        h('style', null, css),
        h('div', { className: 'vv-row' },
          h('div', null, h('h2', null, '视频视觉'), h('div', { className: 'vv-sub' }, 'DSH Video Vision 0.4.0 · 视频与画面缓存管理')),
          button(busy ? '处理中…' : '刷新', () => act('list', {}, '列表已刷新'), { disabled: busy })),
        error && h('div', { className: 'vv-notice vv-error', role: 'alert' }, error),
        notice && h('div', { className: 'vv-notice', role: 'status' }, notice),
        !data && !error && h('div', { className: 'vv-empty' }, '正在读取缓存…'),
        h('div', { className: 'vv-card' },
          h('h3', null, '存储位置'),
          h('label', { htmlFor: 'vv-cache-path', className: 'vv-sub' }, '缓存文件夹（完整路径）'),
          h('input', { id: 'vv-cache-path', value: cachePath, readOnly: true, spellCheck: false, title: '使用“设置缓存目录”选择文件夹' }),
          h('div', { className: 'vv-actions' },
            button('设置缓存目录', () => setDirectory(), { className: 'vv-primary', disabled: busy }),
            button('打开缓存文件夹', () => openFolder(), { disabled: !data, title: data?.root }),
            button('视频文件夹', () => openFolder({ videos: true }), { disabled: !data, title: data?.videoDirectory })),
          h('div', { className: 'vv-sub', style: { marginTop: 7 } }, '点击列表中的“提取视频”或单文件“提取”，在另存为窗口选择保存位置。'),
          h('div', { className: 'vv-sub', style: { marginTop: 7 } }, '更改位置会迁移列表中的缓存，观看进度与已有画面一并保留。')),
        data && h('div', { className: 'vv-card' },
          h('div', { className: 'vv-row' },
            h('h3', null, '当前占用'),
            button('清空全部缓存', () => setConfirm({ endpoint: 'clear', payload: { confirm: true },
              text: '清空列表中的 ' + data.entries.length + ' 项缓存？已提取的文件和本地原视频会保留。' }),
              { className: 'vv-danger', disabled: blocked || !data.entries.length })),
          h('div', { className: 'vv-stats' },
            h('div', { className: 'vv-stat' }, h('strong', null, size(data.bytes)), h('span', null, '磁盘占用')),
            h('div', { className: 'vv-stat' }, h('strong', null, data.entries.length), h('span', null, '缓存条目')),
            h('div', { className: 'vv-stat' }, h('strong', null, data.entries.reduce((n, e) => n + e.files.filter(f => f.name.startsWith('frames/')).length, 0)), h('span', null, '视频画面'))),
          h('div', { className: 'vv-sub', style: { marginTop: 7 } }, '清理仅处理本插件缓存，保留目录中的其他文件。')),
        confirm && h('div', { ref: confirmationRef, className: 'vv-confirm', role: 'alertdialog', 'aria-label': '确认删除缓存' },
          h('div', null, confirm.text),
          h('div', { className: 'vv-actions', style: { marginTop: 10 } },
            button('确认删除', () => act(confirm.endpoint, confirm.payload, '缓存已删除'), { className: 'vv-danger' }),
            button('取消', () => setConfirm(null)))),
        h('div', { className: 'vv-card' },
          h('h3', null, '缓存列表'),
          h('input', { 'aria-label': '搜索缓存', placeholder: '搜索标题、平台或视频 ID', value: search, onChange: e => setSearch(e.target.value) }),
          data && !entries.length && h('div', { className: 'vv-empty' }, data.entries.length ? '没有匹配的缓存' : '还没有视频缓存。发送视频链接即可开始观看。'),
          ...entries.map(entry => h('article', { key: entry.id, className: 'vv-item' },
            h('div', { className: 'vv-row' },
              h('span', { className: 'vv-badge' }, entry.source),
              h('span', { className: 'vv-sub' }, size(entry.bytes))),
            h('div', { className: 'vv-title', style: { marginTop: 6 } }, entry.title),
            h('div', { className: 'vv-sub' }, entry.incomplete ? '未完成的缓存' :
              duration(entry.duration) + ' · ' + entry.width + ' × ' + entry.height +
              (entry.videoOnly ? ' · 视频轨（音频独立缓存）' : '') + (entry.localSource ? ' · 本地原文件保留在原位置' : '')),
            h('div', { className: 'vv-actions', style: { marginTop: 9 } },
              entry.sourceUrl && h('a', { className: 'vv-link', href: entry.sourceUrl, target: '_blank', rel: 'noopener noreferrer' }, '查看原视频 ↗'),
              button('打开目录', () => openFolder({ id: entry.id }), { disabled: false }),
              button('提取视频', () => extraction(entry), { disabled: !entry.mediaFile }),
              button('删除缓存', () => askDelete(entry), { className: 'vv-danger' })),
            h('details', null, h('summary', null, '文件列表（' + entry.files.length + '）'),
              h('div', { className: 'vv-path vv-sub' }, entry.folder),
              ...entry.files.map(file => h('div', { className: 'vv-file', key: file.name },
                h('div', { className: 'vv-file-name' }, file.name, h('div', { className: 'vv-sub' }, file.link ? '目录链接' : size(file.bytes))),
                button('提取', () => extraction(entry, file.name), { disabled: file.link, 'aria-label': '提取 ' + file.name }),
                button('删除', () => askDelete(entry, file.name), { className: 'vv-danger',
                  disabled: blocked || file.link || ['manifest.json', '.video-vision.json'].includes(file.name), 'aria-label': '删除 ' + file.name }))))))));
    }
    const inject = ['slots', 'locale', 'connection'];
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register('video-vision', {
        zh: { nav: '视频视觉' }, en: { nav: 'Video Vision' }
      }));
      const t = ctx.locale.bind('video-vision');
      const rpc = async (endpoint, payload = {}) => {
        const result = await ctx.connection.rpc.call('/api', 'video-vision/cache/' + endpoint, payload);
        if (!result?.ok) throw new Error(result?.error?.message || '缓存管理请求失败');
        return result.value;
      };
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section', id: 'video-vision-cache', order: 110,
        label: () => t('nav'), locale: 'video-vision', inject: () => ({ rpc })
      }, VideoSettings));
    }
    return { apply, inject };
  }
});
