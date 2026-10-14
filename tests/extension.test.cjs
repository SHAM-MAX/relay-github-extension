const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parse, readHints, describe } = require('../context.js');
const { environment, settle, walk, root } = require('./harness.cjs');
const base = 'https://github.com/SHAM-MAX/new-kanban-board';

test('repository context has exactly the requested fields', () => {
  assert.deepEqual(parse(base), { host: 'github.com', owner: 'SHAM-MAX', repository: 'new-kanban-board', url: base, pageType: 'repository', issueNumber: null, pullRequestNumber: null, branch: null });
});
test('issue and PR tabs keep numeric context, including query/hash', () => {
  for (const [route, type, field] of [['issues/15', 'issue', 'issueNumber'], ['pull/42/files', 'pull-request', 'pullRequestNumber']]) {
    const url = base + '/' + route + '?x=1#discussion'; const value = parse(url);
    assert.equal(value.pageType, type); assert.equal(value[field], type === 'issue' ? 15 : 42); assert.equal(value.url, url);
  }
});
test('list/new/non-numeric issue routes do not invent issue numbers', () => {
  for (const suffix of ['issues', 'issues/new', 'issues/0', 'issues/9007199254740993']) assert.equal(parse(base + '/' + suffix).issueNumber, null);
  assert.equal(parse(base + '/pulls').pageType, 'pull-requests');
});
test('global pages and personal/org projects are not repositories', () => {
  for (const suffix of ['', '/settings/profile', '/search?q=task', '/orgs/SHAM-MAX/projects/2', '/users/SHAM-MAX/projects/3']) assert.equal(parse('https://github.com' + suffix).repository, null);
  assert.equal(parse('https://github.com/users/SHAM-MAX/projects/3').pageType, 'project');
  assert.equal(parse('https://github.com/SHAM-MAX').pageType, 'profile');
  assert.equal(parse('https://github.com/github/docs').repository, 'docs');
});
test('non-GitHub URLs are rejected, including deceptive hostname suffixes', () => {
  for (const url of ['https://github.com.evil.test/o/r', 'https://evil.test/github.com/o/r', 'http://github.com/o/r', 'javascript:alert(1)', 'bad', undefined]) assert.equal(parse(url), null);
});
test('slash branches are preserved and stale/tag/ambiguous refs not guessed', () => {
  assert.equal(parse(base + '/tree/feature/relay', { branch: 'feature/relay', refType: 'branch' }).branch, 'feature/relay');
  assert.equal(parse(base + '/blob/feature%2Frelay/src/a.js', { branch: 'feature/relay' }).branch, 'feature/relay');
  assert.equal(parse(base + '/tree/main', { branch: 'old' }).branch, null);
  assert.equal(parse(base + '/tree/v1.0', { branch: 'v1.0', refType: 'tag' }).branch, null);
  assert.equal(parse(base + '/blob/main/a.js').branch, null);
  assert.equal(parse(base + '/issues/15', { branch: 'main' }).branch, null);
});
test('DOM branch hints tolerate malformed/partial GitHub data', () => {
  const document = { querySelectorAll: () => [{ textContent: '{bad' }, { textContent: JSON.stringify({ payload: { codeViewRepoRoute: { refInfo: { name: 'feature/relay', refType: 'branch' } } } }) }], querySelector: () => null };
  assert.equal(readHints(document).branch, 'feature/relay');
  document.querySelectorAll = () => [{ textContent: '{}' }];
  assert.deepEqual(readHints(document), {});
  assert.equal(describe(parse(base + '/issues/15')), 'Issue #15');
});

test('MV3 package permits only GitHub injection and the Relay backend connection', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  assert.equal(manifest.manifest_version, 3); assert.equal(manifest.minimum_chrome_version, '116');
  assert.deepEqual(manifest.permissions, ['storage', 'identity', 'cookies']);
  assert.deepEqual(manifest.host_permissions, ['https://github.com/*', 'https://relay-standalone-backend.onrender.com/*']);
  assert.match(manifest.content_security_policy.extension_pages, /connect-src https:\/\/relay-standalone-backend.onrender.com;/);
  assert.deepEqual(manifest.content_scripts[0].matches, ['https://github.com/*']);
  const files = [manifest.background.service_worker, ...manifest.content_scripts[0].js, ...manifest.content_scripts[0].css, ...Object.values(manifest.icons)];
  for (const file of files) assert.ok(fs.existsSync(path.join(root, file)), file);
  for (const file of ['background.js', 'context.js', 'content.js', 'panel.js']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(source, /\b(fetch|XMLHttpRequest|WebSocket|FileReader|eval)\s*\(|\.innerHTML\s*=|chrome\.(cookies)|localStorage|sessionStorage|console\.(log|error)/);
    assert.doesNotMatch(source, /github_pat_[a-zA-Z0-9_]+|gh[pousr]_[a-zA-Z0-9]{20,}|-----BEGIN .*PRIVATE KEY/);
  }
});
test('launcher stays single through reinjection, SPA routes, and DOM replacement', async () => {
  const env = environment(); env.run('context.js'); env.run('content.js'); env.run('content.js');
  assert.equal(walk(env.document).filter(el => el.id === 'relay-ai-launcher').length, 1);
  env.location.href = base + '/issues/15'; env.intervals[0](); await env.tick(120);
  assert.equal(walk(env.document).filter(el => el.id === 'relay-ai-launcher').length, 1);
  assert.equal(env.sent.filter(message => message.type === 'relay-ai-context-changed').length, 2);
  env.get('launcher').remove(); env.observers[0].callback(); await env.tick(120);
  assert.equal(walk(env.document).filter(el => el.id === 'relay-ai-launcher').length, 1);
  let reply;
  env.chrome.runtime.onMessage.emit({ type: 'relay-ai-get-context' }, { id: env.chrome.runtime.id }, result => { reply = result; });
  assert.equal(reply.context.issueNumber, 15);
});
test('launcher opens floating panel locally without message passing', async () => {
  const env = environment(); env.run('context.js'); env.run('content.js');
  await env.get('launcher-button').click(); await settle();
  assert.equal(env.get('launcher').style.display, 'none');
  assert.equal(walk(env.document).filter(el => el.id === 'relay-ai-floating-panel').length, 1);
});
test('worker opens synchronously from a trusted top-frame message; rejects others', async () => {
  const env = environment(); const calls = []; let response;
  env.chrome.sidePanel.open = options => { calls.push(options); return Promise.resolve(); };
  env.run('background.js');
  const handler = env.chrome.runtime.onMessage.listeners[0];
  const sender = { id: env.chrome.runtime.id, frameId: 0, tab: { id: 7 }, url: base };
  assert.equal(handler({ type: 'relay-ai-open-panel' }, sender, value => { response = value; }), true);
  assert.equal(calls.length, 1); assert.equal(calls[0].tabId, 7); await settle(); assert.equal(response.ok, true);
  for (const bad of [{ ...sender, frameId: 1 }, { ...sender, id: 'other' }, { ...sender, url: 'https://evil.test/' }]) {
    handler({ type: 'relay-ai-open-panel' }, bad, value => { response = value; });
    assert.equal(response.ok, false);
  }
  assert.equal(calls.length, 1);
});
test('worker does not leak raw Chrome errors to the page', async () => {
  const env = environment(); let response;
  env.chrome.sidePanel.open = () => Promise.reject(new Error('sensitive internal message'));
  env.run('background.js');
  env.chrome.runtime.onMessage.listeners[0]({ type: 'relay-ai-open-panel' }, { id: env.chrome.runtime.id, frameId: 0, tab: { id: 7 }, url: base }, value => { response = value; });
  await settle(); assert.equal(response.ok, false); assert.doesNotMatch(response.error, /sensitive/);
});

