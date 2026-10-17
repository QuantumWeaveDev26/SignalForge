# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Four audiences, weighted equally (confirmed): agency strategists preparing pitches and client research, in-house brand teams tracking their brand and market, Indian businesses researching Indian and global markets, and general business researchers. No single lead persona; every surface must work for all four.

## Product Purpose

A research workspace that turns an open business question into a sourced point of view. Users pick a template (brand, competitors, audience, category, trends, pitch, custom), add market, audience, competitors, time window, and their own context files, and receive a report that separates observed evidence, interpretation, recommendations, and limitations, with citation links. Reports continue as follow-up conversations, can be monitored on a cadence, shared by revocable link, and read through scoped API keys and MCP. Success: the user leaves with a position they can defend and trace to its sources.

## Positioning

The target is a brand and market intelligence platform covering Waldo's four service areas: Strategize, Pitch, Monitor, and Build. Pitch is one service, not the organizing constraint for the whole product. The current implementation is an open-web research foundation; it does not yet provide full functional equivalence. Track observed reference features, gaps, dependencies, and acceptance conditions in `docs/waldo-parity.json`.

## Operating Context

- Marketing site (home, Research, Pitch, Monitor, Build, pricing, use cases, sample, contact, privacy, terms) leads into the authenticated workspace.
- Workspace entry point: conversational research with brand context, saved conversations and cited follow-ups. Also available: overview dashboard, project-linked report composer, projects, reusable Files library, workflow card library and step-by-step runs, report library with favorites/labels/filters, report + chat view, profiles, monitors, data coverage, API keys, settings/usage.
- Sign-in: Google OAuth and email/password (signup with verification, password reset) via Better Auth; hosted Sites identity in preview.
- Saved brand workspaces support create/search/edit with revision conflict checks, all-account associated-report counts and latest-10 previews, linked projects/files, brand-filtered workflow and chat entry points, and fresh research briefs. Editing updates an existing automatic weekly rule atomically while preserving its pause state, schedule and history. Existing reports, conversations, workflow templates and pitch snapshots retain their inputs; new chats also record the brand website and revision. Brand revisions are concurrency markers, not a historical version/restore archive.
- The report library searches all owned saved reports by title, subject and question, combines favorite/project/brand/type/status/exact-label/created-since filters server-side, and loads 20 metadata-only cards per page. Counts cover the full account; filter and grid/list choices survive return from a report and reload through the library URL. The workspace overview remains a latest-100 preview and developer list APIs retain their existing contract.
- Shared reports are read by people outside the workspace via revocable links; reports export to Markdown and print.

## Capabilities and Constraints

