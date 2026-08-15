process.env.JWT_SECRET = 'test-jwt-secret-for-registration-tests';

const request = require('supertest');
const express = require('express');

jest.mock('../../services/authService.cjs', () => ({
  registerUser: jest.fn(),
  authenticateUser: jest.fn(),
  getUserById: jest.fn(),
}));

jest.mock('../../services/portalAuthService.cjs', () => ({
  authenticatePortalUser: jest.fn(),
  isTwoFactorEnabled: jest.fn(),
  getTwoFactorSecret: jest.fn(),
  verifyTwoFactorToken: jest.fn(),
  createSession: jest.fn(),
  recordLoginHistory: jest.fn(),
}));

const authService = require('../../services/authService.cjs');
const authRoutes = require('../../routes/auth.cjs');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  return app;
};

describe('POST /api/auth/register — public registration hardening', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authService.registerUser.mockResolvedValue({
      id: 'usr_test_1',
      username: 'newguy',
      email: 'newguy@example.com',
      role: 'Clerk',
      permissions: [],
    });
  });

  it('never forwards a client-supplied Admin role to the service', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'newguy',
        email: 'newguy@example.com',
        password: 'secret123',
        role: 'Admin',
        permissions: ['everything'],
      });

    expect(res.status).toBe(201);
    expect(authService.registerUser).toHaveBeenCalledTimes(1);
    const args = authService.registerUser.mock.calls[0][0];
    expect(args.role).toBeUndefined();
    expect(args.permissions).toBeUndefined();
  });

  it('registers with only username/email/password', async () => {
    const app = buildApp();
    await request(app)
      .post('/api/auth/register')
      .send({ username: 'plainuser', password: 'secret123' });

    expect(authService.registerUser.mock.calls[0][0]).toEqual({
      username: 'plainuser',
      password: 'secret123',
    });
  });

  it('still rejects invalid payloads (short password)', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'abc', password: '123' });

    expect(res.status).toBe(400);
    expect(authService.registerUser).not.toHaveBeenCalled();
  });
});
