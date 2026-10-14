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
    const regex = file === 'assistant-client.js'
      ? /api\.github\.com|github_pat_[a-zA-Z0-9_]+|gh[pousr]_[a-zA-Z0-9]{20,}|sk-[a-zA-Z0-9_-]{20,}|-----BEGIN .*PRIVATE KEY|\.innerHTML\s*=/
      : /api\.github\.com|github_pat_[a-zA-Z0-9_]+|gh[pousr]_[a-zA-Z0-9]{20,}|sk-[a-zA-Z0-9_-]{20,}|-----BEGIN .*PRIVATE KEY|chrome\.cookies|\.innerHTML\s*=/;
    assert.doesNotMatch(source, regex);
  }
});
test('getRepositories requests repositories endpoint with credentials and JSON headers', async () => {
  let reqUrl, reqOptions;
  const mockFetch = async (url, opts) => {
    reqUrl = url;
    reqOptions = opts;
    return response(200, { repositories: [{ id: 1, name: 'repo-one' }] });
  };
  const res = await client.getRepositories({ fetchImpl: mockFetch });
  assert.equal(reqUrl, 'https://relay-standalone-backend.onrender.com/api/github/repositories');
  assert.equal(reqOptions.method, 'GET');
  assert.equal(reqOptions.credentials, 'include');
  assert.equal(reqOptions.headers.Accept, 'application/json');
  const data = await res.json();
  assert.equal(data.repositories.length, 1);
  assert.equal(data.repositories[0].name, 'repo-one');
});

test('checkAuth validates backend session or session cookie', async () => {
  // 1. Backend session valid (200)
  const isAuth = await client.checkAuth({
    fetchImpl: async (url, opts) => {
      assert.equal(url, 'https://relay-standalone-backend.onrender.com/api/github/repositories');
      assert.equal(opts.credentials, 'include');
      return response(200, { repositories: [] });
    }
  });
  assert.equal(isAuth, true);

  // 2. Backend session unauthenticated (401)
  const notAuth = await client.checkAuth({
    fetchImpl: async () => response(401, { error: 'Unauthorized' })
  });
  assert.equal(notAuth, false);

  // 3. Backend 403 (authorization/rate limit/origin issue) preserves authenticated state
  const isAuthOn403 = await client.checkAuth({
    fetchImpl: async () => response(403, { error: 'Origin not allowed' })
  });
  assert.equal(isAuthOn403, true);

  // 4. Network failure throws NETWORK_ERROR
  await assert.rejects(
    client.checkAuth({
      fetchImpl: async () => { throw new TypeError('Failed to fetch'); }
    }),
    /Could not connect to Relay/
  );
});

test('logout invokes backend logout endpoint with credentials', async () => {
  let calledUrl, calledOpts;
  await client.logout({
    fetchImpl: async (url, opts) => {
      calledUrl = url;
      calledOpts = opts;
      return response(200, { ok: true });
    }
  });
  assert.equal(calledUrl, 'https://relay-standalone-backend.onrender.com/api/auth/logout');
  assert.equal(calledOpts.method, 'POST');
  assert.equal(calledOpts.credentials, 'include');
});

