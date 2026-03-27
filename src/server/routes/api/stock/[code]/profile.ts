/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 */

import type { Context } from '@neabyte/deserve'
import * as Services from '@app/server/services/index.ts'

const BASE_URL = 'https://www.idx.co.id/primary/ListedCompany/GetCompanyProfilesDetail'

const cache = new Map<string, { data: unknown; expiresAt: number }>()
const CACHE_TTL_MS = 3600_000 // 1 hour

export async function GET(ctx: Context) {
  const code = ctx.param('code')
  if (!code || code.trim() === '') {
    return ctx.send.json({ error: 'Missing or invalid code' }, { status: 400 })
  }
  const stockCode = code.trim().toUpperCase()

  const cached = cache.get(stockCode)
  if (cached != null && Date.now() < cached.expiresAt) {
    return ctx.send.json(cached.data)
  }

  const client = new Services.Client()
  const url = `${BASE_URL}?KodeEmiten=${encodeURIComponent(stockCode)}&language=id-id`
  const response = await client.get(url)
  if (!response.ok) {
    return ctx.send.json({ error: 'Failed to fetch company profile' }, { status: 502 })
  }

  const data = await response.json()
  cache.set(stockCode, { data, expiresAt: Date.now() + CACHE_TTL_MS })
  return ctx.send.json(data)
}