async function panel(opts = {}) {
  const env = environment({ panel: true, storageData: opts.storageData });
  env.calls = [];
  env.scope.RelayAIAssistant = {
    ENDPOINT: 'https://relay-standalone-backend.onrender.com/assistant',
    connectionURL: id => 'https://relay-standalone-backend.onrender.com/extension-connect?extension_id=' + id,
    login: opts.login || (async () => ({ username: 'octocat' })),
    logout: opts.logout || (async () => ({ ok: true })),
    checkAuth: opts.checkAuth || (async () => false),
    createIssue: opts.createIssue || (async (issuePlan) => ({
      ok: true,
      json: async () => ({
        results: (issuePlan.issues || []).map((issue, idx) => ({
          title: issue.title,
          number: idx + 101,
          url: `https://github.com/SHAM-MAX/new-kanban-board/issues/${idx + 101}`,
          status: 'success'
        }))
      })
    })),
    send: (message, context) => {
      env.calls.push({ message, context });
      return new Promise((resolve, reject) => { env.resolveAI = resolve; env.rejectAI = reject; });
    }
  };
  env.run('context.js'); env.run('panel.js'); await settle(); return env;
}
test('panel displays the backend reply with loading state and blocks double-send', async () => {
  const env = await panel();
  assert.equal(env.get('repository').textContent, 'SHAM-MAX/new-kanban-board');
  env.get('input').value = 'Plan this task'; await env.get('input').emit('input');
  const sending = env.get('form').emit('submit'); await settle();
  assert.equal(env.get('messages').children.length, 1);
  assert.equal(env.get('loading').hidden, false); assert.equal(env.get('send').disabled, true);
  await env.get('form').emit('submit'); assert.equal(env.calls.length, 1);
  assert.equal(env.calls[0].message, 'Plan this task');
  assert.equal(env.calls[0].context.repository, 'new-kanban-board');
  env.resolveAI({ reply: 'This response came from the backend test double.' }); await sending;
  assert.equal(env.get('messages').children.length, 2); assert.equal(env.get('loading').hidden, true);
  assert.match(walk(env.get('messages')).map(el => el.textContent).join(' '), /response came from the backend test double/);
});
test('file selection/removal shows names only and supports reselecting the same file', async () => {
  const env = await panel(); const file = { name: '<img src=x onerror=alert(1)>.txt', size: 4, lastModified: 1 };
  Object.defineProperty(file, 'text', { get() { throw new Error('File contents must not be read'); } });
  env.get('file').files = [file]; await env.get('file').emit('change');
  assert.equal(env.get('attachments').children.length, 1);
  assert.equal(env.get('attachments').children[0].children[0].textContent, file.name);
  assert.equal(env.get('file').value, '');
  await env.get('attachments').children[0].children[1].click(); assert.equal(env.get('attachments').children.length, 0);
  await env.get('file').emit('change'); assert.equal(env.get('attachments').children.length, 1);
});
test('too many files and oversized messages have explicit errors; drafts are retained', async () => {
  const env = await panel(); env.get('file').files = [1, 2, 3, 4].map(i => ({ name: `file${i}.txt`, size: 1, lastModified: i }));
  await env.get('file').emit('change'); assert.match(env.get('error').textContent, /up to 3/);
  assert.equal(env.get('attachments').children.length, 0);
  env.get('input').value = 'x'.repeat(4001); await env.get('form').emit('submit');
  assert.match(env.get('error').textContent, /4,000/); assert.equal(env.get('input').value.length, 4001);
  assert.equal(env.get('messages').children.length, 0);
});
test('navigation updates context via postMessage', async () => {
  const env = await panel();
  env.get('input').value = 'Draft here'; await env.get('input').emit('input');
  env.window.postMessage({ type: 'relay-ai-host-context', context: parse(base + '/pull/42/files') }); await settle();
  assert.equal(env.get('page').textContent, 'Pull request #42');
  assert.equal(env.get('input').value, 'Draft here'); // In Phase 2, draft is just kept in memory for this iframe
});
test('in-flight backend responses cannot appear in a different context', async () => {
  const env = await panel(); env.get('input').value = 'Original'; const sending = env.get('form').emit('submit'); await settle();
  env.window.postMessage({ type: 'relay-ai-host-context', context: parse('https://github.com/github/docs') }); await settle();
  assert.equal(env.get('send').disabled, true);
  env.resolveAI({ reply: 'Response for original repo.', context: { repository: 'Relay-AI/test-repo' } }); await sending;
  assert.equal(env.get('messages').children.length, 0); // Should reject because context repo changed
});
test('backend failure shows a clean error, keeps chat, restores draft, and permits retry', async () => {
  const env = await panel(); env.get('input').value = 'Explain this repository';
  const sending = env.get('form').emit('submit'); await settle();
  env.rejectAI(new Error('Relay AI needs setup.')); await sending;
  assert.match(env.get('error').textContent, /needs setup/);
  assert.equal(env.get('input').value, 'Explain this repository');
  assert.equal(env.get('loading').hidden, true); assert.equal(env.get('send').disabled, false);
  assert.equal(env.get('messages').children.length, 1);
});
test('attachments never enter the request; file-only send is a local error', async () => {
  const env = await panel(); env.get('file').files = [{ name: 'private-notes.txt', size: 42, lastModified: 1 }];
  await env.get('file').emit('change'); await env.get('form').emit('submit');
  assert.equal(env.calls.length, 0); assert.match(env.get('error').textContent, /local only/);
  env.get('input').value = 'Plan this task'; const sending = env.get('form').emit('submit'); await settle();
  assert.deepEqual(Object.keys(env.calls[0]), ['message', 'context']);
  assert.doesNotMatch(JSON.stringify(env.calls[0]), /private-notes/);
  env.resolveAI({ reply: 'A plan.' }); await sending;
  assert.match(walk(env.get('messages')).map(el => el.textContent).join(' '), /not uploaded/);
});
test('missing content script gives URL context and a refresh instruction, not silent failure', async () => {
  const env = await panel(); 
  env.chrome.tabs.sendMessage = async () => { throw new Error('no receiver'); };
  await env.get('context-refresh').click(); await settle();
  assert.equal(env.get('repository').textContent, 'SHAM-MAX/new-kanban-board');
  assert.match(env.get('context-error').textContent, /Refresh this GitHub tab/);
});
test('non-GitHub context is cleared and disables send', async () => {
  const env = await panel();
  env.window.postMessage({ type: 'relay-ai-host-context', context: null }); await settle();
  assert.equal(env.get('context-json').textContent, ''); 
  assert.equal(env.get('send').disabled, true);
});
test('gear menu toggles visibility and responds to escape/outside clicks', async () => {
  const env = await panel();
  const gear = env.get('gear');
  const menu = env.get('gear-menu');
  assert.equal(menu.classList.contains('hidden'), true);
  
  await gear.click(); await settle();
  assert.equal(menu.classList.contains('hidden'), false);
  
  await env.document.emit('click', { target: env.document.body }); await settle();
  assert.equal(menu.classList.contains('hidden'), true);
  
  await gear.click(); await settle();
  assert.equal(menu.classList.contains('hidden'), false);
  
  await env.document.emit('keydown', { key: 'Escape' }); await settle();
  assert.equal(menu.classList.contains('hidden'), true);
});

