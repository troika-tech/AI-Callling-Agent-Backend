const request = require('supertest');
const User = require('../../src/models/User');
const { createTestApp, createTestAdmin, generateToken, setupMocks, resetMocks } = require('../helpers/testHelpers');

describe('Admin User Management', () => {
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

  const createUserRecord = async (overrides = {}) => {
    const passwordHash = overrides.passwordHash || '$2a$10$test.hash.for.testing';
    return User.create({
      email: overrides.email || `crud-user-${Date.now()}-${Math.random()}@example.com`,
      name: overrides.name || 'CRUD User',
      passwordHash,
      role: overrides.role || 'user'
    });
  };

  describe('GET /api/v1/admin/users', () => {
    it('lists users with pagination and filtering', async () => {
      await createUserRecord({ name: 'Alice Example' });
      await createUserRecord({ name: 'Bob Example', role: 'admin' });

      const response = await request(app)
        .get('/api/v1/admin/users?page=1&pageSize=5&search=example&role=admin')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('items');
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body).toHaveProperty('page', 1);
      expect(response.body).toHaveProperty('pageSize', 5);
      expect(response.body).toHaveProperty('total');
      expect(response.body.items.every(u => u.role === 'admin')).toBe(true);
    });
  });

  describe('POST /api/v1/admin/users', () => {
    it('creates a new user', async () => {
      const payload = {
        email: 'new-user@example.com',
        name: 'New User',
        password: 'supersecret',
        role: 'user'
      };

      const response = await request(app)
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload)
        .expect(201);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toMatchObject({
        email: payload.email,
        name: payload.name,
        role: payload.role
      });
      expect(response.body.user).not.toHaveProperty('passwordHash');

      const stored = await User.findOne({ email: payload.email });
      expect(stored).not.toBeNull();
      expect(stored.passwordHash).not.toBe(payload.password);
    });

    it('rejects duplicate emails with 409', async () => {
      await createUserRecord({ email: 'duplicate@example.com' });

      await request(app)
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'duplicate@example.com',
          password: 'supersecret',
          name: 'Dup',
          role: 'user'
        })
        .expect(409);
    });
  });

  describe('GET /api/v1/admin/users/:id', () => {
    it('returns a single user', async () => {
      const user = await createUserRecord();

      const response = await request(app)
        .get(`/api/v1/admin/users/${user._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toMatchObject({
        id: user._id.toString(),
        email: user.email
      });
    });
  });

  describe('PATCH /api/v1/admin/users/:id', () => {
    it('updates user fields including password', async () => {
      const user = await createUserRecord({ name: 'Old Name', role: 'user' });
      const originalHash = user.passwordHash;

      const response = await request(app)
        .patch(`/api/v1/admin/users/${user._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated Name', role: 'admin', password: 'newsecret123' })
        .expect(200);

      expect(response.body.user).toMatchObject({
        id: user._id.toString(),
        name: 'Updated Name',
        role: 'admin'
      });

      const stored = await User.findById(user._id);
      expect(stored.passwordHash).not.toBe(originalHash);
    });
  });

  describe('DELETE /api/v1/admin/users/:id', () => {
    it('deletes a user', async () => {
      const user = await createUserRecord();

      await request(app)
        .delete(`/api/v1/admin/users/${user._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      const stored = await User.findById(user._id);
      expect(stored).toBeNull();
    });

    it('prevents deleting current admin', async () => {
      await request(app)
        .delete(`/api/v1/admin/users/${adminUser._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });
  });

  describe('Validation', () => {
    it('validates create payload', async () => {
      const response = await request(app)
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'not-an-email', password: 'short' })
        .expect(400);

      expect(response.body).toHaveProperty('errors');
      expect(Array.isArray(response.body.errors)).toBe(true);
    });

    it('validates update payload', async () => {
      const user = await createUserRecord();

      const response = await request(app)
        .patch(`/api/v1/admin/users/${user._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('errors');
    });
  });
});
