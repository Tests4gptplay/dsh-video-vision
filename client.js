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
      .vv-card{border:1px solid var(--dsw-alias-border-l2,#c8cbd3);border-radius:14px;padding:16px;margin-top:14px;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-background-secondary,rgba(255,255,255,.08)))}
      .vv-row{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
      .vv-actions{display:flex;gap:7px;flex-wrap:wrap;align-items:center}
      .vv-settings button,.vv-link{font:inherit;line-height:1.4;border:1px solid var(--dsw-alias-border-l2,#b9becb);border-radius:8px;padding:7px 11px;background:transparent;color:inherit;cursor:pointer;text-decoration:none;white-space:nowrap}
      .vv-settings button:hover:not(:disabled),.vv-link:hover{background:var(--vv-hover-bg,var(--dsw-alias-interactive-bg-hover,rgba(110,125,180,.12)))}
      .vv-settings button:focus-visible,.vv-settings input:focus-visible,.vv-settings select:focus-visible,.vv-settings summary:focus-visible,.vv-link:focus-visible{outline:2px solid var(--vv-focus-color,var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#6e83c1)));outline-offset:2px}
      .vv-settings button:disabled{opacity:.45;cursor:default}
      .vv-settings .vv-primary{background:var(--vv-primary-bg,var(--dsw-alias-button-primary-fill,var(--dsw-alias-state-business-primary,#596fa9)));border-color:var(--vv-primary-border,var(--vv-primary-bg,var(--dsw-alias-button-primary-fill,var(--dsw-alias-state-business-primary,#596fa9))));color:var(--vv-primary-label,var(--dsw-alias-label-primary-foreground,white))}
      .vv-settings .vv-primary:hover:not(:disabled){background:var(--vv-primary-hover-bg,var(--dsw-alias-button-primary-hover,var(--vv-primary-bg,var(--dsw-alias-state-business-primary,#596fa9))))}
      .vv-settings .vv-danger{color:var(--vv-danger-color,var(--dsw-alias-state-error-primary,#c33e4c));border-color:var(--vv-danger-border,var(--dsw-alias-state-error-secondary,rgba(195,62,76,.35)))}
      .vv-settings input{width:100%;min-width:0;background:transparent;color:inherit;border:1px solid var(--dsw-alias-border-l2,#c8cbd3);border-radius:8px;padding:9px 10px;font:inherit;margin:7px 0}
      .vv-settings select{font:inherit;color:var(--vv-select-label,var(--dsw-alias-label-primary,inherit));background:var(--vv-select-bg,var(--dsw-alias-bg-layer-2,var(--dsw-alias-background-secondary,transparent)));border-color:var(--vv-select-border,var(--dsw-alias-border-l2,#c8cbd3));color-scheme:inherit}
      .vv-stats{display:flex;gap:26px;flex-wrap:wrap;padding:10px 0 0}
      .vv-stat strong{font-size:24px;line-height:1.3;font-weight:650;display:block}
      .vv-stat span{font-size:12px;color:var(--dsw-alias-label-secondary)}
      .vv-item{padding:15px 0;border-top:1px solid var(--dsw-alias-border-l2,#c8cbd3)}
      .vv-item:first-child{border-top:0;padding-top:4px}
      .vv-title{font-weight:600;overflow-wrap:anywhere}
      .vv-path{font-family:ui-monospace,Consolas,monospace;overflow-wrap:anywhere;font-size:11px}
      .vv-badge{font-size:11px;border-radius:5px;padding:2px 6px;background:var(--vv-badge-bg,var(--dsw-alias-interactive-bg-hover,rgba(110,125,180,.13)))}
      .vv-settings details{margin-top:10px}
      .vv-settings summary{cursor:pointer;color:var(--dsw-alias-label-secondary)}
      .vv-file{display:flex;align-items:center;gap:8px;border-top:1px solid var(--dsw-alias-border-l2,#c8cbd3);padding:8px 0}
      .vv-file-name{flex:1;min-width:0;overflow-wrap:anywhere;font-size:12px}
      .vv-file button{padding:4px 8px;font-size:12px}
      .vv-notice{padding:11px 13px;border-radius:9px;margin-top:12px;background:var(--vv-notice-bg,var(--dsw-alias-interactive-bg-hover,rgba(100,135,180,.13)));overflow-wrap:anywhere}
      .vv-error{color:var(--vv-error-color,var(--dsw-alias-state-error-primary,#c33e4c));background:var(--vv-error-bg,var(--dsw-alias-interactive-bg-hover-danger,rgba(195,62,76,.09)))}
      .vv-confirm{border:1px solid var(--vv-confirm-border,var(--dsw-alias-state-error-secondary,rgba(195,62,76,.4)));padding:13px;border-radius:10px;margin-top:12px}
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
      // Translate Video Vision-owned labels at render time, including previously saved copies.
      // Keep real browser/profile names and stored source identities unchanged.
      const sourceLabel = label => ['Google Chrome（浏览器内确认）', 'Google Chrome (confirm in browser)'].includes(label)
        ? t('browserConfirmedChrome') : label;
      const language = React.useSyncExternalStore(callback => locale.subscribe(callback), () => locale.getSnapshot(), () => locale.getSnapshot()).active;
      const [data, setData] = useState(null);
      const [budgets, setBudgets] = useState({ maxDownloadMB: 0, downloadTimeoutMs: 0, processTimeoutMs: 0 });
      const [cachePath, setCachePath] = useState('');
      const [localBusy, setBusy] = useState(false);
      const backendImporting = data?.browser_session?.importing === true;
      const busy = localBusy || backendImporting;
      const [error, setError] = useState('');
      const [notice, setNotice] = useState('');
      const [confirm, setConfirm] = useState(null);
      const confirmationRef = useRef(null);
      useEffect(() => {
        // Session confirmation stays beside its button; never jump to media settings.
        if (confirm && confirm.endpoint !== 'browser-clear') confirmationRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }, [confirm]);
      const [search, setSearch] = useState('');
      const [setupInfo, setSetupInfo] = useState(null);
      const [pendingAction, setPendingAction] = useState('');
      const [maxHeight, setMaxHeight] = useState(null);
      async function reload() {
        const result = await rpc('list');
        setData(result); setMaxHeight(result.maxHeight ?? 0); setBudgets(result.budgets || { maxDownloadMB: 0, downloadTimeoutMs: 0, processTimeoutMs: 0 });
        return result;
      }
      useEffect(() => { let alive = true;
        rpc('list').then(result => {
          if (alive) { setData(result); setMaxHeight(result.maxHeight ?? 0); setBudgets(result.budgets || { maxDownloadMB: 0, downloadTimeoutMs: 0, processTimeoutMs: 0 }); setCachePath(result.root); }
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
          if (endpoint === 'browser-clear' && (value.cleared !== true || value.failures?.length)) {
            setError(t('sessionClearFailed') + (value.failures || []).map(item => typeof item === 'string' ? item : [item.path || item.file || item.sourceId, item.message || item.error || item.code].filter(Boolean).join(': ')).join('; '));
            return;
          }
          setNotice(endpoint === 'browser-status' ? sessionLabel(value) :
            value.retained?.length ? t('ui2') + value.retained.join('、') : message);
        } catch (e) { setError(e.message); }
        finally { setBusy(false); setPendingAction(''); }
      }
      function sessionLabel(state) {
        const keys = { absent: 'ui35', cleared: 'sessionRevoked', empty: 'emptySession', ready: 'sessionReadable', read_failed: 'sessionReadFailed', decrypt_failed: 'sessionDecryptFailed', unknown: 'sessionUnknown', rollback_failed: 'sessionRecovery', rollback_cleanup_failed: 'sessionRecovery' };
        return t(keys[state?.snapshotState] || 'sessionUnknown');
      }
      const sourceAvailable = data?.browser_session?.sourceAvailable ?? (data?.browser_session?.sources || []).some(item => item.id === data?.browser_session?.sourceId && item.available !== false);
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
      async function authorizeBrowser(enabled) {
        await act('browser-authorization', { enabled }, enabled ? t('ui5') : t('ui6'));
      }
      async function cancelBrowserImport() {
        try {
          const operationId = data?.browser_session?.importOperationId;
          const localImport = ['browser-setup', 'browser-refresh'].includes(pendingAction);
          // A reopened page must never cancel a newer, unrelated import.
          if (!localImport && !operationId) return;
          const result = await rpc('browser-cancel', operationId ? { operationId } : {});
          setNotice(result.cancellationRequested === false ? '' : t('importCancelRequested'));
          if (operationId) await reload();
        }
        catch (e) { setError(e.message); }
      }
      async function importBrowser(refresh = false) {
        if (busy) return;
        const endpoint = refresh ? 'browser-refresh' : 'browser-setup';
        setBusy(true); setPendingAction(endpoint); setError(''); setNotice('');
        try {
          const result = await rpc(endpoint);
          setSetupInfo(null);
          await reload();
          if (result?.cleanupPending) setError(t('sessionRecovery'));
          else setNotice(refresh ? t('ui7') : t('ui8'));
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
      const confirmation = confirm && h('div', { ref: confirmationRef, className: 'vv-confirm', role: 'alertdialog', 'aria-label': t(confirm.endpoint === 'browser-clear' ? 'sessionClear' : 'ui73') },
          h('div', null, confirm.endpoint === 'browser-clear' ? t('sessionClearConfirm') : confirm.endpoint === 'clear' ? t('ui67') + confirm.count + t('ui68') : confirm.file ? t('ui12') + confirm.file + (language === 'en' ? '”?' : '」？') : t('ui13') + confirm.entryTitle + t('ui14')),
          h('div', { className: 'vv-actions', style: { marginTop: 10 } },
            button(t('ui74'), () => act(confirm.endpoint, confirm.payload, t(confirm.endpoint === 'browser-clear' ? 'sessionCleared' : 'ui75')), { className: 'vv-danger' }),
            button(t('ui76'), () => setConfirm(null))));
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
              onChange: event => authorizeBrowser(event.target.checked) }),
            t('ui23')),
          pendingAction === 'browser-authorization' && h('div', { className: 'vv-notice', role: 'status' }, t('ui25')),
          h('div', { className: 'vv-sub', style: { marginTop: 7 } },
            t('webSessionDescription')),
          h('div', { className: 'vv-sub', style: { marginTop: 5 } },
            t('ui27')),
          h('strong', { className: 'vv-first-use' }, t('ui28')),
          h('div', { className: 'vv-sub', style: { marginTop: 5 } },
            t(data?.browser_session?.localCapture ? 'sourceLabel' : 'ui29') + (sourceLabel(data?.browser_session?.browser) || t('ui30')) + t('ui31') +
            sessionLabel(data?.browser_session) + (data?.browser_session?.sourceAvailable === false ? ' · ' + t('sourceUnavailable') : '') +
            (data?.browser_session?.importedAt ? t('ui36') + new Date(data.browser_session.importedAt).toLocaleString(language === 'en' ? 'en' : 'zh-CN') : '') +
            (data?.browser_session?.componentMessage ? ' · ' + data.browser_session.componentMessage : '')),
          data?.browser_session?.localCapture && data?.browser_session?.sources?.length > 0 && h('select', {
            value: data.browser_session.sourceId || '', 'aria-label': t('cdpSource'), disabled: busy,
            onChange: event => act('browser-source', { sourceId: event.target.value }, '') },
            h('option', { value: '', disabled: true }, t('cdpSource')),
            data.browser_session.sourceId && !data.browser_session.sources.some(item => item.id === data.browser_session.sourceId) &&
              h('option', { value: data.browser_session.sourceId, disabled: true },
                (sourceLabel(data.browser_session.browser) || t('ui30')) + ' · ' + t('sourceUnavailable')),
            ...data.browser_session.sources.map(item => h('option', { key: item.id, value: item.id }, sourceLabel(item.label) + (item.available === false ? ' · ' + t('sourceUnavailable') : '')))),
          h('div', { className: 'vv-actions', style: { marginTop: 9 } },
            button(pendingAction === 'browser-setup' ? t('ui37') : data?.browser_session?.connected ? t('ui38') : t('ui39'), () => importBrowser(),
              { className: 'vv-primary', disabled: busy || !data?.browser_session?.enabled || !data?.browser_session?.sourceId || !sourceAvailable || data?.browser_session?.connected === true }),
            button(pendingAction === 'browser-refresh' ? t('ui40') : t('ui41'), () => importBrowser(true),
              { disabled: busy || !data?.browser_session?.enabled || !data?.browser_session?.sourceId || !sourceAvailable || !data?.browser_session?.imported }),
            (backendImporting || ['browser-setup', 'browser-refresh'].includes(pendingAction)) && button(t('cancelImport'), cancelBrowserImport, { disabled: !['browser-setup', 'browser-refresh'].includes(pendingAction) && !data?.browser_session?.importOperationId }),
            button(pendingAction === 'browser-status' ? t('ui42') : t('ui43'), () => act('browser-status', { checkExtension: true }, ''), { disabled: localBusy || !data }),
            button(pendingAction === 'browser-clear' ? t('sessionClearing') : t('sessionClear'),
              () => setConfirm({ endpoint: 'browser-clear', payload: { confirm: true } }), { disabled: busy || !data })),
          confirm?.endpoint === 'browser-clear' && confirmation,
          h('div', { className: 'vv-sub', style: { marginTop: 6 } }, t('ui44')),
          (backendImporting || ['browser-setup', 'browser-refresh'].includes(pendingAction)) && h('div', { className: 'vv-notice', role: 'status' },
            t('ui45')),
          (!data?.browser_session?.imported || setupInfo) && h('div', { className: 'vv-setup', 'aria-label': t('ui46') },
            h('strong', null, t('ui47')),
            h('ol', null,
              h('li', null, t('ui48')),
              h('li', null, t('ui49')),
              h('li', null, t('ui50'))),
            button(pendingAction === 'browser-settings' ? t('ui51') : data?.browser_session?.extensionInstallation?.state === 'installed' ? t('extensionInstalled') : data?.browser_session?.extensionInstallation?.state === 'checking' ? t('extensionChecking') : t('ui52'), openBrowserSettings,
              { disabled: busy || ['installed', 'checking'].includes(data?.browser_session?.extensionInstallation?.state) }),
            h('div', { className: 'vv-sub', style: { marginTop: 6 } }, t('ui53')),
            ['unknown', 'failed'].includes(data?.browser_session?.extensionInstallation?.state) && h('div', { className: 'vv-sub' }, t('extensionUnknown')))),
        h('div', { className: 'vv-card' },
          h('h3', null, t('ui54')),
          h('details', null, h('summary', null, t('sourceQualityTitle')),
            h('label', null, t('sourceHeight'), h('input', { type: 'number', min: 0, step: 1, disabled: busy,
              value: maxHeight ?? data?.maxHeight ?? 0, 'aria-label': t('sourceHeight'),
              onChange: event => setMaxHeight(Number(event.target.value)) })),
            h('div', { className: 'vv-sub' }, t('sourceQualityHelp')),
            button(t('sourceQualitySave'), () => act('source-quality', { maxHeight: maxHeight ?? data?.maxHeight ?? 0 }, t('sourceQualitySaved')), { disabled: busy || !data })),
          h('details', null, h('summary', null, t('budgetsTitle')),
            h('div', { className: 'vv-sub' }, t('budgetsHelp')),
            ...[['maxDownloadMB', 'budgetSize', 1], ['downloadTimeoutMs', 'budgetDownloadTime', 1000], ['processTimeoutMs', 'budgetProcessTime', 1000]].map(([key, label, unit]) =>
              h('label', { key }, t(label), h('input', { type: 'number', min: 0, step: 'any', disabled: busy,
                value: budgets[key] / unit, 'aria-label': t(label),
                onChange: event => setBudgets(previous => ({ ...previous, [key]: Number(event.target.value) * unit })) }))),
            button(t('budgetsSave'), () => act('budgets', budgets, t('budgetsSaved')))),
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
          h('div', { className: 'vv-sub', style: { marginTop: 5 } },
            h('div', null, t('ui64')),
            h('div', null, t('methodsPreserved')))),
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
        confirm?.endpoint !== 'browser-clear' && confirmation,
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
        zh: {"cancelImport": "取消导入", "importCancelRequested": "正在取消导入…", "browserConfirmedChrome": "Google Chrome（浏览器内确认）", "nav": "视频视觉", "ui2": "新位置已启用，旧目录中有文件仍被占用：", "ui3": "缓存目录已设置。", "ui5": "已保存：浏览器登录态授权开启。", "ui6": "已保存：浏览器登录态授权关闭。", "ui7": "刷新完成：登录态已更新。", "ui8": "导入完成：登录态已保存。", "ui9": "已打开扩展商店页面。", "ui10": "已合并音轨并保存到：", "ui11": "已保存到：", "ui12": "删除缓存文件「", "ui13": "删除「", "ui14": "」的全部缓存？", "ui15": "视频视觉设置", "ui16": "视频视觉", "ui17": "DSH Video Vision 0.10.0-candidate.4 · 网络与本地视频分析、缓存和提取保存", "ui18": "处理中…", "ui19": "刷新", "ui20": "列表已刷新", "ui21": "正在读取缓存…", "ui22": "浏览器登录态授权", "ui23": "授权使用默认浏览器登录态", "ui25": "正在保存授权设置…", "ui27": "登录态加密保存在本机，点击“刷新登录态”可更新。", "ui28": "保持已登录的浏览器运行，明确选择来源后点击“导入登录态”；以后按需刷新。", "ui29": "默认浏览器：", "ui30": "读取中", "ui31": " · 登录态：", "ui32": "暂不可读取", "ui33": "已导入", "ui34": "需刷新", "ui35": "未导入", "ui36": " · 导入时间：", "ui37": "正在导入登录态…", "ui38": "登录态已导入", "ui39": "导入登录态", "ui40": "正在刷新登录态…", "ui41": "刷新登录态", "ui42": "正在检查…", "ui43": "检查状态", "ui44": "若登录态失效，请点击“刷新登录态”。", "ui45": "正在发现浏览器连接并导入登录态；若浏览器显示连接确认，请选择允许。", "ui46": "首次导入登录态", "ui47": "首次使用", "ui48": "保持已登录的浏览器运行；现有的浏览器连接会自动识别。", "ui49": "开启授权，选择来源浏览器连接，再点击“导入登录态”。浏览器若显示连接确认，选择允许即可。", "ui50": "导入完成表示已保存副本，不代表任一网站已验证登录成功。后续按需刷新。", "ui51": "正在打开…", "ui52": "安装 Chrome 扩展", "extensionInstalled": "已安装", "extensionChecking": "正在检查安装状态…", "extensionUnknown": "安装状态尚未确认。", "ui53": "安装后，在浏览器内确认连接；再次导入会更新此处保存的登录态。", "ui54": "存储位置", "ui55": "缓存文件夹（完整路径）", "ui56": "使用“设置缓存目录”选择文件夹", "ui57": "设置缓存目录", "ui58": "缓存文件夹", "ui59": "方法文件夹", "ui60": "“提取视频”会将已缓存的独立音轨无损合并到视频；单文件“提取”按原样保存。", "ui61": "更改位置会迁移列表中的缓存，观看进度与已有画面一并保留。", "ui62": "方法与扩展文件夹", "ui63": "正在读取…", "ui64": "点击“方法文件夹”查看方法指导、站点解析扩展和持久化笔记。", "methodsPreserved": "升级插件或清空视频缓存会保留它们。", "ui65": "当前占用", "ui66": "清空全部缓存", "ui67": "清空列表中的 ", "ui68": " 项缓存？已提取的文件和本地原视频会保留。", "ui69": "磁盘占用", "ui70": "缓存条目", "ui71": "视频画面", "ui72": "清理仅处理本插件缓存，保留目录中的其他文件。", "ui73": "确认删除缓存", "ui74": "确认删除", "ui75": "缓存已删除", "ui76": "取消", "ui77": "缓存列表", "ui78": "搜索缓存", "ui79": "搜索标题、平台或视频 ID", "ui80": "没有匹配的缓存", "ui81": "还没有视频缓存。发送视频链接即可开始观看。", "ui82": "未完成的缓存", "ui83": " · 视频轨（音频独立缓存）", "ui84": " · 本地原文件保留在原位置", "ui85": "查看原视频 ↗", "ui86": "打开目录", "ui87": "提取视频", "ui88": "删除缓存", "ui89": "文件列表（", "ui90": "目录链接", "ui91": "提取", "ui92": "提取 ", "ui93": "删除", "ui94": "删除 ", "ui95": "缓存管理请求失败", "sessionClear": "清理登录态", "sessionClearing": "正在清理登录态…", "sessionClearConfirm": "删除 Video Vision 自己保存的登录态副本并停止使用它们？不退出来源浏览器或 DSH 内置浏览器的登录，也不清理媒体缓存。", "sessionCleared": "Video Vision 登录态副本已清理。来源浏览器、DSH 内置浏览器和媒体缓存未改动。", "sessionClearFailed": "清理未全部成功；未能删除的副本需重试。详情：", "sessionReadable": "已保存可读取副本（未验证站点登录）", "sessionReadFailed": "副本读取失败（不是空登录态）", "sessionDecryptFailed": "副本解密失败（不是空登录态）", "sessionUnknown": "副本状态未知", "sessionRevoked": "副本读取已撤销", "sessionRecovery": "副本事务恢复/清理未完成，读取已停止；请清理 Video Vision 副本后重新导入。"},
        en: {"cancelImport": "Cancel import", "importCancelRequested": "Cancelling import…", "browserConfirmedChrome": "Google Chrome (confirm in browser)", "nav": "Video Vision", "ui2": "The new location is active. Some files in the old folder are still in use: ", "ui3": "Cache directory set.", "ui5": "Saved: browser session authorization is on.", "ui6": "Saved: browser session authorization is off.", "ui7": "Refresh complete: browser session updated.", "ui8": "Import complete: browser session saved.", "ui9": "Extension store page opened.", "ui10": "Audio merged and saved to: ", "ui11": "Saved to: ", "ui12": "Delete cached file “", "ui13": "Delete all cached files for “", "ui14": "”?", "ui15": "Video Vision settings", "ui16": "Video Vision", "ui17": "DSH Video Vision 0.10.0-candidate.4 · Online/local video analysis, caching and export", "ui18": "Processing…", "ui19": "Refresh", "ui20": "List refreshed", "ui21": "Loading cache…", "ui22": "Browser session authorization", "ui23": "Allow use of the default browser session", "ui25": "Saving authorization settings…", "ui27": "Sessions are encrypted and stored locally. Click “Refresh browser session” to update them.", "ui28": "Keep your signed-in browser running, select its connection, then import; refresh as needed afterward.", "ui29": "Default browser: ", "ui30": "Loading", "ui31": " · Session: ", "ui32": "Currently unavailable", "ui33": "Imported", "ui34": "Refresh required", "ui35": "Not imported", "ui36": " · Imported: ", "ui37": "Importing browser session…", "ui38": "Browser session imported", "ui39": "Import browser session", "ui40": "Refreshing browser session…", "ui41": "Refresh browser session", "ui42": "Checking…", "ui43": "Check status", "ui44": "If the session expires, click “Refresh browser session”.", "ui45": "Discovering browser connections and importing the session. If the browser asks to connect, choose Allow.", "ui46": "First browser session import", "ui47": "Getting started", "ui48": "Keep your signed-in browser running. Existing browser connections are detected automatically.", "ui49": "Enable authorization, select a source browser connection, then click “Import browser session”. If asked to connect, choose Allow.", "ui50": "Import complete means a copy was saved, not that any website login was verified. Refresh as needed.", "ui51": "Opening…", "ui52": "Install Chrome extension", "extensionInstalled": "Installed", "extensionChecking": "Checking installation…", "extensionUnknown": "Installation status is not confirmed.", "ui53": "After installation, confirm the connection in the browser. Importing again updates the login state saved here.", "ui54": "Storage location", "ui55": "Cache folder (full path)", "ui56": "Use “Set cache directory” to choose a folder", "ui57": "Set cache directory", "ui58": "Cache folder", "ui59": "Methods folder", "ui60": "“Extract video” losslessly merges separately cached audio into the video. “Extract” saves an individual file unchanged.", "ui61": "Changing the location moves the listed caches, preserving playback progress and existing frames.", "ui62": "Methods and extensions folder", "ui63": "Loading…", "ui64": "Open “Methods folder” for guidance, site resolver extensions and persistent notes.", "methodsPreserved": "Plugin upgrades and clearing the video cache preserve these files.", "ui65": "Current usage", "ui66": "Clear all cache", "ui67": "Clear all ", "ui68": " cache entries in the list? Extracted files and local source videos will be preserved.", "ui69": "Disk usage", "ui70": "Cache entries", "ui71": "Video frames", "ui72": "Cleanup only affects this plugin’s cache; other files in the directory are preserved.", "ui73": "Confirm cache deletion", "ui74": "Confirm deletion", "ui75": "Cache deleted", "ui76": "Cancel", "ui77": "Cache list", "ui78": "Search cache", "ui79": "Search by title, platform or video ID", "ui80": "No matching cache entries", "ui81": "No video cache yet. Send a video link to start watching.", "ui82": "Incomplete cache", "ui83": " · Video track (audio cached separately)", "ui84": " · Local source file remains in its original location", "ui85": "View original video ↗", "ui86": "Open folder", "ui87": "Extract video", "ui88": "Delete cache", "ui89": "Files (", "ui90": "Directory link", "ui91": "Extract", "ui92": "Extract ", "ui93": "Delete", "ui94": "Delete ", "ui95": "Cache management request failed", "sessionClear": "Clear login state", "sessionClearing": "Clearing login state…", "sessionClearConfirm": "Delete session copies saved by Video Vision and stop using them? This does not sign out the source browser or DSH built-in browser, or clear media caches.", "sessionCleared": "Video Vision session copies cleared. Source browser, DSH built-in browser and media caches were not changed.", "sessionClearFailed": "Cleanup was not fully successful; retry copies that could not be deleted. Details: ", "sessionReadable": "Readable copy saved (site login not verified)", "sessionReadFailed": "Copy read failed (not an empty session)", "sessionDecryptFailed": "Copy decryption failed (not an empty session)", "sessionUnknown": "Copy status unknown", "sessionRevoked": "Copy reads revoked", "sessionRecovery": "Snapshot transaction recovery/cleanup is incomplete and reads are stopped; clear Video Vision copies before importing again."}
      };
      Object.assign(messages.zh, { sourceQualityTitle: '源视频清晰度', sourceHeight: '源视频分辨率上限（高度，0 表示不限制）', sourceQualityHelp: '这是源视频清晰度设置，不是下载大小预算。不会改变已有缓存或分析画面的缩放尺寸。', sourceQualitySave: '保存清晰度设置', sourceQualitySaved: '源视频清晰度设置已保存。', emptySession: '已导入，当前无登录态', budgetsTitle: '可选处理预算', budgetsHelp: '0 表示不限制；仍可随时停止任务。', budgetSize: '下载大小（MiB）', budgetDownloadTime: '下载总时限（秒）', budgetProcessTime: '单项处理时限（秒）', budgetsSave: '保存预算', budgetsSaved: '预算已保存。', cdpSource: '选择来源浏览器连接', sourceUnavailable: '连接不可用（保留已选来源）', sourceLabel: '来源浏览器：', webSessionDescription: '复用已导入的浏览器登录态，访问需要登录的网站。' });
    Object.assign(messages.en, { sourceQualityTitle: 'Source video quality', sourceHeight: 'Source video resolution limit (height; 0 means unlimited)', sourceQualityHelp: 'This controls source video quality, not the download size budget. Existing cached videos and analysis-frame scaling are unchanged.', sourceQualitySave: 'Save quality setting', sourceQualitySaved: 'Source video quality setting saved.', emptySession: 'Imported; no session cookies', budgetsTitle: 'Optional processing budgets', budgetsHelp: '0 means unlimited; tasks can still be stopped.', budgetSize: 'Download size (MiB)', budgetDownloadTime: 'Download time limit (seconds)', budgetProcessTime: 'Per-process time limit (seconds)', budgetsSave: 'Save budgets', budgetsSaved: 'Budgets saved.', cdpSource: 'Select source browser connection', sourceUnavailable: 'Connection unavailable (selected source retained)', sourceLabel: 'Source browser: ', webSessionDescription: 'Reuse an imported browser session to access websites that require login.' });
    ctx.effect(() => ctx.locale.register('video-vision', messages));
      const t = ctx.locale.bind('video-vision');
      const backendMessages = {"缓存正在整理，请完成后再查看视频。": "The cache is being reorganized. Wait for it to finish before watching videos.", "视频任务正在使用缓存，请稍后重试。": "A video task is using the cache. Please try again later.", "无效的视频缓存 ID。": "Invalid video cache ID.", "缓存目录不存在或是链接。": "The cache directory does not exist or is a link.", "此目录不是可管理的视频缓存。": "This directory is not a manageable video cache.", "请选择普通文件夹作为缓存目录。": "Select a regular folder as the cache directory.", "缓存文件不存在，请刷新列表。": "The cached file does not exist. Refresh the list.", "索引文件随整项缓存一起删除。": "Index files are deleted together with the entire cache entry.", "此缓存含目录链接，请先在文件管理器中处理。": "This cache contains directory links. Handle them in the file manager first.", "列表中含目录链接，请先在文件管理器中处理。": "The list contains directory links. Handle them in the file manager first.", "请选择与缓存源文件不同的保存位置。": "Choose a save location different from the cached source file.", "请选择与缓存音频文件不同的保存位置。": "Choose a save location different from the cached audio file.", "音视频合并未生成有效文件。": "Merging audio and video did not produce a valid file.", "DSH 设置服务尚未就绪。": "The DSH settings service is not ready.", "请填写缓存文件夹的完整路径。": "Enter the full path to the cache folder.", "新旧缓存目录不能互相包含。": "The old and new cache directories cannot contain each other.", "缓存含目录链接，请先在文件管理器中处理。": "The cache contains directory links. Handle them in the file manager first.", "目标目录已有同名缓存：": "The destination already contains a cache with this name: ", "当前平台": "Current platform", "未识别": "Unrecognized", "请先开启“授权使用默认浏览器登录态”。": "Enable “Allow use of the default browser session” first.", "请在 Chrome 中打开 ": "Open this in Chrome: ", "默认浏览器授权已关闭或更新。": "Default browser authorization has been disabled or updated.", "默认浏览器授权已关闭。": "Default browser authorization is off.", "请通过 Desktop 设置中的授权开关操作。": "Use the authorization switch in Desktop settings.", "请确认删除。": "Confirm deletion.", "请确认清空缓存。": "Confirm clearing the cache.", "Windows 文件窗口未能打开。": "The Windows file dialog could not be opened.", "Windows 文件窗口未返回结果。": "The Windows file dialog did not return a result.", "系统另存为窗口用于 Windows。": "The system Save As dialog is available on Windows.", "本地会话服务未响应，请重新打开设置。": "The local session service did not respond. Reopen settings.", "本地浏览器请求未完成，请检查连接。": "The local browser request did not complete. Check the connection.", "浏览器连接信息不完整。": "Browser connection information is incomplete.", "请先在设置中导入登录态。": "Import the browser session in settings first.", "未找到可用的浏览器连接。请保持已登录的来源浏览器运行，并确认该浏览器允许连接后重试。": "No available browser connection was found. Keep the signed-in source browser running and confirm that it allows connections, then try again.", "未能连接正在运行的浏览器。请保持来源浏览器运行后重试。": "Could not connect to the running browser. Keep the source browser running and try again.", "等待浏览器确认超时。原登录态未改动，可再次点击刷新。": "Timed out waiting for browser confirmation. The previous session is unchanged; you can refresh again.", "浏览器未提供可导入的 Cookie。原登录态未改动。": "The browser did not provide cookies to import. The previous session is unchanged.", "当前系统的本地加密存储不可用，未保存登录态。": "Local encrypted storage is unavailable on this system. The session was not saved.", "登录态未能保存，原登录态未改动。": "The session could not be saved. The previous session is unchanged.", "正在导入登录态，请等待本次操作结束。": "A session import is in progress. Wait for it to finish.", "本地会话请求无效。": "Invalid local session request."};
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
