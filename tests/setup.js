const mongoose = require('mongoose');

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '0'; // Use random available port for tests
process.env.JWT_SECRET = 'test-secret-key';
process.env.MONGO_URL = 'mongodb://localhost:27017/millis_saas_test';
process.env.MILLIS_BASE_URL = 'https://api-test.millis.ai';
process.env.MILLIS_API_KEY = 'test-api-key';

// Global test timeout
jest.setTimeout(30000);

// Setup test database
beforeAll(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('Connected to test database');
  } catch (error) {
    console.error('Failed to connect to test database:', error);
  }
});

// Clean up after each test
afterEach(async () => {
  try {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany({});
    }
  } catch (error) {
    console.error('Error cleaning up test data:', error);
  }
});

// Close database connection after all tests
afterAll(async () => {
  try {
    await mongoose.connection.close();
    console.log('Disconnected from test database');
  } catch (error) {
    console.error('Error closing database connection:', error);
  }
});
