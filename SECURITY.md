# Security policy

## Supported versions

Until TiboPing reaches 1.0, security fixes are released for the latest minor release
only.

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |
| < 0.1   | No        |

## Reporting a vulnerability

Please use GitHub’s private vulnerability reporting flow:

1. Open this repository’s **Security** tab.
2. Choose **Advisories** → **Report a vulnerability**.
3. Include affected revision/version, impact, reproduction, and any suggested fix.

If private reporting is unavailable, open a public issue asking the maintainer to
enable a private channel, but do not include vulnerability details, secrets, or an
exploit.

You should receive an acknowledgment within seven days. We will investigate, agree on
a disclosure timeline, prepare a fix and tests, and credit reporters who want credit.
Please allow a reasonable remediation window before public disclosure.

## Security boundaries

TiboPing is a single-operator, self-hosted service. The dashboard is protected by an
admin password, an eight-hour signed HttpOnly/SameSite session, origin checks, CSRF
tokens, and login rate limiting. It is not designed for mutually untrusted operators or
multi-tenant hosting.

Important deployment assumptions:

- Keep `APP_SECRET`, `ADMIN_PASSWORD`, `X_BEARER_TOKEN`, webhook URLs, cookies, and
  generic signing secrets out of Git, logs, screenshots, and issue reports.
- Use HTTPS whenever the dashboard is reachable beyond localhost. Set `PUBLIC_URL` to
  the exact browser origin.
- Keep the default loopback port binding and expose TiboPing through a maintained
  reverse proxy.
- Keep `ALLOW_PRIVATE_WEBHOOKS=false` unless LAN delivery is intentional. Enabling it
  permits outbound HTTP to private addresses and expands SSRF impact if the operator
  account is compromised.
- Back up `APP_SECRET` separately from SQLite. It derives the AES-256-GCM key used for
  destination configuration and stored X credentials. Losing it is unrecoverable;
  changing it without re-entering configuration makes encrypted rows unreadable.
- A changed admin password does not revoke an already signed session immediately;
  sessions expire within eight hours. If compromise is suspected, isolate the service,
  rotate provider credentials, rebuild configuration with a new `APP_SECRET`, and
  restart.
- Generic webhook receivers must verify signatures against the raw request body, bound
  timestamp age, and deduplicate `event_id`. See
  [docs/generic-webhook.md](docs/generic-webhook.md).

Dependencies and container images should be kept current. Do not rely on TiboPing as a
general-purpose secret vault or internet-facing identity provider.
