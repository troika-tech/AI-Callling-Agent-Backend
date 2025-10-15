# User Dashboard Error Model

## Response Shape
All non-2xx responses return the following JSON object:

```json
{
  "error": "Human readable summary",
  "code": "MILLIS_RATE_LIMIT",
  "retryAfter": 30
}
```

- `error` (string, required): Localized-ready summary for UI surfaces.
- `code` (string, optional): Stable machine code (UPPER_SNAKE_CASE) for client branching.
- `retryAfter` (integer seconds, optional): Present for throttling scenarios.

## Standard Codes
| HTTP | Code | Description | Client Guidance |
|------|------|-------------|-----------------|
| 400 | `VALIDATION_ERROR` | Query/body failed schema validation | Highlight offending field, allow correction |
| 401 | `AUTH_REQUIRED` | Session missing or expired | Trigger login modal/redirect |
| 403 | `READ_ONLY_SCOPE` | Blocked write attempt or unauthorized tenant data | Show banner "Contact admin" |
| 404 | `RESOURCE_NOT_FOUND` | Call, campaign, or phone missing | Show inline not found state |
| 409 | `CONFLICT` | Export in progress or agent mismatch | Show conflict notice, optional retry |
| 429 | `RATE_LIMITED` | Upstream or local rate limit triggered | Display retry guidance using `retryAfter` |
| 500 | `INTERNAL_ERROR` | Unexpected server error | Show generic error and encourage retry |
| 502 | `UPSTREAM_ERROR` | Millis failure surfaced | Show status banner; auto-retry with backoff |

## Retry Guidance
- Clients should perform exponential backoff for `RATE_LIMITED` and `UPSTREAM_ERROR` responses, respecting `retryAfter` when provided.
- `VALIDATION_ERROR` should never be retried without user correction.
- Streaming endpoints (recording) use normal HTTP status codes; partial responses without completion should be retried with Range header.

## Logging & Correlation
- Every error response includes `X-Request-ID` header. Frontend must surface this in support tickets.
- Audit log captures error context (userId, endpoint, code).

## Localization
- `error` messages returned in English by default. Internationalization planned; clients should avoid string comparisons beyond `code`.