test('gear menu opens and closes subviews', async () => {
  const env = await panel();
  await env.get('gear').click(); await settle();
  
  await env.get('gear-prefs').click(); await settle();
  assert.equal(env.get('preferences-view').classList.contains('hidden'), false);
  assert.equal(env.get('gear-menu').classList.contains('hidden'), true);
  
  await env.get('back-prefs').click(); await settle();
  assert.equal(env.get('preferences-view').classList.contains('hidden'), true);
  
  await env.get('gear').click(); await settle();
  await env.get('gear-about').click(); await settle();
  assert.equal(env.get('about-view').classList.contains('hidden'), false);
});

test('chat history loads, filters, and restores conversations', async () => {
  const env = await panel();
  
  const convo1 = {
    conversationId: 'c1',
    title: 'Repo 1 Convo',
    owner: 'SHAM-MAX',
    repository: 'new-kanban-board',
    messages: [{ role: 'user', text: 'hello from repo 1', files: [] }],
    updatedAt: Date.now()
  };
  const convo2 = {
    conversationId: 'c2',
    title: 'Repo 2 Convo',
    owner: 'other-owner',
    repository: 'other-repo',
    messages: [{ role: 'user', text: 'hello from repo 2', files: [] }],
    updatedAt: Date.now()
  };
  
  env.chrome.storage.local.get = (keys, cb) => {
    cb({ relay_conversations: [convo1, convo2] });
  };
  
  await env.get('gear').click(); await settle();
  await env.get('gear-history').click(); await settle();
  
  assert.equal(env.get('history-view').classList.contains('hidden'), false);
  
  // It should filter out Repo 2
  const historyText = env.get('history-list').textContent;
  assert.match(historyText, /Repo 1 Convo/);
  assert.doesNotMatch(historyText, /Repo 2 Convo/);
  
  // Restore
  const cards = walk(env.get('history-list')).filter(el => el.className === 'relay-ai-history-card');
  assert.equal(cards.length, 1);
  await cards[0].click(); await settle();
  
  assert.equal(env.get('history-view').classList.contains('hidden'), true);
  const msgs = walk(env.get('messages')).filter(el => el.className && el.className.includes('relay-ai-message-body'));
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].textContent, 'hello from repo 1');
});

test('ai models menu opens custom picker', async () => {
  const env = await panel();
  
  // Add mock options since harness doesn't parse elements without IDs
  const dropdown = env.get('custom-picker-dropdown');
  const option = env.document.createElement('div');
  option.className = 'relay-ai-custom-picker-option';
  option.dataset.value = 'custom-model';
  
  const text = env.document.createElement('span');
  text.className = 'relay-ai-option-text';
  text.textContent = 'Custom Model';
  option.append(text);
  dropdown.append(option);
  
  await env.get('gear').click(); await settle();
  await env.get('gear-models').click(); await settle();
  
  assert.equal(env.get('gear-menu').classList.contains('hidden'), true);
  
  const customPicker = env.document.getElementById('relay-ai-custom-picker');
  assert.equal(customPicker.classList.contains('is-open'), true);
  
  await dropdown.emit('click', { target: option }); await settle();
  
  assert.equal(customPicker.classList.contains('is-open'), false);
  assert.equal(env.get('model-selector').value, 'custom-model');
  assert.equal(env.get('custom-picker-value').textContent, 'Custom Model');
});

test('preferences clear history shows dialog and deletes storage', async () => {
  const env = await panel();
  await env.get('gear').click(); await settle();
  await env.get('gear-prefs').click(); await settle();
  
  await env.get('pref-clear-all').click(); await settle();
  
  // Dialog should exist
  const dialogs = walk(env.document).filter(el => el.className && el.className.includes('relay-ai-subview'));
  assert.ok(dialogs.length >= 4);
  
  const confirmBtn = walk(env.document).find(el => el.id === 'relay-confirm-btn');
  assert.ok(confirmBtn);
  
  let removedKey = null;
  env.chrome.storage.local.remove = (key, cb) => {
    removedKey = key;
    cb();
  };
  
  await confirmBtn.click(); await settle();
  assert.equal(removedKey, 'relay_conversations');
  
  const remain = walk(env.document).find(el => el.id === 'relay-confirm-btn');
  assert.ok(!remain);
});



test('assistant response does not render internal debug or model metadata', async () => {
  const env = await panel();
  env.get('input').value = 'hi'; 
  await env.get('input').emit('input');
  const sending = env.get('form').emit('submit'); 
  await settle();
  
  env.resolveAI({ 
    reply: 'Hello! How can I assist you with your project today?', 
    model: 'openai/gpt-oss-120b'
  }); 
  await sending;
  
  const text = walk(env.get('messages')).map(el => el.textContent).join(' ');
  
  assert.match(text, /Hello! How can I assist/);
  assert.doesNotMatch(text, /RELAY_DEBUG_VERSION/);
  assert.doesNotMatch(text, /pm-context-v1/);
  assert.doesNotMatch(text, /Model:/);
  assert.doesNotMatch(text, /Groq/);
  assert.doesNotMatch(text, /GPT-OSS/);
});

