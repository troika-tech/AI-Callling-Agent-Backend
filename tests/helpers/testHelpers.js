const { Readable } = require('stream');
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
  userInfo: {
    credit: 120.5,
    used_credit: 35.0,
    auto_refill: {
      enabled: true,
      threshold: 50,
      refill_amount: 200
    }
  },
  listAgents: {
    items: [
      { id: 'agent_123', name: 'Outbound Agent', voice_label: 'Agent Voice', language: 'en', created_at: 1693526400 },
      { id: 'agent_456', name: 'Inbound Agent', voice_label: 'Agent Voice 2', language: 'en', created_at: 1693612800 }
    ],
    total: 2
  },
  listPhones: {
    items: [
      { id: 'phone1', number: '+14155550100', tags: ['vip'], agent_id: 'agent_123', status: 'ACTIVE', created_at: '2025-09-01T00:00:00Z' },
      { id: 'phone2', number: '+14155550101', tags: [], agent_id: null, status: 'INACTIVE', created_at: '2025-09-02T00:00:00Z' }
    ],
    total: 2
  },
  phoneDetail: {
    id: 'phone1',
    number: '+14155550100',
    agent_id: 'agent_123',
    status: 'ACTIVE',
    tags: ['vip'],
    created_at: '2025-09-01T00:00:00Z',
    meta: { region: 'US' }
  },
  importPhones: { message: 'Import queued', jobId: 'job123' },
  setPhoneAgent: { success: true, agentId: 'agent_123' },
  updatePhoneTags: { success: true, tags: ['vip', 'beta'] },
  approveCampaign: { success: true, status: 'approved' },
  listCampaigns: {
    items: [
      { id: 'cmp_1', name: 'Summer Promo', status: 'ACTIVE', created_at: '2025-08-01T00:00:00Z' },
      { id: 'cmp_2', name: 'Winter Promo', status: 'PAUSED', created_at: '2025-09-01T00:00:00Z' }
    ],
    total: 2
  },
  campaignDetail: { id: 'cmp_1', name: 'Summer Promo', status: 'ACTIVE' },
  campaignInfo: { id: 'cmp_1', info: { budget: 1000 } },
  listCallLogs: {
    items: [
      {
        session_id: 'sess_1',
        ts: '2025-09-23T10:00:00Z',
        agent: { id: 'agent_123', name: 'Outbound Agent' },
        phone: '+14155550100',
        duration_sec: 120,
        status: 'COMPLETED',
        cost: 1.23
      }
    ],
    next_cursor: null,
    has_more: false,
    total: 1
  },
  callDetail: {
    session_id: 'sess_1',
    agent: { id: 'agent_123', name: 'Outbound Agent' },
    duration_sec: 120,
    status: 'COMPLETED',
    chat: [{ speaker: 'agent', text: 'Hello there' }],
    cost_breakdown: [{ item: 'telephony', cost: 1.23 }],
    recording: { available: true }
  },
  listSessions: {
    items: [
      { id: 'session1', userPhone: '+14155550100', agentId: 'agent_123' }
    ],
    total: 1
  }
};

const createMockMillisClient = () => ({
  getUserInfo: jest.fn().mockResolvedValue(mockMillisResponses.userInfo),
  listAgents: jest.fn().mockResolvedValue(mockMillisResponses.listAgents),
  listPhones: jest.fn().mockResolvedValue(mockMillisResponses.listPhones),
  getPhoneDetail: jest.fn().mockResolvedValue(mockMillisResponses.phoneDetail),
  importPhones: jest.fn().mockResolvedValue(mockMillisResponses.importPhones),
  setPhoneAgent: jest.fn().mockResolvedValue(mockMillisResponses.setPhoneAgent),
  updatePhoneTags: jest.fn().mockResolvedValue(mockMillisResponses.updatePhoneTags),
  approveCampaign: jest.fn().mockResolvedValue(mockMillisResponses.approveCampaign),
  listCampaigns: jest.fn().mockResolvedValue(mockMillisResponses.listCampaigns),
  getCampaignDetail: jest.fn().mockResolvedValue(mockMillisResponses.campaignDetail),
  getCampaignInfo: jest.fn().mockResolvedValue(mockMillisResponses.campaignInfo),
  listCallLogs: jest.fn().mockResolvedValue(mockMillisResponses.listCallLogs),
  getCallDetail: jest.fn().mockResolvedValue(mockMillisResponses.callDetail),
  streamCallRecording: jest.fn().mockResolvedValue({
    status: 200,
    headers: { 'content-type': 'audio/mpeg' },
    data: Readable.from('audio-bytes')
  }),
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