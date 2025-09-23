# API Quick Reference Card

## Base URL
```
http://localhost:4000/api/v1
```

## Authentication
```javascript
// Login
POST /auth/login
{
  "email": "user@example.com",
  "password": "password123"
}

// Use token
Authorization: Bearer <access-token>
```

## Admin Endpoints (Require Admin Role)

### Phone Management
```javascript
// List phones
GET /admin/phones?page=1&pageSize=50&search=+91

// Import phones
POST /admin/phones/import
{
  "phones": ["+14155550100", "+14155550101"]
}

// Set phone agent
POST /admin/phones/{phone}/set_agent
{
  "agentId": "agent_123"
}

// Update phone tags
PATCH /admin/phones/{phone}/tags
{
  "tags": ["vip", "beta"]
}
```

### Campaign Management
```javascript
// Approve/reject campaign
POST /admin/campaigns/{id}/approve
{
  "approve": true,
  "reason": "Meets compliance"
}
```

### Call & Session Management
```javascript
// List call logs
GET /admin/call_logs?from=2025-09-01T00:00:00Z&to=2025-09-23T23:59:59Z

// List sessions
GET /admin/sessions?agentId=agent_123&phone=+14155550100
```

## Response Format
All list endpoints return:
```json
{
  "items": [...],
  "page": 1,
  "pageSize": 50,
  "total": 100
}
```

## Error Codes
- `400` - Validation Error
- `401` - Unauthorized
- `403` - Forbidden (Wrong Role)
- `404` - Not Found
- `429` - Rate Limited
- `502` - External Service Error
- `500` - Internal Server Error

## Rate Limits
- **General**: 100 requests/15 minutes
- **Admin**: 60 requests/minute
- **Whitelisted IPs**: No limit

## Frontend Helper Functions
```javascript
// API call with auth
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

// Handle pagination
const getPaginatedData = async (endpoint, page = 1, pageSize = 50, filters = {}) => {
  const params = new URLSearchParams({ page, pageSize });
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.append(key, value);
  });
  
  const response = await apiCall(`${endpoint}?${params}`);
  return response.json();
};
```
