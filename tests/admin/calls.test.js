const request = require('supertest');
const createTestApp = require('../app');
const { createTestAdmin, generateToken, setupMocks, resetMocks, mockMillisClient } = require('../helpers/testHelpers');

describe('Admin Call & Session Management', () => {
  let app, adminUser, adminToken;

  beforeAll(() => {
    setupMocks();
    app = createTestApp();
  });

  beforeEach(async () => {
    resetMocks();
    adminUser = await createTestAdmin();
    adminToken = generateToken(adminUser);
  });

  describe('GET /api/v1/admin/call_logs', () => {
    it('should list call logs with date filtering', async () => {
      const response = await request(app)
        .get('/api/v1/admin/call_logs?from=2025-09-01T00:00:00Z&to=2025-09-23T23:59:59Z&page=1&pageSize=50')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('items');
      expect(response.body).toHaveProperty('page', 1);
      expect(response.body).toHaveProperty('pageSize', 50);
      expect(response.body).toHaveProperty('total');
      expect(mockMillisClient.listCallLogs).toHaveBeenCalledWith({
        page: 1,
        pageSize: 50,
        from: '2025-09-01T00:00:00Z',
        to: '2025-09-23T23:59:59Z',
        status: undefined
      });
    });

    it('should list call logs with status filter', async () => {
      const response = await request(app)
        .get('/api/v1/admin/call_logs?status=completed')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(mockMillisClient.listCallLogs).toHaveBeenCalledWith({
        page: 1,
        pageSize: 50,
        from: undefined,
        to: undefined,
        status: 'completed'
      });
    });
  });

  describe('GET /api/v1/admin/sessions', () => {
    it('should list sessions with agent filtering', async () => {
      const response = await request(app)
        .get('/api/v1/admin/sessions?agentId=agent_123&page=1&pageSize=20')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('items');
      expect(response.body).toHaveProperty('page', 1);
      expect(response.body).toHaveProperty('pageSize', 20);
      expect(response.body).toHaveProperty('total');
      expect(mockMillisClient.listSessions).toHaveBeenCalledWith({
        page: 1,
        pageSize: 20,
        phone: undefined,
        agentId: 'agent_123'
      });
    });

    it('should list sessions with phone filtering', async () => {
      const response = await request(app)
        .get('/api/v1/admin/sessions?phone=%2B14155550100')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(mockMillisClient.listSessions).toHaveBeenCalledWith({
        page: 1,
        pageSize: 50,
        phone: '+14155550100',
        agentId: undefined
      });
    });
  });
});
