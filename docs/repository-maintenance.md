# Repository maintenance

This repository is the maintained GitHub source copy for SignalForge. The public website is hosted by Sites. Pushing to GitHub does not deploy it.

## Release synchronization

1. Complete the feature in the canonical Sites checkout. Keep its existing project identity, source remote and publishing workflow intact.
2. Run type checking, the complete fixture/policy test suite, the production build, and relevant browser/live acceptance checks.
3. Publish with the Sites source helper and native Sites deployment tools. Wait for a successful deployment and retain its exact source commit SHA.
4. Export tracked files from that exact commit into a separate GitHub checkout. Never copy the canonical working directory or its Git metadata. Do not include uncommitted changes.
5. Exclude real environment files and credentials, local tool/runtime state, dependencies, build outputs, screenshots, database files and TypeScript build caches. Preserve only the documented blank .env.auth.example and .env.billing.example templates.
6. Review the full GitHub diff and scan for credential patterns. Deliberate test-only fixtures are not deployment credentials; do not replace them with real keys.
7. Update docs/source-release.json with the deployed source SHA, site URL and synchronization date. Commit on main for the initial import; use a focused branch/pull request for subsequent feature changes when useful. Never force-push over existing GitHub history.
8. Push, inspect the GitHub commit and CI result, and report the repository link plus any failed checks. Do not claim synchronization if the push failed.

Future GitHub-originated changes must be reviewed and carried through the canonical Sites workflow before being called live. Reconcile both histories without replacing existing work.

## Validation and credentials

The GitHub Actions validation workflow uses Node 24, the committed npm lockfile, type checking, fixture/policy tests and a production build. It has read-only repository permissions and requires no application secrets. It does not deploy or run paid model requests. Live smoke scripts (tests/live-*.mjs) are intentionally not run by CI.

Environment examples describe variable names only. Configure actual OpenAI, Google, Gmail, webhook, scheduler and Razorpay credentials through approved local or hosted secret settings. Never put them in source, issues, PRs, workflow output or frontend bundles. Keep production database contents and uploaded customer files out of Git.

Keep the current SignalForge theme unless the user explicitly requests a design change. The tracked DESIGN.md describes its visual rules.

## Lockfile portability

The missing optional @emnapi/core@1.10.0 and @emnapi/runtime@1.10.0 lock entries beneath @rolldown/binding-wasm32-wasi were reconciled into canonical Sites source in version18. The repository lockfile now matches that published source. Preserve a complete cross-platform lockfile when changing dependencies and verify clean npm ci in CI.
