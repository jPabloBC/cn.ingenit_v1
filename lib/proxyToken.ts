import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

type TokenStore = {
  // token -> { userId, createdAt }
  tokens: Record<string, { userId: string; createdAt: number }>
  // userId -> token
  users: Record<string, string>
}

const STORE_PATH = path.join(process.cwd(), 'data', 'playwright_sessions', 'proxy_tokens.json')
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7 // 7 days

async function ensureDir() {
  await fs.promises.mkdir(path.dirname(STORE_PATH), { recursive: true }).catch(() => {})
}

async function readStore(): Promise<TokenStore> {
  await ensureDir()
  if (!fs.existsSync(STORE_PATH)) return { tokens: {}, users: {} }
  try {
    const raw = await fs.promises.readFile(STORE_PATH, 'utf-8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { tokens: {}, users: {} }
    return {
      tokens: typeof parsed.tokens === 'object' && parsed.tokens ? parsed.tokens : {},
      users: typeof parsed.users === 'object' && parsed.users ? parsed.users : {},
    }
  } catch {
    return { tokens: {}, users: {} }
  }
}

async function writeStore(store: TokenStore) {
  await ensureDir()
  await fs.promises.writeFile(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8')
}

function isExpired(createdAt: number) {
  return Date.now() - createdAt > MAX_AGE_MS
}

export async function getOrCreateProxyTokenForUser(userId: string) {
  const store = await readStore()

  const existing = store.users[userId]
  if (existing) {
    const entry = store.tokens[existing]
    if (entry && entry.userId === userId && !isExpired(entry.createdAt)) return existing

    // cleanup stale
    delete store.tokens[existing]
    delete store.users[userId]
  }

  const token = crypto.randomBytes(24).toString('hex')
  store.tokens[token] = { userId, createdAt: Date.now() }
  store.users[userId] = token
  await writeStore(store)
  return token
}

export async function resolveUserIdFromProxyToken(token: string) {
  const store = await readStore()
  const entry = store.tokens[token]
  if (!entry) return null
  if (entry.userId && !isExpired(entry.createdAt)) return entry.userId

  // expired: cleanup
  try {
    delete store.users[entry.userId]
    delete store.tokens[token]
    await writeStore(store)
  } catch {
    // ignore
  }
  return null
}
