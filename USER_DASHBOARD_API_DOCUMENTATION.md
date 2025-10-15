# User Dashboard API Documentation

## Overview
This document provides comprehensive API documentation for the User Dashboard frontend team. The dashboard provides read-only access to call performance, financial impact, and related resources for authenticated users.

## Base URL
```
http://localhost:5000/api/v1
```

## Authentication
All dashboard endpoints require authentication via HTTP-only cookies (session-based auth).

### Authentication Flow
1. **Login**: `POST /api/v1/auth/login`
2. **Signup**: `POST /api/v1/auth/signup` 
3. **Refresh**: `POST /api/v1/auth/refresh`
4. **Logout**: `POST /api/v1/auth/logout`

### Session Management
- Sessions are managed via HTTP-only secure cookies
- Session TTL: 12 hours idle, 7 days absolute
- Automatic refresh via silent endpoint
- CSRF protection via double-submit token

## Authorization
- **Required Roles**: `owner` or `admin`
- **Access Control**: Row-level filters ensure users only access tenant-scoped data
- **Rate Limiting**: 100 requests per 15 minutes (general), 60 requests per minute (admin)

---

## API Endpoints

### 1. Authentication & User Profile

#### Get Current User
**GET** `/api/v1/me/whoami`

Get current authenticated user information.

**Headers:**
```
Cookie: session=<session-token>; refresh_token=<refresh-token>
```

**Response (200):**
```json
{
  "user": {
    "id": "64f8a1b2c3d4e5f6a7b8c9d0",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "user"
  }
}
```

#### Get User Profile with Billing
**GET** `/api/v1/me`

Get user profile with billing snapshot (cached ~15 seconds per user).

**Headers:**
```
Cookie: session=<session-token>; refresh_token=<refresh-token>
```

**Response (200):**
```json
{
  "user": {
    "id": "64f8a1b2c3d4e5f6a7b8c9d0",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "user"
  },
  "billing": {
    "credit": 1000.50,
    "used_credit": 150.25,
    "auto_refill": true
  }
}
```

---

### 2. Dashboard Overview

#### Get Dashboard Overview
**GET** `/api/v1/me`

Same as user profile endpoint above - provides user info with billing data.

---

### 3. Agents Management

#### List Agents
**GET** `/api/v1/agents`

Get paginated list of agents (cached 30-60 seconds per tenant).

**Query Parameters:**
- `page` (optional): Page number (default: 1, min: 1)
- `pageSize` (optional): Items per page (default: 25, max: 100)
- `search` (optional): Search term for agent name

**Example:**
```
GET /api/v1/agents?page=1&pageSize=25&search=voice
```

**Response (200):**
```json
{
  "items": [
    {
      "id": "agent_123",
      "name": "Voice Agent Alpha",
      "voice_label": "Professional Female",
      "language": "en-US",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 25,
  "totalPages": 1
}
```

---

### 4. Call Logs Management

#### List Call Logs
**GET** `/api/v1/call-logs`

Get paginated list of call logs with optional filtering.

**Query Parameters:**
- `limit` (optional): Items per page (default: 25, max: 100)
- `from` (optional): Start date (ISO 8601 format)
- `to` (optional): End date (ISO 8601 format)
- `agent_id` (optional): Filter by agent ID
- `status` (optional): Filter by call status
- `cursor` (optional): Pagination cursor for next page

**Example:**
```
GET /api/v1/call-logs?limit=25&from=2024-01-01&to=2024-01-31&status=completed
```

**Response (200):**
```json
{
  "items": [
    {
      "session_id": "sess_123456",
      "ts": "2024-01-15T14:30:00Z",
      "agent": {
        "id": "agent_123",
        "name": "Voice Agent Alpha"
      },
      "masked_phone": "+1*** **45",
      "duration_sec": 180,
      "status": "completed",
      "cost": 0.15
    }
  ],
  "next_cursor": "eyJ0aW1lc3RhbXAiOjE3MDUzNDQwMDB9",
  "has_more": true
}
```

#### Get Call Detail
**GET** `/api/v1/call-logs/{sessionId}`

Get detailed information about a specific call.

**Path Parameters:**
- `sessionId`: The call session ID

