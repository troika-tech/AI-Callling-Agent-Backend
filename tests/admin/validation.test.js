const request = require('supertest');
const createTestApp = require('../app');
const { createTestAdmin, generateToken, setupMocks, resetMocks } = require('../helpers/testHelpers');

describe('Admin Input Validation', () => {
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

  describe('Phone Management Validation', () => {
    it('should validate phone import payload', async () => {
      const response = await request(app)
        .post('/api/v1/admin/phones/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ phones: 'invalid' })
        .expect(400);

      expect(response.body).toHaveProperty('errors');
    });

    it('should validate set agent payload', async () => {
      const response = await request(app)
        .post('/api/v1/admin/phones/+14155550100/set_agent')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ agentId: 123 })
        .expect(400);

      expect(response.body).toHaveProperty('errors');
    });

    it('should validate update tags payload', async () => {
      const response = await request(app)
        .patch('/api/v1/admin/phones/+14155550100/tags')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ tags: 'invalid' })
        .expect(400);

      expect(response.body).toHaveProperty('errors');
    });
  });

  describe('Campaign Management Validation', () => {
    it('should validate campaign approval payload', async () => {
      const response = await request(app)
        .post('/api/v1/admin/campaigns/campaign123/approve')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ approve: 'invalid' })
        .expect(400);

      expect(response.body).toHaveProperty('errors');
    });

    it('should validate campaign ID parameter', async () => {
      const response = await request(app)
        .post('/api/v1/admin/campaigns//approve')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ approve: true })
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Not found');
    });
  });

  describe('Query Parameter Validation', () => {
    it('should validate pagination parameters', async () => {
      const response = await request(app)
        .get('/api/v1/admin/phones?page=0&pageSize=200')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body).toHaveProperty('errors');
    });

    it('should validate date parameters', async () => {
      const response = await request(app)
        .get('/api/v1/admin/call_logs?from=invalid-date')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body).toHaveProperty('errors');
    });
  });
});
