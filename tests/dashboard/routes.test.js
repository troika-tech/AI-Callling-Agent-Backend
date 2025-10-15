const request = require('supertest');

const {
  createTestApp,
  createTestUser,
  generateToken,
  setupMocks,
  resetMocks,
  mockMillisClient,
  mockMillisResponses
} = require('../helpers/testHelpers');

describe('Dashboard Read-Only API', () => {
  let app;
  let ownerUser;
  let ownerToken;

  beforeAll(() => {
    setupMocks();
    app = createTestApp();
  });

  beforeEach(async () => {
    resetMocks();
    ownerUser = await createTestUser('owner');
    ownerToken = `Bearer ${generateToken(ownerUser)}`;
  });

  const authHeader = () => ({ Authorization: ownerToken });

  it('returns the current user profile', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set(authHeader())
      .expect(200);

    expect(res.body.user).toMatchObject({
      id: ownerUser._id.toString(),
      email: ownerUser.email,
      role: 'owner'
    });
  });

  it('returns billing overview data', async () => {
    const res = await request(app)
      .get('/api/me')
      .set(authHeader())
      .expect(200);

    expect(res.body.user.email).toBe(ownerUser.email);
    expect(res.body.billing).toEqual(mockMillisResponses.userInfo);
  });

  it('lists agents with normalized fields', async () => {
    const res = await request(app)
      .get('/api/agents')
      .set(authHeader())
      .expect(200);

    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0]).toMatchObject({
      id: 'agent_123',
      name: 'Outbound Agent',
      voice_label: 'Agent Voice',
      language: 'en'
    });
  });

  it('lists call logs with masked phones and pagination metadata', async () => {
    const res = await request(app)
      .get('/api/call-logs')
      .set(authHeader())
      .expect(200);

    expect(res.body.items[0]).toMatchObject({
      session_id: 'sess_1',
      status: 'completed'
    });
    expect(res.body.items[0].masked_phone).toContain('*');
    expect(res.body.has_more).toBe(false);
  });

  it('returns call detail with transcript and cost breakdown', async () => {
    const res = await request(app)
      .get('/api/call-logs/sess_1')
      .set(authHeader())
      .expect(200);

    expect(res.body.session_id).toBe('sess_1');
    expect(res.body.chat).toHaveLength(1);
    expect(res.body.recording.available).toBe(true);
  });

  it('normalizes string transcripts into structured chat entries', async () => {
    mockMillisClient.getCallDetail.mockResolvedValueOnce({
      session_id: 'sess_string',
      agent: { id: 'agent_string', name: 'String Agent' },
      duration_sec: 90,
      status: 'COMPLETED',
      transcript: 'Agent: Welcome to the call\nCustomer: Thanks!\nSystem: Call completed'
    });

    const res = await request(app)
      .get('/api/call-logs/sess_string')
      .set(authHeader())
      .expect(200);

    expect(res.body.chat).toHaveLength(3);
    expect(res.body.chat[0]).toMatchObject({ speaker: 'agent', message: 'Welcome to the call' });
    expect(res.body.chat[1]).toMatchObject({ speaker: 'customer', message: 'Thanks!' });
    expect(res.body.chat[2]).toMatchObject({ speaker: 'system', message: 'Call completed' });
  });

  it('streams call recording audio', async () => {
    const res = await request(app)
      .get('/api/call-logs/sess_1/recording')
      .set(authHeader())
      .buffer(true)
      .parse((response, callback) => {
        response.setEncoding('utf8');
        let data = '';
        response.on('data', (chunk) => { data += chunk; });
        response.on('end', () => callback(null, data));
      })
      .expect(200);

    expect(res.headers['content-type']).toBe('audio/mpeg');
    expect(res.body).toBe('audio-bytes');
    expect(mockMillisClient.streamCallRecording).toHaveBeenCalledWith('sess_1', {});
  });

  it('lists campaigns and exposes detail/info endpoints', async () => {
    const listRes = await request(app)
      .get('/api/campaigns')
      .set(authHeader())
      .expect(200);

    expect(listRes.body.items).toHaveLength(2);

    const detailRes = await request(app)
      .get('/api/campaigns/cmp_1')
      .set(authHeader())
      .expect(200);
    expect(detailRes.body).toEqual(mockMillisResponses.campaignDetail);

    const infoRes = await request(app)
      .get('/api/campaigns/cmp_1/info')
      .set(authHeader())
      .expect(200);
    expect(infoRes.body).toEqual(mockMillisResponses.campaignInfo);
  });

  it('lists phones with masked identifiers and returns detail', async () => {
    const listRes = await request(app)
      .get('/api/phones')
      .set(authHeader())
      .expect(200);

    expect(listRes.body.items[0].id).toContain('*');

    const detailRes = await request(app)
      .get('/api/phones/phone1')
      .set(authHeader())
      .expect(200);

    expect(detailRes.body.id).toContain('*');
    expect(detailRes.body.tags).toEqual(expect.arrayContaining(['vip']));
  });

  it('streams CSV exports with masked phone data', async () => {
    const res = await request(app)
      .get('/api/exports/calls.csv')
      .set(authHeader())
      .expect(200);

    expect(res.headers['content-type']).toContain('text/csv');
    const lines = res.text.trim().split('\n');
    expect(lines[0]).toBe('session_id,ts,agent_id,agent_name,masked_phone,duration_sec,status,cost');
    expect(lines[1]).toContain('*');
  });

  it('rejects write attempts with 403 Managed by Admins', async () => {
    await request(app)
      .post('/api/phones')
      .set(authHeader())
      .expect(403);
  });

  it('blocks access for users without dashboard role', async () => {
    const regularUser = await createTestUser('user');
    const token = `Bearer ${generateToken(regularUser)}`;

    await request(app)
      .get('/api/agents')
      .set('Authorization', token)
      .expect(403);
  });
});
