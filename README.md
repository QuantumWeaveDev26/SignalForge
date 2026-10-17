# SignalForge

SignalForge is a business research and strategy workspace with an original visual theme, inspired by the services and workflows demonstrated by Waldo. It does not contain Waldo's private source code or licensed datasets.

**Live website:** https://signalforge-research-nr.brandmintai.chatgpt.site

## Working capabilities

- Public marketing pages and direct Google or verified email/password accounts; password resets, active-device/session listings and revocation without exposing session tokens.
- Saved research conversations, follow-up questions, brand/persona/project context, web research and source-linked reports. Optional browser speech dictation fills the editable composer for review before sending; availability depends on browser support.
- Editable saved-brand workspaces with revision conflict protection, linked report totals/latest previews and related projects/files/workflows. Brand context history records edits after activation, and restoration creates a fresh revision. Edits update automatic-monitor inputs while retaining pause/schedule/history; earlier research and chat context snapshots remain unchanged.
- A persistent Brand view filters associated workspace lists and supplies defaults for new work. Explicit URL scope wins; open drafts and existing snapshots keep their context. All brands includes unassociated older items. This filter is not a team permission boundary.
- Editable research workflows with background execution, saved step outputs, retries, complete paginated run history and signed provider-webhook completion.
- Projects, brands/topics and a complete saved-report library: search, combined filters, favorites and labels across all saved reports, with pagination, reliable retry, grid/list views and remembered filters. Markdown, editable Word (DOCX) and editable PowerPoint text-slide downloads, plus revocable report sharing, are supported.
- A Files library for PDF, DOCX, PPTX, XLSX, TXT, CSV and Markdown: extracted-text previews, original downloads, project/brand organization, archive/restore and reuse in research. PPTX preserves declared slide order; XLSX extracts visible sheet/cell values and cached formulas without recalculation. DOCX secondary parts are attributed separately. File limits and OCR limitations are disclosed in the product.
- Saved client/RFP briefs, reusable agency credentials, cited pitch research, editable playbooks, paginated revision history, revision-specific team reviews/owner decisions and Markdown, Word or editable PowerPoint exports. New revisions capture full brief/agency context for optional restoration; legacy snapshots disclose their limits.
- Daily/weekly/monthly monitoring rules with IANA timezone/local-time scheduling, report history and an authenticated hourly Google Cloud dispatcher that respects each rule's own cadence. DST transitions, month ends and overdue scans have explicit rules; the hourly dispatcher does not promise minute-exact delivery. Legacy schedules remain unchanged until edited. Repeat briefings can be compared with the prior completed scan, with source differences, an AI change summary and duplicate-dispatch protection.
- Opt-in monitoring email notifications to verified account recipients, with a durable queue, bounded safe retries, sender health checks, test mail and delivery status. Google OAuth remains in Testing by request: sender authorization can expire after seven days, so reconnect is still necessary and indefinite unattended delivery is not promised.
- Hashed and revocable read-only API keys with report/profile permissions, new-key expiry, an atomic 60-request/minute budget and rolling 24-hour usage counts. REST and MCP provide paginated report search while preserving legacy list responses. Legacy keys retain their previous permissions and lifetime.
- Separate team workspaces with approved Owner/Editor/Viewer roles, email-bound seven-day private invitation links, access revocation and shared conversations with My/All creator filters. Personal records stay separate; all team records are visible to its members. Owners share invitations manually. Team paid-plan sharing, developer keys, notification delivery and ownership transfer are unavailable.
- Owner-managed client portals publish deliberately reviewed, immutable report/pitch text snapshots for verified email recipients. One-use private invitations bind the accepting account, with optional private comments and Markdown downloads, 1–90 day expiry, revocation and snapshot withdrawal. Each portal shares its published snapshots with every active recipient; separate portals provide separate disclosure groups. Clients gain no team membership, original files, private intake/agency context or research execution rights. Owners manually share invitation links; no invitation or comment notification emails are sent.
- Usage/concurrency limits, source-coverage disclosures and disabled states for services that have not been connected.
- An authenticated, repeat-safe action saves the fixed prepared manager demo report/playbook into the account's workspace with related project/brand records and a paused monitoring rule. Samples are clearly fictional and prepared, not live AI research; saving them makes no provider or payment call.

