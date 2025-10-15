# User Dashboard Auth & Security Policy

## Authentication Model
- Session-based auth using HTTP-only secure cookies.
- Cookie attributes: `Secure`, `HttpOnly`, `SameSite=None`, `Path=/`, TTL 12 hours idle, 7 days absolute.
- Session refresh via silent endpoint; refresh cookie rotated on each use.
- Login sources supported in v1: email + password handled by existing auth service. SSO (OIDC/SAML) slated for roadmap.
- MFA enforcement piggybacks on account-level policy (out-of-scope for dashboard but respected).

## Authorization & Access Control
- Dashboard routes require `role in {owner, admin}`; other roles receive 403.
- Row-level filters ensure users only access tenant-scoped calls/phones/campaigns.
- Export endpoints validate permissions plus rate limit (max 5 exports per hour per user).

## Cookie & Session Security
- CSRF protection via double-submit token stored in secure cookie + header.
- Session binding includes user agent hash and IP range tolerance to mitigate hijacking.
- Forced logout on password reset or detected credential compromise.

## API Gateway & CORS
- CORS origins limited to configured dashboard domains (no wildcard).
- Allowed methods: `GET`, `POST` for exports, `OPTIONS`.
- Credentials required; preflight caches 5 minutes.

## Backend Proxies & Recording Access
- Audio recordings fetched from Millis via server-side signed requests; response streamed to client with Range support.
- Proxy strips upstream headers revealing storage endpoints; adds download token scoped to request.
- Download URLs expire immediately after response; no caching by CDN.

## Logging & Audit
- Authentication attempts logged with outcome, reason codes; PII masked per policy.
- Dashboard interactions (view list, export request, playback) create audit records stored 180 days.
- Logs exclude raw transcripts; only hashed identifiers.

## Error Handling & Incident Response
- API errors conform to `{ error, code, retryAfter? }` contract for consistency with UX rules doc.
- Upstream Millis outages trigger severity notifications and feature flag fallback (disable new exports, show status banner).
- Monitoring via existing Prometheus/Grafana stack; alerts for auth errors >2% and export job failures.

## Data Protection & Retention
- CSV exports stored encrypted at rest; auto-delete after 24 hours.
- Cache layers avoid storing transcripts/recordings; rely on streaming only.
- Backups follow existing database policy (daily snapshots, 30-day retention).

## Non-Goals / Explicit Exclusions
- No write APIs exposed to dashboard frontend.
- No direct credential storage (rely on shared auth service).
- No anonymous access or public sharing links.
