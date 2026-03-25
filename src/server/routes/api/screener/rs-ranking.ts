/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 */

import type { Context } from '@neabyte/deserve'
import { and, asc, desc, gte, lte } from 'drizzle-orm'
import Database from '@app/server/Database.ts'
import Utils from '@app/server/Utils.ts'
import * as Schemas from '@app/server/schemas/index.ts'
import type * as Types from '@app/server/Types.ts'

function calcMA(prices: number[], period: number): number | null {
  if (prices.length < period) {
    return null
  }
  const slice = prices.slice(prices.length - period)
  return slice.reduce((a, b) => a + b, 0) / period
}

function returnPct(current: number, past: number): number | null {
  if (past <= 0 || !Number.isFinite(past) || !Number.isFinite(current)) {
    return null
  }
  return ((current - past) / past) * 100
}

export async function GET(ctx: Context) {
  const latestRows = await Database.select({ date: Schemas.summary.date })
    .from(Schemas.summary)
    .orderBy(desc(Schemas.summary.date))
    .limit(1)
  const latestDate = latestRows[0]?.date
  if (latestDate == null) {
    const empty: Types.RsRankingResponse = { date: 0, totalCount: 0, data: [] }
    return ctx.send.json(empty)
  }
  const dateRef = Number(latestDate)
  // Fetch ~400 calendar days (~270+ trading days) to cover 12-month periods
  const dateStart = Utils.addDaysToDateInt(dateRef, -400)

  const summaryRows = await Database.select({
    stockCode: Schemas.summary.stockCode,
    date: Schemas.summary.date,
    priceClose: Schemas.summary.priceClose,
    priceHigh: Schemas.summary.priceHigh,
    priceLow: Schemas.summary.priceLow
  })
    .from(Schemas.summary)
    .where(and(gte(Schemas.summary.date, dateStart), lte(Schemas.summary.date, dateRef)))
    .orderBy(asc(Schemas.summary.stockCode), asc(Schemas.summary.date))

  type OhlcEntry = { date: number; close: number; high: number; low: number }
  const ohlcByCode = new Map<string, OhlcEntry[]>()
  for (const row of summaryRows) {
    const close = row.priceClose != null && Number.isFinite(Number(row.priceClose))
      ? Number(row.priceClose)
      : null
    if (close == null || close <= 0) {
      continue
    }
    const high = row.priceHigh != null && Number.isFinite(Number(row.priceHigh))
      ? Number(row.priceHigh)
      : close
    const low = row.priceLow != null && Number.isFinite(Number(row.priceLow))
      ? Number(row.priceLow)
      : close
    const list = ohlcByCode.get(row.stockCode) ?? []
    list.push({ date: Number(row.date), close, high, low })
    ohlcByCode.set(row.stockCode, list)
  }

  // Screener for names and sectors
  const screenerRows = await Database.select({
    code: Schemas.screener.code,
    name: Schemas.screener.name,
    sector: Schemas.screener.sector
  }).from(Schemas.screener)

  const screenerMap = new Map<string, { name: string | null; sector: string | null }>()
  for (const row of screenerRows) {
    screenerMap.set(row.code, { name: row.name ?? null, sector: row.sector ?? null })
  }

  // Calculate RS Score using Minervini weighted formula:
  // RS = 40% * 3m_return + 20% * 6m_return + 20% * 9m_return + 20% * 12m_return
  // Trading days: 3m=63, 6m=126, 9m=189, 12m=252
  type RsEntry = {
    code: string
    price: number
    rsScore: number
    return3m: number | null
    return6m: number | null
    return9m: number | null
    return12m: number | null
    trendCriteriaCount: number
  }

  const rsEntries: RsEntry[] = []

  for (const [code, rows] of ohlcByCode.entries()) {
    if (rows.length < 20) {
      continue
    }
    const price = rows[rows.length - 1].close

    const r3m = rows.length >= 63
      ? returnPct(price, rows[rows.length - 63].close)
      : returnPct(price, rows[0].close)
    const r6m = rows.length >= 126
      ? returnPct(price, rows[rows.length - 126].close)
      : returnPct(price, rows[0].close)
    const r9m = rows.length >= 189 ? returnPct(price, rows[rows.length - 189].close) : null
    const r12m = rows.length >= 252 ? returnPct(price, rows[rows.length - 252].close) : null

    // Weighted RS Score
    let rsScore = 0
    let weightUsed = 0
    if (r3m != null) {
      rsScore += r3m * 0.4
      weightUsed += 0.4
    }
    if (r6m != null) {
      rsScore += r6m * 0.2
      weightUsed += 0.2
    }
    if (r9m != null) {
      rsScore += r9m * 0.2
      weightUsed += 0.2
    }
    if (r12m != null) {
      rsScore += r12m * 0.2
      weightUsed += 0.2
    }
    if (weightUsed < 0.4) {
      continue // need at least 3m data
    }
    if (weightUsed < 1) {
      rsScore = rsScore / weightUsed // normalise if partial
    }

    // Quick Trend Template criteria count (MA alignment check)
    const closes = rows.map((r) => r.close)
    const ma50 = calcMA(closes, 50)
    const ma150 = calcMA(closes, 150)
    const ma200 = calcMA(closes, 200)
    let trendCriteriaCount = 0
    if (ma50 != null && ma150 != null) {
      if (price > ma150) {
        trendCriteriaCount++
      }
      if (ma200 != null && price > ma200) {
        trendCriteriaCount++
      }
      if (ma200 != null && ma150 > ma200) {
        trendCriteriaCount++
      }
      if (ma50 > ma150) {
        trendCriteriaCount++
      }
      if (price > ma50) {
        trendCriteriaCount++
      }
    }

    rsEntries.push({
      code,
      price: Utils.round3(price),
      rsScore,
      return3m: r3m != null ? Utils.round3(r3m) : null,
      return6m: r6m != null ? Utils.round3(r6m) : null,
      return9m: r9m != null ? Utils.round3(r9m) : null,
      return12m: r12m != null ? Utils.round3(r12m) : null,
      trendCriteriaCount
    })
  }

  // Sort by RS Score and assign percentile rank 1-99
  rsEntries.sort((a, b) => a.rsScore - b.rsScore)
  const total = rsEntries.length

  const results: Types.RsRankingRow[] = rsEntries.map((entry, idx) => {
    const rsRank = total > 1 ? Math.max(1, Math.round(((idx + 1) / total) * 99)) : 99
    const screener = screenerMap.get(entry.code)
    return {
      code: entry.code,
      name: screener?.name ?? null,
      sector: screener?.sector ?? null,
      price: entry.price,
      rsScore: Utils.round3(entry.rsScore),
      rsRank,
      return3m: entry.return3m,
      return6m: entry.return6m,
      return9m: entry.return9m,
      return12m: entry.return12m,
      trendCriteriaCount: entry.trendCriteriaCount
    }
  })

  // Sort descending by RS rank for response
  results.sort((a, b) => b.rsRank - a.rsRank)

  const response: Types.RsRankingResponse = {
    date: dateRef,
    totalCount: results.length,
    data: results
  }
  return ctx.send.json(response)
}
