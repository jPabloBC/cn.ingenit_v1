import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import crypto from 'crypto'

function base64url(input: Buffer) {
  return input.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export async function GET(req: NextRequest) {
  // If a SIGNING KEY is configured, issue a short-lived HMAC token. Otherwise
  // fall back to returning a static token from environment (dev fallback).
  const signingKey = process.env.STREAMER_SIGNING_KEY
  const fallback = process.env.NEXT_PUBLIC_STREAMER_TOKEN || process.env.STREAMER_TOKEN || ''

  if (!signingKey) {
    return NextResponse.json({ token: fallback })
  }

  const now = Math.floor(Date.now() / 1000)
  const payload = { iat: now, exp: now + 60 } // 60s TTL
  const payloadJson = JSON.stringify(payload)
  const payloadB = Buffer.from(payloadJson, 'utf8')
  const sig = crypto.createHmac('sha256', signingKey).update(payloadB).digest()
  const token = `${base64url(payloadB)}.${base64url(sig)}`
  return NextResponse.json({ token })
}
