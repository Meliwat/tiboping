# Signed generic webhook v1

A generic destination sends an HTTP `POST` with a versioned JSON body and an
HMAC-SHA256 signature. The signing secret is 32 random bytes displayed once as base64
when the destination is created or rotated.

## Request

```http
POST /your-endpoint HTTP/1.1
Content-Type: application/json
X-TiboPing-Event: x:1990000000000000001
X-TiboPing-Timestamp: 1785585602
X-TiboPing-Signature: v1=<64 lowercase hex characters>
```

`X-TiboPing-Timestamp` is Unix time in seconds. `X-TiboPing-Event` equals the JSON
`event_id` and is stable for a given X post.

```json
{
  "schema_version": "1",
  "event_id": "x:1990000000000000001",
  "event_type": "tibo.post",
  "post": {
    "id": "1990000000000000001",
    "author_name": "Tibo",
    "author_username": "thsottiaux",
    "text": "Codex CLI v2 is rolling out today.",
    "url": "https://x.com/thsottiaux/status/1990000000000000001",
    "created_at": "2026-08-01T12:00:01.000Z",
    "kind": "post"
  },
  "categories": ["codex"],
  "observed_at": "2026-08-01T12:00:02.000Z"
}
```

`kind` is `post`, `reply`, or `quote`. `categories` contains zero or more of `codex`,
`outages`, and `usage-limits`. An Everything destination can therefore receive an empty
category array.

## Signature algorithm

1. Decode the displayed secret from base64 to exactly 32 bytes.
2. Preserve the request body’s raw bytes; do not parse and reserialize JSON first.
3. Compute `HMAC-SHA256(secret, timestamp + "." + raw_body)`.
4. Hex-encode the digest and prefix it with `v1=`.
5. Compare the complete value in constant time.

### Public test vector

```text
secret_base64 = CwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCws=
timestamp     = 1785585602
raw_body      = {"event_id":"x:123"}
signature     = v1=64f92f2c0f28768e248496a6d1a7034ae88263963d47b0138683d1faadc9c22f
```

### Node.js verification example

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyTiboPing({ rawBody, headers, secretBase64 }) {
  const timestamp = headers['x-tiboping-timestamp'];
  const received = headers['x-tiboping-signature'];
  const eventHeader = headers['x-tiboping-event'];

  if (typeof timestamp !== 'string' || typeof received !== 'string') return false;
  const sentAt = Number(timestamp) * 1000;
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() - sentAt) > 5 * 60_000) {
    return false;
  }

  const secret = Buffer.from(secretBase64, 'base64');
  if (secret.length !== 32) return false;
  const expected = `v1=${createHmac('sha256', secret)
    .update(timestamp, 'utf8')
    .update('.', 'utf8')
    .update(rawBody)
    .digest('hex')}`;

  const left = Buffer.from(received, 'utf8');
  const right = Buffer.from(expected, 'utf8');
  if (left.length !== right.length || !timingSafeEqual(left, right)) return false;

  const event = JSON.parse(rawBody.toString('utf8'));
  return event.schema_version === '1' && event.event_id === eventHeader;
}
```

Framework body parsers commonly discard the original bytes. Configure the webhook
route to expose a `Buffer`/raw body before using this example.

## Replay and duplicate protection

A valid HMAC proves authenticity, not freshness or uniqueness. A receiver should:

- reject timestamps outside a short window such as five minutes;
- store `event_id` in a durable unique set before causing a side effect;
- return the same successful response for an already processed event;
- compare the event header to the body;
- process only supported `schema_version` and `event_type` values.

TiboPing retries a temporary failure with the same `event_id`, body, and post data but a
new request timestamp/signature.

## Response handling

| Receiver response      | TiboPing behavior                                      |
| ---------------------- | ------------------------------------------------------ |
| `2xx`                  | Mark delivered                                         |
| `408`, `429`, or `5xx` | Retry with bounded backoff; honor longer `Retry-After` |
| `3xx`                  | Reject redirect and fail permanently                   |
| Other `4xx`            | Fail permanently and pause the destination             |
| Network/timeout        | Retry                                                  |

Keep responses below 64 KiB and complete within 10 seconds. TiboPing does not follow
redirects, so return a final status from the configured URL.

## Secret rotation

Choose **Secret** on the destination card. TiboPing immediately replaces the stored
secret and shows the new base64 value once. Update the receiver before relying on the
next event, then send a test notification. A receiver may temporarily accept both old
and new secrets during the cutover; TiboPing does not expose the old value again.
