import { createPrivateKey, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { normalizePrivateKey } from '../../../supabase/functions/_shared/pem';

// GitHub issues PKCS#1 keys ("BEGIN RSA PRIVATE KEY").
const { privateKey: pkcs1 } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
});
const expected = createPrivateKey(pkcs1).export({ type: 'pkcs8', format: 'pem' }).toString();

const variants: Record<string, string> = {
  'as downloaded (PKCS#1, real newlines)': pkcs1,
  'literal \\n escapes': pkcs1.trim().replace(/\n/g, '\\n'),
  'newlines stripped (single-line paste)': pkcs1.replace(/\n/g, ''),
  'wrapped in quotes': `"${pkcs1.trim()}"`,
  'Windows line endings': pkcs1.replace(/\n/g, '\r\n'),
  'whole file base64-encoded': btoa(pkcs1),
  'already PKCS#8': expected,
};

describe('normalizePrivateKey', () => {
  for (const [name, input] of Object.entries(variants)) {
    it(`accepts ${name}`, () => {
      const out = normalizePrivateKey(input);
      expect(out.startsWith('-----BEGIN PRIVATE KEY-----\n')).toBe(true);
      expect(out).toBe(expected);
    });
  }

  it('explains a truncated key (only the first line saved)', () => {
    expect(() => normalizePrivateKey('-----BEGIN RSA PRIVATE KEY-----\n-----END RSA PRIVATE KEY-----')).toThrow(/truncated/);
  });

  it('explains garbage input', () => {
    expect(() => normalizePrivateKey('...')).toThrow(/not a PEM key/);
  });
});
