/* Fixed backend only. No token, cookie-reading API, file upload, or GitHub API client. */
(function (root) {
  'use strict';
  const ORIGIN = 'https://relay-standalone-backend.onrender.com';
  const ENDPOINT = ORIGIN + '/api/assistant';
  const ERRORS = {
    LOGIN_REQUIRED: 'Sign in using Connect Relay, then return to GitHub and retry.',
    EXTENSION_NOT_CONNECTED: 'Click Connect Relay and approve this installed extension, then retry.',
    ORIGIN_NOT_ALLOWED: 'This extension is not connected. Use Connect Relay to approve its Chrome ID.',
    INVALID_REQUEST: 'Relay rejected the message or GitHub context. Check the message length, refresh the page context, and retry.',
    AI_SETUP_REQUIRED: 'Relay AI needs setup. The project owner must connect an Anthropic provider or enable Hatchable AI credits in secure project Setup. Do not enter a key here.',
    AI_LIMIT_REACHED: 'Relay AI has reached its usage limit. Check the project AI quota and retry later.',
    AI_TIMEOUT: 'Relay AI took too long to respond. Your message is kept; retry when ready.',
    AI_INVALID_RESPONSE: 'Relay received an incomplete AI response. Try a shorter or more specific question.',
    AI_UNAVAILABLE: 'Relay could not reach its AI service. Retry later or check the project AI configuration.'
  };
  function failure(message, code) { return Object.assign(new Error(message), { code }); }
  function connectionURL(extensionId) {
    if (!/^[a-p]{32}$/.test(extensionId || '')) throw failure('Reload the Relay extension to reconnect.', 'INVALID_EXTENSION_ID');
    return ORIGIN + '/extension-connect?extension_id=' + extensionId;
  }
  async function send(message, context, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55000);
    try {
      // Strict allowlist: even accidental extra UI fields/filenames are never sent.
      const payload = { message, context: Object.fromEntries(['host','owner','repository','url','pageType','issueNumber','pullRequestNumber','branch'].map(key => [key, context[key]])) };
      if (options.model) payload.model = options.model;
      const response = await (options.fetchImpl || fetch)(ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'include', redirect: 'error', cache: 'no-store',
        body: JSON.stringify(payload), signal: controller.signal
      });
      let data;
      try { data = await response.json(); } catch {
        if (response.status === 401 || response.status === 403 || response.redirected) throw failure(ERRORS.LOGIN_REQUIRED, 'LOGIN_REQUIRED');
        throw failure('Relay returned an unexpected response. Open Connect Relay to check your session, then retry.', 'INVALID_RESPONSE');
      }
      if (!response.ok) {
        const code = data?.code || (response.status === 401 ? 'LOGIN_REQUIRED' : response.status === 429 ? 'AI_LIMIT_REACHED' : null);
        throw failure(ERRORS[code] || (response.status === 403 ? 'Your Relay account cannot access this request. Check membership and Connect Relay.' : 'The Relay backend could not complete the request. Please retry later.'), code || 'BACKEND_ERROR');
      }
      const expectedRepo = context.repository ? context.owner + '/' + context.repository : null;
      if (typeof data?.reply !== 'string' || !data.reply.trim() || data.reply.length > 16000 || data.context?.repository !== expectedRepo || data.context?.pageType !== context.pageType) {
        throw failure('Relay returned an invalid assistant response. Please retry.', 'INVALID_RESPONSE');
      }
      return { reply: data.reply, context: data.context, model: data.model, issuePlan: data.issuePlan };
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') throw failure(ERRORS.AI_TIMEOUT, 'AI_TIMEOUT');
      if (typeof error?.code === 'string' && (Object.hasOwn(ERRORS, error.code) || ['INVALID_RESPONSE','BACKEND_ERROR'].includes(error.code))) throw error;
      throw failure('Could not connect to Relay. Check your internet connection, sign in using Connect Relay, and allow the extension access to the Relay site.', 'NETWORK_ERROR');
    } finally { clearTimeout(timer); }
  }
  const api = Object.freeze({ send, connectionURL, ENDPOINT });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RelayAIAssistant = api;
})(globalThis);
