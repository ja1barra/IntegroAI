// AES-256-GCM envelope for OAuth tokens at rest.
//   format: v1.<keyId>.<iv b64url>.<tag b64url>.<ciphertext b64url>
// Key rotation: set CREDENTIALS_ENCRYPTION_KEY(+_ID) to the new key and put the
// old one in CREDENTIALS_ENCRYPTION_KEY_PREVIOUS ("<id>:<base64>"). Existing rows
// stay readable; the `rotate_credentials` job re-encrypts them under the new key.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const b64u = b => Buffer.from(b).toString('base64url')
const fromB64u = s => Buffer.from(s, 'base64url')

function parseKey(b64, label) {
  const raw = Buffer.from(String(b64 ?? ''), 'base64')
  if (raw.length !== 32) throw new Error(`${label} must be 32 bytes, base64-encoded (e.g. \`openssl rand -base64 32\`)`)
  return raw
}

export function keyring(encCfg) {
  const ring = new Map()
  if (encCfg?.key) ring.set(String(encCfg.keyId ?? '1'), parseKey(encCfg.key, 'CREDENTIALS_ENCRYPTION_KEY'))
  for (const part of String(encCfg?.previous ?? '').split(',').map(s => s.trim()).filter(Boolean)) {
    const i = part.indexOf(':')
    if (i < 1) throw new Error('CREDENTIALS_ENCRYPTION_KEY_PREVIOUS must look like "<id>:<base64>"')
    ring.set(part.slice(0, i), parseKey(part.slice(i + 1), 'CREDENTIALS_ENCRYPTION_KEY_PREVIOUS'))
  }
  return { ring, currentId: encCfg?.key ? String(encCfg.keyId ?? '1') : null }
}

export function encrypt(plain, encCfg) {
  const { ring, currentId } = keyring(encCfg)
  if (!currentId) throw new Error('CREDENTIALS_ENCRYPTION_KEY is not configured')
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', ring.get(currentId), iv)
  c.setAAD(Buffer.from(currentId))
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()])
  return { value: `v1.${currentId}.${b64u(iv)}.${b64u(c.getAuthTag())}.${b64u(ct)}`, keyVersion: currentId }
}

export function decrypt(value, encCfg) {
  const [v, id, iv, tag, ct] = String(value).split('.')
  if (v !== 'v1' || !id || !iv || !tag || !ct) throw new Error('Unrecognized ciphertext format')
  const key = keyring(encCfg).ring.get(id)
  if (!key) throw new Error(`No encryption key available for key version ${id}`)
  const d = createDecipheriv('aes-256-gcm', key, fromB64u(iv))
  d.setAAD(Buffer.from(id))
  d.setAuthTag(fromB64u(tag))
  return Buffer.concat([d.update(fromB64u(ct)), d.final()]).toString('utf8')
}

export const keyVersionOf = value => String(value).split('.')[1] ?? null
