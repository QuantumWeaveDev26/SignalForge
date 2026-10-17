# SignalForge independent accounts

This migration adds direct Google OAuth and email/password accounts using Better Auth 1.7.9, with the existing Cloudflare D1 database. It does not require Supabase. The public Site audience stays public. Platform-owned ChatGPT auth routes remain intact for optional preview-workspace linking; new users do not use those routes after account activation.

## Google Cloud configuration

Use a Web application OAuth client. Only request OpenID, email, and profile for customer sign-in.

- Authorized JavaScript origin: `https://signalforge-research-nr.brandmintai.chatgpt.site`
- Customer sign-in redirect URI: `https://signalforge-research-nr.brandmintai.chatgpt.site/api/auth/callback/google`
- Temporary mailbox setup redirect URI: `http://localhost:57431/gmail-oauth/callback`

Enable Gmail API in the same Google Cloud project. The separate operator-only mailbox wizard requests OpenID, email, and `https://www.googleapis.com/auth/gmail.send`. Customer sign-in never requests Gmail access. Review the OAuth app's consent audience, publishing status, test users, and applicable Google verification requirements. Google refresh tokens for external apps in Testing can expire after seven days when non-basic scopes are requested. Mailbox authorization must be suitable for unattended production use before claiming reliable public email delivery.

## Mailbox and secrets

The operator selected `team.quantumweaveai@gmail.com` as the sender. Gmail API is used over HTTPS; no SMTP connection, mailbox password, or access to read messages is needed.

1. Copy `.env.auth.example` to ignored `.env.auth.local` in the project root.
2. Set the supplied Google web client ID, its client secret, and the sender address locally. Do not paste secrets in chat or commit the file.
3. Run `node scripts/connect-gmail.mjs`. Open the printed Google consent URL and authorize the selected sender account. The wizard verifies its email identity, saves the refresh token and a random session secret locally, and never prints them. It does not send email or activate the hosted Site.
4. Configure the corresponding hosted runtime values through the Sites secret settings. Mark `GOOGLE_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, and `BETTER_AUTH_SECRET` as secrets. `GOOGLE_CLIENT_ID`, `AUTH_EMAIL_FROM`, `AUTH_BASE_URL`, and `AUTH_ENABLED` are configuration.
5. Deploy the saved version after changing runtime configuration. Enable `AUTH_ENABLED=true` only once credentials and the additive migration are ready.

Passwords are hashed by Better Auth. Unverified email/password registrations cannot obtain an authenticated workspace. Verification and reset links expire after one hour; resetting a password revokes existing sessions. Sessions live in D1 and use secure HttpOnly SameSite=Lax cookies. OAuth tokens are encrypted before database storage. Automatic same-email social-account linking is disabled; users link Google explicitly while signed in. Auth requests have database-backed rate limits and same-origin checks. Google callback state/PKCE and verification/reset handling are provided by Better Auth.

The Gmail transport obtains a short-lived access token, checks the verified sender identity, then sends the message. It validates recipients and link origins and does not log credential values, message bodies, or token-bearing URLs. Gmail quotas and Google authorization availability still apply.

## Existing reports and rollback

The migration only adds auth tables and `workspace_accounts`. Existing record owners, uploaded object keys, reports, shares, and developer keys are not rewritten.

After signing in to a verified SignalForge account, an existing preview user can open Workspace settings and link the original preview workspace. This requires a fresh SignalForge login and a valid original ChatGPT preview session with the same email; email matching alone does not claim data. Each preview workspace can be claimed by at most one SignalForge account. New and preview workspaces stay separate and can be switched; linking never merges, deletes, or moves records, including during concurrent writes.

Until activation, old sign-in continues to work. To roll back, set `AUTH_ENABLED=false` and redeploy the saved version. Keep the additive tables: new accounts and workspace data remain stored, and original preview records remain available through the original identity. Rolling back login can temporarily prevent access for newly registered independent accounts; it does not delete them.

## Verification

`node --experimental-strip-types --test tests/auth.test.mjs` exercises the actual Better Auth handler with a local D1 binding and the production Drizzle schema: hashed signup, blocked unverified sessions, verification cookies, forged sessions, Google redirect/state/PKCE, password reset/revocation, additive ownership preservation, and the Gmail transport with fake HTTP responses. Real Google consent and mailbox delivery require the operator's configured credentials and are separate activation checks.

## Monitoring emails and sender recovery (17 October 2026)

Monitoring now has an opt-in Email notifications panel. It uses the signed-in verified account email, never an address from the request body. Explicitly linked preview workspaces are checked against their account link on each delivery. Enabling notifications covers scans launched afterward; it does not backfill old reports. Account verification/reset emails continue through the same Gmail sender.

The existing hourly monitoring dispatcher discovers completed, partial and failed scans and scan-launch refusals. It saves each event in the additive D1 outbox before sending. The outbox records pending/retry/blocked/sending/accepted/uncertain/failed/suppressed states; the stored success state is called sent and the UI labels it Accepted by Gmail. Gmail acceptance is not proof of inbox receipt. Monitoring emails contain a private sign-in link, title and outcome, with no report body or attachments. Disabling notifications suppresses unsent queued messages.

Token refresh/identity reads retry bounded temporary failures. Explicit rate-limit rejections retry with backoff/Retry-After through the hourly dispatcher. At most eight send attempts and seven days of message retention are allowed; authorization blocks do not consume send attempts. A process interruption after starting send, a network timeout, a Gmail 5xx or a missing success receipt is uncertain because Gmail offers no exactly-once send contract here. These messages are not automatically resent. After checking the inbox and spam folder, the owner can explicitly acknowledge duplicate risk and retry.

The operator explicitly chose to keep Google OAuth in Testing on 17 October 2026. This cannot provide permanent unattended sender authorization: Gmail-scoped refresh consent can expire after seven days. The UI always discloses Testing unless GMAIL_OAUTH_STATUS=production has been configured after an actual Google status change. That flag is a disclosure, not a way to change Google's consent state.

When Gmail authorization is blocked:
1. Run the existing local node scripts/connect-gmail.mjs wizard and authorize the configured sender yourself. Never paste its refresh token into chat.
2. Replace only the hosted GMAIL_REFRESH_TOKEN secret through Sites environment settings, then redeploy a saved version. Keep the existing login client and session secret.
3. Choose Check sender in Monitoring. Eligible blocked messages automatically retry after their saved backoff, while expired messages require a fresh future event.
4. Use Send me a test email and check both inbox and spam. Tests are limited to one per owner every 30 minutes.

For repeatable operator acceptance, node scripts/verify-mail-live.mjs --send sends exactly one test message to the configured sender through an isolated actual Worker/D1 and the real Gmail transport. The ignored proof file reserves the attempt before sending so reruns do not send duplicates. It does not read the inbox, launch research or change production records. Tests under tests/*.test.mjs never use real credentials or send external email.

References: https://developers.google.com/identity/protocols/oauth2/ and https://developers.google.com/workspace/gmail/api/guides/handle-errors .
