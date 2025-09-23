const request = require('supertest');

const AgentAssignment = require('../../src/models/AgentAssignment');
const { createTestApp, createTestAdmin, createTestUser, generateToken, setupMocks, resetMocks } = require('../helpers/testHelpers');

describe('Admin Agents', () => {
  let app;
  let adminUser;
  let adminToken;

  beforeAll(() => {
    setupMocks();
    app = createTestApp();
  });

  beforeEach(async () => {
    resetMocks();
    adminUser = await createTestAdmin();
    adminToken = generateToken(adminUser);
  });

  describe('GET /api/v1/admin/agents', () => {
    it('lists agents with assignment info', async () => {
      const targetUser = await createTestUser();
      await AgentAssignment.create({ agentId: 'agent_123', user: targetUser._id });

      const response = await request(app)
        .get('/api/v1/admin/agents?page=1&pageSize=20')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('items');
      expect(Array.isArray(response.body.items)).toBe(true);

      const assignedAgent = response.body.items.find(agent => agent.id === 'agent_123');
      const unassignedAgent = response.body.items.find(agent => agent.id === 'agent_456');

      expect(assignedAgent).toBeDefined();
      expect(assignedAgent).toHaveProperty('assignedUserId', targetUser._id.toString());

      expect(unassignedAgent).toBeDefined();
      expect(unassignedAgent).toHaveProperty('assignedUserId', null);
    });
  });

  describe('POST /api/v1/admin/users/:id/agents', () => {
    it('assigns an agent to a user', async () => {
      const targetUser = await createTestUser();

      const response = await request(app)
        .post(`/api/v1/admin/users/${targetUser._id}/agents`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ agentId: 'agent_123' })
        .expect(201);

      expect(response.body).toHaveProperty('assignment');
      expect(response.body.assignment).toMatchObject({
        agentId: 'agent_123',
        userId: targetUser._id.toString()
      });

      const stored = await AgentAssignment.findOne({ agentId: 'agent_123' });
      expect(stored).not.toBeNull();
      expect(stored.user.toString()).toBe(targetUser._id.toString());
    });

    it('rejects assigning the same agent to different users', async () => {
      const firstUser = await createTestUser();
      const secondUser = await createTestUser();
      await AgentAssignment.create({ agentId: 'agent_123', user: firstUser._id });

      await request(app)
        .post(`/api/v1/admin/users/${secondUser._id}/agents`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ agentId: 'agent_123' })
        .expect(409);
    });

    it('is idempotent when assigning the same agent to the same user', async () => {
      const targetUser = await createTestUser();
      await AgentAssignment.create({ agentId: 'agent_123', user: targetUser._id });

      const response = await request(app)
        .post(`/api/v1/admin/users/${targetUser._id}/agents`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ agentId: 'agent_123' })
        .expect(200);

      expect(response.body).toHaveProperty('assignment');
      expect(response.body.assignment).toHaveProperty('userId', targetUser._id.toString());
    });

    it('returns 404 when assigning to a non-existent user', async () => {
      const fakeId = '60ddaeff2f799d6b4c8f6e11';

      await request(app)
        .post(`/api/v1/admin/users/${fakeId}/agents`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ agentId: 'agent_123' })
        .expect(404);
    });

    it('validates agent assignment payload', async () => {
      const targetUser = await createTestUser();

      const response = await request(app)
        .post(`/api/v1/admin/users/${targetUser._id}/agents`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ agentId: 123 })
        .expect(400);

      expect(response.body).toHaveProperty('errors');
    });
  });

  describe('DELETE /api/v1/admin/users/:id/agents/:agentId', () => {
    it('unassigns an agent from a user', async () => {
      const targetUser = await createTestUser();
      await AgentAssignment.create({ agentId: 'agent_123', user: targetUser._id });

      await request(app)
        .delete(`/api/v1/admin/users/${targetUser._id}/agents/agent_123`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      const stored = await AgentAssignment.findOne({ agentId: 'agent_123' });
      expect(stored).toBeNull();
    });

    it('returns 404 when the user does not exist', async () => {
      await request(app)
        .delete('/api/v1/admin/users/60ddaeff2f799d6b4c8f6e11/agents/agent_123')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('returns 404 when the assignment does not exist', async () => {
      const targetUser = await createTestUser();

      await request(app)
        .delete(`/api/v1/admin/users/${targetUser._id}/agents/agent_123`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('returns 409 when the agent is assigned to a different user', async () => {
      const firstUser = await createTestUser();
      const secondUser = await createTestUser();
      await AgentAssignment.create({ agentId: 'agent_123', user: firstUser._id });

      await request(app)
        .delete(`/api/v1/admin/users/${secondUser._id}/agents/agent_123`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);
    });
  });
});
