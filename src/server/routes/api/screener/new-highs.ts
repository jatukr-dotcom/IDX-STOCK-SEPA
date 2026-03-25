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

export async function GET(ctx: Context) {
  const latestRows = await Database.select({ date: Schemas.summary.date })
    .from(Schemas.summary)
    .orderBy(desc(Schemas.summary.date))
    .limit(1)
  const latestDate = latestRows[0]?.date
  if (latestDate == null) {
    const empty: Types.NewHighsResponse = { date: 0, totalCount: 0, data: [] }
    return ctx.send.json(empty)
  }
  const dateRef = Number(latestDate)
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

  // Calculate RS Score for ranking
  const rsScoreByCode = new Map<string, number>()
  for (const [code, rows] of ohlcByCode.entries()) {
    if (rows.length < 20) {
      continue
    }
    const price = rows[rows.length - 1].close
    const r3m = rows.length >= 63
      ? ((price - rows[rows.length - 63].close) / rows[rows.length - 63].close) * 100
      : ((price - rows[0].close) / rows[0].close) * 100
    const r6m = rows.length >= 126
      ? ((price - rows[rows.length - 126].close) / rows[rows.length - 126].close) * 100
      : null
    let rsScore = r3m * 0.4
    let w = 0.4
    if (r6m != null) {
      rsScore += r6m * 0.2
      w += 0.2
    }
    rsScoreByCode.set(code, w > 0 ? rsScore / w : rsScore)
  }

  const rsSorted = [...rsScoreByCode.entries()].sort((a, b) => a[1] - b[1])
  const rsTotal = rsSorted.length
  const rsRankByCode = new Map<string, number>()
  rsSorted.forEach(([code], idx) => {
    rsRankByCode.set(code, Math.max(1, Math.round(((idx + 1) / rsTotal) * 99)))
  })

  // Find stocks near 52-week highs (within 15% of their 52-week high)
  const results: Types.NewHighRow[] = []

  for (const [code, rows] of ohlcByCode.entries()) {
    if (rows.length < 20) {
      continue
    }

    const price = rows[rows.length - 1].close
    const last252 = rows.slice(Math.max(0, rows.length - 252))
    const high52w = Math.max(...last252.map((r) => r.high))
    const low52w = Math.min(...last252.map((r) => r.low))

    const pctFromHigh = high52w > 0 ? ((price - high52w) / high52w) * 100 : null
    const pctFromLow = low52w > 0 ? ((price - low52w) / low52w) * 100 : null

    // Only include stocks within 15% of 52-week high
    if (pctFromHigh == null || pctFromHigh < -15) {
      continue
    }

    // Quick MA alignment count
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

    const rsRank = rsRankByCode.get(code) ?? null
    const screener = screenerMap.get(code)

    results.push({
      code,
      name: screener?.name ?? null,
      sector: screener?.sector ?? null,
      price: Utils.round3(price),
      high52w: Utils.round3(high52w),
      low52w: Utils.round3(low52w),
      pctFrom52wHigh: pctFromHigh != null ? Utils.round3(pctFromHigh) : null,
      pctFrom52wLow: pctFromLow != null ? Utils.round3(pctFromLow) : null,
      rsRank,
      trendCriteriaCount
    })
  }

  // Sort: closest to 52-week high first (highest pctFromHigh descending, i.e. least negative)
  results.sort((a, b) => {
    const aHigh = a.pctFrom52wHigh ?? -999
    const bHigh = b.pctFrom52wHigh ?? -999
    return bHigh - aHigh
  })

  const response: Types.NewHighsResponse = {
    date: dateRef,
    totalCount: results.length,
    data: results
  }
  return ctx.send.json(response)
}
