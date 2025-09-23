// Simple test to verify the app works
const { createTestUser, generateToken } = require('./tests/helpers/testHelpers');
const createTestApp = require('./tests/app');
const request = require('supertest');

async function runSimpleTest() {
  console.log('[Simple Test] Starting...');

  try {
    const app = createTestApp();
    console.log('[Simple Test] Test app created');

    const user = await createTestUser('admin');
    console.log('[Simple Test] Test user created:', user.email);

    const token = generateToken(user);
    console.log('[Simple Test] Token generated');

    const healthResponse = await request(app)
      .get('/api/v1/health')
      .expect(200);
    console.log('[Simple Test] Health endpoint response:', healthResponse.body);

    const adminResponse = await request(app)
      .get('/api/v1/admin/phones')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    console.log('[Simple Test] Admin endpoint response:', adminResponse.body);

    console.log('[Simple Test] Completed successfully');
  } catch (error) {
    console.error('[Simple Test] Failure:', error.message);
    console.error(error);
  }
}

runSimpleTest();
