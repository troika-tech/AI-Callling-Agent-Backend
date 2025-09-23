const createTestApp = require('../app');
const User = require('../../src/models/User');
const { signAccess } = require('../../src/lib/jwt');
const { randomUUID } = require('crypto');

const uniqueEmail = (role) => `${role}-${randomUUID()}@example.com`;

const createTestUser = async (role = 'user') => {
  return User.create({
    email: uniqueEmail(role),
    name: `Test ${role}`,
    passwordHash: '$2a$10$test.hash.for.testing',
    role
  });
};

const createTestAdmin = async () => {
  return createTestUser('admin');
};

const generateToken = (user) => {
  return signAccess({
    sub: user._id.toString(),
    email: user.email,
    role: user.role
  });
};

const mockMillisResponses = {
  listAgents: {
    items: [
      { id: 'agent_123', label: 'Outbound Agent' },
      { id: 'agent_456', label: 'Inbound Agent' }
    ],
    total: 2
  },
  listPhones: {
    items: [
      { id: 'phone1', number: '+14155550100', tags: ['vip'], agentId: 'agent1' },
      { id: 'phone2', number: '+14155550101', tags: [], agentId: null }
    ],
    total: 2
  },
  importPhones: { message: 'Import queued', jobId: 'job123' },
  setPhoneAgent: { success: true, agentId: 'agent_123' },
  updatePhoneTags: { success: true, tags: ['vip', 'beta'] },
  approveCampaign: { success: true, status: 'approved' },
  listCallLogs: {
    items: [
      { id: 'call1', from: '+14155550100', to: '+14155550101', status: 'completed' }
    ],
    total: 1
  },
  listSessions: {
    items: [
      { id: 'session1', userPhone: '+14155550100', agentId: 'agent_123' }
    ],
    total: 1
  }
};

const createMockMillisClient = () => ({
  listAgents: jest.fn().mockResolvedValue(mockMillisResponses.listAgents),
  listPhones: jest.fn().mockResolvedValue(mockMillisResponses.listPhones),
  importPhones: jest.fn().mockResolvedValue(mockMillisResponses.importPhones),
  setPhoneAgent: jest.fn().mockResolvedValue(mockMillisResponses.setPhoneAgent),
  updatePhoneTags: jest.fn().mockResolvedValue(mockMillisResponses.updatePhoneTags),
  approveCampaign: jest.fn().mockResolvedValue(mockMillisResponses.approveCampaign),
  listCallLogs: jest.fn().mockResolvedValue(mockMillisResponses.listCallLogs),
  listSessions: jest.fn().mockResolvedValue(mockMillisResponses.listSessions)
});

const mockMillisClient = createMockMillisClient();

let mocksInitialized = false;
const setupMocks = () => {
  if (mocksInitialized) return;
  jest.doMock('../../src/clients/millis', () => mockMillisClient);
  mocksInitialized = true;
};

const resetMocks = () => {
  Object.values(mockMillisClient).forEach(mock => mock.mockClear());
};

module.exports = {
  createTestApp,
  createTestUser,
  createTestAdmin,
  generateToken,
  mockMillisResponses,
  mockMillisClient,
  setupMocks,
  resetMocks
};
