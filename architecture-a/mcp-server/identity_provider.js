/**
 * Mock Identity Provider (Layer 3).
 *
 * Issues RS256-signed JWTs that carry a `gpc` claim.
 * In a real deployment this would be an external IdP; here it runs in-process.
 */

const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const PRIVATE_KEY = fs.readFileSync(path.join(__dirname, '..', 'keys', 'private.pem'));
const PUBLIC_KEY  = fs.readFileSync(path.join(__dirname, '..', 'keys', 'public.pem'));

const ISSUER   = 'gpc-demo-idp';
const AUDIENCE = 'third-party-storage';

/**
 * Issue a signed JWT embedding the GPC signal.
 * @param {string} subject  — caller identity (e.g. 'orchestrator')
 * @param {boolean} gpc     — true if user has opted out of tracking
 * @returns {string}        — compact JWT
 */
function issueToken(subject, gpc) {
  return jwt.sign(
    { gpc: !!gpc },
    PRIVATE_KEY,
    { algorithm: 'RS256', expiresIn: '5m', issuer: ISSUER, audience: AUDIENCE, subject }
  );
}

/**
 * Verify a JWT and return its decoded payload.
 * Throws if the signature is invalid or the token is expired.
 * @param {string} token
 * @returns {{ gpc: boolean, sub: string, ... }}
 */
function verifyToken(token) {
  return jwt.verify(token, PUBLIC_KEY, { algorithms: ['RS256'], issuer: ISSUER, audience: AUDIENCE });
}

module.exports = { issueToken, verifyToken };
