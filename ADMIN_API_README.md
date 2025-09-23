# Millis SaaS Admin API - Step 3 Hardening & Ship

## Overview
This document outlines the hardened admin API implementation with security, validation, audit logging, and testing.

## Features Implemented

### 1. Route Wiring & Authentication
- Admin routes wired in `src/index.js`
- Admin endpoints protected with `requireAuth` and `requireRole('admin')`
- JWT-based authentication with access and refresh tokens

### 2. Environment & Client Configuration
- Environment variables: `MILLIS_BASE_URL`, `MILLIS_API_KEY`, `JWT_SECRET`
- Millis client enhanced with error handling and timeouts
- Centralized configuration in `src/config.js`

### 3. Input Validation (express-validator)
- **List Phones**: `page` (>=1), `pageSize` (1-100), `search` (<=100 chars)
- **Import Phones**: `phones` (non-empty array), each phone (1-20 chars)
- **Set Agent**: `phone` (1-20 chars), `agentId` (1-50 chars)
- **Update Tags**: `phone` (1-20 chars), `tags` (array), each tag (1-30 chars)
- **Approve Campaign**: `id` (1-50 chars), `approve` (boolean), `reason` (<=500 chars)
- **Call Logs**: pagination, `from`/`to` ISO dates, `status` (<=20 chars)
- **Sessions**: pagination, `phone` (<=20 chars), `agentId` (<=50 chars)

### 4. Consistent Response Shapes
All list endpoints return:
```json
{
  "items": [...],
  "page": 1,
  "pageSize": 50,
  "total": 100
}
```

### 5. Audit Trail
- `AdminAudit` model records admin actions with context
- Logged actions: `set_agent`, `update_tags`, `approve_campaign`, `reject_campaign`
- Stored data: actor, action, target, diff, reason, Millis response, IP, user agent
- Indexes optimized for lookups by actor, action, target, and time

### 6. Rate Limiting & Security Hardening
- Admin routes: 60 requests per minute per IP
- General routes: 100 requests per 15 minutes per IP
- IP whitelisting configurable through `RATE_LIMIT_WHITELIST`
- Helmet, CORS, payload limits, proxy support

### 7. Error Handling
- Validation: 400 with details
- Authentication: 401 for invalid or expired tokens
- Authorization: 403 for insufficient permissions
- Millis API failures: 502 for upstream errors
- Rate limiting: 429 with descriptive payload

### 8. Testing (Jest + Supertest)
- Authentication and authorization scenarios
- Input validation coverage
- Happy-path flows with mocked Millis client
- Error propagation for upstream failures

## API Endpoints
```
GET    /api/v1/admin/phones                    # List phones with pagination/search
POST   /api/v1/admin/phones/import             # Import phone numbers
POST   /api/v1/admin/phones/:phone/set_agent   # Assign agent to phone
PATCH  /api/v1/admin/phones/:phone/tags        # Update phone tags
POST   /api/v1/admin/campaigns/:id/approve     # Approve/reject campaign
GET    /api/v1/admin/call_logs                 # List call logs with filtering
GET    /api/v1/admin/sessions                  # List sessions with filtering
```

## Environment Variables
```
# Server
NODE_ENV=development
PORT=4000
MONGO_URL=mongodb://localhost:27017/millis_saas
CORS_ORIGINS=*

# JWT
JWT_SECRET=your-super-secret-jwt-key-here
ACCESS_TOKEN_TTL=30m
REFRESH_TOKEN_TTL=7d

# Millis API
MILLIS_BASE_URL=https://api-eu-west.millis.ai
MILLIS_API_KEY=your-millis-api-key-here

# Rate limiting
RATE_LIMIT_WHITELIST=103.232.246.21,192.168.1.1,10.0.0.1
```

## Testing
- Tests expect a MongoDB instance reachable at `MONGO_URL`; start `mongod` locally or point to a test cluster.
- In CI, ensure MongoDB is available before running `npm test` (example: GitHub Actions service).
- Jest setup lives in `tests/setup.js`, which seeds environment variables and clears collections between cases.

### GitHub Actions Example
```
services:
  mongo:
    image: mongo:7
    ports: ["27017:27017"]
    options: >-
      --health-cmd "mongosh --eval 'db.adminCommand(\"ping\")'"
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5
```

## Security Features
1. JWT authentication with short-lived access tokens
2. Role-based authorization for admin surfaces
3. Rate limiting with IP whitelisting
4. Input validation across parameters and bodies
5. Security headers via Helmet and strict payload limits
6. Audit logging for all admin-sensitive operations
7. Centralized error handling without leaking internals

## Database Models
```
AdminAudit
  actor: ObjectId
  action: String
  target: String
  targetType: String
  diff: Mixed
  reason: String
  millisResponse: Mixed
  ipAddress: String
  userAgent: String
  createdAt / updatedAt: Date
```

## Postman Collection
Postman collection (`postman/Millis SaaS Admin APIs.postman_collection.json`) includes all endpoints, authentication flows, and shared environment variables.

## Production Readiness
- Comprehensive validation and security posture
- Audit trail for compliance
- Robust error handling
- Test coverage and documentation
- Rate limiting, logging, and configuration hygiene

## Next Steps
1. Deploy to production
2. Add monitoring and alerting
3. Configure backups
4. Publish OpenAPI/Swagger docs
5. Integrate performance and log aggregation tooling