Word and PowerPoint exports include saved content/source trails and disclose status/coverage limits; native Office visual layout has not been verified. Version27 passed 196 tests, type checking and production build, including eight portal Worker/D1 integration cases and four portal React DOM cases. Dependencies and the cross-platform lockfile are unchanged. Signed-in production browser walkthroughs were not performed for this release; no real provider/email requests or client production seeds were made. Existing speech tests use a mocked browser engine rather than real microphone recording. The acceptance records in docs/ describe tested behavior and remaining limits. docs/source-release.json identifies the exact published Sites source commit mirrored into this repository. See docs/repository-maintenance.md for future release synchronization.

## Remaining integrations and limitations

Licensed ad libraries, social listening, measured trends and audience panels are not connected. Open-web research is distinguished from those datasets. OCR/scanned-image/chart interpretation, internal per-record staff privacy/requester controls, team paid-plan/email sharing, ownership transfer and retention administration remain unavailable. PowerPoint exports contain editable saved text, not chart rendering or an invented summarized narrative. Razorpay integration code exists, but payment activation and end-to-end merchant testing are deferred until credentials are configured. Google OAuth remains Testing by request, so Gmail sender consent can expire after seven days. Client download controls restrict the provided export action; readable text may still be copied, printed or captured, and prior downloads cannot be recalled. Portal comments are bounded to 200 messages per snapshot/client thread with the latest 100 shown. This is not exhaustive Waldo feature parity.

## Stack

React and Vinext on Cloudflare Workers, D1 for structured records, R2 for uploaded context, Better Auth for application accounts, and OpenAI for research. Schema and additive migrations are in db/ and drizzle/. Preserve the existing .openai/hosting.json Site identity; do not create a replacement Site for this application.

## Local development and checks

Use Node 24 and npm. From a fresh clone:

```sh
npm ci
node --import ./scripts/sites-env.mjs ./scripts/run-framework.mjs dev --hostname 127.0.0.1
```

The portable development server uses port 5173. Local D1 must be initialized from the committed migrations before exercising database features. Local development identity and fixture tests do not grant access to production accounts or data.

```sh
node node_modules/typescript/bin/tsc --noEmit
node --experimental-strip-types --test tests/*.test.mjs
node scripts/run-framework.mjs build
```

Fixture/policy tests create isolated local databases and stub provider responses; they require no API keys and do not send email or charge a merchant. The separate tests/live-*.mjs scripts can call real providers and must only be run with explicit authorization and approved credentials. On Windows, if the npm shell shim resolves incorrectly, invoke the installed npm-cli.js with node.

## Secrets and hosted operation

Never commit real .env files, API keys, OAuth secrets, refresh tokens, webhook signing secrets, private service tokens, payment credentials, production data or uploaded files. The two committed .env.*.example files are blank configuration templates. See docs/authentication.md, docs/background-execution.json, docs/monitoring-setup.json and docs/billing-readiness.json for service-specific setup and limits.

The local development runner may load an ignored .env.local from the parent workspace, plus ignored project-local auth/background files; production builds do not load the parent key file. Configure hosted secrets through Sites. The dedicated Cloud Scheduler identity calls the monitoring endpoint using verified Google OIDC; its schedule is distinct from customer monitoring cadence.

GitHub pushes validate source; they do not deploy the website. Publishing remains through the approved Sites source/deployment workflow, preserving the existing project and audience. The GitHub Actions workflow runs type checking, fixture tests and a production build without production secrets.

## License

No project-wide redistribution license has been selected. Third-party code retains its included license notices, including those under build/ and vendor/.