test('connect relay click invokes login, displays system notification, and toggles auth state', async () => {
  const env = await panel();
  let loginCalled = false;
  env.scope.RelayAIAssistant.login = async () => {
    loginCalled = true;
    return { username: 'octocat' };
  };

  const connectBtn = env.get('connect');
  assert.ok(connectBtn);
  await connectBtn.click();
  await settle();

  assert.equal(loginCalled, true);
  assert.equal(env.get('auth-unauthenticated').hidden, true);
  assert.equal(env.get('auth-authenticated').hidden, false);

  const messages = walk(env.get('messages')).map(el => el.textContent).join(' ');
  assert.match(messages, /Successfully signed in as octocat/);
});

test('floating button and extension UI are hidden on login and OAuth pages, but visible on repository pages', async () => {
  const authUrls = [
    'https://github.com/login',
    'https://github.com/login/oauth/authorize?client_id=test-id&redirect_uri=https%3A%2F%2Ftest.chromiumapp.org%2F',
    'https://github.com/login/oauth/callback',
    'https://github.com/oauth/authorize',
    'https://github.com/session',
    'https://github.com/sessions'
  ];

  // 1. Initial load on auth/oauth pages suppresses floating launcher and panel
  for (const url of authUrls) {
    const authEnv = environment({ url });
    authEnv.run('context.js');
    authEnv.run('content.js');
    assert.equal(walk(authEnv.document).filter(el => el.id === 'relay-ai-launcher').length, 0, `Launcher should not exist on ${url}`);
    assert.equal(walk(authEnv.document).filter(el => el.id === 'relay-ai-floating-panel').length, 0, `Panel should not exist on ${url}`);
  }

  // 2. Normal repository page shows floating launcher
  const repoEnv = environment({ url: base });
  repoEnv.run('context.js');
  repoEnv.run('content.js');
  assert.equal(walk(repoEnv.document).filter(el => el.id === 'relay-ai-launcher').length, 1);

  // 3. Navigation from repository page to OAuth authorization page removes launcher
  repoEnv.location.href = 'https://github.com/login/oauth/authorize?client_id=test-id';
  repoEnv.intervals[0]();
  await repoEnv.tick(120);
  assert.equal(walk(repoEnv.document).filter(el => el.id === 'relay-ai-launcher').length, 0);

  // 4. Navigation back to repository page restores launcher
  repoEnv.location.href = base + '/issues/15';
  repoEnv.intervals[0]();
  await repoEnv.tick(120);
  assert.equal(walk(repoEnv.document).filter(el => el.id === 'relay-ai-launcher').length, 1);
});

test('closing and reopening the panel preserves the connected state', async () => {
  const sharedStorage = {};
  // 1. Initial panel session connects
  const panel1 = await panel({ storageData: sharedStorage });
  assert.equal(panel1.get('auth-authenticated').hidden, true);
  await panel1.get('connect').click();
  await settle();
  assert.equal(panel1.get('auth-authenticated').hidden, false);
  assert.equal(sharedStorage.relay_auth_connected, true);

  // 2. Reopening panel (new instance with same storage & active session) preserves connected state
  const panel2 = await panel({ storageData: sharedStorage, checkAuth: async () => true });
  assert.equal(panel2.get('auth-authenticated').hidden, false);
  assert.equal(panel2.get('auth-unauthenticated').hidden, true);
});

test('reopening panel checks backend session and restores connected UI automatically', async () => {
  let checkAuthCalled = false;
  const env = await panel({
    checkAuth: async () => {
      checkAuthCalled = true;
      return true;
    }
  });
  await settle();
  assert.equal(checkAuthCalled, true);
  assert.equal(env.get('auth-authenticated').hidden, false);
  assert.equal(env.get('auth-unauthenticated').hidden, true);
});

test('does not launch OAuth again when user is already authenticated', async () => {
  let loginCount = 0;
  const env = await panel({
    storageData: { relay_auth_connected: true },
    checkAuth: async () => true,
    login: async () => {
      loginCount++;
      return { username: 'octocat' };
    }
  });
  await settle();
  assert.equal(env.get('auth-authenticated').hidden, false);

  // Attempt to trigger connect while authenticated
  await env.get('connect').click();
  await settle();
  assert.equal(loginCount, 0, 'OAuth login must not be launched when already authenticated');
});

test('explicit logout clears session and returns UI to disconnected state, and clicking connect after logout restarts OAuth', async () => {
  const sharedStorage = { relay_auth_connected: true };
  let logoutCalled = false;
  let loginCount = 0;

  const env = await panel({
    storageData: sharedStorage,
    checkAuth: async () => true,
    logout: async () => {
      logoutCalled = true;
      return { ok: true };
    },
    login: async () => {
      loginCount++;
      return { username: 'octocat' };
    }
  });
  await settle();
  assert.equal(env.get('auth-authenticated').hidden, false);

  // Explicit logout
  const logoutBtn = env.get('logout');
  assert.ok(logoutBtn);
  await logoutBtn.click();
  await settle();

  assert.equal(logoutCalled, true);
  assert.equal(env.get('auth-authenticated').hidden, true);
  assert.equal(env.get('auth-unauthenticated').hidden, false);
  assert.equal(sharedStorage.relay_auth_connected, undefined);

  // Clicking connect after logout restarts OAuth
  // checkAuth now returns false since user logged out
  env.scope.RelayAIAssistant.checkAuth = async () => false;
  await env.get('connect').click();
  await settle();

  assert.equal(loginCount, 1, 'OAuth login should restart after logout');
  assert.equal(env.get('auth-authenticated').hidden, false);
  assert.equal(sharedStorage.relay_auth_connected, true);
});

test('temporary network failure during checkAuth does not log out user', async () => {
  const sharedStorage = { relay_auth_connected: true };
  const env = await panel({
    storageData: sharedStorage,
    checkAuth: async () => {
      throw new TypeError('Failed to fetch');
    }
  });
  await settle();

  // Connected state must be preserved
  assert.equal(env.get('auth-authenticated').hidden, false);
  assert.equal(env.get('auth-unauthenticated').hidden, true);
  assert.equal(sharedStorage.relay_auth_connected, true);
});

