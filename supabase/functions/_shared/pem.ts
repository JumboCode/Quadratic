// Normalizes the GitHub App private key however it was pasted into the secret store, and converts
// GitHub's PKCS#1 ("BEGIN RSA PRIVATE KEY") keys to the PKCS#8 form WebCrypto requires.
// Pure (no Deno APIs) so the web app's Vitest suite can test it.

/**
 * Accepts: real newlines, literal "\n" escapes, newlines stripped entirely (single-line paste),
 * surrounding quotes, or the whole .pem file base64-encoded. Throws a readable error otherwise.
 */
export function normalizePrivateKey(raw: string): string {
  let key = raw.trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n').replace(/\r/g, '');

  if (!key.includes('-----BEGIN')) {
    try {
      const decoded = atob(key.replace(/\s/g, ''));
      if (decoded.includes('-----BEGIN')) key = decoded;
    } catch {
      // not base64; fall through to the error below
    }
  }

  const m = key.match(/-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/);
  if (!m) {
    throw new Error(
      'GITHUB_APP_PRIVATE_KEY is not a PEM key. Paste the entire .pem file, including the BEGIN/END lines.',
    );
  }
  const [, type, bodyRaw] = m;
  const body = bodyRaw.replace(/\s/g, '');
  if (body.length < 200) {
    throw new Error(
      'GITHUB_APP_PRIVATE_KEY looks truncated (only the BEGIN/END lines were saved). ' +
        'Re-set it with the full contents of the .pem file.',
    );
  }

  let der = base64ToBytes(body);
  if (type === 'RSA PRIVATE KEY') der = pkcs1ToPkcs8(der);
  else if (type !== 'PRIVATE KEY') throw new Error(`Unsupported key type "${type}"; expected an RSA private key.`);

  const b64 = bytesToBase64(der);
  return `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`;
}

// PrivateKeyInfo ::= SEQUENCE { version INTEGER 0, algorithm AlgorithmIdentifier(rsaEncryption, NULL), privateKey OCTET STRING }
const RSA_ALGORITHM_ID = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
const VERSION_0 = [0x02, 0x01, 0x00];

function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
  const octet = [0x04, ...derLength(pkcs1.length), ...pkcs1];
  const inner = [...VERSION_0, ...RSA_ALGORITHM_ID, ...octet];
  return new Uint8Array([0x30, ...derLength(inner.length), ...inner]);
}

function derLength(n: number): number[] {
  if (n < 0x80) return [n];
  const bytes: number[] = [];
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  return [0x80 | bytes.length, ...bytes];
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
