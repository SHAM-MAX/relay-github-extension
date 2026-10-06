# Relay AI — GitHub Extension · Phase 2

Version **0.2.0**. Desktop Chrome **116+**, Manifest V3, native Side Panel, vanilla JavaScript. The existing launcher, layout, context card, branch display, per-tab conversation, file picker and character counter are retained. Send now calls the authenticated Relay backend instead of producing a demo answer.

**Current status:** backend additions are deployed as Relay version **4**. Automated tests and live API error/authentication checks passed. A real AI reply is **not yet verified**: Hatchable currently returns `412 AI_SETUP_REQUIRED` because its Anthropic provider is not configured. Your Phase 1 Chrome installation was reported working by you; this Phase 2 build still needs the native Chrome checks below.

## Update your installed extension

1. Extract `Relay_GitHub_Extension_Phase2.zip`.
2. Back up your current extension folder. Copy the contents of the new **`relay-github-extension`** folder into the **same folder you originally loaded in Chrome**, replacing matching files and including the new `assistant-client.js` file. Keep that folder in its original location to preserve the unpacked extension ID. Do not copy the backend folder into it.
3. Open `chrome://extensions`. Enable Developer mode if needed. Find **Relay AI — GitHub Assistant**, click **Reload**, and check that its version is **0.2.0**. If Chrome requests approval for the added Relay-site permission, review and accept it. There are no additional all-sites permissions.
4. Refresh your GitHub tab, for example https://github.com/SHAM-MAX/GitHub-Kanban-Practice . Click **✦ Relay**.
5. Click the small **Connect Relay** link at the bottom of the panel. In the new Relay tab, sign in with the Hatchable account that owns this project or has collaborator access. If sign-in does not preserve the connection URL, click Connect Relay again from the panel.
6. Compare the displayed extension ID with the Relay card on `chrome://extensions`. Click **Connect extension** on the Relay page. This approves only that extension for your member account. No PAT or API key is entered in Chrome.
7. Return to GitHub, check the repository/context card, and send a message.

For a new installation, use Chrome → Extensions → Developer mode → **Load unpacked**, selecting the inner `relay-github-extension` folder that directly contains `manifest.json`. Then complete steps 4–7. A new folder/location can produce a different unpacked ID; connect that ID again. The package does not add a manifest `key` or change an existing ID deliberately.

## Configure the existing AI service