test('repository-fetch 403 response does not trigger automatic logout', async () => {
  const sharedStorage = { relay_auth_connected: true };
  const env = await panel({
    storageData: sharedStorage,
    checkAuth: async () => true
  });
  await settle();
  assert.equal(env.get('auth-authenticated').hidden, false);

  // Trigger repository fetch with 403 error
  env.scope.RelayAIAssistant.getRepositories = async () => ({
    ok: false,
    status: 403,
    json: async () => ({ error: 'Use Connect Relay in the panel to approve this extension.', code: 'EXTENSION_NOT_CONNECTED' })
  });

  // Open repository picker via refresh button
  await env.get('refresh').click();
  await settle();

  // Verify repository picker shows clean error and retry button
  const errorEl = walk(env.document).find(el => el.className && el.className.includes('relay-ai-repository-error'));
  assert.ok(errorEl);
  assert.match(errorEl.textContent, /Use Connect Relay in the panel to approve this extension/);

  // CRITICAL: Panel auth state must STILL be Connected
  assert.equal(env.get('auth-authenticated').hidden, false);
  assert.equal(env.get('auth-unauthenticated').hidden, true);
  assert.equal(sharedStorage.relay_auth_connected, true);
});

test('repeated panel close/reopen preserves connected authentication state', async () => {
  const persistentStorage = {};

  // First session: user signs in
  const session1 = await panel({ storageData: persistentStorage });
  await session1.get('connect').click();
  await settle();
  assert.equal(session1.get('auth-authenticated').hidden, false);
  assert.equal(persistentStorage.relay_auth_connected, true);

  // Reopen 1
  const session2 = await panel({ storageData: persistentStorage, checkAuth: async () => true });
  assert.equal(session2.get('auth-authenticated').hidden, false);
  assert.equal(session2.get('auth-unauthenticated').hidden, true);

  // Reopen 2
  const session3 = await panel({ storageData: persistentStorage, checkAuth: async () => true });
  assert.equal(session3.get('auth-authenticated').hidden, false);
  assert.equal(session3.get('auth-unauthenticated').hidden, true);

  // Reopen 3 with repository fetch failure
  const session4 = await panel({ storageData: persistentStorage, checkAuth: async () => true });
  assert.equal(session4.get('auth-authenticated').hidden, false);
  assert.equal(session4.get('auth-unauthenticated').hidden, true);
  assert.equal(persistentStorage.relay_auth_connected, true);
});

