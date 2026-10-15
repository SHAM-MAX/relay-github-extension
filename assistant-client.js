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

  async function getSessionCookie() {
    if (!globalThis.chrome?.cookies?.get) return null;
    try {
      const cookie = await new Promise((resolve) => {
        chrome.cookies.get({ url: ORIGIN + '/api/', name: 'relay_pm_session' }, (c1) => {
          if (c1?.value) return resolve(c1);
          chrome.cookies.get({ url: ORIGIN, name: 'relay_pm_session' }, (c2) => {
            resolve(c2);
          });
        });
      });
      if (cookie?.value && globalThis.chrome?.cookies?.set) {
        try {
          chrome.cookies.set({
            url: ORIGIN + '/api/',
            name: 'relay_pm_session',
            value: cookie.value,
            path: '/api/',
            secure: true,
            sameSite: 'no_restriction',
            partitionKey: { topLevelSite: 'https://github.com' }
          }, () => {
            if (chrome.runtime?.lastError) {}
          });
        } catch {}
      }
      return cookie;
    } catch {
      return null;
    }
  }

  async function checkAuth(options = {}) {
    const cookie = await getSessionCookie();
    if (cookie?.value) return true;

    const fetchImpl = options.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
    if (fetchImpl) {
      try {
        const res = await fetchImpl(ORIGIN + '/api/github/repositories', {
          method: 'GET',
          credentials: 'include',
          headers: { Accept: 'application/json' }
        });
        if (res.ok) return true;
        // 401 specifically indicates an invalid or expired session cookie.
        if (res.status === 401) return false;
        // 403 indicates an authorization, origin, or GitHub API rate limit issue, NOT a logged out user.
        // We preserve authentication state and do not disconnect.
        if (res.status === 403) return true;
        throw failure('Server session check error', 'NETWORK_ERROR');
      } catch (err) {
        if (err?.code === 'NETWORK_ERROR') throw err;
        throw failure('Could not connect to Relay to verify session.', 'NETWORK_ERROR');
      }
    }

    return false;
  }

  async function login() {
    const stateRes = await fetch(ORIGIN + '/api/auth/github/login');
    if (!stateRes.ok) throw failure('Could not request login state from Relay', 'NETWORK_ERROR');
    const { state, clientId, redirectUri: expectedRedirectUri, scope } = await stateRes.json();

    const oauthScope = scope || 'public_repo';
    const authUrlTemplate = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=REDIRECT_URI_PLACEHOLDER&state=${state}&scope=${encodeURIComponent(oauthScope)}`;

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'relay-ai-login',
        authUrlTemplate,
        redirectUri: expectedRedirectUri
      }, async (response) => {
        if (chrome.runtime.lastError) return reject(failure(chrome.runtime.lastError.message, 'LOGIN_FAILED'));
        if (!response || response.error) return reject(failure(response?.error || 'Unknown error', 'LOGIN_FAILED'));

        const url = new URL(response.callbackUrl);
        const code = url.searchParams.get('code');
        const returnedState = url.searchParams.get('state');

        if (state !== returnedState) {
          return reject(failure('Invalid OAuth state returned', 'LOGIN_FAILED'));
        }

        try {
          const exchangeRes = await fetch(ORIGIN + '/api/auth/github/exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              code,
              state,
              redirect_uri: response.redirectUri || expectedRedirectUri
            })
          });

          if (!exchangeRes.ok) {
            return reject(failure('Failed to exchange authorization code', 'LOGIN_FAILED'));
          }
          resolve(await exchangeRes.json());
        } catch (err) {
          reject(failure(err.message, 'LOGIN_FAILED'));
        }
      });
    });
  }

  async function logout(options = {}) {
    const fetchImpl = options.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
    if (!fetchImpl) return;
    const headers = { ...(options.headers || {}) };
    const cookie = await getSessionCookie();
    if (cookie?.value && !headers['Cookie'] && !headers['cookie']) {
      headers['Cookie'] = `relay_pm_session=${cookie.value}`;
    }
    const res = await fetchImpl(ORIGIN + '/api/auth/logout', { method: 'POST', credentials: 'include', headers });
    if (!res.ok) throw failure('Could not log out', 'NETWORK_ERROR');
  }
  async function send(message, context, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55000);
    try {
      // Strict allowlist: even accidental extra UI fields/filenames are never sent.
      const payload = { message, context: Object.fromEntries(['host','owner','repository','url','pageType','issueNumber','pullRequestNumber','branch'].map(key => [key, context[key]])) };
      if (options.model) payload.model = options.model;
      const headers = { 'Content-Type': 'application/json', Accept: 'application/json', ...(options.headers || {}) };
      const cookie = await getSessionCookie();
      if (cookie?.value && !headers['Cookie'] && !headers['cookie']) {
        headers['Cookie'] = `relay_pm_session=${cookie.value}`;
      }
      const response = await (options.fetchImpl || fetch)(ENDPOINT, {
        method: 'POST', headers,
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
  async function createIssue(issuePlan, context, options = {}) {
    const fetchImpl = options.fetchImpl || fetch;
    const headers = { 'Accept': 'application/json', 'Content-Type': 'application/json', ...(options.headers || {}) };
    const cookie = await getSessionCookie();
    if (cookie?.value && !headers['Cookie'] && !headers['cookie']) {
      headers['Cookie'] = `relay_pm_session=${cookie.value}`;
    }
    const response = await fetchImpl(ENDPOINT.replace('/assistant', '/github/issues'), {
      method: 'POST', credentials: 'include',
      headers,
      body: JSON.stringify({ issuePlan, context })
    });
    return response;
  }
  
  async function getRepositories(options = {}) {
    const fetchImpl = options.fetchImpl || fetch;
    const url = ENDPOINT.replace('/assistant', '/github/repositories');
    const headers = { 'Accept': 'application/json', ...(options.headers || {}) };
    const cookie = await getSessionCookie();
    if (cookie?.value && !headers['Cookie'] && !headers['cookie']) {
      headers['Cookie'] = `relay_pm_session=${cookie.value}`;
    }
    return await fetchImpl(url, {
      method: 'GET',
      credentials: 'include',
      headers
    });
  }

  async function getAssignmentRecommendations(task, context, options = {}) {
    const fetchImpl = options.fetchImpl || fetch;
    const owner = encodeURIComponent(context?.owner || '');
    const repo = encodeURIComponent(context?.repository || '');
    const url = ENDPOINT.replace('/assistant', `/pm/assignment/recommendations?owner=${owner}&repo=${repo}`);
    const headers = { 'Accept': 'application/json', 'Content-Type': 'application/json', ...(options.headers || {}) };
    const cookie = await getSessionCookie();
    if (cookie?.value && !headers['Cookie'] && !headers['cookie']) {
      headers['Cookie'] = `relay_pm_session=${cookie.value}`;
    }
    return await fetchImpl(url, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({ task, owner: context?.owner, repo: context?.repository })
    });
  }

  async function getDeveloperProfile(context, options = {}) {
    const fetchImpl = options.fetchImpl || fetch;
    const owner = encodeURIComponent(context?.owner || '');
    const repo = encodeURIComponent(context?.repository || '');
    const userQuery = options.userId ? `&userId=${encodeURIComponent(options.userId)}` : '';
    const url = ENDPOINT.replace('/assistant', `/pm/assignment/profile?owner=${owner}&repo=${repo}${userQuery}`);
    const headers = { 'Accept': 'application/json', ...(options.headers || {}) };
    const cookie = await getSessionCookie();
    if (cookie?.value && !headers['Cookie'] && !headers['cookie']) {
      headers['Cookie'] = `relay_pm_session=${cookie.value}`;
    }
    return await fetchImpl(url, {
      method: 'GET',
      credentials: 'include',
      headers
    });
  }

  async function upsertDeveloperProfile(profileData, context, options = {}) {
    const fetchImpl = options.fetchImpl || fetch;
    const owner = encodeURIComponent(context?.owner || '');
    const repo = encodeURIComponent(context?.repository || '');
    const url = ENDPOINT.replace('/assistant', `/pm/assignment/profile?owner=${owner}&repo=${repo}`);
    const headers = { 'Accept': 'application/json', 'Content-Type': 'application/json', ...(options.headers || {}) };
    const cookie = await getSessionCookie();
    if (cookie?.value && !headers['Cookie'] && !headers['cookie']) {
      headers['Cookie'] = `relay_pm_session=${cookie.value}`;
    }
    return await fetchImpl(url, {
      method: 'PUT',
      credentials: 'include',
      headers,
      body: JSON.stringify({ ...profileData, owner: context?.owner, repo: context?.repository })
    });
  }
  
  async function getProjectHealth(context, options = {}) {
    const fetchImpl = options.fetchImpl || fetch;
    const owner = encodeURIComponent(context?.owner || '');
    const repo = encodeURIComponent(context?.repository || '');
    const thresholdQuery = options.stalledThresholdDays ? `&stalledThresholdDays=${encodeURIComponent(options.stalledThresholdDays)}` : '';
    const url = ENDPOINT.replace('/assistant', `/pm/health?owner=${owner}&repo=${repo}${thresholdQuery}`);
    const headers = { 'Accept': 'application/json', ...(options.headers || {}) };
    const cookie = await getSessionCookie();
    if (cookie?.value && !headers['Cookie'] && !headers['cookie']) {
      headers['Cookie'] = `relay_pm_session=${cookie.value}`;
    }
    return await fetchImpl(url, {
      method: 'GET',
      credentials: 'include',
      headers
    });
  }

  async function getTraceability(context, options = {}) {
    const fetchImpl = options.fetchImpl || fetch;
    const owner = encodeURIComponent(context?.owner || '');
    const repo = encodeURIComponent(context?.repository || '');
    const url = ENDPOINT.replace('/assistant', `/pm/traceability?owner=${owner}&repo=${repo}`);
    const headers = { 'Accept': 'application/json', ...(options.headers || {}) };
    const cookie = await getSessionCookie();
    if (cookie?.value && !headers['Cookie'] && !headers['cookie']) {
      headers['Cookie'] = `relay_pm_session=${cookie.value}`;
    }
    return await fetchImpl(url, {
      method: 'GET',
      credentials: 'include',
      headers
    });
  }

  const api = Object.freeze({
    send,
    connectionURL,
    login,
    logout,
    checkAuth,
    ENDPOINT,
    createIssue,
    getRepositories,
    getAssignmentRecommendations,
    getDeveloperProfile,
    upsertDeveloperProfile,
    getProjectHealth,
    getTraceability
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RelayAIAssistant = api;
})(globalThis);