Open your Relay project in [Hatchable secure Setup](https://hatchable.com/console/projects/relay-ai-project/setup) and its AI settings. Connect the project's Anthropic provider, or use Hatchable AI credits if available for your account. The new endpoint uses `model: 'sonnet'`, matching the existing `/api/analyze` implementation.

Keep any provider key in Hatchable's secure configuration. No key belongs in the extension, source code, chat, or GitHub repository. The existing GitHub token does not configure the AI provider. AI billing/provider settings were not changed automatically.

Until configured, Send shows a clear AI setup error and restores the message for retry. It never invents a demo reply. After configuring the provider, retry without changing the extension code. The project remains private; making it public is not part of setup.

## Manual test in your Chrome

These checks remain to be performed with the updated extension, especially the cookie/session flow.

1. Check `chrome://extensions` for load errors. Refresh GitHub and verify exactly one **✦ Relay** button, including after Code → Issues → Pull requests navigation and Back/Forward.
2. Click the launcher and verify the native panel opens with the same layout. Inspect **Page details**. On an existing issue/PR, verify its number; on a branch page, verify the branch when GitHub exposes an unambiguous hint.
3. Complete **Connect Relay**. Send `Explain this repository`. Your message appears immediately, loading appears, and Send is disabled until completion. With AI configured, the reply should appear in the conversation. Without a repository description, the assistant should explain that it has page metadata only and ask for the relevant text.
4. For a useful AI test, send: `This repository is a Kanban practice app. The issue asks for filtering cards by assignee while retaining the current column view. Suggest a short implementation plan for review; do not create tasks.` This supplies the content the model needs. Any output is chat text only.
5. Double-click Send or press Enter repeatedly during loading: only one request should be sent. Switch GitHub tabs while waiting: the reply must stay with the original tab's conversation.
6. Select `notes.txt` using **Attach file**. Its filename should appear and be removable. Send a message with it selected: the bubble should say **not uploaded**. A file-only send asks you to type a message. Up to 3 filenames and 4,000 message characters are supported.
7. To inspect transport, right-click inside the side panel → Inspect → Network. Send a harmless message. Confirm one `POST https://relay-standalone-backend.onrender.com/api/assistant`, containing only `message` and the eight context fields. File names, file contents, chat history, and credentials must not be in the JSON. Browser-managed session cookies are expected; do not copy or share them.
8. Disconnect using the Relay connection page, then retry: expect a connection error. Reconnect. If signed out, expect a sign-in instruction. A network failure must show an error and preserve the draft, with no fake assistant response.
9. Verify the existing Relay dashboard still opens and lists its tasks/team/GitHub connection. No Phase 2 test requires creating or publishing an issue.

A launcher duplicate check in the GitHub page's DevTools console:

```js
document.querySelectorAll('#relay-ai-launcher').length // expected: 1
```

## Runtime files and locations

Everything in this table belongs inside `relay-github-extension/`. Keep the subdirectories intact; no build step or npm install is required.

| File | Phase 2 change / purpose |
| --- | --- |
| `manifest.json` | Updated to 0.2.0; adds only the fixed Relay backend host and permits that origin in `connect-src`. |
| `assistant-client.js` | New fixed-endpoint JSON client, cookies, timeout, strict payload/response validation and sanitized errors. |
| `panel.js` | Replaces demo chat with real transport; prevents duplicate calls, keeps drafts/history/files and adds Connect Relay URL. |
| `panel.html` | Loads the client; updates phase/loading text and adds the small connection link. |
| `panel.css` | Adds only a small style rule for the connection link. |
| `background.js` | Unchanged native side-panel opening and sender validation. |
| `content.js`, `content.css` | Unchanged single floating launcher, scoped styles and SPA navigation handling. |
| `context.js` | Unchanged GitHub route/branch detection shared by content script and panel. |
| `icons/relay-16.png`, `relay-32.png`, `relay-48.png`, `relay-128.png` | Unchanged icons. |
| `tests/harness.cjs`, `tests/extension.test.cjs` | Updated DOM/Chrome test doubles and integration-state checks. Not loaded by Chrome. |
| `tests/assistant-client.test.cjs` | New backend transport/error/privacy checks using mocked fetch. |
| `README.md`, `TEST_RESULTS.md` | Updated setup instructions, exact test evidence and limitations. |

The sibling `relay-phase2-backend/` folder contains the exact eight new files deployed to Hatchable, plus documentation and tests. It is not another extension. Existing backend files are intentionally not replaced by this patch package.

## Endpoint and JSON contract

`POST https://relay-standalone-backend.onrender.com/api/assistant`

Exact example request (`branch` may be `null` when unavailable):

```json
{
  "message": "Explain this repository",
  "context": {
    "host": "github.com",
    "owner": "SHAM-MAX",
    "repository": "GitHub-Kanban-Practice",
    "url": "https://github.com/SHAM-MAX/GitHub-Kanban-Practice",
    "pageType": "repository",
    "issueNumber": null,
    "pullRequestNumber": null,
    "branch": "main"
  }
}
```

Successful response contract (illustrative placeholder, **not a live AI result**):

```json
{
  "reply": "<AI-generated plain text>",
  "context": {
    "repository": "SHAM-MAX/GitHub-Kanban-Practice",
    "pageType": "repository"
  }
}
```

Actual response observed on the deployed endpoint on 2026-09-23, HTTP **412**:

```json
{
  "error": "Relay AI is not configured. The project owner must connect an Anthropic AI provider or enable Hatchable AI credits in secure project Setup. No key belongs in this extension.",
  "code": "AI_SETUP_REQUIRED"
}
```

Other errors include 400 invalid context/message, 401 sign-in required, 403 extension not approved, 429 AI quota, 502 invalid/unavailable AI and 504 timeout. Raw AI errors and secrets are never shown.

## Authentication, CORS and data handling

- The panel calls the fixed Relay endpoint directly from the extension page using `credentials: 'include'`. Chrome supplies the existing member session; the extension never reads cookies or handles tokens.
- **Connect Relay** registers the exact `chrome-extension://<your-installed-ID>` origin for the current member. Only the authenticated, same-origin Relay page can register/revoke it. The assistant checks member identity and that member's origin binding before calling AI.
- The handler returns credentialed CORS headers only for an approved exact extension origin or the Relay site itself. There is no `*`, extension-origin wildcard, arbitrary reflection, or anonymous AI access. Handler-level OPTIONS is supported; POST always checks platform-resolved membership.
- **Platform limitation:** the private Hatchable site's outer gateway currently returns 401 to ordinary unauthenticated HTTP OPTIONS before reaching the handler. MV3 extension pages with explicit backend host permission use Chrome's privileged cross-origin fetch path; ordinary webpage CORS rules do not apply to that path. This is why the network call is in the panel, not the GitHub content script. The actual cookie-bearing Chrome request still needs the manual test above. Do not disable authentication or make the project public to work around errors.
- Chrome documents host-permitted extension requests as same-site for cookies, but managed-browser policies, host access settings and session expiry can still affect sign-in. The extension reports failures without automatically retrying billable requests.
- Only the message and the eight context fields go to Relay/Hatchable AI. Current URL includes its query/hash. No GitHub REST calls, external content fetches, analytics, file uploads or GitHub modifications were added.
- Context is sent in a separate message labelled untrusted project data, with static system rules. The AI has no tools. Responses/messages/filenames are rendered using `textContent`, not HTML.
- Conversation history and filenames stay in panel memory, partitioned by tab. Only the current message goes to the backend; previous chat turns are not model memory. Reload/browser restart clears local conversation state. Closing a panel does not guarantee Chrome immediately destroys its document.

## Boundaries and troubleshooting

The assistant has page **metadata**, not repository files, README text, issue/PR bodies or selected file contents. It cannot meaningfully explain unseen code or an unseen issue; paste the relevant non-secret description in your message. It may provide planning advice as text but cannot create Relay tasks, choose assignees, approve work, change deadlines, or publish GitHub issues.

For a missing launcher, allow GitHub site access and refresh the tab. For stale context, click ↻ then refresh GitHub if instructed. URL-derived context does not prove a repository/issue exists. Branch hints can be unavailable for empty repositories, tags, commit SHAs or ambiguous refs. GitHub Enterprise, Firefox and mobile Chrome are outside this build.

For a sign-in/network error, use Connect Relay in the same Chrome profile, confirm collaborator access and the extension's permission for the Relay site, then retry. Share only the visible error text/status if troubleshooting; never send keys, cookies or authorization headers.

## Automated checks

From `relay-github-extension/`, with Node.js 20+:

```sh
node --test tests/extension.test.cjs tests/assistant-client.test.cjs
```

See `TEST_RESULTS.md` and the sibling backend README for results and unresolved verification.

Official references: [cross-origin extension requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests), [extension cookies](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies), [Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel).
