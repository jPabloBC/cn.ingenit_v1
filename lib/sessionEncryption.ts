import fs from 'fs'
import crypto from 'crypto'

const ALGO = 'aes-256-gcm'

function deriveKey(password: string, salt: Buffer) {
  return crypto.scryptSync(password, salt, 32)
}

export async function encryptObjectToFile(filePath: string, obj: any) {
  const keySecret = process.env.PLAYWRIGHT_SESSIONS_KEY
  const payload = JSON.stringify(obj)
  if (!keySecret) {
    // fallback: write plaintext
    await fs.promises.writeFile(filePath, payload, 'utf-8')
    return
  }
  const salt = crypto.randomBytes(16)
  const iv = crypto.randomBytes(12)
  const key = deriveKey(keySecret, salt)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const out = {
    v: 1,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64')
  }
  await fs.promises.writeFile(filePath, JSON.stringify(out, null, 2), 'utf-8')
}

export async function decryptObjectFromFile<T = any>(filePath: string): Promise<T | null> {
  const keySecret = process.env.PLAYWRIGHT_SESSIONS_KEY
  if (!fs.existsSync(filePath)) return null
  const raw = await fs.promises.readFile(filePath, 'utf-8')
  // detect encrypted format
  try {
    const parsed = JSON.parse(raw)
    if (parsed && parsed.v === 1 && parsed.salt && parsed.iv && parsed.tag && parsed.data) {
      if (!keySecret) throw new Error('no encryption key configured')
      const salt = Buffer.from(parsed.salt, 'base64')
      const iv = Buffer.from(parsed.iv, 'base64')
      const tag = Buffer.from(parsed.tag, 'base64')
      const data = Buffer.from(parsed.data, 'base64')
      const key = deriveKey(keySecret, salt)
      const decipher = crypto.createDecipheriv(ALGO, key, iv)
      decipher.setAuthTag(tag)
      const dec = Buffer.concat([decipher.update(data), decipher.final()])
      return JSON.parse(dec.toString('utf-8')) as T
    }
  } catch (e) {
    // not encrypted JSON -> fallback to parsing plaintext JSON
  }
  try {
    return JSON.parse(raw) as T
  } catch (e) {
    return null
  }
}
