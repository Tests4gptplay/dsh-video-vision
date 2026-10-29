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
      .vv-first-use{display:block;font-size:inherit;font-weight:700;color:var(--dsw-alias-label-primary);line-height:1.6;margin:12px 0 6px}
      .vv-setup{margin-top:12px;padding:12px;border:1px solid var(--dsw-alias-border-l2,#c8cbd3);border-radius:9px}
      .vv-setup ol{margin:7px 0;padding-left:20px}
      .vv-setup li{margin:5px 0}
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

    function VideoSettings({ rpc, t, locale, localizeMessage }) {
      const language = React.useSyncExternalStore(callback => locale.subscribe(callback), () => locale.getSnapshot(), () => locale.getSnapshot()).active;
      const desktopBrowser = globalThis.dshDesktop?.protocolVersion === 1 && Boolean(globalThis.dshDesktop.browser);
      const [data, setData] = useState(null);
      const [cachePath, setCachePath] = useState('');
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState('');
      const [notice, setNotice] = useState('');
      const [confirm, setConfirm] = useState(null);
      const confirmationRef = useRef(null);
      useEffect(() => { confirmationRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [confirm]);
      const [search, setSearch] = useState('');
      const [setupInfo, setSetupInfo] = useState(null);
      const [pendingAction, setPendingAction] = useState('');
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
      }, [language]);
      useEffect(() => {
        let alive = true;
        const updateBridge = () => rpc('browser-status').then(browser_session => {
          if (alive) setData(previous => previous ? { ...previous, browser_session } : previous);
        }).catch(() => {});
        window.addEventListener('focus', updateBridge);
        return () => { alive = false; window.removeEventListener('focus', updateBridge); };
      }, []);
      async function act(endpoint, payload, message) {
        setBusy(true); setPendingAction(endpoint); setError(''); setNotice(''); setConfirm(null);
        try {
          const value = await rpc(endpoint, payload);
          if (endpoint === 'relocate') setCachePath(value.root);
          await reload();
          setNotice(endpoint === 'browser-status' ? (value.connected ? t('ui0') : t('ui1')) :
            value.retained?.length ? t('ui2') + value.retained.join('、') : message);
        } catch (e) { setError(e.message); }
        finally { setBusy(false); setPendingAction(''); }
      }
      const blocked = busy;
      const button = (label, onClick, options = {}) => h('button', { type: 'button', disabled: blocked, onClick, ...options }, label);
      async function setDirectory() {
        setError(''); setNotice('');
        try {
          const picker = window.__DSH_DIRECTORY_PICKER__;
          const selected = picker?.pick ? { path: await picker.pick() } : await rpc('pick-directory');
          if (selected.path && !selected.canceled) await act('relocate', { path: selected.path }, t('ui3'));
        } catch (e) { setError(e.message); }
      }
      async function authorizeBrowser(enabled, syncToNative) {
        await act('browser-authorization', { enabled, syncToNative },
          enabled ? (syncToNative ? t('ui4') : t('ui5')) : t('ui6'));
      }
      async function importBrowser(refresh = false) {
        const endpoint = refresh ? 'browser-refresh' : 'browser-setup';
        setBusy(true); setPendingAction(endpoint); setError(''); setNotice('');
        try {
          await rpc(endpoint);
          setSetupInfo(null);
          await reload();
          setNotice(refresh ? t('ui7') : t('ui8'));
        } catch (e) { setError(e.message); setSetupInfo(true); }
        finally { setBusy(false); setPendingAction(''); }
      }
      async function openBrowserSettings() {
        setBusy(true); setPendingAction('browser-settings'); setError('');
        try { await rpc('browser-settings'); setSetupInfo(true); setNotice(t('ui9')); }
        catch (e) { setError(e.message); }
        finally { setBusy(false); setPendingAction(''); }
      }
      async function openFolder(payload = {}) {
        setError(''); setNotice('');
        try { await rpc('reveal', payload); }
        catch (e) { setError(e.message); }
      }
      async function openMethodsFolder() {
        setError(''); setNotice('');
        try { await rpc('reveal-configuration'); }
        catch (e) { setError(e.message); }
      }
      async function extraction(entry, file) {
        setError(''); setNotice('');
        try {
          const result = await rpc('extract', { id: entry.id, file });
          if (!result.canceled) setNotice((result.merged_audio ? t('ui10') : t('ui11')) + result.path);
        } catch (e) { setError(e.message); }
      }
      function askDelete(entry, file) {
        setConfirm({ endpoint: 'remove', payload: { id: entry.id, file, confirm: true },
          entryTitle: entry.title, file });
      }
      const entries = (data?.entries || []).filter(e => (e.title + ' ' + e.id + ' ' + e.source).toLowerCase().includes(search.toLowerCase()));
      return h('section', { className: 'vv-settings', 'aria-label': t('ui15') },
        h('style', null, css),
        h('div', { className: 'vv-row' },
          h('div', null, h('h2', null, t('ui16')), h('div', { className: 'vv-sub' }, t('ui17'))),
          button(busy ? t('ui18') : t('ui19'), () => act('list', {}, t('ui20')), { disabled: busy })),
        error && h('div', { className: 'vv-notice vv-error', role: 'alert' }, localizeMessage(error)),
        notice && h('div', { className: 'vv-notice', role: 'status' }, localizeMessage(notice)),
        !data && !error && h('div', { className: 'vv-empty' }, t('ui21')),
        h('div', { className: 'vv-card' },
          h('h3', null, t('ui22')),
          h('label', { className: 'vv-row', style: { justifyContent: 'flex-start', marginTop: 10 } },
            h('input', { type: 'checkbox', role: 'switch', 'aria-label': t('ui23'),
              checked: data?.browser_session?.enabled === true,
              disabled: busy || !data,
              style: { width: 18, minWidth: 18, margin: 0 },
              onChange: event => authorizeBrowser(event.target.checked, data?.browser_session?.syncToNative === true) }),
            t('ui23')),
          desktopBrowser && h('label', { className: 'vv-row', style: { justifyContent: 'flex-start', marginTop: 10 } },
            h('input', { type: 'checkbox', role: 'switch', 'aria-label': t('ui24'),
              checked: data?.browser_session?.syncToNative === true,
              disabled: busy || !data?.browser_session?.enabled,
              style: { width: 18, minWidth: 18, margin: 0 },
              onChange: event => authorizeBrowser(true, event.target.checked) }),
            t('ui24')),
          pendingAction === 'browser-authorization' && h('div', { className: 'vv-notice', role: 'status' }, t('ui25')),
          h('div', { className: 'vv-sub', style: { marginTop: 7 } },
            t(desktopBrowser ? 'ui26' : 'webSessionDescription')),
          h('div', { className: 'vv-sub', style: { marginTop: 5 } },
            t('ui27')),
          h('strong', { className: 'vv-first-use' }, t('ui28')),
          h('div', { className: 'vv-sub', style: { marginTop: 5 } },
            t(data?.browser_session?.localCapture ? 'sourceLabel' : 'ui29') + (data?.browser_session?.browser || t('ui30')) + t('ui31') +
            (!data?.browser_session?.ready ? t('ui32') : data?.browser_session?.connected ? t('ui33') : data?.browser_session?.imported ? t('ui34') : t('ui35')) +
            (data?.browser_session?.importedAt ? t('ui36') + new Date(data.browser_session.importedAt).toLocaleString(language === 'en' ? 'en' : 'zh-CN') : '') +
            (data?.browser_session?.componentMessage ? ' · ' + data.browser_session.componentMessage : '')),
          data?.browser_session?.localCapture && data?.browser_session?.sources?.length > 0 && (data.browser_session.sources.length > 1 || !data.browser_session.sources.some(item => item.id === data.browser_session.sourceId)) && h('select', {
            value: data.browser_session.sourceId || '', 'aria-label': t('cdpSource'), disabled: busy,
            onChange: event => act('browser-source', { sourceId: event.target.value }, '') },
            h('option', { value: '', disabled: true }, t('cdpSource')),
            ...data.browser_session.sources.map(item => h('option', { key: item.id, value: item.id }, item.label))),
          h('div', { className: 'vv-actions', style: { marginTop: 9 } },
            button(pendingAction === 'browser-setup' ? t('ui37') : data?.browser_session?.connected ? t('ui38') : t('ui39'), () => importBrowser(),
              { className: 'vv-primary', disabled: busy || !data?.browser_session?.enabled || data?.browser_session?.connected === true }),
            button(pendingAction === 'browser-refresh' ? t('ui40') : t('ui41'), () => importBrowser(true),
              { disabled: busy || !data?.browser_session?.enabled || !data?.browser_session?.imported }),
            button(pendingAction === 'browser-status' ? t('ui42') : t('ui43'), () => act('browser-status', {}, ''), { disabled: busy || !data })),
          h('div', { className: 'vv-sub', style: { marginTop: 6 } }, t('ui44')),
          ['browser-setup', 'browser-refresh'].includes(pendingAction) && h('div', { className: 'vv-notice', role: 'status' },
            t('ui45')),
          (!data?.browser_session?.imported || setupInfo) && h('div', { className: 'vv-setup', 'aria-label': t('ui46') },
            h('strong', null, t('ui47')),
            h('ol', null,
              h('li', null, t('ui48')),
              h('li', null, t('ui49')),
              h('li', null, t('ui50'))),
            button(pendingAction === 'browser-settings' ? t('ui51') : t('ui52'), openBrowserSettings,
              { disabled: busy }),
            h('div', { className: 'vv-sub', style: { marginTop: 6 } }, t('ui53')))),
        h('div', { className: 'vv-card' },
          h('h3', null, t('ui54')),
          h('label', { htmlFor: 'vv-cache-path', className: 'vv-sub' }, t('ui55')),
          h('input', { id: 'vv-cache-path', value: cachePath, readOnly: true, spellCheck: false, title: t('ui56') }),
          h('div', { className: 'vv-actions' },
            button(t('ui57'), () => setDirectory(), { className: 'vv-primary', disabled: busy }),
            button(t('ui58'), () => openFolder(), { disabled: !data, title: data?.root }),
            button(t('ui59'), () => openMethodsFolder(), { disabled: false, title: data?.configurationDirectory })),
          h('div', { className: 'vv-sub', style: { marginTop: 7 } }, t('ui60')),
          h('div', { className: 'vv-sub', style: { marginTop: 7 } }, t('ui61')),
          h('div', { style: { marginTop: 14 } }, h('strong', null, t('ui62'))),
          h('div', { className: 'vv-path' }, data?.configurationDirectory || t('ui63')),
          h('div', { className: 'vv-sub', style: { marginTop: 5 } }, t('ui64'))),
        data && h('div', { className: 'vv-card' },
          h('div', { className: 'vv-row' },
            h('h3', null, t('ui65')),
            button(t('ui66'), () => setConfirm({ endpoint: 'clear', payload: { confirm: true },
              count: data.entries.length }),
              { className: 'vv-danger', disabled: blocked || !data.entries.length })),
          h('div', { className: 'vv-stats' },
            h('div', { className: 'vv-stat' }, h('strong', null, size(data.bytes)), h('span', null, t('ui69'))),
            h('div', { className: 'vv-stat' }, h('strong', null, data.entries.length), h('span', null, t('ui70'))),
            h('div', { className: 'vv-stat' }, h('strong', null, data.entries.reduce((n, e) => n + e.files.filter(f => f.name.startsWith('frames/')).length, 0)), h('span', null, t('ui71')))),
          h('div', { className: 'vv-sub', style: { marginTop: 7 } }, t('ui72'))),
        confirm && h('div', { ref: confirmationRef, className: 'vv-confirm', role: 'alertdialog', 'aria-label': t('ui73') },
          h('div', null, confirm.endpoint === 'clear' ? t('ui67') + confirm.count + t('ui68') : confirm.file ? t('ui12') + confirm.file + (language === 'en' ? '”?' : '」？') : t('ui13') + confirm.entryTitle + t('ui14')),
          h('div', { className: 'vv-actions', style: { marginTop: 10 } },
            button(t('ui74'), () => act(confirm.endpoint, confirm.payload, t('ui75')), { className: 'vv-danger' }),
            button(t('ui76'), () => setConfirm(null)))),
        h('div', { className: 'vv-card' },
          h('h3', null, t('ui77')),
          h('input', { 'aria-label': t('ui78'), placeholder: t('ui79'), value: search, onChange: e => setSearch(e.target.value) }),
          data && !entries.length && h('div', { className: 'vv-empty' }, data.entries.length ? t('ui80') : t('ui81')),
          ...entries.map(entry => h('article', { key: entry.id, className: 'vv-item' },
            h('div', { className: 'vv-row' },
              h('span', { className: 'vv-badge' }, !entry.manifest?.source && entry.source === '未完成' ? (language === 'en' ? 'Incomplete' : entry.source) : entry.source),
              h('span', { className: 'vv-sub' }, size(entry.bytes))),
            h('div', { className: 'vv-title', style: { marginTop: 6 } }, entry.title),
            h('div', { className: 'vv-sub' }, entry.incomplete ? t('ui82') :
              duration(entry.duration) + ' · ' + entry.width + ' × ' + entry.height +
              (entry.videoOnly ? t('ui83') : '') + (entry.localSource ? t('ui84') : '')),
            h('div', { className: 'vv-actions', style: { marginTop: 9 } },
              entry.sourceUrl && h('a', { className: 'vv-link', href: entry.sourceUrl, target: '_blank', rel: 'noopener noreferrer' }, t('ui85')),
              button(t('ui86'), () => openFolder({ id: entry.id }), { disabled: false }),
              button(t('ui87'), () => extraction(entry), { disabled: !entry.mediaFile }),
              button(t('ui88'), () => askDelete(entry), { className: 'vv-danger' })),
            h('details', null, h('summary', null, t('ui89') + entry.files.length + (language === 'en' ? ')' : '）')),
              h('div', { className: 'vv-path vv-sub' }, entry.folder),
              ...entry.files.map(file => h('div', { className: 'vv-file', key: file.name },
                h('div', { className: 'vv-file-name' }, file.name, h('div', { className: 'vv-sub' }, file.link ? t('ui90') : size(file.bytes))),
                button(t('ui91'), () => extraction(entry, file.name), { disabled: file.link, 'aria-label': t('ui92') + file.name }),
                button(t('ui93'), () => askDelete(entry, file.name), { className: 'vv-danger',
                  disabled: blocked || file.link || ['manifest.json', '.video-vision.json'].includes(file.name), 'aria-label': t('ui94') + file.name }))))))));
    }
    const inject = ['slots', 'locale', 'connection'];
    function apply(ctx) {
      const messages = {
        zh: {"nav": "视频视觉", "ui0": "检查完成：已导入的登录态可用。", "ui1": "检查完成：尚无可用登录态，请导入或刷新。", "ui2": "新位置已启用，旧目录中有文件仍被占用：", "ui3": "缓存目录已设置。", "ui4": "已保存：默认浏览器授权开启，内置浏览器同步开启。", "ui5": "已保存：默认浏览器授权开启，内置浏览器同步关闭。", "ui6": "已保存：默认浏览器授权和同步均已关闭。", "ui7": "刷新完成：登录态已更新。", "ui8": "导入完成：登录态已保存。", "ui9": "已打开浏览器连接设置。已有 CAH 或其他可用连接时，直接点击导入即可。", "ui10": "已合并音轨并保存到：", "ui11": "已保存到：", "ui12": "删除缓存文件「", "ui13": "删除「", "ui14": "」的全部缓存？", "ui15": "视频视觉设置", "ui16": "视频视觉", "ui17": "DSH Video Vision 0.9.2 · 视频、音频与画面缓存管理", "ui18": "处理中…", "ui19": "刷新", "ui20": "列表已刷新", "ui21": "正在读取缓存…", "ui22": "浏览器登录态授权", "ui23": "授权使用默认浏览器登录态", "ui24": "同步至 DSH 内置浏览器", "ui25": "正在保存授权设置…", "ui26": "自动发现并复用正在运行的浏览器登录态，供 DSH 访问需要登录的网站。开启同步后，DSH 内置浏览器也可使用。", "ui27": "登录态加密保存在本机，点击“刷新登录态”可更新。", "ui28": "保持已登录的浏览器运行，点击“导入登录态”；以后按需刷新。", "ui29": "默认浏览器：", "ui30": "读取中", "ui31": " · 登录态：", "ui32": "暂不可读取", "ui33": "已导入", "ui34": "需刷新", "ui35": "未导入", "ui36": " · 导入时间：", "ui37": "正在导入登录态…", "ui38": "登录态已导入", "ui39": "导入登录态", "ui40": "正在刷新登录态…", "ui41": "刷新登录态", "ui42": "正在检查…", "ui43": "检查状态", "ui44": "若登录态失效，请点击“刷新登录态”。", "ui45": "正在发现浏览器连接并导入登录态；若浏览器显示连接确认，请选择允许。", "ui46": "首次导入登录态", "ui47": "首次使用", "ui48": "保持已登录的浏览器运行；CAH 等现有浏览器连接会自动识别。", "ui49": "开启授权，点击“导入登录态”。浏览器若显示连接确认，选择允许即可。", "ui50": "看到“导入完成”后即可使用；后续只需按需刷新。", "ui51": "正在打开…", "ui52": "浏览器连接设置（可选）", "ui53": "已运行 CAH 等浏览器会话时直接导入；需要建立新的 Chrome 连接时，可使用上方设置。", "ui54": "存储位置", "ui55": "缓存文件夹（完整路径）", "ui56": "使用“设置缓存目录”选择文件夹", "ui57": "设置缓存目录", "ui58": "缓存文件夹", "ui59": "方法文件夹", "ui60": "“提取视频”会将已缓存的独立音轨无损合并到视频；单文件“提取”按原样保存。", "ui61": "更改位置会迁移列表中的缓存，观看进度与已有画面一并保留。", "ui62": "方法与扩展文件夹", "ui63": "正在读取…", "ui64": "点击“方法文件夹”查看方法指导、站点解析扩展和持久化笔记；升级插件或清空视频缓存会保留它们。", "ui65": "当前占用", "ui66": "清空全部缓存", "ui67": "清空列表中的 ", "ui68": " 项缓存？已提取的文件和本地原视频会保留。", "ui69": "磁盘占用", "ui70": "缓存条目", "ui71": "视频画面", "ui72": "清理仅处理本插件缓存，保留目录中的其他文件。", "ui73": "确认删除缓存", "ui74": "确认删除", "ui75": "缓存已删除", "ui76": "取消", "ui77": "缓存列表", "ui78": "搜索缓存", "ui79": "搜索标题、平台或视频 ID", "ui80": "没有匹配的缓存", "ui81": "还没有视频缓存。发送视频链接即可开始观看。", "ui82": "未完成的缓存", "ui83": " · 视频轨（音频独立缓存）", "ui84": " · 本地原文件保留在原位置", "ui85": "查看原视频 ↗", "ui86": "打开目录", "ui87": "提取视频", "ui88": "删除缓存", "ui89": "文件列表（", "ui90": "目录链接", "ui91": "提取", "ui92": "提取 ", "ui93": "删除", "ui94": "删除 ", "ui95": "缓存管理请求失败"},
        en: {"nav": "Video Vision", "ui0": "Check complete: the imported browser session is available.", "ui1": "Check complete: no browser session is available. Import or refresh it.", "ui2": "The new location is active. Some files in the old folder are still in use: ", "ui3": "Cache directory set.", "ui4": "Saved: default browser authorization and built-in browser sync are on.", "ui5": "Saved: default browser authorization is on; built-in browser sync is off.", "ui6": "Saved: default browser authorization and sync are off.", "ui7": "Refresh complete: browser session updated.", "ui8": "Import complete: browser session saved.", "ui9": "Browser connection settings opened. If CAH or another connection is available, click Import browser session.", "ui10": "Audio merged and saved to: ", "ui11": "Saved to: ", "ui12": "Delete cached file “", "ui13": "Delete all cached files for “", "ui14": "”?", "ui15": "Video Vision settings", "ui16": "Video Vision", "ui17": "DSH Video Vision 0.9.2 · Video, audio and frame cache management", "ui18": "Processing…", "ui19": "Refresh", "ui20": "List refreshed", "ui21": "Loading cache…", "ui22": "Browser session authorization", "ui23": "Allow use of the default browser session", "ui24": "Sync to the DSH built-in browser", "ui25": "Saving authorization settings…", "ui26": "Automatically discover and reuse a running browser session for websites that require login. Enable sync to also use it in the DSH built-in browser.", "ui27": "Sessions are encrypted and stored locally. Click “Refresh browser session” to update them.", "ui28": "Keep your signed-in browser running and click “Import browser session”; refresh as needed afterward.", "ui29": "Default browser: ", "ui30": "Loading", "ui31": " · Session: ", "ui32": "Currently unavailable", "ui33": "Imported", "ui34": "Refresh required", "ui35": "Not imported", "ui36": " · Imported: ", "ui37": "Importing browser session…", "ui38": "Browser session imported", "ui39": "Import browser session", "ui40": "Refreshing browser session…", "ui41": "Refresh browser session", "ui42": "Checking…", "ui43": "Check status", "ui44": "If the session expires, click “Refresh browser session”.", "ui45": "Discovering browser connections and importing the session. If the browser asks to connect, choose Allow.", "ui46": "First browser session import", "ui47": "Getting started", "ui48": "Keep your signed-in browser running. Existing browser connections such as CAH are detected automatically.", "ui49": "Enable authorization and click “Import browser session”. If the browser asks to connect, choose Allow.", "ui50": "Once “Import complete” appears, you can use the session. Refresh as needed afterward.", "ui51": "Opening…", "ui52": "Browser connection settings (optional)", "ui53": "Import directly when a browser session such as CAH is running. Use the settings above to establish a new Chrome connection.", "ui54": "Storage location", "ui55": "Cache folder (full path)", "ui56": "Use “Set cache directory” to choose a folder", "ui57": "Set cache directory", "ui58": "Cache folder", "ui59": "Methods folder", "ui60": "“Extract video” losslessly merges separately cached audio into the video. “Extract” saves an individual file unchanged.", "ui61": "Changing the location moves the listed caches, preserving playback progress and existing frames.", "ui62": "Methods and extensions folder", "ui63": "Loading…", "ui64": "Open “Methods folder” for guidance, site resolver extensions and persistent notes. Plugin upgrades and clearing the video cache preserve these files.", "ui65": "Current usage", "ui66": "Clear all cache", "ui67": "Clear all ", "ui68": " cache entries in the list? Extracted files and local source videos will be preserved.", "ui69": "Disk usage", "ui70": "Cache entries", "ui71": "Video frames", "ui72": "Cleanup only affects this plugin’s cache; other files in the directory are preserved.", "ui73": "Confirm cache deletion", "ui74": "Confirm deletion", "ui75": "Cache deleted", "ui76": "Cancel", "ui77": "Cache list", "ui78": "Search cache", "ui79": "Search by title, platform or video ID", "ui80": "No matching cache entries", "ui81": "No video cache yet. Send a video link to start watching.", "ui82": "Incomplete cache", "ui83": " · Video track (audio cached separately)", "ui84": " · Local source file remains in its original location", "ui85": "View original video ↗", "ui86": "Open folder", "ui87": "Extract video", "ui88": "Delete cache", "ui89": "Files (", "ui90": "Directory link", "ui91": "Extract", "ui92": "Extract ", "ui93": "Delete", "ui94": "Delete ", "ui95": "Cache management request failed"}
      };
      Object.assign(messages.zh, { cdpSource: '选择来源浏览器连接', sourceLabel: '来源浏览器：', webSessionDescription: '复用已导入的浏览器登录态，访问需要登录的网站。' });
    Object.assign(messages.en, { cdpSource: 'Select source browser connection', sourceLabel: 'Source browser: ', webSessionDescription: 'Reuse an imported browser session to access websites that require login.' });
    ctx.effect(() => ctx.locale.register('video-vision', messages));
      const t = ctx.locale.bind('video-vision');
      const backendMessages = {"缓存正在整理，请完成后再查看视频。": "The cache is being reorganized. Wait for it to finish before watching videos.", "视频任务正在使用缓存，请稍后重试。": "A video task is using the cache. Please try again later.", "无效的视频缓存 ID。": "Invalid video cache ID.", "缓存目录不存在或是链接。": "The cache directory does not exist or is a link.", "此目录不是可管理的视频缓存。": "This directory is not a manageable video cache.", "请选择普通文件夹作为缓存目录。": "Select a regular folder as the cache directory.", "缓存文件不存在，请刷新列表。": "The cached file does not exist. Refresh the list.", "索引文件随整项缓存一起删除。": "Index files are deleted together with the entire cache entry.", "此缓存含目录链接，请先在文件管理器中处理。": "This cache contains directory links. Handle them in the file manager first.", "列表中含目录链接，请先在文件管理器中处理。": "The list contains directory links. Handle them in the file manager first.", "请选择与缓存源文件不同的保存位置。": "Choose a save location different from the cached source file.", "请选择与缓存音频文件不同的保存位置。": "Choose a save location different from the cached audio file.", "音视频合并未生成有效文件。": "Merging audio and video did not produce a valid file.", "DSH 设置服务尚未就绪。": "The DSH settings service is not ready.", "请填写缓存文件夹的完整路径。": "Enter the full path to the cache folder.", "新旧缓存目录不能互相包含。": "The old and new cache directories cannot contain each other.", "缓存含目录链接，请先在文件管理器中处理。": "The cache contains directory links. Handle them in the file manager first.", "目标目录已有同名缓存：": "The destination already contains a cache with this name: ", "当前平台": "Current platform", "未识别": "Unrecognized", "本地组件已安装，等待 Desktop 载入。": "The local component is installed, waiting for Desktop to load it.", "本地组件缺失，点击“导入登录态”可恢复组件。": "The local component is missing. Click “Import browser session” to restore it.", "请先开启“授权使用默认浏览器登录态”。": "Enable “Allow use of the default browser session” first.", "本地会话组件已恢复。请重启 DSH Desktop 载入组件，再点击导入登录态。": "The local session component has been restored. Restart DSH Desktop to load it, then import the browser session.", "本地会话组件已安装但尚未运行。请重启 DSH Desktop 载入组件，再点击导入登录态。": "The local session component is installed but not running. Restart DSH Desktop to load it, then import the browser session.", "请在 Chrome 中打开 ": "Open this in Chrome: ", "默认浏览器授权已关闭或更新。": "Default browser authorization has been disabled or updated.", "默认浏览器授权已关闭。": "Default browser authorization is off.", "内置浏览器同步已关闭。": "Built-in browser sync is off.", "请通过 Desktop 设置中的授权开关操作。": "Use the authorization switch in Desktop settings.", "请确认删除。": "Confirm deletion.", "请确认清空缓存。": "Confirm clearing the cache.", "Windows 文件窗口未能打开。": "The Windows file dialog could not be opened.", "Windows 文件窗口未返回结果。": "The Windows file dialog did not return a result.", "系统另存为窗口用于 Windows。": "The system Save As dialog is available on Windows.", "本地会话服务未响应，请重新打开设置。": "The local session service did not respond. Reopen settings.", "无法连接本地会话组件，请检查组件状态。": "Cannot connect to the local session component. Check its status.", "本地浏览器桥已断开。": "The local browser bridge disconnected.", "请先设置本地浏览器桥。": "Set up the local browser bridge first.", "本地浏览器请求未完成，请检查连接。": "The local browser request did not complete. Check the connection.", "本地浏览器桥响应无效。": "Invalid response from the local browser bridge.", "浏览器连接信息不完整。": "Browser connection information is incomplete.", "请先在设置中导入登录态。": "Import the browser session in settings first.", "未找到可用的浏览器连接。请保持已登录的浏览器或 CAH 运行，再点击导入。": "No available browser connection was found. Keep your signed-in browser or CAH running, then click Import.", "未能连接正在运行的浏览器。请保持来源浏览器运行后重试。": "Could not connect to the running browser. Keep the source browser running and try again.", "等待浏览器确认超时。原登录态未改动，可再次点击刷新。": "Timed out waiting for browser confirmation. The previous session is unchanged; you can refresh again.", "浏览器未提供可导入的 Cookie。原登录态未改动。": "The browser did not provide cookies to import. The previous session is unchanged.", "当前系统的本地加密存储不可用，未保存登录态。": "Local encrypted storage is unavailable on this system. The session was not saved.", "登录态未能保存，原登录态未改动。": "The session could not be saved. The previous session is unchanged.", "正在导入登录态，请等待本次操作结束。": "A session import is in progress. Wait for it to finish.", "本地会话服务连接未授权。": "The local session service connection is not authorized.", "本地会话请求无效。": "Invalid local session request."};
      const localizeMessage = value => {
        const english = ctx.locale.getSnapshot().active === 'en';
        const pairs = [...Object.keys(messages.zh).map(key => [messages.zh[key], messages.en[key]]), ...Object.entries(backendMessages)];
        for (const [zh, en] of pairs) if (value === zh || value === en) return english ? en : zh;
        for (const key of ['ui2', 'ui10', 'ui11']) {
          const zh = messages.zh[key], en = messages.en[key];
          for (const prefix of [zh, en]) if (value.startsWith(prefix)) return (english ? en : zh) + value.slice(prefix.length);
        }
        return value;
      };
      const rpc = async (endpoint, payload = {}) => {
        const result = await ctx.connection.rpc.call('/api', 'video-vision/cache/' + endpoint, { ...payload, uiLanguage: ctx.locale.getSnapshot().active });
        if (!result?.ok) throw new Error(result?.error?.message || t('ui95'));
        return result.value;
      };
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section', id: 'video-vision-cache', order: 110,
        label: () => t('nav'), locale: 'video-vision', inject: () => ({ rpc, t, locale: ctx.locale, localizeMessage })
      }, VideoSettings));
    }
    return { apply, inject };
  }
});
