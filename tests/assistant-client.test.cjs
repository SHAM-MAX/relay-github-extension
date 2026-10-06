const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const client = require('../assistant-client.js');
const context = require('../context.js').parse('https://github.com/SHAM-MAX/GitHub-Kanban-Practice');
const response = (status, data) => ({ status, ok: status >= 200 && status < 300, json: async () => data });
test('transport uses only the fixed Relay endpoint, session cookies, and allowed request fields', async () => {
  let url, request;
  const result = await client.send('Explain this repository', { ...context, secret: 'not sent', files: ['not sent'] }, { fetchImpl: async (u, r) => {
    url = u; request = r;
    return response(200, { reply: 'Real response contract', context: { repository: 'SHAM-MAX/GitHub-Kanban-Practice', pageType: 'repository' } });
  } });
  assert.equal(url, 'https://relay-standalone-backend.onrender.com/api/assistant');
  assert.equal(request.credentials, 'include'); assert.equal(request.redirect, 'error');
  assert.equal(request.method, 'POST'); assert.equal(request.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(request.body), { message: 'Explain this repository', context });
  assert.equal(result.reply, 'Real response contract');
});
test('authentication, configuration, quota, and server errors use safe messages', async () => {
  for (const [status, code, pattern] of [[401,'LOGIN_REQUIRED',/Sign in/], [403,'EXTENSION_NOT_CONNECTED',/Connect Relay/], [412,'AI_SETUP_REQUIRED',/needs setup/], [429,'AI_LIMIT_REACHED',/usage limit/], [502,'AI_UNAVAILABLE',/AI service/]]) {
    await assert.rejects(client.send('hello', context, { fetchImpl: async () => response(status, { code, error: 'raw upstream secret must not show' }) }), error => pattern.test(error.message) && !error.message.includes('raw upstream'));
  }
});
test('network failures and aborted requests never become fake assistant messages', async () => {
  await assert.rejects(client.send('hello', context, { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }), /Could not connect to Relay/);
  await assert.rejects(client.send('hello', context, { fetchImpl: async () => { throw new DOMException('Operation aborted', 'AbortError'); } }), /too long/);
});
test('HTML/login/malformed and wrong-context responses are rejected', async () => {
  await assert.rejects(client.send('hello', context, { fetchImpl: async () => ({ status: 401, json: async () => { throw new Error('HTML'); } }) }), /Sign in/);
  for (const body of [{ reply: '<script>x</script>' }, { reply: 'ok', context: { repository: 'another/repo', pageType: 'repository' } }, { reply: '', context: { repository: 'SHAM-MAX/GitHub-Kanban-Practice', pageType: 'repository' } }]) {
    await assert.rejects(client.send('hello', context, { fetchImpl: async () => response(200, body) }), /invalid assistant response/);
  }
});
test('connection URL preserves the installed ID; no key or broad runtime privileges added', () => {
  assert.equal(client.connectionURL('a'.repeat(32)), 'https://relay-standalone-backend.onrender.com/extension-connect?extension_id=' + 'a'.repeat(32));
  assert.throws(() => client.connectionURL('https://evil.test'), /Reload/);
  for (const file of ['assistant-client.js','panel.js','background.js','content.js','context.js','manifest.json']) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert.doesNotMatch(source, /api\.github\.com|github_pat_[a-zA-Z0-9_]+|gh[pousr]_[a-zA-Z0-9]{20,}|sk-[a-zA-Z0-9_-]{20,}|-----BEGIN .*PRIVATE KEY|chrome\.cookies|\.innerHTML\s*=/);
  }
});
