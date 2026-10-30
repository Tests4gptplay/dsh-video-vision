// Zero / omitted means no user-selected total budget. Cancellation remains active.
export function optionalBudget(value, name) {
  if (value === undefined || value === null || value === 0) return 0;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    throw new Error(`${name} must be zero (unlimited) or a positive finite number.`);
  return value;
}
export function byteBudget(config) {
  const value = optionalBudget(config.maxDownloadMB, 'maxDownloadMB');
  return value ? value * 1024 * 1024 : Infinity;
}
const settingsPath = 'Settings > Video Vision > Optional processing budgets';
export class BudgetExceededError extends Error {
  constructor(setting, value, options = {}) {
    const unit = setting === 'maxDownloadMB' ? 'MiB' : 'ms';
    const next = `Open ${settingsPath}, increase ${setting} or set it to 0 (unlimited), save, then retry. Tasks can still be canceled.`;
    super(`The configured ${setting} budget (${value} ${unit}) was exceeded. ${next}`, options);
    this.name = 'BudgetExceededError';
    this.code = 'VIDEO_VISION_BUDGET_EXCEEDED';
    this.budget = { setting, value, unit };
    this.nextAction = next;
  }
}
function findCause(error, matches) {
  const seen = new Set();
  while (error && typeof error === 'object' && !seen.has(error)) {
    if (matches(error)) return error;
    seen.add(error); error = error.cause;
  }
}
export function isBudgetError(error) {
  return Boolean(findCause(error, item => item instanceof BudgetExceededError));
}
export function budgetRecovery(error) {
  const cause = findCause(error, item => item instanceof BudgetExceededError);
  if (!cause) return null;
  return { state: 'budget_exceeded', code: cause.code, message: cause.message,
    budget: { ...cause.budget }, settings_path: settingsPath, next_action: cause.nextAction };
}
const timeoutCodes = new Set(['ETIMEDOUT', 'ESOCKETTIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT']);
export function timeoutRecovery(error) {
  if (isBudgetError(error)) return null;
  // Error types/codes are evidence; an arbitrary message containing "timeout"
  // is not evidence that a configured budget (or an upstream deadline) expired.
  const cause = findCause(error, item => item.name === 'TimeoutError' || timeoutCodes.has(item.code));
  if (!cause) return null;
  return { state: 'upstream_timeout', message: error.message,
    cause: { name: cause.name, ...(cause.code === undefined ? {} : { code: cause.code }), message: cause.message },
    next_action: 'The upstream request timed out; this is not a configured Video Vision processing budget. Check the source and connection, then retry.' };
}
export function budgetSignal(signal, timeoutMs, setting = 'downloadTimeoutMs') {
  const value = optionalBudget(timeoutMs, setting);
  if (!value) return signal;
  const timeout = AbortSignal.timeout(value), deadline = new AbortController();
  timeout.addEventListener('abort', () => deadline.abort(new BudgetExceededError(setting, value, { cause: timeout.reason })), { once: true });
  return AbortSignal.any([signal, deadline.signal]);
}
