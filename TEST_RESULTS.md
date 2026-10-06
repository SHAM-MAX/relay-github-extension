# Phase 2 verification report

Date: **2026-09-23**. Extension **0.2.0**. Relay backend deployment **v4**, live.

## Automated execution

- Extension: `node --test tests/extension.test.cjs tests/assistant-client.test.cjs` — **26 passed, 0 failed**.
- Backend: from the sibling `relay-phase2-backend/` folder, `node --test tests/assistant.test.cjs` — **10 passed, 0 failed**.
- Total: **36 passed**. These are Node tests using explicit DOM/Chrome, fetch, database and AI test doubles. A passing simulated AI response is not a real AI completion.

Extension coverage includes MV3 assets/permissions/CSP, common secret-pattern and direct-GitHub-API checks, eight-field context parsing, branch ambiguity, SPA/reinjection single-button behavior, sender validation and immediate native panel API invocation, message/reply display, loading/double-send prevention, per-tab history/drafts, file selection/removal and local-only behavior, connection URL, fixed request URL/payload/cookies, malformed/wrong-context responses, safe errors and timeouts.

Backend coverage includes request/context validation, URL/issue/PR/branch consistency, rejection of attachment/extra fields, static system rules and untrusted context, no AI tools, successful reply contract with mocked AI, truncated/tool-call response rejection, sanitized provider/quota/timeout errors, exact-origin CORS preflight, membership gating, per-member origin binding, same-origin registration and revocation.

The Phase 1 ZIP was compared byte-for-byte with the updated package: `background.js`, `content.js`, `content.css`, `context.js` and all four icons are unchanged. No original file was removed. Runtime modifications are limited to the panel and its fixed backend transport/configuration.

## Live deployed handler checks

Hatchable's deployed-function test runner executed real deployed handler code. It synthesizes the requested member identity; these checks do **not** prove browser cookie transport.

| Check | Observed |
| --- | --- |
| Anonymous assistant POST | 401 `LOGIN_REQUIRED`; AI not called |
| Invalid authenticated assistant input | 400 `INVALID_REQUEST` |
| Authenticated valid message → real Hatchable AI | 412 `AI_SETUP_REQUIRED`; Anthropic provider missing |
| Approved exact extension origin + member | 412 from AI setup; exact-origin ACAO and credentials headers present |
| Unknown extension origin + member | 403 `EXTENSION_NOT_CONNECTED`; no ACAO |
| Approved origin without member | 401; origin approval does not grant authentication |
| Same-origin member connection registration | 200, connected true |
| Connection revocation and subsequent status | 200, connected false |

A temporary synthetic extension ID was registered only for those tests and then removed. The final status check confirmed it is disconnected. It is not a configured user extension. The user must connect their actual Chrome ID using Connect Relay.

An independent unauthenticated HTTP OPTIONS request to the live private site returned **401 at the Hatchable gateway**, before handler dispatch. The handler's successful OPTIONS behavior was tested locally. Native MV3 host-permitted fetch has a privileged cross-origin path; that end-to-end path remains unverified here.

## Existing Relay regression checks

The v3 deployment manifest was compared with the new project file hashes: **all 19 existing files are unchanged**; eight files were added. Existing `/api/analyze`, `/api/github`, `/api/workspace`, dashboard frontend, planner, assignment logic, GitHub integration and project configuration were not edited.

| Existing endpoint | Observed after deployment |
| --- | --- |
| GET `/api/workspace` | 200, revision 15, 13 tasks, 3 requirements |
| POST `/api/analyze`, existing request ID replay | 200, same requirement ID, revision 15 and identical state; no new analysis/tasks |
| POST `/api/analyze`, too-short input | 400 with existing validation error |
| POST `/api/github`, `action: config` | 200, configured true; only safe configuration returned |
| POST `/api/github`, `action: metadata` | 200, `SHAM-MAX/GitHub-Kanban-Practice`, assignee `SHAM-MAX`, 13 labels, 2 milestones |
| Final GET `/api/workspace` | Full response identical to pre-regression baseline |

No GitHub issues, task assignments, approvals, plans, deadlines or workspace mutations were created during Phase 2 testing. The only database test mutation was the temporary extension-origin binding, which was removed. The new origins table itself remains as part of the deployed implementation.

## Not verified / blocked

- **Real AI success is blocked** by the project's missing Anthropic provider configuration. No 200 AI reply is claimed. The 200 reply schema was tested using a mocked AI service only.
- **Updated extension installation, native button/Side Panel rendering and actual session-cookie transport are not verified here.** You reported Phase 1 working successfully. The unchanged launcher/context sources reduce regression risk but do not replace testing v0.2.0 in your Chrome.
- **Visual regression of the Relay dashboard and connection page has not been completed in a native browser.** Dashboard source hashes and API regression checks passed.
- The managed browser available in the earlier Phase 1 work rejected `chrome://extensions`; a local Chromium download failed and an HTTP preview was blocked. No restriction bypass or new successful native Chrome run is claimed.
- Provider billing/quota settings, browser cookie policy and your actual extension-origin connection remain to be confirmed by the user.
- No real file upload, repository-content retrieval, multi-turn model memory, assignment or GitHub write behavior is included in this phase.

Complete the manual checklist in README after setting up the AI provider before treating the entire GitHub → extension → backend → real AI → extension flow as accepted.
