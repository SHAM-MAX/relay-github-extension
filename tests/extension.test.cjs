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
  assert.deepEqual(manifest.permissions, ['sidePanel']);
  assert.deepEqual(manifest.host_permissions, ['https://github.com/*', 'https://relay-standalone-backend.onrender.com/*']);
  assert.match(manifest.content_security_policy.extension_pages, /connect-src https:\/\/relay-ai-project.hatchable.site;/);
  assert.deepEqual(manifest.content_scripts[0].matches, ['https://github.com/*']);
  const files = [manifest.background.service_worker, manifest.side_panel.default_path, ...manifest.content_scripts[0].js, ...manifest.content_scripts[0].css, ...Object.values(manifest.icons)];
  for (const file of files) assert.ok(fs.existsSync(path.join(root, file)), file);
  for (const file of ['background.js', 'context.js', 'content.js', 'panel.js']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(source, /\b(fetch|XMLHttpRequest|WebSocket|FileReader|eval)\s*\(|\.innerHTML\s*=|chrome\.(cookies|storage)|localStorage|sessionStorage|console\.(log|error)/);
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
test('launcher opens via message and displays a recoverable error on rejection', async () => {
  const env = environment(); env.run('context.js'); env.run('content.js');
  await env.get('launcher-button').click(); await settle();
  assert.equal(env.sent.at(-1).type, 'relay-ai-open-panel');
  env.chrome.runtime.sendMessage = async () => { throw new Error('invalidated'); };
  await env.get('launcher-button').click(); await settle();
  assert.equal(env.get('launcher-error').hidden, false);
  assert.match(env.get('launcher-error').textContent, /Reload/);
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

async function panel() {
  const env = environment({ panel: true });
  env.calls = [];
  env.scope.RelayAIAssistant = {
    ENDPOINT: 'https://relay-standalone-backend.onrender.com/assistant',
    connectionURL: id => 'https://relay-standalone-backend.onrender.com/extension-connect?extension_id=' + id,
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
test('navigation updates context and keeps chat drafts isolated between tabs', async () => {
  const env = await panel(); env.get('input').value = 'Draft on tab 10'; await env.get('input').emit('input');
  env.current.url = base + '/pull/42/files'; env.chrome.tabs.onUpdated.emit(10, { url: env.current.url }); await settle();
  assert.equal(env.get('page').textContent, 'Pull request #42');
  env.current.id = 11; env.current.url = 'https://github.com/github/docs'; env.chrome.tabs.onActivated.emit({ tabId: 11, windowId: 1 }); await settle();
  assert.equal(env.get('input').value, ''); assert.equal(env.get('repository').textContent, 'github/docs');
  env.current.id = 10; env.current.url = base; env.chrome.tabs.onActivated.emit({ tabId: 10, windowId: 1 }); await settle();
  assert.equal(env.get('input').value, 'Draft on tab 10');
});
test('in-flight backend responses cannot appear in a different tab conversation', async () => {
  const env = await panel(); env.get('input').value = 'Original'; const sending = env.get('form').emit('submit'); await settle();
  env.current.id = 11; env.chrome.tabs.onActivated.emit({ tabId: 11, windowId: 1 }); await settle();
  assert.equal(env.get('send').disabled, true);
  env.resolveAI({ reply: 'Response for original tab.' }); await sending; assert.equal(env.get('messages').children.length, 0);
  env.current.id = 10; env.chrome.tabs.onActivated.emit({ tabId: 10, windowId: 1 }); await settle();
  assert.equal(env.get('messages').children.length, 2);
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
  const env = await panel(); env.chrome.tabs.sendMessage = async () => { throw new Error('no receiver'); };
  await env.get('refresh').click(); await settle();
  assert.equal(env.get('repository').textContent, 'SHAM-MAX/new-kanban-board');
  assert.match(env.get('context-error').textContent, /Refresh this GitHub tab/);
});
test('non-GitHub tabs clear context and do not request page contents', async () => {
  const env = await panel(); let requested = 0;
  env.chrome.tabs.sendMessage = async () => { requested++; };
  env.current.id = 12; env.current.url = 'https://example.com'; env.chrome.tabs.onActivated.emit({ tabId: 12, windowId: 1 }); await settle();
  assert.equal(env.get('context-json').textContent, 'null'); assert.equal(env.get('send').disabled, true); assert.equal(requested, 0);
});
