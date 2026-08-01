# TiboPing v0.1 release audit

Audit date: 2026-08-01

This record maps the v0.1 design criteria to direct evidence. The application is
a release candidate until the GitHub workflows pass on the first public push.

## Quality-gate results

The following commands passed from a clean clone at commit `0a2685f`:

- `npm ci`
- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm run license:check` — 335 installed dependency licenses approved
- `npm run test:coverage` — 44 files and 146 tests passed; 86.42% statements,
  72.11% branches, 83.13% functions, and 88.6% lines
- `npm run build`
- `npm run test:e2e` — 6 browser, keyboard, and Axe checks passed

A direct storage audit also seeded provider credentials, inspected the raw SQLite
rows and database bytes, decrypted the values for a round trip, and inspected
redacted logs. The database contained ciphertext and the logs contained none of
the seeded credentials.

## Acceptance matrix

|   # | Criterion                                 | Direct evidence                                                                                                                                                                                                                                                                                                                                                              | Status     |
| --: | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
|   1 | Docker start, health, and persistence     | `scripts/docker-smoke.mjs` boots the production image, checks its non-root user and SPA health, sends a signed webhook, restarts with the same volume, and checks the persisted post and delivery. The ARM64 clean-build audit found and fixed missing native build tooling in `Dockerfile`; the final clean-runner smoke is delegated to `.github/workflows/container.yml`. | CI pending |
|   2 | Offline demo through the real pipeline    | `apps/server/test/runtime.test.ts`, `apps/server/test/source/demo-source.test.ts`, and `e2e/setup.spec.ts` exercise setup, classification, routing, the delivery worker, and receipt without X credentials.                                                                                                                                                                  | Passed     |
|   3 | Official X watch and catch-up             | `apps/server/test/source/x-api-client.test.ts`, `x-source.test.ts`, `source-coordinator.test.ts`, and `x-stream-parser.test.ts` cover account resolution, owned-rule replacement, checkpointing, supported post types, repost filtering, reconnects, and catch-up against controlled HTTP fixtures.                                                                          | Passed     |
|   4 | Everything and every category combination | `packages/core/test/classifier.test.ts` and `apps/server/test/delivery/router.test.ts` exhaustively cover the three-category routing table, including multi-category posts and one job per destination. `e2e/dashboard.spec.ts` verifies a live routing change.                                                                                                              | Passed     |
|   5 | Safe Slack and Discord rendering          | `apps/server/test/destinations/slack.test.ts` and `discord.test.ts` inspect test and notification payloads, source text, timestamps, category labels, canonical links, and mention suppression.                                                                                                                                                                              | Passed     |
|   6 | Signed generic webhook v1                 | `apps/server/test/destinations/generic.test.ts` and `apps/server/test/crypto.test.ts` verify exact serialized bytes and HMAC signatures. `docs/generic-webhook.md` publishes a reproducible verification vector.                                                                                                                                                             | Passed     |
|   7 | Local duplicate prevention                | `apps/server/test/db/deliveries.test.ts` and `apps/server/test/delivery/restart.test.ts` exercise the unique `(post_id, destination_id)` boundary across replay and process restart. `README.md` documents the remaining remote ambiguity boundary.                                                                                                                          | Passed     |
|   8 | Retries and provider isolation            | `apps/server/test/delivery/worker.test.ts`, `backoff.test.ts`, and `e2e/dashboard.spec.ts` cover exponential retry, provider rate limits, permanent failure, destination-only pause, and dashboard recovery.                                                                                                                                                                 | Passed     |
|   9 | Encrypted credentials and redaction       | The direct raw-file audit above, plus `apps/server/test/crypto.test.ts`, `redaction.test.ts`, `db/settings.test.ts`, and the authenticated API suites, cover encryption, log redaction, and response secrecy.                                                                                                                                                                | Passed     |
|  10 | Complete automated quality gates          | Local format, lint, type, license, unit/integration/coverage, build, browser, keyboard, and accessibility gates passed. `.github/workflows/ci.yml` repeats them; `.github/workflows/container.yml` smoke-tests AMD64 and builds both AMD64 and ARM64 with immutable action pins. Remote workflow results require the first GitHub push.                                      | CI pending |
|  11 | Launch and contributor documentation      | The README quick start was executed from a clean clone. `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `LICENSE`, architecture, adapter, classifier, webhook, issue-template, and pull-request-template files were inspected against shipped behavior.                                                                                                              | Passed     |

## Release decision

Publish only after both GitHub workflows pass. No paid X calls or provider secrets
are required by either workflow. Once green, tag the exact passing commit as
`v0.1.0`.
