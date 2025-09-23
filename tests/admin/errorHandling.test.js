const request = require('supertest');
const createTestApp = require('../app');
const { createTestAdmin, generateToken, setupMocks, resetMocks, mockMillisClient } = require('../helpers/testHelpers');

describe('Admin Error Handling', () => {
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

  describe('Millis API Error Propagation', () => {
    it('should handle Millis API timeout', async () => {
      mockMillisClient.listPhones.mockRejectedValueOnce(new Error('Millis API timeout'));

      const response = await request(app)
        .get('/api/v1/admin/phones')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(502);

      expect(response.body).toHaveProperty('error', 'External service error');
      expect(response.body).toHaveProperty('code', 'EXTERNAL_SERVICE_ERROR');
    });

    it('should handle Millis API 429 rate limit', async () => {
      mockMillisClient.listPhones.mockRejectedValueOnce(new Error('Millis API rate limit exceeded'));

      const response = await request(app)
        .get('/api/v1/admin/phones')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(502);

      expect(response.body).toHaveProperty('error', 'External service error');
    });

    it('should handle Millis API 500 server error', async () => {
      mockMillisClient.listPhones.mockRejectedValueOnce(new Error('Millis API server error: 500'));

      const response = await request(app)
        .get('/api/v1/admin/phones')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(502);

      expect(response.body).toHaveProperty('error', 'External service error');
    });
  });

  describe('Validation Error Handling', () => {
    it('should return 400 for invalid phone import', async () => {
      const response = await request(app)
        .post('/api/v1/admin/phones/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ phones: 'not-an-array' })
        .expect(400);

      expect(response.body).toHaveProperty('errors');
    });

    it('should return 400 for invalid campaign approval', async () => {
      const response = await request(app)
        .post('/api/v1/admin/campaigns/test/approve')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ approve: 'not-a-boolean' })
        .expect(400);

      expect(response.body).toHaveProperty('errors');
    });
  });

  describe('Authentication Error Handling', () => {
    it('should return 401 for invalid token', async () => {
      const response = await request(app)
        .get('/api/v1/admin/phones')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Invalid token');
    });

    it('should return 401 for expired token', async () => {
      const response = await request(app)
        .get('/api/v1/admin/phones')
        .set('Authorization', 'Bearer expired-token')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });
});
