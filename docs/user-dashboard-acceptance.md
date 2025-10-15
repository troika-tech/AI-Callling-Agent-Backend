# User Dashboard API Deliverable Checklist

## Acceptance Criteria Alignment
- [ ] All documented endpoints deployed to staging with cookie-based auth enabled.
- [ ] Contracts match `docs/user-dashboard-openapi.yaml` (request/response schemas, examples).
- [ ] Rate limiting configured for login, call logs, and export flows per spec.
- [ ] Recording proxy verified to stream with Range support and without exposing Millis URLs.
- [ ] Non-GET requests to `/api/*` dashboard resources return 403 and are logged with `READ_ONLY_SCOPE`.
- [ ] Audit events emitted for login, call list/detail views, exports, and playback.

## Launch Readiness Tasks
1. Implement validation schemas mirroring OpenAPI definitions; ensure 400 responses include detailed field errors.
2. Wire cache layer (Redis) with TTLs noted in `x-behavioral-rules`.
3. Instrument correlation IDs and upstream latency metrics.
4. Configure CSV export job limits (max 10k rows, 30-day window, 5 exports/hour per user).
5. Populate masking utilities shared across list/detail/export flows.
6. Smoke-test FE flows against staging using documented examples.

## Sign-Off Owners
- Product: scope & UX alignment (KPI definitions, data freshness).
- Engineering Lead: implementation completeness, caching, streaming proxy.
- Security: cookie policy, CORS allowlist, masking verification, audit logging.
- QA: regression tests covering endpoints, negative cases, rate limits.

## Risks & Mitigations
- **Millis rate variability**: use cache + graceful fallback message for `/api/call-logs`.
- **Export backlog**: queue with concurrency cap and progress polling to avoid timeouts.
- **Recording size**: enforce max duration and chunked streaming to prevent memory pressure.

## Non-Goals Confirmation
- No write-paths to Millis resources.
- No realtime websocket updates.
- No configuration mutation UIs.
