import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';

/**
 * End-to-end smoke test. Boots the Express app in-process (no network listen) and
 * exercises routes that do not require a database connection.
 */
describe('App (e2e)', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  it('GET /api/v1 returns the standard success envelope with API metadata', () => {
    return request(app)
      .get('/api/v1')
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.name).toBeDefined();
      });
  });

  it('GET /api/v1/users/me without a token returns 401', () => {
    return request(app)
      .get('/api/v1/users/me')
      .expect(401)
      .expect((res) => {
        expect(res.body.success).toBe(false);
      });
  });
});
