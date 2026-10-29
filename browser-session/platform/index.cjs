const adapters = { win32: () => require('./windows.cjs'), linux: () => require('./linux.cjs'), darwin: () => require('./darwin.cjs') };
const unavailable = { defaultBrowser: async () => ({ supported: false, label: '当前平台' }), runningBrowsers: async () => [], defaultPortFiles: () => [] };
module.exports = adapters[process.platform]?.() || unavailable;
