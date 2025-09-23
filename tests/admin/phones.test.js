const request = require('supertest');
const createTestApp = require('../app');
const { createTestAdmin, generateToken, setupMocks, resetMocks, mockMillisClient } = require('../helpers/testHelpers');

describe('Admin Phone Management', () => {
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

  describe('GET /api/v1/admin/phones', () => {
    it('should list phones with pagination', async () => {
      const response = await request(app)
        .get('/api/v1/admin/phones?page=1&pageSize=25&search=%2B91')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('items');
      expect(response.body).toHaveProperty('page', 1);
      expect(response.body).toHaveProperty('pageSize', 25);
      expect(response.body).toHaveProperty('total');
      expect(mockMillisClient.listPhones).toHaveBeenCalledWith({
        page: 1,
        pageSize: 25,
        search: '+91'
      });
    });

    it('should use default pagination values', async () => {
      const response = await request(app)
        .get('/api/v1/admin/phones')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.page).toBe(1);
      expect(response.body.pageSize).toBe(50);
    });
  });

  describe('POST /api/v1/admin/phones/import', () => {
    it('should import phones successfully', async () => {
      const phones = ['+14155550100', '+14155550101'];
      const response = await request(app)
        .post('/api/v1/admin/phones/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ phones })
        .expect(202);

      expect(response.body).toHaveProperty('message', 'Import queued');
      expect(mockMillisClient.importPhones).toHaveBeenCalledWith({ phones });
    });
  });

  describe('POST /api/v1/admin/phones/:phone/set_agent', () => {
    it('should set phone agent successfully', async () => {
      const phone = '+14155550100';
      const agentId = 'agent_123';
      
      const response = await request(app)
        .post(`/api/v1/admin/phones/${phone}/set_agent`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ agentId })
        .expect(200);

      expect(response.body).toHaveProperty('phone', phone);
      expect(response.body).toHaveProperty('agentId', agentId);
      expect(mockMillisClient.setPhoneAgent).toHaveBeenCalledWith(phone, { agentId });
    });
  });

  describe('PATCH /api/v1/admin/phones/:phone/tags', () => {
    it('should update phone tags successfully', async () => {
      const phone = '+14155550100';
      const tags = ['vip', 'beta'];
      
      const response = await request(app)
        .patch(`/api/v1/admin/phones/${phone}/tags`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ tags })
        .expect(200);

      expect(response.body).toHaveProperty('phone', phone);
      expect(response.body).toHaveProperty('tags', tags);
      expect(mockMillisClient.updatePhoneTags).toHaveBeenCalledWith(phone, { tags });
    });
  });
});
