const request = require('supertest');
const createTestApp = require('../app');
const User = require('../../src/models/User');
const AuthSession = require('../../src/models/AuthSession');
const { hashPassword } = require('../../src/lib/password');

describe('Auth routes', () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  it('signs up, refreshes, logs out, and logs back in using cookies', async () => {
    const agent = request.agent(app);
    const email = 'auth-flow@example.com';
    const password = 'Password123!';

    const signupRes = await agent
      .post('/api/v1/auth/signup')
      .send({ email, password, name: 'Flow User' })
      .expect(201);

    expect(signupRes.body.user).toMatchObject({ email, name: 'Flow User', role: 'user' });
    expect(signupRes.headers['set-cookie']).toEqual(expect.arrayContaining([
      expect.stringContaining('session='),
      expect.stringContaining('refresh_token=')
    ]));

    const sessionCount = await AuthSession.countDocuments();
    expect(sessionCount).toBe(1);

    const meRes = await agent.get('/api/v1/auth/me').expect(200);
    expect(meRes.body.user.email).toBe(email);

    const refreshRes = await agent.post('/api/v1/auth/refresh').expect(200);
    expect(refreshRes.headers['set-cookie']).toEqual(expect.arrayContaining([
      expect.stringContaining('session='),
      expect.stringContaining('refresh_token=')
    ]));

    await agent.post('/api/v1/auth/logout').expect(204);

    const postLogoutMe = await agent.get('/api/v1/auth/me');
    expect(postLogoutMe.status).toBe(401);

    const loginRes = await agent
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    expect(loginRes.headers['set-cookie']).toEqual(expect.arrayContaining([
      expect.stringContaining('session='),
      expect.stringContaining('refresh_token=')
    ]));
  });

  it('rejects invalid login attempts', async () => {
    const password = await hashPassword('ValidPassword1!');
    await User.create({ email: 'login@example.com', passwordHash: password, role: 'user' });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'login@example.com', password: 'wrongPassword!' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it('requires refresh token cookie', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});