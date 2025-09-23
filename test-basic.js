// Basic test without Jest mocks
const createTestApp = require('./tests/app');
const User = require('./src/models/User');
const { signAccess } = require('./src/lib/jwt');
const request = require('supertest');
const mongoose = require('mongoose');

async function runBasicTest() {
  console.log('[Basic Test] Starting...');

  try {
    await mongoose.connect('mongodb://localhost:27017/millis_saas_test');
    console.log('[Basic Test] Connected to test database');

    const app = createTestApp();
    console.log('[Basic Test] Test app created');

    const user = await User.create({
      email: 'test-admin@example.com',
      name: 'Test Admin',
      passwordHash: '$2a$10$test.hash.for.testing',
      role: 'admin'
    });
    console.log('[Basic Test] Test user created:', user.email);

    const token = signAccess({
      sub: user._id.toString(),
      email: user.email,
      role: user.role
    });
    console.log('[Basic Test] Token generated');

    const healthResponse = await request(app)
      .get('/api/v1/health')
      .expect(200);
    console.log('[Basic Test] Health endpoint response:', healthResponse.body);

    const adminResponse = await request(app)
      .get('/api/v1/admin/phones')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    console.log('[Basic Test] Admin endpoint response:', adminResponse.body);

    await User.deleteMany({});
    await mongoose.connection.close();

    console.log('[Basic Test] Completed successfully');
  } catch (error) {
    console.error('[Basic Test] Failure:', error.message);
    console.error(error);
  }
}

runBasicTest();
