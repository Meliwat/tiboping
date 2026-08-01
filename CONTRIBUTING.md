# Contributing to TiboPing

Thanks for helping make a very small signal relay more useful. Bug fixes, classifier
fixtures, destination adapters, documentation, and accessibility improvements are all
welcome.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before opening a pull request

For bugs, search existing issues and include a minimal reproduction. For classification
changes, include the exact post text or an anonymized equivalent, the expected
categories, and the current result. Never paste bearer tokens, webhook URLs, signing
secrets, cookies, or populated `.env` files.

For a large feature or behavior change, open an issue first. This avoids doing a lot of
work against an interface that may be changing.

## Local setup

TiboPing requires Node.js 24+ and npm 11+.

```bash
git clone <your-fork-url>
cd tiboping
npm ci
cp .env.example .env
npm run dev
```

For local development, set `DEMO_MODE=true`. Demo mode exercises the real application
without X credentials or paid requests.

## Quality checks

Run the focused test while iterating, then the complete local gates before requesting
review:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

Browser tests build and start a temporary production-mode server on ports 3100 and 3999. Install Chromium once if Playwright asks for it:

```bash
npx playwright install chromium
```

The Docker smoke test is optional during normal iteration but required for deployment
changes:

```bash
npm run test:docker
```

It builds a local image, sends a signed generic webhook, restarts against a named
volume, and verifies persistence. It does not call X.

## Classifier changes

Rules live in `packages/core/src/classifier/rules.ts` and must remain deterministic.
Every rule change needs:

1. At least one positive fixture with the expected category and rule ID.
2. Negative fixtures for plausible false positives.
3. An explanation in `docs/classification-rules.md` if public behavior changes.
4. No network call, model inference, clock dependency, or hidden mutable state.

Prefer narrow contextual rules to broad keywords. A rule can add a category but must
not suppress another matching category.

## Destination adapters

Adapters implement the `DestinationAdapter` contract in
`apps/server/src/destinations/types.ts`:

- validate configuration before it is stored;
- render provider-safe output with no implicit mentions;
- enforce a 10-second timeout, bounded response body, manual redirects, and URL policy;
- map 2xx to success, 408/429/5xx/network errors to retry, and invalid endpoints to a
  permanent failure;
- never log credentials or full webhook URLs.

Add rendering, injection, rate-limit, redirect, retry, and registry tests. If the
adapter adds a new destination type, update the core schema, database migration path,
setup/dashboard UI, documentation, and end-to-end coverage together.

## Commits and pull requests

Keep commits scoped and use an imperative subject, for example:

```text
fix: preserve catch-up order after reconnect
feat: add ntfy destination adapter
docs: explain generic webhook replay protection
```

Pull requests should explain the user-visible result, testing performed, security or
compatibility impact, and screenshots for UI changes. Complete the repository pull
request template; do not mark a check complete unless you ran it.

Maintainers may ask to split unrelated changes. Small, reviewable pull requests land
faster.

## Security reports

Do not open a public issue for a suspected vulnerability. Follow
[SECURITY.md](SECURITY.md) instead.