- Context files: text PDFs (up to 50 pages), DOCX, plain text, Markdown and CSV; 5 MB and 100,000 extracted characters per file; up to three per run or chat message within a shared 30,000-character context budget. The Files library supports previews, original downloads, project/brand organization and archive/restore. Page, paragraph or line markers retain attribution. OCR, image/chart interpretation, PPTX and XLSX are not available.
- Chat stores independent conversations, preserves a snapshot of the selected brand, and supports Strategy Agent and Research Agent response roles. A user-defined persona offers a clearly labeled hypothetical perspective, not measured audience or interview evidence. Voice input and shared team chat are not active. Brand, project and persona context are snapshotted; agent choice is retained per answer. Favorites, older-message pagination, copy with sources and full Markdown export are available. Answers use up to eight recent answered turns within a bounded context budget; reading older history does not expand model memory.
- The workflow library presents nine reference-aligned cards. Five run using open-web research; four social/ad-dependent cards stay unavailable until real data providers are connected.
- Monitoring cadence: daily, weekly, monthly. An active hourly Google Cloud Scheduler dispatcher checks due rules through a dedicated OIDC identity. Weekly India monitoring is enabled for saved brands; there are currently no real business brands saved. A real scheduled QA run completed with citations, and duplicate dispatch was checked. Monitoring history now paginates saved scans and new scans capture the previous completed same-rule baseline at launch. Comparable scopes receive a cited changes section plus newly cited/shared/earlier-only source lists and Markdown export. Scope changes, unfinished scans and historical reports without snapshots withhold direct comparison. Opt-in verified-account email notifications now use the hourly dispatcher and a durable D1 outbox for completed/partial/failed scans and launch refusals. Monitoring shows Gmail acceptance receipts, safe retries, sender health and a test action. Gmail OAuth remains Testing by explicit operator choice, so consent can expire after seven days; ambiguous sends require an acknowledged manual retry.
- Saved workflows run one to three research steps. Each step uses one report allowance. Users can review after each step or enable continuous progression, including background execution with the page closed; errors and partial results always pause. Templates retain owned brand/project/file defaults, can be customized/duplicated and reordered, and runs preserve attempts plus prior source handoffs. Repeated create and guarded advance requests do not duplicate billed work. Signed OpenAI webhooks persist terminal states and advance eligible continuous workflows with duplicate/lease guards. A three-step background Brand Audit completed live with its page closed.
- Pitch workspace: saved structured client/RFP intake, reusable agency credentials snapshotted per pitch, selected context files, an editable manual playbook, source-backed one-step background research, explicit research import, append-only playbook revisions with conflict detection and restore, archive/restore and Markdown export. Each research run uses one report allowance. Human edits are not automatically verified; restoring a playbook preserves the current brief and agency snapshot. Team review, rich deck/DOCX exports and automatic client communication are not included.
- API tokens are read-only and cannot launch billed research.
- Licensed social listening, audience panels, ad datasets, transactional email beyond Gmail delivery, and enterprise SSO are not active and must never be presented as connected.
- The operator approved monthly Solo pricing (INR 1,499 / USD 19; 50 questions, 10 reports) and Pro pricing (INR 3,999 / USD 49; 200 questions, 30 reports). Razorpay checkout, verification, webhooks, cancellation and account usage are implemented. Activation requires separate test/live server configuration and merchant acceptance testing; never present disabled or test checkout as live billing. See `docs/billing-readiness.json`.
- Runtime: Vinext/React on Cloudflare Workers, D1, R2. Hosting configuration (`.openai/hosting.json`, build and config files) is fixed.
- Authentication, research, and API behavior must be preserved through any visual change.
- The user has frozen the current deployed theme. Build missing functionality within it; do not begin another visual redesign.
- The REA repository is an inspection toolkit, not Waldo's source code or its data services. Reconstruct observed behavior and connect authorized providers separately.

## Brand Commitments

- Name "SignalForge" and the two-bar logo mark are provisional (confirmed): design so both can be swapped without rework.
- Voice in existing copy: short declarative lines, evidence-first, no hype ("Good questions deserve better evidence.").

## Evidence on Hand

- One clearly illustrative sample report format (`/sample`); it must stay labeled illustrative.
- Provider-generated validation reports exist; they do not establish customer adoption, measured business results, or complete dataset coverage. No customer testimonials, certifications, or press are established. Do not fabricate any.
- Logged-in Waldo screenshots supplied on 2026-10-15 show brand selection, conversations, workflows, projects, files navigation, report filters, and workspace management. Screenshots establish visible controls, not successful execution or private backend behavior.

## Product Principles

1. Evidence stays inspectable: findings sit next to their sources, and limits are stated rather than hidden.
2. Never imply coverage, automation, or integrations that are not active.
3. The user's context (brief, brands, files) is what makes the answer theirs.
4. Research is a conversation that continues, not a one-shot answer.
5. Serve the four audiences across strategy, pitching, monitoring, and developer access; judge progress by working capabilities and real evidence.

## Editable Word exports

Saved completed/partial research reports and saved pitch playbooks download as editable DOCX without a provider call. Reports include the question, status, market, creation date, body, numbered citation links, source appendix and limitations. Pitch playbooks include the saved revision, intake, supplied agency snapshot, body, file identifiers and source trail. Pitch exports are disabled while the editor has unsaved changes. Existing Markdown and Print/PDF exports remain available.

The export supports the product Markdown subset, headings, emphasis, bullet/numbered lists, links, code, and simple pipe tables. Wide tables become labeled records to preserve legibility. Images are preserved as text references, not embedded. It is a saved-content document, not a slide deck; report follow-up chat and the separate monitoring comparison panel are not included. No shared links or access grants are created.

## Prepared manager demo

Overview can save a fixed fictional coffee launch pack for the signed-in owner. The brand/project, sourced prepared report, editable pitch and initial revision, and paused weekly monitoring rule are saved atomically. Prepared content states its origin and source review date; it is not presented as a new model run. Repeated saves reuse the same records without overwriting edits. No provider calls, new billing charges or public share links are created. Real research and follow-ups retain their normal usage limits.