test('getRepositories includes session credentials and synchronizes partitioned cookie when chrome.cookies is available', async () => {
  let reqOptions;
  const mockFetch = async (url, opts) => {
    reqOptions = opts;
    return response(200, { repositories: [{ id: 101, name: 'authed-repo' }] });
  };

  const originalChrome = globalThis.chrome;
  let partitionSyncDetails = null;
  globalThis.chrome = {
    cookies: {
      get: (details, cb) => {
        if (details.name === 'relay_pm_session') {
          cb({ name: 'relay_pm_session', value: 'sess_valid_abc_123' });
        } else {
          cb(null);
        }
      },
      set: (details, cb) => {
        partitionSyncDetails = details;
        if (cb) cb(details);
      }
    }
  };

  try {
    const res = await client.getRepositories({ fetchImpl: mockFetch });
    assert.equal(reqOptions.credentials, 'include');
    assert.equal(reqOptions.headers.Accept, 'application/json');
    assert.equal(reqOptions.headers.Cookie, 'relay_pm_session=sess_valid_abc_123');
    assert.ok(partitionSyncDetails);
    assert.equal(partitionSyncDetails.name, 'relay_pm_session');
    assert.equal(partitionSyncDetails.value, 'sess_valid_abc_123');
    assert.equal(partitionSyncDetails.partitionKey?.topLevelSite, 'https://github.com');
    const data = await res.json();
    assert.equal(data.repositories[0].name, 'authed-repo');
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test('createIssue sends issuePlan and context to backend with credentials and cookies', async () => {
  let reqUrl, reqOptions;
  const mockFetch = async (url, opts) => {
    reqUrl = url;
    reqOptions = opts;
    return response(200, {
      results: [{ title: 'Single Ticket', number: 12, url: 'https://github.com/SHAM-MAX/GitHub-Kanban-Practice/issues/12', status: 'success' }]
    });
  };

  const plan = { issues: [{ id: '1', title: 'Single Ticket', body: 'Issue details', assignees: ['alice'] }] };
  const targetContext = { owner: 'SHAM-MAX', repository: 'GitHub-Kanban-Practice' };

  const res = await client.createIssue(plan, targetContext, { fetchImpl: mockFetch });
  assert.equal(reqUrl, 'https://relay-standalone-backend.onrender.com/api/github/issues');
  assert.equal(reqOptions.method, 'POST');
  assert.equal(reqOptions.credentials, 'include');
  assert.equal(reqOptions.headers['Content-Type'], 'application/json');

  const payload = JSON.parse(reqOptions.body);
  assert.deepEqual(payload.issuePlan, plan);
  assert.deepEqual(payload.context, targetContext);

  const data = await res.json();
  assert.equal(data.results[0].number, 12);
  assert.equal(data.results[0].status, 'success');
});

test('getAssignmentRecommendations calls backend recommendations with context and task', async () => {
  let reqUrl, reqOptions;
  const mockFetch = async (url, opts) => {
    reqUrl = url;
    reqOptions = opts;
    return response(200, { recommendations: [{ githubUsername: 'alice', overallScore: 88 }] });
  };

  const task = { title: 'Implement feature', requiredSkills: ['node.js'] };
  const context = { owner: 'SHAM-MAX', repository: 'GitHub-Kanban-Practice' };
  const res = await client.getAssignmentRecommendations(task, context, { fetchImpl: mockFetch });

  assert.equal(reqUrl, 'https://relay-standalone-backend.onrender.com/api/pm/assignment/recommendations?owner=SHAM-MAX&repo=GitHub-Kanban-Practice');
  assert.equal(reqOptions.method, 'POST');
  const payload = JSON.parse(reqOptions.body);
  assert.deepEqual(payload.task, task);
  assert.equal(payload.owner, 'SHAM-MAX');
  assert.equal(payload.repo, 'GitHub-Kanban-Practice');

  const data = await res.json();
  assert.equal(data.recommendations[0].githubUsername, 'alice');
});

test('getDeveloperProfile and upsertDeveloperProfile call backend profile endpoint', async () => {
  let calls = [];
  const mockFetch = async (url, opts) => {
    calls.push({ url, opts });
    if (opts.method === 'GET') {
      return response(200, { profile: { declared_skills: ['react'], weekly_capacity_hours: 40 } });
    }
    return response(200, { profile: { ...JSON.parse(opts.body) } });
  };

  const context = { owner: 'SHAM-MAX', repository: 'GitHub-Kanban-Practice' };

  // GET
  const getRes = await client.getDeveloperProfile(context, { fetchImpl: mockFetch });
  assert.equal(calls[0].url, 'https://relay-standalone-backend.onrender.com/api/pm/assignment/profile?owner=SHAM-MAX&repo=GitHub-Kanban-Practice');
  assert.equal(calls[0].opts.method, 'GET');
  const getData = await getRes.json();
  assert.deepEqual(getData.profile.declared_skills, ['react']);

  // PUT
  const putRes = await client.upsertDeveloperProfile({ declaredSkills: ['vue'], weeklyCapacityHours: 30 }, context, { fetchImpl: mockFetch });
  assert.equal(calls[1].url, 'https://relay-standalone-backend.onrender.com/api/pm/assignment/profile?owner=SHAM-MAX&repo=GitHub-Kanban-Practice');
  assert.equal(calls[1].opts.method, 'PUT');
  const putData = await putRes.json();
  assert.deepEqual(putData.profile.declaredSkills, ['vue']);
});
