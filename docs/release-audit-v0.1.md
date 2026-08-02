# TiboPing v0.1 release audit

Audit date: 2026-08-01

This record maps the v0.1 design criteria to direct evidence. The release
candidate passed its private pull-request workflows; the eventual merge commit
must pass the same workflows on `main` before it is tagged.

## Quality-gate results

The following commands passed after a locked install with generated artifacts
removed at commit `063124b`:

- `npm ci`
- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm run license:check` — 335 installed dependency licenses approved
- `npm run test:coverage` — 44 files and 146 tests passed; 86.42% statements,
  72.11% branches, 83.13% functions, and 88.6% lines
- `npm run build`
- `npm run test:e2e` — 6 browser, keyboard, and Axe checks passed

The clean GitHub runners passed the
[CI workflow](https://github.com/Meliwat/tiboping/actions/runs/30729894412) and
[Container workflow](https://github.com/Meliwat/tiboping/actions/runs/30729894399/attempts/3)
on the same commit. The container matrix built AMD64 and ARM64. The runtime
smoke passed its complete build, delivery, signed-webhook, restart, and
persistence flow in both
[attempt 1](https://github.com/Meliwat/tiboping/actions/runs/30729894399/attempts/1)
and
[attempt 3](https://github.com/Meliwat/tiboping/actions/runs/30729894399/attempts/3).
Attempt 2 stopped before the build because Docker Hub timed out; no application
step ran in that attempt.

A direct storage audit also seeded provider credentials, inspected the raw SQLite
rows and database bytes, decrypted the values for a round trip, and inspected
redacted logs. The database contained ciphertext and the logs contained none of
the seeded credentials.

## Acceptance matrix

|   # | Criterion                                 | Direct evidence                                                                                                                                                                                                                                                                                     | Status |
| --: | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
|   1 | Docker start, health, and persistence     | `scripts/docker-smoke.mjs` boots the production image, checks its non-root user and SPA health, sends a signed webhook, restarts with the same volume, and checks the persisted post and delivery. GitHub's clean runner passed this complete flow twice on `063124b`.                              | Passed |
|   2 | Offline demo through the real pipeline    | `apps/server/test/runtime.test.ts`, `apps/server/test/source/demo-source.test.ts`, and `e2e/setup.spec.ts` exercise setup, classification, routing, the delivery worker, and receipt without X credentials.                                                                                         | Passed |
|   3 | Official X watch and catch-up             | `apps/server/test/source/x-api-client.test.ts`, `x-source.test.ts`, `source-coordinator.test.ts`, and `x-stream-parser.test.ts` cover account resolution, owned-rule replacement, checkpointing, supported post types, repost filtering, reconnects, and catch-up against controlled HTTP fixtures. | Passed |
|   4 | Everything and every category combination | `packages/core/test/classifier.test.ts` and `apps/server/test/delivery/router.test.ts` exhaustively cover the three-category routing table, including multi-category posts and one job per destination. `e2e/dashboard.spec.ts` verifies a live routing change.                                     | Passed |
|   5 | Safe Slack and Discord rendering          | `apps/server/test/destinations/slack.test.ts` and `discord.test.ts` inspect test and notification payloads, source text, timestamps, category labels, canonical links, and mention suppression.                                                                                                     | Passed |
|   6 | Signed generic webhook v1                 | `apps/server/test/destinations/generic.test.ts` and `apps/server/test/crypto.test.ts` verify exact serialized bytes and HMAC signatures. `docs/generic-webhook.md` publishes a reproducible verification vector.                                                                                    | Passed |
|   7 | Local duplicate prevention                | `apps/server/test/db/deliveries.test.ts` and `apps/server/test/delivery/restart.test.ts` exercise the unique `(post_id, destination_id)` boundary across replay and process restart. `README.md` documents the remaining remote ambiguity boundary.                                                 | Passed |
|   8 | Retries and provider isolation            | `apps/server/test/delivery/worker.test.ts`, `backoff.test.ts`, and `e2e/dashboard.spec.ts` cover exponential retry, provider rate limits, permanent failure, destination-only pause, and dashboard recovery.                                                                                        | Passed |
|   9 | Encrypted credentials and redaction       | The direct raw-file audit above, plus `apps/server/test/crypto.test.ts`, `redaction.test.ts`, `db/settings.test.ts`, and the authenticated API suites, cover encryption, log redaction, and response secrecy.                                                                                       | Passed |
|  10 | Complete automated quality gates          | Local and clean-runner format, lint, type, license, unit/integration/coverage, build, browser, keyboard, and accessibility gates passed. The container workflow passed its runtime smoke plus AMD64 and ARM64 builds with immutable action pins.                                                    | Passed |
|  11 | Launch and contributor documentation      | The README quick start was executed from a clean clone. `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `LICENSE`, architecture, adapter, classifier, webhook, issue-template, and pull-request-template files were inspected against shipped behavior.                                     | Passed |

## Release decision

The private pull-request workflows passed. Merge only while the pull-request head
is green, then require both workflows to pass on the exact `main` merge commit.
No paid X calls or provider secrets are required by either workflow. Once the
`main` checks are green, tag that commit as `v0.1.0`.
