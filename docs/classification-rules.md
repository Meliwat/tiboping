# Classification rules

TiboPing classifier v1 is deterministic and intentionally small. It normalizes Unicode
text with NFKC, lowercases with the `en-US` locale, evaluates every rule, and returns all
matching categories plus the rule IDs that explain the result.

Rules add categories independently. A post can therefore be Codex, Outages, and Usage
limits at the same time. Multiple rules in one category do not duplicate that category.

## Rule table

| Rule ID                    | Category     | Match summary                                                   |
| -------------------------- | ------------ | --------------------------------------------------------------- |
| `codex.keyword`            | Codex        | Whole word `codex`                                              |
| `codex.model-release`      | Codex        | A named GPT/o-series/Sol model near shipping/release lifecycle  |
| `outages.direct`           | Outages      | Outage, incident, degraded/degradation, or unavailable          |
| `outages.recovery`         | Outages      | Recovery/recovered, resolved/resolving, or restored/restoration |
| `outages.contextual-state` | Outages      | Service context near down/fixed/back up/offline/online again    |
| `usage-limits.direct`      | Usage limits | Usage/rate/token/weekly limits, quota, allowance, or credits    |
| `usage-limits.reset`       | Usage limits | Reset/refresh/replenish near usage/limit/quota/credit context   |
| `usage-limits.big-button`  | Usage limits | Exact phrase `big button`                                       |

“Near” is a bounded character distance in normalized text. It keeps lifecycle words
from classifying an unrelated release and state words from classifying an unrelated
“fixed” comment.

## Examples

| Text                                                         | Result                         |
| ------------------------------------------------------------ | ------------------------------ |
| `Codex CLI v2 is rolling out today.`                         | Codex                          |
| `GPT-5.7 is shipping this morning.`                          | Codex                          |
| `The service has recovered and traffic looks healthy.`       | Outages                        |
| `I've reset everyone's usage limits.`                        | Usage limits                   |
| `Codex is degraded while we repair the usage limit service.` | Codex + Outages + Usage limits |
| `Beautiful weather for a long walk.`                         | Unmatched                      |

Unmatched is not a fourth category. It is delivered only to destinations using
Everything.

## False-positive guards

The fixture suite includes nearby language that must remain unmatched, including
“fixed dinner,” “down for coffee,” a clothing button, and a playlist release. Every new
rule should add both positive and plausible negative fixtures.

## Proposing a rule

Open the classifier issue template with:

- exact or anonymized post text;
- current categories;
- expected categories;
- why the change generalizes beyond one post;
- false positives the rule should avoid.

Implementation changes belong in `packages/core/src/classifier/rules.ts`; fixtures live
in `packages/core/src/classifier/fixtures.ts`. Rules may not call a network service,
model, clock, random source, or hidden mutable state. Run `npm test -- packages/core`
and update this document when public behavior changes.
