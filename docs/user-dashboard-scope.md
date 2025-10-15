# User Dashboard Scope v1

## Overview
A read-only dashboard for authenticated end users to review call performance, financial impact, and related resources without modifying any upstream configuration.

## KPIs & Metrics Surface
- Total calls (custom range, default last 30 days)
- Average call duration (mm:ss)
- Completion rate (% of calls reaching configured success marker)
- Monthly cost (USD) with trend vs previous month

## Read-Only Feature Inventory
- KPI header cards (calls, avg duration, completion rate, monthly cost)
- Lists with pagination (default pageSize 25, max 100) for:
  * Calls (sortable by time, duration, completion)
  * Agents (name, role, assignment status)
  * Campaigns (name, channel, status)
  * Phones (number, tags, assigned agent)
- Record drill-in:
  * Call details: timeline, masked transcript, disposition labels, cost line items
  * Playback: streaming audio via backend proxy with HTTP Range
- Billing snapshot: credits balance, credits used month-to-date, auto-refill settings (read-only)
- Data export: CSV of calls (max 10k records per export, masked PII)

## Role Matrix
| Role | Access | Notes |
|------|--------|-------|
| Account Owner | Full read-only dashboard access | Can request CSV exports |
| Admin (existing) | Mirror owner view | No configuration write from dashboard UI |
| Agent | Limited view: own calls only, no billing | Optional future phase (out-of-scope v1) |
| Support (Millis) | Access via existing admin APIs | Managed under separate tooling |

## Data & Time Policies
- Query & persist timestamps in UTC
- Display timestamps converted to Asia/Kolkata (IST) with offset notation (e.g., `2025-09-25 14:05 IST (+05:30)`)
- Cost and duration values are read-only calculations derived from existing Millis data

## Export & Reporting Constraints
- CSV export limited to 30-day range, hard stop at 10k rows
- Server enforces cursor-based pagination for exports to avoid skipping when new data arrives
- Transcript snippets flagged as sensitive are redacted (see UX rules doc)

## Non-Goals
- No knowledge base management
- No agent, campaign, or phone mutations
- No outbound call initiation or live call control
- No billing changes (plan, payment methods, auto-refill toggles)
- No custom report builder or dashboard widgets
- No real-time streaming dashboards beyond existing Millis polling cadence

## Acceptance & Sign-Off Checklist
- Product verifies KPI definitions and data freshness expectations
- Engineering confirms read-only data paths and proxy behavior
- Security reviews masking, export limits, and logging
- Legal/compliance certifies PII handling approach
