# User Dashboard UX & Data Handling Rules

## Timezone & Date Handling
- All persisted timestamps remain in UTC in storage and network payloads.
- Dashboard converts and displays to Asia/Kolkata (IST, UTC+05:30).
- UI labels show local time plus offset indicator (e.g., `09:30 IST (+05:30)`).
- Filters accept date ranges in local time; backend normalizes to UTC boundaries.

## Pagination & Data Limits
- Default page size: 25 items. User-selectable options: 25, 50, 100.
- Maximum server-side page size: 100.
- Cursor-based pagination for lists to avoid duplicates/skips when data updates.
- Historical queries (KPIs/charts) capped at 12 months; lists capped to 30k records via pagination.
- CSV export uses dedicated cursor with 1-hour validity; max 10k rows per export job; max 30-day window per request.

## PII Masking Policy
- Phone numbers rendered as `+<country>••• ••<last two>` (example: `+1••• ••42`).
- Email addresses masked to first/last character with domain retained (e.g., `j•••e@example.com`).
- Transcript masking:
  * Sensitive phrases flagged by Millis metadata are replaced with `[redacted]` in UI and exports.
  * Manual override list (PCI, SSN patterns) applied server-side before serialization.
- CSV exports inherit same masking rules; no raw identifiers beyond internal IDs.

## Call Detail & Recording Access
- Call transcript presented with speaker labels, masked per policy, 200-line maximum per view with "Load more".
- Recording playback served via backend proxy endpoint that supports HTTP Range requests for scrubbing.
- No direct Millis storage URLs exposed to the client; signed URLs remain server-only.
- Playback requires active session; URLs expire immediately after request.

## Billing Snapshot Rules
- Credits balance and usage sourced from existing billing service.
- Auto-refill settings displayed read-only with status badges (Enabled/Disabled/Manual).
- Cost breakdown shows total, telephony, agent minutes, taxes where available.

## Error Handling & Retry Guidance
- All user-facing errors follow `{ error: string, code?: string, retryAfter?: number }` JSON shape.
- Upstream 429/5xx map to actionable messages with retry suggestions (e.g., "Retry in a few minutes").
- Export jobs expose status polling; failures include `supportTicketHint` when human review needed.

## Accessibility & Responsiveness
- Lists and KPI cards support keyboard navigation and screen readers.
- Charts require textual summary for assistive tech (e.g., "Completion rate 92%, up 4% vs prior period").
- Mobile layout stacks KPI cards, collapses secondary lists behind tabs.

## Audit & Observability
- All data views log audit events (userId, action, filters, timestamp) with masked payloads.
- Export job creation and download both logged.

## Open Questions (Track for Sign-Off)
- Confirm whether agent-level view is included v1 or deferred.
- Determine retention period for export files (default proposal: 24 hours).
