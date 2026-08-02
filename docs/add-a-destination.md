# Add a destination

Destinations are created during setup or from **Dashboard → Add destination**. Every
destination starts on **Everything**; open **Topics** afterward to choose Codex +
releases, Outages, and/or Usage limits + resets.

TiboPing validates a URL before encrypting it. Send a test notification before relying
on the destination in production.

## Slack

1. Follow Slack’s [incoming webhook guide](https://api.slack.com/messaging/webhooks) to
   create a webhook for the target channel.
2. Choose **Slack**, give the destination a recognizable display name, and paste the
   complete `https://hooks.slack.com/services/...` URL.
3. Save, select topics, and send the test notification.

Slack Gov webhooks on `hooks.slack-gov.com` are also accepted. Other hosts and path
shapes are rejected. TiboPing sends a Block Kit message with escaped/truncated post
text, category labels, timestamp, and an **Open on X** button.

## Discord

1. In the target Discord channel, open **Edit Channel → Integrations → Webhooks** and
   create/copy a webhook URL. Discord’s
   [webhook guide](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks)
   has the provider steps.
2. Choose **Discord**, name the destination, and paste the complete webhook URL.
3. Save, select topics, and send the test notification.

TiboPing accepts official Discord, PTB, Canary, and legacy `discordapp.com` webhook
hosts. Messages disable `allowed_mentions`, use one embed, and include categories and
the post timestamp.

## Generic webhook

Choose **Generic** when another system can receive HTTPS POST requests. TiboPing shows a
random signing secret exactly once. Copy it into the receiver before continuing.

The request uses a versioned JSON contract and three `X-TiboPing-*` headers. Verify the
signature against the raw bytes, reject stale timestamps, and deduplicate event IDs.
The complete contract and code are in [generic-webhook.md](generic-webhook.md).

Generic webhooks make a useful bridge to automation tools and destinations without a
native adapter. Production endpoints must use HTTPS and resolve only to public
addresses. For an intentional LAN receiver, set `ALLOW_PRIVATE_WEBHOOKS=true`; this
allows private HTTP targets and should be used only on a trusted network.

## Routing semantics

- **Everything**: every observed original post, reply, or quote from Tibo, including
  text that matches no category.
- **Codex + releases**: any post with a Codex classifier match.
- **Outages**: incident/degradation and recovery language.
- **Usage limits + resets**: limit/quota/credit and reset/big-button language.

Selecting multiple categories means “any of these,” not “all of these.” A post matching
two selected categories produces one delivery.

## Failure and recovery

Each destination is isolated. Temporary provider/network failures retry without
blocking another channel. Rate-limit responses honor `Retry-After` when it is longer
than the local backoff.

A redirect, invalid webhook, or rejecting generic endpoint is permanent and pauses that
destination. To recover:

1. Use **Endpoint** to repair the URL and send **Test**.
2. Choose **Resume**.
3. Open **Deliveries** and choose **Retry** on the failed row.

Rotating a generic secret or changing an endpoint clears its tested status. Send
another test before treating it as healthy.

## Adding a native adapter

The `DestinationAdapter` contract lives in
`apps/server/src/destinations/types.ts`. A new adapter must validate configuration and
return one of `success`, `retry`, or `permanent-failure` from `send`.

Adapters must use the shared HTTP transport and URL policy, avoid automatic redirects,
bound response bytes, suppress mention injection, redact credentials, and add tests for
rendering plus the full HTTP outcome matrix. See [CONTRIBUTING.md](../CONTRIBUTING.md)
for the repository-wide checklist.