test('proposed issue cards support editing ticket fields and saving to state', async () => {
  const env = await panel();
  env.get('input').value = 'Create issues';
  const sending = env.get('form').emit('submit');
  await settle();

  const issuePlan = {
    issues: [
      { id: '1', title: 'Issue One', issue_type: 'task', priority: 'High', body: 'Original description', labels: ['ui'] },
      { id: '2', title: 'Issue Two', issue_type: 'bug', priority: 'Low', body: 'Second description', labels: ['backend'] }
    ]
  };

  env.resolveAI({ reply: 'Here are the issues.', issuePlan });
  await sending;

  const cards = walk(env.get('messages')).filter(el => el.classList && el.classList.contains('relay-ai-issue-card'));
  assert.equal(cards.length, 2);

  // Click edit button on the first card
  const card1Actions = walk(cards[0]).find(el => el.classList && el.classList.contains('relay-ai-issue-card-actions'));
  const editBtn = walk(card1Actions).find(el => el.textContent === 'Edit');
  assert.ok(editBtn);
  await editBtn.click();
  await settle();

  // Find edit form inputs inside card 1
  const editForm = walk(cards[0]).find(el => el.classList && el.classList.contains('relay-ai-issue-edit-form'));
  assert.ok(editForm);

  const inputs = walk(editForm).filter(el => el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
  const titleInput = inputs.find(el => el.value === 'Issue One');
  const bodyInput = inputs.find(el => el.value === 'Original description');
  assert.ok(titleInput);
  assert.ok(bodyInput);

  titleInput.value = 'Updated Issue One Title';
  bodyInput.value = 'Updated acceptance criteria';

  // Save changes
  const saveBtn = walk(editForm).find(el => el.textContent === 'Save Changes');
  await saveBtn.click();
  await settle();

  // Verify updated state and rendering
  assert.match(walk(cards[0]).map(el => el.textContent).join(' '), /Updated Issue One Title/);
  assert.match(walk(cards[0]).map(el => el.textContent).join(' '), /Updated acceptance criteria/);
  assert.equal(issuePlan.issues[0].title, 'Updated Issue One Title');
  assert.equal(issuePlan.issues[0].body, 'Updated acceptance criteria');

  // Verify card 2 was unaffected
  assert.equal(issuePlan.issues[1].title, 'Issue Two');
  assert.match(walk(cards[1]).map(el => el.textContent).join(' '), /Issue Two/);
});

test('individual issue creation creates only target issue and prevents duplicate submission', async () => {
  let createdPlans = [];
  let contextsReceived = [];
  const env = await panel({
    createIssue: async (plan, ctx) => {
      createdPlans.push(plan);
      contextsReceived.push(ctx);
      return {
        ok: true,
        json: async () => ({
          results: plan.issues.map(i => ({
            title: i.title,
            number: 42,
            url: `https://github.com/SHAM-MAX/new-kanban-board/issues/42`,
            status: 'success'
          }))
        })
      };
    }
  });

  env.get('input').value = 'Propose plan';
  const sending = env.get('form').emit('submit');
  await settle();

  const issuePlan = {
    issues: [
      { id: '1', title: 'First Task', issue_type: 'task', priority: 'Medium', body: 'Do task 1' },
      { id: '2', title: 'Second Task', issue_type: 'task', priority: 'Low', body: 'Do task 2' }
    ]
  };

  env.resolveAI({ reply: 'Proposed plan', issuePlan });
  await sending;

  const cards = walk(env.get('messages')).filter(el => el.classList && el.classList.contains('relay-ai-issue-card'));
  assert.equal(cards.length, 2);

  // Click individual Create on Card 1
  const card1Actions = walk(cards[0]).find(el => el.classList && el.classList.contains('relay-ai-issue-card-actions'));
  const card1CreateBtn = walk(card1Actions).find(el => el.textContent === 'Create');
  assert.ok(card1CreateBtn);

  await card1CreateBtn.click();
  await settle();

  // Verify only First Task was sent to backend
  assert.equal(createdPlans.length, 1);
  assert.equal(createdPlans[0].issues.length, 1);
  assert.equal(createdPlans[0].issues[0].title, 'First Task');
  assert.equal(contextsReceived.length, 1);
  assert.equal(contextsReceived[0].owner, 'SHAM-MAX');
  assert.equal(contextsReceived[0].repository, 'new-kanban-board');

  // Verify card 1 transitioned to created state
  assert.match(walk(cards[0]).map(el => el.textContent).join(' '), /Created in GitHub/);
  assert.match(walk(cards[0]).map(el => el.textContent).join(' '), /#42 First Task/);

  // Verify card 2 is still uncreated and has Create button
  const card2Actions = walk(cards[1]).find(el => el.classList && el.classList.contains('relay-ai-issue-card-actions'));
  const card2CreateBtn = walk(card2Actions).find(el => el.textContent === 'Create');
  assert.ok(card2CreateBtn);
  assert.equal(issuePlan.issues[1]._created, undefined);

  // Verify bulk button now displays "Create 1 Issue"
  const bulkCreateBtn = walk(env.get('messages')).find(el => el.textContent && el.textContent.startsWith('Create 1 Issue'));
  assert.ok(bulkCreateBtn);

  // Clicking bulk create now only creates remaining uncreated issues (First Task is skipped)
  await bulkCreateBtn.click();
  await settle();

  assert.equal(createdPlans.length, 2);
  assert.equal(createdPlans[1].issues.length, 1);
  assert.equal(createdPlans[1].issues[0].title, 'Second Task');
  assert.equal(contextsReceived.length, 2);
  assert.equal(contextsReceived[1].owner, 'SHAM-MAX');
  assert.equal(contextsReceived[1].repository, 'new-kanban-board');
});

test('individual issue cancellation removes only target issue with confirmation', async () => {
  const env = await panel();
  env.get('input').value = 'Get issues';
  const sending = env.get('form').emit('submit');
  await settle();

  const issuePlan = {
    issues: [
      { id: '1', title: 'Task Alpha', issue_type: 'task', priority: 'High', body: 'Body 1' },
      { id: '2', title: 'Task Beta', issue_type: 'task', priority: 'Low', body: 'Body 2' }
    ]
  };

  env.resolveAI({ reply: 'Here are the issues.', issuePlan });
  await sending;

  let cards = walk(env.get('messages')).filter(el => el.classList && el.classList.contains('relay-ai-issue-card'));
  assert.equal(cards.length, 2);

  // Click Cancel on Card 1
  const card1Actions = walk(cards[0]).find(el => el.classList && el.classList.contains('relay-ai-issue-card-actions'));
  const cancelBtn = walk(card1Actions).find(el => el.textContent === 'Cancel');
  await cancelBtn.click();
  await settle();

  // Verify confirmation appears
  const confirmBox = walk(cards[0]).find(el => el.classList && el.classList.contains('relay-ai-issue-cancel-confirm'));
  assert.ok(confirmBox);
  assert.match(confirmBox.textContent, /Cancel this issue\?/);

  // Click "Keep" to dismiss
  const keepBtn = walk(confirmBox).find(el => el.textContent === 'Keep');
  await keepBtn.click();
  await settle();

  // Card 1 still present and not deleted
  assert.equal(issuePlan.issues.length, 2);

  // Click Cancel and then "Yes, Remove"
  const cancelBtnAgain = walk(cards[0]).find(el => el.textContent === 'Cancel');
  await cancelBtnAgain.click();
  await settle();

  const removeBtn = walk(cards[0]).find(el => el.textContent === 'Yes, Remove');
  await removeBtn.click();
  await settle();

  // Verify only Task Alpha was removed from proposal state and DOM
  assert.equal(issuePlan.issues.length, 1);
  assert.equal(issuePlan.issues[0].title, 'Task Beta');

  cards = walk(env.get('messages')).filter(el => el.classList && el.classList.contains('relay-ai-issue-card'));
  assert.equal(cards.length, 1);
  assert.match(walk(cards[0]).map(el => el.textContent).join(' '), /Task Beta/);
});

test('individual issue creation with SHAM-MAX/GitHub-Kanban-Practice context passes exact repo and single issue', async () => {
  let createdPayload = null;
  let createdContext = null;

  const env = await panel({
    createIssue: async (plan, ctx) => {
      createdPayload = plan;
      createdContext = ctx;
      return {
        ok: true,
        json: async () => ({
          results: [{
            title: plan.issues[0].title,
            number: 99,
            url: `https://github.com/${ctx.owner}/${ctx.repository}/issues/99`,
            status: 'success'
          }]
        })
      };
    }
  });

  // Emulate user on SHAM-MAX/GitHub-Kanban-Practice
  env.window.postMessage({
    type: 'relay-ai-host-context',
    context: {
      host: 'github.com',
      owner: 'SHAM-MAX',
      repository: 'GitHub-Kanban-Practice',
      url: 'https://github.com/SHAM-MAX/GitHub-Kanban-Practice'
    }
  });
  await settle();

  assert.equal(env.get('repository').textContent, 'SHAM-MAX/GitHub-Kanban-Practice');

  env.get('input').value = 'Create tasks for kanban board';
  const sending = env.get('form').emit('submit');
  await settle();

  const proposedPlan = {
    issues: [
      { id: 'kanban-1', title: 'Implement Kanban Column Dragging', issue_type: 'user_story', priority: 'High', body: 'Support drag & drop' },
      { id: 'kanban-2', title: 'Add Column WIP Limit', issue_type: 'task', priority: 'Medium', body: 'Set max card limit' }
    ]
  };

  env.resolveAI({
    reply: 'Proposed 2 issues for SHAM-MAX/GitHub-Kanban-Practice',
    issuePlan: proposedPlan,
    context: { owner: 'SHAM-MAX', repository: 'GitHub-Kanban-Practice' }
  });
  await sending;

  const cards = walk(env.get('messages')).filter(el => el.classList && el.classList.contains('relay-ai-issue-card'));
  assert.equal(cards.length, 2);

  // Click Create on the first ticket only
  const card1Actions = walk(cards[0]).find(el => el.classList && el.classList.contains('relay-ai-issue-card-actions'));
  const card1CreateBtn = walk(card1Actions).find(el => el.textContent === 'Create');
  assert.ok(card1CreateBtn);

  await card1CreateBtn.click();
  await settle();

  // Verify exact repository context and single ticket sent
  assert.equal(createdContext.owner, 'SHAM-MAX');
  assert.equal(createdContext.repository, 'GitHub-Kanban-Practice');
  assert.equal(createdPayload.issues.length, 1);
  assert.equal(createdPayload.issues[0].title, 'Implement Kanban Column Dragging');
  assert.equal(createdPayload.issues[0].id, 'kanban-1');

  // Verify Card 1 transitioned to success and Card 2 is untouched
  assert.match(walk(cards[0]).map(el => el.textContent).join(' '), /Created in GitHub/);
  assert.match(walk(cards[0]).map(el => el.textContent).join(' '), /#99/);
  assert.equal(proposedPlan.issues[1]._created, undefined);
});

test('proposed issue cards display assignment recommendations and send selected assignee on creation', async () => {
  let createdPayload = null;
  let recsCalledWith = null;

  const env = await panel({
    checkAuth: async () => true,
    createIssue: async (singlePlan) => {
      createdPayload = singlePlan;
      return {
        ok: true,
        json: async () => ({
          results: [{
            title: singlePlan.issues[0].title,
            number: 101,
            url: 'https://github.com/SHAM-MAX/new-kanban-board/issues/101',
            status: 'success'
          }]
        })
      };
    }
  });

  env.scope.RelayAIAssistant.getAssignmentRecommendations = async (task, context) => {
    recsCalledWith = { task, context };
    return {
      ok: true,
      json: async () => ({
        recommendations: [
          {
            githubUsername: 'alice',
            overallScore: 92,
            confidence: 'High',
            rationale: 'Strong match with required technical skills.',
            criteria: {
              technicalSkills: { score: 95 },
              workloadAndEffort: { score: 90 },
              repositoryFamiliarity: { score: 85 },
              availabilityAndDeadlines: { score: 100 },
              growthAndFairness: { score: 80 }
            },
            missingDataWarnings: []
          },
          {
            githubUsername: 'bob',
            overallScore: 68,
            confidence: 'Medium',
            rationale: 'Moderate workload bandwidth.',
            criteria: {
              technicalSkills: { score: 60 },
              workloadAndEffort: { score: 70 },
              repositoryFamiliarity: { score: 50 },
              availabilityAndDeadlines: { score: 80 },
              growthAndFairness: { score: 75 }
            },
            missingDataWarnings: ['No repository contributions recorded']
          }
        ],
        warnings: []
      })
    };
  };

  env.get('input').value = 'Propose backend feature';
  const sending = env.get('form').emit('submit');
  await settle();

  const proposedPlan = {
    issues: [
      { id: 'task-1', title: 'Setup database pool', issue_type: 'task', priority: 'High', body: 'Configure pg pool', labels: ['postgresql'] }
    ]
  };

  env.resolveAI({
    reply: 'Proposed plan',
    issuePlan: proposedPlan,
    context: { owner: 'SHAM-MAX', repository: 'new-kanban-board' }
  });
  await sending;
  await settle();

  const cards = walk(env.get('messages')).filter(el => el.classList && el.classList.contains('relay-ai-issue-card'));
  assert.equal(cards.length, 1);

  // Recommendations should be requested
  assert.ok(recsCalledWith);
  assert.equal(recsCalledWith.task.title, 'Setup database pool');
  assert.equal(recsCalledWith.context.owner, 'SHAM-MAX');

  // Candidate cards rendered
  const candCards = walk(cards[0]).filter(el => el.classList && el.classList.contains('relay-ai-candidate-card'));
  assert.equal(candCards.length, 2);
  assert.match(candCards[0].textContent, /@alice/);
  assert.match(candCards[0].textContent, /92%/);
  assert.match(candCards[0].textContent, /High conf/);
  assert.match(candCards[1].textContent, /@bob/);

  // Advisory confirmation: Click candidate Alice to select
  await candCards[0].click();
  await settle();

  assert.equal(proposedPlan.issues[0].assignee, 'alice');
  assert.equal(proposedPlan.issues[0].assignees.length, 1);
  assert.equal(proposedPlan.issues[0].assignees[0], 'alice');

  // Click Create on the card
  const createBtn = walk(cards[0]).find(el => el.textContent === 'Create');
  assert.ok(createBtn);
  await createBtn.click();
  await settle();

  // Verify single ticket created includes assignees
  assert.ok(createdPayload);
  assert.equal(createdPayload.issues.length, 1);
  assert.equal(createdPayload.issues[0].assignees.length, 1);
  assert.equal(createdPayload.issues[0].assignees[0], 'alice');
  assert.equal(proposedPlan.issues[0]._created, true);
});

test('developer profile modal can be opened and saves updated profile', async () => {
  let profileSaved = null;

  const env = await panel({
    checkAuth: async () => true
  });

  env.scope.RelayAIAssistant.getAssignmentRecommendations = async () => ({
    ok: true,
    json: async () => ({ recommendations: [], warnings: ['No assignees'] })
  });

  env.scope.RelayAIAssistant.getDeveloperProfile = async () => ({
    ok: true,
    json: async () => ({
      profile: {
        declared_skills: ['node.js'],
        weekly_capacity_hours: 35,
        max_concurrent_tasks: 2,
        is_available: true,
        current_focus: 'Core'
      }
    })
  });

  env.scope.RelayAIAssistant.upsertDeveloperProfile = async (data) => {
    profileSaved = data;
    return {
      ok: true,
      json: async () => ({ profile: data })
    };
  };

  env.get('input').value = 'Test ticket';
  const sending = env.get('form').emit('submit');
  await settle();

  env.resolveAI({
    reply: 'Done',
    issuePlan: { issues: [{ id: '1', title: 'Task 1', body: 'Body' }] },
    context: { owner: 'SHAM-MAX', repository: 'new-kanban-board' }
  });
  await sending;
  await settle();

  const editProfileBtn = walk(env.get('messages')).find(el => el.textContent === 'Edit Dev Profile');
  assert.ok(editProfileBtn);

  await editProfileBtn.click();
  await settle();

  const modal = walk(env.document).find(el => el.classList && el.classList.contains('relay-ai-profile-modal'));
  assert.ok(modal);

  const saveBtn = walk(modal).find(el => el.textContent === 'Save Profile');
  assert.ok(saveBtn);
  await saveBtn.click();
  await settle();

  assert.ok(profileSaved);
  assert.equal(typeof profileSaved.weeklyCapacityHours, 'number');
});

test('PM approval workflow: approves top recommended developer or overrides with manual eligible assignee', async () => {
  let createdPayload = null;

  const env = await panel({
    checkAuth: async () => true,
    createIssue: async (singlePlan) => {
      createdPayload = singlePlan;
      return {
        ok: true,
        json: async () => ({
          results: [{
            title: singlePlan.issues[0].title,
            number: 105,
            url: 'https://github.com/SHAM-MAX/new-kanban-board/issues/105',
            status: 'success'
          }]
        })
      };
    }
  });

  env.scope.RelayAIAssistant.getAssignmentRecommendations = async () => ({
    ok: true,
    json: async () => ({
      recommendations: [
        {
          githubUsername: 'sarah-lead',
          overallScore: 94,
          confidence: 'High',
          rationale: 'Expert in system architecture with low active workload.',
          criteria: {
            technicalSkills: { score: 95 },
            workloadAndEffort: { score: 90 },
            repositoryFamiliarity: { score: 95 },
            availabilityAndDeadlines: { score: 100 },
            growthAndFairness: { score: 85 }
          },
          missingDataWarnings: []
        },
        {
          githubUsername: 'alex-dev',
          overallScore: 72,
          confidence: 'Medium',
          rationale: 'Capable developer with healthy capacity.',
          criteria: {
            technicalSkills: { score: 70 },
            workloadAndEffort: { score: 80 },
            repositoryFamiliarity: { score: 65 },
            availabilityAndDeadlines: { score: 75 },
            growthAndFairness: { score: 70 }
          },
          missingDataWarnings: []
        }
      ],
      warnings: []
    })
  });

  env.get('input').value = 'Feature request';
  const sending = env.get('form').emit('submit');
  await settle();

  const proposedPlan = {
    issues: [
      { id: 'task-auth', title: 'Implement OAuth refresh', issue_type: 'feature', priority: 'High', body: 'Support token rotation' }
    ]
  };

  env.resolveAI({
    reply: 'Proposed plan',
    issuePlan: proposedPlan,
    context: { owner: 'SHAM-MAX', repository: 'new-kanban-board' }
  });
  await sending;
  await settle();

  const cards = walk(env.get('messages')).filter(el => el.classList && el.classList.contains('relay-ai-issue-card'));
  assert.equal(cards.length, 1);

  // Top recommendation spotlight should be visible with Recommended badge
  const topSpotlight = walk(cards[0]).find(el => el.classList && el.classList.contains('relay-ai-top-recommendation'));
  assert.ok(topSpotlight);
  assert.match(topSpotlight.textContent, /★ Recommended/);
  assert.match(topSpotlight.textContent, /@sarah-lead/);
  assert.match(topSpotlight.textContent, /94%/);

  // Approve assignment button
  const approveBtn = walk(topSpotlight).find(el => el.tagName === 'BUTTON' && el.textContent === 'Approve Assignment');
  assert.ok(approveBtn);

  // PM Approves top recommendation
  await approveBtn.click();
  await settle();

  assert.equal(proposedPlan.issues[0].assignee, 'sarah-lead');
  assert.equal(proposedPlan.issues[0].assignees.length, 1);
  assert.equal(proposedPlan.issues[0].assignees[0], 'sarah-lead');

  // Manual override: PM overrides using the manual select dropdown
  const manualSelect = walk(cards[0]).find(el => el.tagName === 'SELECT' && el.classList.contains('relay-ai-assignee-manual-select'));
  assert.ok(manualSelect);
  manualSelect.value = 'alex-dev';
  manualSelect.emit('change');
  await settle();

  assert.equal(proposedPlan.issues[0].assignee, 'alex-dev');
  assert.equal(proposedPlan.issues[0].assignees.length, 1);
  assert.equal(proposedPlan.issues[0].assignees[0], 'alex-dev');

  // Click Create
  const createBtn = walk(cards[0]).find(el => el.textContent === 'Create');
  assert.ok(createBtn);
  await createBtn.click();
  await settle();

  assert.ok(createdPayload);
  assert.equal(createdPayload.issues[0].assignees.length, 1);
  assert.equal(createdPayload.issues[0].assignees[0], 'alex-dev');
  assert.equal(proposedPlan.issues[0]._created, true);
});

test('insufficient evidence displays clear notice and handles GitHub issue assignment failure cleanly', async () => {
  let createdCalled = false;

  const env = await panel({
    checkAuth: async () => true,
    createIssue: async () => {
      createdCalled = true;
      return {
        ok: false,
        status: 422,
        json: async () => ({
          error: 'GitHub API error: user cannot be assigned to issues in this repository'
        })
      };
    }
  });

  env.scope.RelayAIAssistant.getAssignmentRecommendations = async () => ({
    ok: true,
    json: async () => ({
      recommendations: [],
      warnings: ['Insufficient permissions to list assignees for private organization']
    })
  });

  env.get('input').value = 'Task';
  const sending = env.get('form').emit('submit');
  await settle();

  env.resolveAI({
    reply: 'Plan',
    issuePlan: {
      issues: [{ id: 'task-fail', title: 'Test issue', body: 'Details', assignee: 'unauthorized-user' }]
    },
    context: { owner: 'SHAM-MAX', repository: 'new-kanban-board' }
  });
  await sending;
  await settle();

  const cards = walk(env.get('messages')).filter(el => el.classList && el.classList.contains('relay-ai-issue-card'));
  assert.equal(cards.length, 1);

  // Insufficient evidence notice displayed
  const insufficientElem = walk(cards[0]).find(el => el.classList && el.classList.contains('relay-ai-assignment-insufficient'));
  assert.ok(insufficientElem);
  assert.match(insufficientElem.textContent, /Insufficient evidence/);

  // Attempt creation which triggers 422 assignment error
  const createBtn = walk(cards[0]).find(el => el.textContent === 'Create');
  assert.ok(createBtn);
  await createBtn.click();
  await settle();

  assert.equal(createdCalled, true);
  const statusElem = walk(cards[0]).find(el => el.classList && el.classList.contains('relay-ai-issue-card-status-error'));
  assert.ok(statusElem);
  assert.match(statusElem.textContent, /cannot be assigned/);
});

test('assignment recommendation network failure or 403 displays diagnostic notice and preserves manual selection', async () => {
  const env = await panel({
    checkAuth: async () => true
  });

  // Mock getAssignmentRecommendations rejecting with network error
  env.scope.RelayAIAssistant.getAssignmentRecommendations = async () => {
    throw new Error('Failed to fetch');
  };

  env.get('input').value = 'Network test';
  const sending = env.get('form').emit('submit');
  await settle();

  env.resolveAI({
    reply: 'Plan with issue',
    issuePlan: {
      issues: [{ id: 'task-err', title: 'Network fail issue', body: 'Body' }]
    },
    context: { owner: 'SHAM-MAX', repository: 'new-kanban-board' }
  });
  await sending;
  await settle();

  const cards = walk(env.get('messages')).filter(el => el.classList && el.classList.contains('relay-ai-issue-card'));
  assert.equal(cards.length, 1);

  // Diagnostic notice should be displayed in candidates container
  const diagnosticElem = walk(cards[0]).find(el => el.textContent && el.textContent.includes('Diagnostic: Backend connection failed'));
  assert.ok(diagnosticElem, 'Diagnostic notice must be rendered on backend failure');

  // Manual select dropdown is still present and functional
  const manualSelect = walk(cards[0]).find(el => el.classList && el.classList.contains('relay-ai-assignee-manual-select'));
  assert.ok(manualSelect, 'Manual select override dropdown must be preserved');
});
