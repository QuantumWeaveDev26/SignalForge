# SignalForge

SignalForge is a business research and strategy workspace with an original visual theme, inspired by the services and workflows demonstrated by Waldo. It does not contain Waldo's private source code or licensed datasets.

**Live website:** https://signalforge-research-nr.brandmintai.chatgpt.site

## Working capabilities

- Public marketing pages and direct Google or verified email/password accounts; password resets and revocable sessions.
- Saved research conversations, follow-up questions, brand/persona/project context, web research and source-linked reports.
- Editable saved-brand workspaces with revision conflict protection, linked report totals/latest previews and related projects/files/workflows. Edits update automatic-monitor inputs while retaining pause/schedule/history; earlier research and chat context snapshots remain unchanged.
- Editable research workflows with background execution, saved step outputs, retries and signed provider-webhook completion.
- Projects, brands/topics and a complete saved-report library: search, combined filters, favorites and labels across all saved reports, with pagination, reliable retry, grid/list views and remembered filters. Markdown and editable Word (DOCX) downloads, plus revocable report sharing, are supported.
- A Files library for PDF, DOCX, TXT, CSV and Markdown: extracted-text previews, original downloads, project/brand organization, archive/restore and reuse in research. File limits and OCR limitations are disclosed in the product.
- Saved client/RFP briefs, reusable agency credentials, cited pitch research, editable playbooks, revision history/restore and Markdown or editable Word exports.
- Daily/weekly/monthly monitoring rules, report history and an authenticated hourly Google Cloud dispatcher that respects each rule's own cadence. Repeat briefings can be compared with the prior completed scan, with source differences, an AI change summary and duplicate-dispatch protection.
- Scoped, hashed and revocable read-only workspace API keys and JSON-RPC MCP tools for saved reports and profiles.
- Usage/concurrency limits, source-coverage disclosures and disabled states for services that have not been connected.

Word exports include linked source appendices and disclose status/coverage limits; native Office visual pagination has not been verified. The acceptance records in docs/ describe tested behavior and remaining limits. docs/source-release.json identifies the exact published Sites source commit mirrored into this repository. See docs/repository-maintenance.md for future release synchronization.

## Remaining integrations and limitations

Licensed ad libraries, social listening, measured trends and audience panels are not connected. Open-web research is distinguished from those datasets. Team invitations/roles/shared chats, richer presentation/spreadsheet exports, OCR and broader raw-data APIs remain incomplete. Razorpay integration code exists, but payment activation and end-to-end merchant testing are deferred until credentials are configured. Gmail sender authorization must be suitable for production; Google OAuth Testing can require periodic reconnection for the sender.

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
