const request = require('supertest');
const { createTestApp, createTestUser, createTestAdmin, generateToken, setupMocks, resetMocks } = require('../helpers/testHelpers');

describe('Admin Authentication & Authorization', () => {
  let app, adminUser, regularUser, adminToken, userToken;

  beforeAll(() => {
    setupMocks();
    app = createTestApp();
  });

  beforeEach(async () => {
    resetMocks();
    adminUser = await createTestAdmin();
    regularUser = await createTestUser('user');
    adminToken = generateToken(adminUser);
    userToken = generateToken(regularUser);
  });

  describe('GET /api/v1/admin/phones', () => {
    it('should allow admin access', async () => {
      const response = await request(app)
        .get('/api/v1/admin/phones')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('items');
      expect(response.body).toHaveProperty('page');
      expect(response.body).toHaveProperty('pageSize');
    });

    it('should deny user access with 403', async () => {
      await request(app)
        .get('/api/v1/admin/phones')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('should deny access without token with 401', async () => {
      await request(app)
        .get('/api/v1/admin/phones')
        .expect(401);
    });
  });

  describe('POST /api/v1/admin/phones/import', () => {
    it('should allow admin access', async () => {
      const response = await request(app)
        .post('/api/v1/admin/phones/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ phones: ['+14155550100', '+14155550101'] })
        .expect(202);

      expect(response.body).toHaveProperty('message');
    });

    it('should deny user access with 403', async () => {
      await request(app)
        .post('/api/v1/admin/phones/import')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ phones: ['+14155550100'] })
        .expect(403);
    });
  });

  describe('POST /api/v1/admin/campaigns/:id/approve', () => {
    it('should allow admin access', async () => {
      const response = await request(app)
        .post('/api/v1/admin/campaigns/campaign123/approve')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ approve: true, reason: 'Test approval' })
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('record');
    });

    it('should deny user access with 403', async () => {
      await request(app)
        .post('/api/v1/admin/campaigns/campaign123/approve')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ approve: true, reason: 'Test approval' })
        .expect(403);
    });
  });
});