**Response (200):**
```json
{
  "session_id": "sess_123456",
  "agent": {
    "id": "agent_123",
    "name": "Voice Agent Alpha"
  },
  "duration_sec": 180,
  "status": "completed",
  "chat": [
    {
      "timestamp": "2024-01-15T14:30:15Z",
      "speaker": "agent",
      "message": "Hello, how can I help you today?"
    }
  ],
  "cost_breakdown": [
    {
      "type": "call_duration",
      "amount": 0.10,
      "description": "3 minutes at $0.033/min"
    }
  ],
  "recording": {
    "available": true
  }
}
```

#### Stream Call Recording
**GET** `/api/v1/call-logs/{sessionId}/recording`

Stream audio recording for a specific call with HTTP Range support.

**Path Parameters:**
- `sessionId`: The call session ID

**Headers:**
```
Range: bytes=0-1023
```

**Response (206 Partial Content):**
```
Content-Type: audio/mpeg
Content-Range: bytes 0-1023/2048
Accept-Ranges: bytes
Cache-Control: private, no-store

[Audio data stream]
```

---

### 5. Campaigns Management

#### List Campaigns
**GET** `/api/v1/campaigns`

Get paginated list of campaigns.

**Query Parameters:**
- `page` (optional): Page number (default: 1, min: 1)
- `pageSize` (optional): Items per page (default: 25, max: 100)
- `search` (optional): Search term for campaign name

**Response (200):**
```json
{
  "items": [
    {
      "id": "campaign_123",
      "name": "Q1 Sales Campaign",
      "status": "active",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 25,
  "totalPages": 1
}
```

#### Get Campaign Detail
**GET** `/api/v1/campaigns/{id}`

Get detailed information about a specific campaign.

**Path Parameters:**
- `id`: The campaign ID

**Response (200):**
```json
{
  "id": "campaign_123",
  "name": "Q1 Sales Campaign",
  "status": "active",
  "created_at": "2024-01-01T00:00:00Z",
  "description": "Outbound sales campaign for Q1",
  "target_audience": "Enterprise customers",
  "call_volume": 1000
}
```

#### Get Campaign Info
**GET** `/api/v1/campaigns/{id}/info`

Get additional campaign information.

**Path Parameters:**
- `id`: The campaign ID

**Response (200):**
```json
{
  "id": "campaign_123",
  "metrics": {
    "total_calls": 1000,
    "completed_calls": 850,
    "success_rate": 0.85
  },
  "settings": {
    "max_retries": 3,
    "call_timeout": 300
  }
}
```

---

### 6. Phone Numbers Management

#### List Phone Numbers
**GET** `/api/v1/phones`

Get paginated list of phone numbers with masking applied.

**Query Parameters:**
- `page` (optional): Page number (default: 1, min: 1)
- `pageSize` (optional): Items per page (default: 25, max: 100)
- `search` (optional): Search term for phone number

**Response (200):**
```json
{
  "items": [
    {
      "id": "+1*** **45",
      "agent_id": "agent_123",
      "status": "active",
      "tags": ["sales", "primary"],
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 25,
  "totalPages": 1
}
```

#### Get Phone Detail
**GET** `/api/v1/phones/{phone}`

Get detailed information about a specific phone number.

**Path Parameters:**
- `phone`: The phone number (masked)

**Response (200):**
```json
{
  "id": "+1*** **45",
  "agent_id": "agent_123",
  "status": "active",
  "tags": ["sales", "primary"],
  "created_at": "2024-01-01T00:00:00Z",
  "meta": {
    "region": "US",
    "timezone": "America/New_York"
  }
}
```

---

### 7. Data Export

#### Export Call Logs CSV
**GET** `/api/v1/exports/calls.csv`

Export call logs as CSV file (max 10k records, 30-day range limit).

**Query Parameters:**
- `from` (optional): Start date (ISO 8601 format)
- `to` (optional): End date (ISO 8601 format)
- `agent_id` (optional): Filter by agent ID
- `status` (optional): Filter by call status
- `cursor` (optional): Pagination cursor

**Rate Limiting:** Max 5 exports per hour per user

