/**
 * Unit tests for the JWT identity provider (Layer 3).
 */

const { issueToken, verifyToken } = require('../mcp-server/identity_provider.js');

describe('issueToken / verifyToken', () => {
  test('issues a verifiable token with gpc=true', () => {
    const token = issueToken('orchestrator', true);
    const claims = verifyToken(token);
    expect(claims.gpc).toBe(true);
    expect(claims.sub).toBe('orchestrator');
  });

  test('issues a verifiable token with gpc=false', () => {
    const token = issueToken('orchestrator', false);
    const claims = verifyToken(token);
    expect(claims.gpc).toBe(false);
  });

  test('coerces truthy values to boolean true', () => {
    const token = issueToken('agent', 1);
    const claims = verifyToken(token);
    expect(claims.gpc).toBe(true);
  });

  test('coerces falsy values to boolean false', () => {
    const token = issueToken('agent', 0);
    const claims = verifyToken(token);
    expect(claims.gpc).toBe(false);
  });

  test('verifyToken throws on a tampered token', () => {
    const token = issueToken('orchestrator', true);
    const parts = token.split('.');
    // Flip a character in the payload
    const tamperedPayload = parts[1].slice(0, -2) + 'AA';
    const tampered = [parts[0], tamperedPayload, parts[2]].join('.');
    expect(() => verifyToken(tampered)).toThrow();
  });

  test('verifyToken throws on a completely invalid token', () => {
    expect(() => verifyToken('not.a.jwt')).toThrow();
  });

  test('token carries correct issuer and audience claims', () => {
    const token = issueToken('orchestrator', true);
    const claims = verifyToken(token);
    expect(claims.iss).toBe('gpc-demo-idp');
    expect(claims.aud).toBe('third-party-storage');
  });
});
