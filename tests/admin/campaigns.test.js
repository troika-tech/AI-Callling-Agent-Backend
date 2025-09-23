const request = require('supertest');
const createTestApp = require('../app');
const { createTestAdmin, generateToken, setupMocks, resetMocks, mockMillisClient } = require('../helpers/testHelpers');

describe('Admin Campaign Management', () => {
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

  describe('POST /api/v1/admin/campaigns/:id/approve', () => {
    it('should approve campaign successfully', async () => {
      const campaignId = 'campaign_123';
      const payload = { approve: true, reason: 'Meets compliance.' };
      
      const response = await request(app)
        .post(`/api/v1/admin/campaigns/${campaignId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'approved');
      expect(response.body).toHaveProperty('record');
      expect(mockMillisClient.approveCampaign).toHaveBeenCalledWith(campaignId, {
        status: 'approved',
        reason: 'Meets compliance.'
      });
    });

    it('should reject campaign successfully', async () => {
      const campaignId = 'campaign_456';
      const payload = { approve: false, reason: 'Missing DNC proof.' };
      
      const response = await request(app)
        .post(`/api/v1/admin/campaigns/${campaignId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'rejected');
      expect(response.body).toHaveProperty('record');
      expect(mockMillisClient.approveCampaign).toHaveBeenCalledWith(campaignId, {
        status: 'rejected',
        reason: 'Missing DNC proof.'
      });
    });

    it('should handle campaign approval without reason', async () => {
      const campaignId = 'campaign_789';
      const payload = { approve: true };
      
      const response = await request(app)
        .post(`/api/v1/admin/campaigns/${campaignId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'approved');
      expect(mockMillisClient.approveCampaign).toHaveBeenCalledWith(campaignId, {
        status: 'approved',
        reason: undefined
      });
    });
  });
});
