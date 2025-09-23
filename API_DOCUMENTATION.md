# Millis SaaS API Documentation

## Base URL
```
http://localhost:4000/api/v1
```

## Authentication
All protected endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Rate Limiting
- **General endpoints**: 100 requests per 15 minutes per IP
- **Admin endpoints**: 60 requests per minute per IP
- **Whitelisted IPs**: Bypass rate limiting (configurable via `RATE_LIMIT_WHITELIST`)

---

## Public Endpoints

### Health Check
**GET** `/health`

Check if the API is running.

**Response:**
```json
{
  "status": "ok"
}
```

---

## Authentication Endpoints

### User Registration
**POST** `/auth/signup`

Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe"
}
```

**Response (201):**
```json
{
  "user": {
    "id": "64f8a1b2c3d4e5f6a7b8c9d0",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "user"
  },
  "tokens": {
    "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### User Login
**POST** `/auth/login`

Authenticate user and get access tokens.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
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
  "tokens": {
    "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### Refresh Token
**POST** `/auth/refresh`

Get a new access token using refresh token.

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (200):**
```json
{
  "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

## User Endpoints

### Get Current User
**GET** `/me/whoami`

Get current authenticated user information.

**Headers:**
```
Authorization: Bearer <access-token>
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

### User Dashboard (Placeholder)
**GET** `/user/placeholder`

Placeholder endpoint for user-specific functionality.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response (200):**
```json
{
  "message": "User dashboard APIs will live here."
}
```

---

## Admin Endpoints

> **Note:** All admin endpoints require `role: "admin"` in the JWT token.

### Admin Dashboard (Placeholder)
**GET** `/admin/placeholder`

Placeholder endpoint for admin dashboard.

**Headers:**
```
Authorization: Bearer <admin-access-token>
```

**Response (200):**
```json
{
  "message": "Admin dashboard APIs will live here."
}
```

---

## Phone Management

### List Phones
**GET** `/admin/phones`

Get paginated list of phone numbers with optional search.

**Headers:**
```
Authorization: Bearer <admin-access-token>
```

**Query Parameters:**
- `page` (optional): Page number (default: 1, min: 1)
- `pageSize` (optional): Items per page (default: 50, min: 1, max: 100)
- `search` (optional): Search term (max: 100 characters)

**Example:**
```
GET /admin/phones?page=1&pageSize=25&search=+91
```

**Response (200):**
```json
{
  "items": [
    {
      "id": "phone1",
      "number": "+14155550100",
      "tags": ["vip", "premium"],
      "agentId": "agent_123",
      "meta": {
        "createdAt": "2025-01-01T00:00:00Z",
        "updatedAt": "2025-01-01T00:00:00Z"
      }
    },
    {
      "id": "phone2",
      "number": "+14155550101",
      "tags": [],
      "agentId": null,
      "meta": {
        "createdAt": "2025-01-01T00:00:00Z",
        "updatedAt": "2025-01-01T00:00:00Z"
      }
    }
  ],
  "page": 1,
  "pageSize": 25,
  "total": 2
}
```

### Import Phones
**POST** `/admin/phones/import`

Import phone numbers in bulk.

**Headers:**
```
Authorization: Bearer <admin-access-token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "phones": [
    "+14155550100",
    "+14155550101",
    "+14155550102"
  ]
}
```

**Response (202):**
```json
{
  "message": "Import queued",
  "result": {
    "jobId": "import_job_123",
    "status": "pending"
  }
}
```

### Set Phone Agent
**POST** `/admin/phones/{phone}/set_agent`

Assign an agent to a specific phone number.

**Headers:**
```
Authorization: Bearer <admin-access-token>
Content-Type: application/json
```

**Path Parameters:**
- `phone`: Phone number (1-20 characters)

**Request Body:**
```json
{
  "agentId": "agent_123"
}
```

**Response (200):**
```json
{
  "phone": "+14155550100",
  "agentId": "agent_123",
  "out": {
    "success": true,
    "agentId": "agent_123"
  }
}
```

### Update Phone Tags
**PATCH** `/admin/phones/{phone}/tags`

Update tags for a specific phone number.

**Headers:**
```
Authorization: Bearer <admin-access-token>
Content-Type: application/json
```

**Path Parameters:**
- `phone`: Phone number (1-20 characters)

**Request Body:**
```json
{
  "tags": ["vip", "beta", "premium"]
}
```

**Response (200):**
```json
{
  "phone": "+14155550100",
  "tags": ["vip", "beta", "premium"],
  "out": {
    "success": true,
    "tags": ["vip", "beta", "premium"]
  }
}
```

---

## Campaign Management

### Approve/Reject Campaign
**POST** `/admin/campaigns/{id}/approve`

Approve or reject a campaign.

**Headers:**
```
Authorization: Bearer <admin-access-token>
Content-Type: application/json
```

**Path Parameters:**
- `id`: Campaign ID (1-50 characters)

**Request Body:**
```json
{
  "approve": true,
  "reason": "Meets compliance requirements"
}
```

**Response (200):**
```json
{
  "status": "approved",
  "record": {
    "campaignId": "campaign_123",
    "approvedBy": "64f8a1b2c3d4e5f6a7b8c9d0",
    "status": "approved",
    "reason": "Meets compliance requirements",
    "millisResponse": {
      "success": true,
      "status": "approved"
    },
    "createdAt": "2025-01-01T00:00:00Z",
    "updatedAt": "2025-01-01T00:00:00Z"
  }
}
```

---

## Call & Session Management

### List Call Logs
**GET** `/admin/call_logs`

Get paginated list of call logs with optional filtering.

**Headers:**
```
Authorization: Bearer <admin-access-token>
```

**Query Parameters:**
- `page` (optional): Page number (default: 1, min: 1)
- `pageSize` (optional): Items per page (default: 50, min: 1, max: 100)
- `from` (optional): Start date (ISO 8601 format)
- `to` (optional): End date (ISO 8601 format)
- `status` (optional): Call status (max: 20 characters)

**Example:**
```
GET /admin/call_logs?from=2025-09-01T00:00:00Z&to=2025-09-23T23:59:59Z&page=1&pageSize=50
```

**Response (200):**
```json
{
  "items": [
    {
      "id": "call1",
      "from": "+14155550100",
      "to": "+14155550101",
      "startedAt": "2025-09-01T10:00:00Z",
      "endedAt": "2025-09-01T10:05:30Z",
      "durationSec": 330,
      "status": "completed",
      "meta": {
        "agentId": "agent_123",
        "campaignId": "campaign_456"
      }
    }
  ],
  "page": 1,
  "pageSize": 50,
  "total": 1
}
```

### List Sessions
**GET** `/admin/sessions`

Get paginated list of sessions with optional filtering.

**Headers:**
```
Authorization: Bearer <admin-access-token>
```

**Query Parameters:**
- `page` (optional): Page number (default: 1, min: 1)
- `pageSize` (optional): Items per page (default: 50, min: 1, max: 100)
- `phone` (optional): Phone number filter (max: 20 characters)
- `agentId` (optional): Agent ID filter (max: 50 characters)

**Example:**
```
GET /admin/sessions?agentId=agent_123&page=1&pageSize=20
```

**Response (200):**
```json
{
  "items": [
    {
      "id": "session1",
      "userPhone": "+14155550100",
      "agentId": "agent_123",
      "startedAt": "2025-09-01T10:00:00Z",
      "endedAt": "2025-09-01T10:30:00Z",
      "meta": {
        "campaignId": "campaign_456",
        "duration": 1800
      }
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1
}
```

---

## Error Responses

### Validation Error (400)
```json
{
  "errors": [
    {
      "msg": "Page must be a positive integer",
      "param": "page",
      "location": "query"
    }
  ]
}
```

### Unauthorized (401)
```json
{
  "error": "Invalid token"
}
```

### Forbidden (403)
```json
{
  "error": "Forbidden"
}
```

### Not Found (404)
```json
{
  "error": "Not found"
}
```

### Rate Limited (429)
```json
{
  "error": "Too many requests, please try again later."
}
```

### External Service Error (502)
```json
{
  "error": "External service error",
  "code": "EXTERNAL_SERVICE_ERROR"
}
```

### Internal Server Error (500)
```json
{
  "error": "Internal Server Error",
  "code": "INTERNAL_ERROR"
}
```

---

## Data Models

### User
```json
{
  "id": "string (ObjectId)",
  "email": "string (unique, lowercase)",
  "name": "string",
  "role": "string (enum: 'user', 'admin')",
  "createdAt": "string (ISO 8601)",
  "updatedAt": "string (ISO 8601)"
}
```

### Phone
```json
{
  "id": "string (Millis ID)",
  "number": "string",
  "tags": "string[]",
  "agentId": "string | null",
  "meta": "object",
  "createdAt": "string (ISO 8601)",
  "updatedAt": "string (ISO 8601)"
}
```

### Call Log
```json
{
  "id": "string (call ID)",
  "from": "string",
  "to": "string",
  "startedAt": "string (ISO 8601)",
  "endedAt": "string (ISO 8601)",
  "durationSec": "number",
  "status": "string",
  "meta": "object",
  "createdAt": "string (ISO 8601)",
  "updatedAt": "string (ISO 8601)"
}
```

### Session
```json
{
  "id": "string (session ID)",
  "userPhone": "string",
  "agentId": "string",
  "startedAt": "string (ISO 8601)",
  "endedAt": "string (ISO 8601)",
  "meta": "object",
  "createdAt": "string (ISO 8601)",
  "updatedAt": "string (ISO 8601)"
}
```

### Campaign Approval
```json
{
  "campaignId": "string",
  "approvedBy": "string (ObjectId)",
  "status": "string (enum: 'approved', 'rejected')",
  "reason": "string",
  "millisResponse": "object",
  "createdAt": "string (ISO 8601)",
  "updatedAt": "string (ISO 8601)"
}
```

---

## Frontend Integration Examples

### Authentication Flow
```javascript
// 1. Login
const loginResponse = await fetch('/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password123'
  })
});

const { user, tokens } = await loginResponse.json();

// 2. Store tokens
localStorage.setItem('accessToken', tokens.access);
localStorage.setItem('refreshToken', tokens.refresh);

// 3. Use token for API calls
const apiCall = async (endpoint, options = {}) => {
  const token = localStorage.getItem('accessToken');
  
  return fetch(`/api/v1${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
};

// 4. Handle token refresh
const refreshToken = async () => {
  const refreshToken = localStorage.getItem('refreshToken');
  
  const response = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });
  
  const { access } = await response.json();
  localStorage.setItem('accessToken', access);
};
```

### Phone Management
```javascript
// List phones with pagination
const getPhones = async (page = 1, pageSize = 50, search = '') => {
  const params = new URLSearchParams({ page, pageSize });
  if (search) params.append('search', search);
  
  const response = await apiCall(`/admin/phones?${params}`);
  return response.json();
};

// Import phones
const importPhones = async (phones) => {
  const response = await apiCall('/admin/phones/import', {
    method: 'POST',
    body: JSON.stringify({ phones })
  });
  return response.json();
};

// Set phone agent
const setPhoneAgent = async (phone, agentId) => {
  const response = await apiCall(`/admin/phones/${phone}/set_agent`, {
    method: 'POST',
    body: JSON.stringify({ agentId })
  });
  return response.json();
};

// Update phone tags
const updatePhoneTags = async (phone, tags) => {
  const response = await apiCall(`/admin/phones/${phone}/tags`, {
    method: 'PATCH',
    body: JSON.stringify({ tags })
  });
  return response.json();
};
```

### Campaign Management
```javascript
// Approve/reject campaign
const approveCampaign = async (campaignId, approve, reason = '') => {
  const response = await apiCall(`/admin/campaigns/${campaignId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ approve, reason })
  });
  return response.json();
};
```

### Call & Session Management
```javascript
// Get call logs with date filtering
const getCallLogs = async (filters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.append(key, value);
  });
  
  const response = await apiCall(`/admin/call_logs?${params}`);
  return response.json();
};

// Get sessions with filtering
const getSessions = async (filters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.append(key, value);
  });
  
  const response = await apiCall(`/admin/sessions?${params}`);
  return response.json();
};
```

---

## Environment Variables

The API uses the following environment variables:

```bash
# Server Configuration
NODE_ENV=development
PORT=4000
MONGO_URL=mongodb://localhost:27017/millis_saas
CORS_ORIGINS=*

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-here
ACCESS_TOKEN_TTL=30m
REFRESH_TOKEN_TTL=7d

# Millis AI API Configuration
MILLIS_BASE_URL=https://api-eu-west.millis.ai
MILLIS_API_KEY=your-millis-api-key-here

# Rate Limiting Configuration
RATE_LIMIT_WHITELIST=103.232.246.21,192.168.1.1,10.0.0.1
```

---

## Postman Collection

A complete Postman collection is available at:
- **Collection**: `postman/Millis SaaS — Admin APIs.postman_collection.json`
- **Environment**: `postman/Millis SaaS — Local.postman_environment.json`

The collection includes:
- All API endpoints with proper authentication
- Test scripts for validation
- Environment variables for easy testing
- Examples for all request/response formats

---

## Support

For technical support or questions about the API, please contact the backend development team.
