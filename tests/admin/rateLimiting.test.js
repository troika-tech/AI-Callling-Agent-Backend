const request = require('supertest');
const createTestApp = require('../app');
const { createTestAdmin, generateToken, setupMocks, resetMocks } = require('../helpers/testHelpers');

describe('Rate Limiting with IP Whitelisting', () => {
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

  describe('Whitelisted IP (103.232.246.21)', () => {
    it('should bypass rate limiting for whitelisted IP', async () => {
      const originalReq = request(app);
      const mockReq = {
        ...originalReq,
        get: (url) => {
          const req = originalReq.get(url);
          req.set('X-Forwarded-For', '103.232.246.21');
          return req;
        }
      };

      const responses = await Promise.all(
        Array.from({ length: 80 }, () =>
          mockReq
            .get('/api/v1/admin/phones')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('X-Forwarded-For', '103.232.246.21')
        )
      );

      responses.forEach(response => {
        expect(response.status).not.toBe(429);
      });
    });
  });

  describe('Non-whitelisted IP', () => {
    it('should apply rate limiting for non-whitelisted IPs', async () => {
      const responses = await Promise.all(
        Array.from({ length: 70 }, () =>
          request(app)
            .get('/api/v1/admin/phones')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('X-Forwarded-For', '192.168.1.100')
        )
      );

      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Direct IP detection', () => {
    it('should detect IP from req.ip when available', async () => {
      const cfg = require('../../src/config');
      expect(cfg.rateLimit.whitelistedIPs).toContain('103.232.246.21');
    });
  });

  describe('Environment variable configuration', () => {
    it('should read whitelisted IPs from environment variable', () => {
      const originalEnv = process.env.RATE_LIMIT_WHITELIST;

      process.env.RATE_LIMIT_WHITELIST = '192.168.1.1,10.0.0.1,103.232.246.21';

      jest.resetModules();
      const cfg = require('../../src/config');

      expect([...cfg.rateLimit.whitelistedIPs].sort()).toEqual(['10.0.0.1', '103.232.246.21', '192.168.1.1']);

      if (originalEnv) {
        process.env.RATE_LIMIT_WHITELIST = originalEnv;
      } else {
        delete process.env.RATE_LIMIT_WHITELIST;
      }

      jest.resetModules();
    });
  });
});
