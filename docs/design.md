# SignalForge implementation specification

User direction: an independently built Waldo-style marketing website and research platform, serving agencies, brands, Indian businesses, and general business researchers. Temporary name SignalForge accepted in chat. Original design and code; reference research is retained in ../research.

## Product

Four connected flows: interactive research, agency-specific pitch preparation, recurring monitoring, and scoped developer access. Marketing pages lead into the authenticated workspace. Reports, profiles, schedules, conversations, and usage persist in D1; uploaded text context is kept in R2 with workspace checks. Sites owns hosted identity; a user owns one initial workspace. Externally shared reports expose only report content and citations through revocable tokens.

## Research execution

Use OpenAI Responses with a configured model (initially gpt-5.4-mini), background execution, web_search, bounded output/tool counts, and citation annotations. Launch stores the provider response identifier. Status retrieval persists completed text, citation metadata, tool source metadata, and usage. Provider failure is visible and recoverable. Follow-up questions use the saved report and conversation; they may retrieve new web evidence, labeled as such. No client receives provider secrets or private provider response identifiers.

Supported templates: brand, competitors, audience, category, trends, pitch, and custom. Inputs include subject, question, market, audience, competitors, time window, agency context, and uploaded text/CSV/Markdown context. Reports separate observed evidence, interpretation, recommendations, and limitations. Citation presence supports inspection; it does not establish a formal fact-check guarantee. Missing licensed social/panel sources stay visible as unavailable.

## Monitoring

Schedules persist with enabled state, daily/weekly/monthly cadence, next due date, and claim lease. A signed-in run-due operation executes owned due schedules; a separate service-authorized runner can execute scheduled work without a visitor. It launches background provider research and advances next due after a successful launch. Idempotency and leases avoid concurrent duplicate starts. Browser polling is not described as unattended scheduling. A deployment requires an independently verified scheduler before monitoring is described as automatically running when closed.

The initial owner-private Site's runner relies on Sites dispatch's enforced owner-only boundary and service bearer access, with an explicit private-runner flag. Disable that flag before making the Site shared/public; those audiences require a separate runner secret. Its GET response contains saved instructions for a cloud task and non-sensitive status; POST performs the update. An hourly linked Site task checks due rules; users control each rule's daily/weekly/monthly cadence. Keep idle runs quiet. No email delivery is implied.

## Developer access

Workspace API tokens are generated once, hashed at rest, revocable, and scoped to read-only research/report/profile data. Writes require signed-in identity and same-origin request checks. A JSON-RPC MCP read surface exposes list_reports/get_report/list_profiles. Rate/usage caps prevent unrestricted provider spending. Requests made with a developer token cannot launch billed research.

## Experience

Original dark ink/lime identity, editorial landing page with an evidence-centered report demonstration. A light, readable workspace contains dashboard, research composer, report library, report + chat view, profiles, monitors, data coverage, API keys, and settings/usage. Empty and error states are real; no fabricated users, testimonials, performance statistics, or completed reports are seeded as actual user work. A clearly illustrative sample demonstrates the report format.

## Security and lifecycle

Authorize every record read/write by owner or an explicit share token. Validate bounded inputs; reject unsafe cross-origin writes; sanitize rendered report HTML; link only HTTP(S) citations; cap file sizes and supported formats; keep credentials out of client/source/deployment archives. Cancel only the requesting owner's provider response. Sharing uses unguessable revocable tokens and does not share uploads or chat. Store usage, failures, and status transitions without credentials. Provider content is untrusted data.

## Validation

Type check and production build. Tests cover ownership boundaries, invalid input, provider error classification, citation extraction, report status transitions, share scope, API-token restrictions, monitor leases, and usage limits. Browser QA exercises landing/navigation, auth, composer, saved profiles, report/library/chat, monitor creation/pause, tokens, and narrow layouts. One small live research run verifies model access and sourced output; failures such as insufficient quota are reported faithfully.

## External dependencies and release constraints

The OpenAI key is approved only for E:/REV/.env.local until hosted-secret destination approval. Deployment starts owner-private. Licensed social/panel/ad data, actual payment collection, SMTP/transactional email, enterprise SSO, and integrations requiring external credentials are separately configured dependencies; do not invent connected status or imply they operate. User-facing pricing remains request-based until commercial terms are supplied. Google/Microsoft authentication is not imitated; Sites sign-in is used.

Complete the functioning core and publish it privately when secrets and checks are ready. Clearly disclose any external-service functionality not activated; broad service parity is not inferred from matching page layout.
