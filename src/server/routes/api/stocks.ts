/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * GET /api/stocks — paginated list of all stocks with composite score.
 * Query params: limit, offset, search (code/name/sector), sector
 */

import type { Context } from '@neabyte/deserve'
import Database from '@app/server/Database.ts'
import Utils from '@app/server/Utils.ts'
import * as Schemas from '@app/server/schemas/index.ts'
import * as Services from '@app/server/services/index.ts'
import type * as Types from '@app/server/Types.ts'

export async function GET(ctx: Context) {
  const { limit, offset } = Utils.parseLimitOffset(
    Utils.queryString(ctx.query('limit')),
    Utils.queryString(ctx.query('offset'))
  )
  const search = Utils.queryString(ctx.query('search'))?.trim().toLowerCase() ?? ''
  const sectorFilter = Utils.queryString(ctx.query('sector'))?.trim() ?? ''

  const screenerRows = await Database.select({
    code: Schemas.screener.code,
    name: Schemas.screener.name,
    sector: Schemas.screener.sector,
    industry: Schemas.screener.industry,
    per: Schemas.screener.per,
    pbv: Schemas.screener.pbv,
    roa: Schemas.screener.roa,
    roe: Schemas.screener.roe,
    der: Schemas.screener.der,
    week26PC: Schemas.screener.week26PC,
    week52PC: Schemas.screener.week52PC
  }).from(Schemas.screener)

  // Client-side filter (search & sector) — screener table is small enough
  let filtered = screenerRows
  if (sectorFilter !== '') {
    filtered = filtered.filter((r) =>
      r.sector?.toLowerCase() === sectorFilter.toLowerCase()
    )
  }
  if (search !== '') {
    filtered = filtered.filter((r) =>
      r.code.toLowerCase().includes(search) ||
      (r.name?.toLowerCase().includes(search) ?? false) ||
      (r.sector?.toLowerCase().includes(search) ?? false) ||
      (r.industry?.toLowerCase().includes(search) ?? false)
    )
  }

  // Compute composite scores for filtered set (rank against ALL stocks for consistency)
  const allForScore: Types.ScreenerRow[] = screenerRows.map((row) => ({
    code: row.code,
    name: row.name,
    sector: row.sector,
    per: row.per,
    pbv: row.pbv,
    roa: row.roa,
    roe: row.roe,
    der: row.der,
    week26PC: row.week26PC,
    week52PC: row.week52PC
  }))
  const ranked = Services.Composite.computeRanked(allForScore)
  const scoreMap = new Map<string, { compositeScore: number; rank: number }>()
  for (const r of ranked) {
    scoreMap.set(r.code, { compositeScore: r.compositeScore, rank: r.rank })
  }

  // Sort filtered by composite score descending
  const sorted = filtered.slice().sort((a, b) => {
    const sa = scoreMap.get(a.code)?.compositeScore ?? 0
    const sb = scoreMap.get(b.code)?.compositeScore ?? 0
    return sb - sa
  })

  const totalCount = sorted.length
  const page = sorted.slice(offset, offset + limit)

  const data: Types.StockListItem[] = page.map((row) => {
    const s = scoreMap.get(row.code)
    return {
      code: row.code,
      name: row.name,
      sector: row.sector,
      industry: row.industry ?? null,
      compositeScore: s?.compositeScore ?? 0,
      rank: s?.rank ?? 0,
      per: row.per,
      roe: row.roe,
      der: row.der
    }
  })

  const response: Types.StockListResponse = { totalCount, limit, offset, data }
  return ctx.send.json(response)
}