**Response (200):**
```
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="call-logs.csv"

session_id,ts,agent_id,agent_name,masked_phone,duration_sec,status,cost
sess_123456,2024-01-15T14:30:00Z,agent_123,Voice Agent Alpha,+1*** **45,180,completed,0.15
```

---

## Data Models

### User
```json
{
  "id": "string",
  "email": "string",
  "name": "string",
  "role": "user" | "admin" | "owner"
}
```

### Agent
```json
{
  "id": "string",
  "name": "string",
  "voice_label": "string",
  "language": "string",
  "created_at": "string (ISO 8601)"
}
```

### Call Log Item
```json
{
  "session_id": "string",
  "ts": "string (ISO 8601)",
  "agent": {
    "id": "string",
    "name": "string"
  },
  "masked_phone": "string",
  "duration_sec": "number",
  "status": "completed" | "failed" | "abandoned" | "live" | "queued" | "pending",
  "cost": "number"
}
```

### Call Detail
```json
{
  "session_id": "string",
  "agent": {
    "id": "string",
    "name": "string"
  },
  "duration_sec": "number",
  "status": "string",
  "chat": [
    {
      "timestamp": "string (ISO 8601)",
      "speaker": "agent" | "customer",
      "message": "string"
    }
  ],
  "cost_breakdown": [
    {
      "type": "string",
      "amount": "number",
      "description": "string"
    }
  ],
  "recording": {
    "available": "boolean"
  }
}
```

### Campaign
```json
{
  "id": "string",
  "name": "string",
  "status": "active" | "inactive" | "completed",
  "created_at": "string (ISO 8601)"
}
```

### Phone
```json
{
  "id": "string (masked)",
  "agent_id": "string",
  "status": "active" | "inactive",
  "tags": ["string"],
  "created_at": "string (ISO 8601)",
  "meta": "object"
}
```

### Billing Snapshot
```json
{
  "credit": "number",
  "used_credit": "number",
  "auto_refill": "boolean"
}
```

---

## Error Responses

### Standard Error Format
```json
{
  "error": "string",
  "code": "string",
  "retryAfter": "number (optional)"
}
```

### Common HTTP Status Codes
- `200` - Success
- `400` - Bad Request
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (duplicate resource)
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error
- `502` - Bad Gateway (external service error)

---

## Security & Privacy

### Data Masking
- Phone numbers are masked in all responses (format: `+1*** **45`)
- PII in transcripts is redacted based on sensitivity rules
- Export files have masked PII

### Caching
- Agent data: 30-60 seconds per tenant
- User billing: ~15 seconds per user
- Call logs: 30 seconds per query

### Rate Limiting
- General endpoints: 100 requests per 15 minutes
- Admin endpoints: 60 requests per minute
- Export endpoints: 5 exports per hour per user

### CORS
- Origins limited to configured dashboard domains
- Credentials required
- Methods: GET, POST, OPTIONS

---

## Implementation Notes

### Pagination
- Use `cursor` parameter for call logs (cursor-based pagination)
- Use `page` and `pageSize` for other endpoints (offset-based pagination)
- Default page size: 25, maximum: 100

### Date/Time Handling
- All timestamps are in UTC
- Display should convert to Asia/Kolkata (IST) with offset notation
- Format: `2025-09-25 14:05 IST (+05:30)`

### File Downloads
- CSV exports are streamed for large datasets
- Audio recordings support HTTP Range requests for streaming
- Download URLs expire immediately after response

### Error Handling
- All errors follow consistent `{ error, code }` format
- Retry logic should respect `retryAfter` field
- Network errors should show user-friendly messages

---

## Frontend Integration Checklist

- [ ] Implement session-based authentication with HTTP-only cookies
- [ ] Handle automatic token refresh
- [ ] Implement proper error handling for all status codes
- [ ] Add loading states for all API calls
- [ ] Implement pagination for all list endpoints
- [ ] Add data masking for phone numbers
- [ ] Implement CSV export functionality
- [ ] Add audio streaming for call recordings
- [ ] Handle rate limiting with user feedback
- [ ] Implement proper timezone conversion (UTC to IST)
- [ ] Add proper error boundaries and fallback UI
- [ ] Implement responsive design for all screen sizes
