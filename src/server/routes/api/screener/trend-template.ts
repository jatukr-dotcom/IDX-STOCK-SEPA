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
    const empty: Types.TrendTemplateResponse = { date: 0, totalCount: 0, data: [] }
    return ctx.send.json(empty)
  }
  const dateRef = Number(latestDate)
  // Fetch ~400 calendar days to cover 200+ trading days
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

  // Get screener data for names and sectors
  const screenerRows = await Database.select({
    code: Schemas.screener.code,
    name: Schemas.screener.name,
    sector: Schemas.screener.sector
  }).from(Schemas.screener)

  const screenerMap = new Map<string, { name: string | null; sector: string | null }>()
  for (const row of screenerRows) {
    screenerMap.set(row.code, { name: row.name ?? null, sector: row.sector ?? null })
  }

  // Calculate RS Score for each stock using 6-month (~126 trading days) return
  const rsScoreByCode = new Map<string, number>()
  for (const [code, rows] of ohlcByCode.entries()) {
    if (rows.length < 60) {
      continue
    }
    const last = rows[rows.length - 1]!.close
    const sixMonthAgoClose = rows.length >= 126 ? rows[rows.length - 126]!.close : rows[0]!.close
    if (sixMonthAgoClose > 0) {
      rsScoreByCode.set(code, ((last - sixMonthAgoClose) / sixMonthAgoClose) * 100)
    }
  }

  // Rank stocks by RS Score => percentile 1-99
  const rsScoresSorted = [...rsScoreByCode.entries()].sort((a, b) => a[1] - b[1])
  const rsRankByCode = new Map<string, number>()
  const totalRanked = rsScoresSorted.length
  rsScoresSorted.forEach(([code], idx) => {
    const rank = totalRanked > 1 ? Math.round(((idx + 1) / totalRanked) * 99) : 99
    rsRankByCode.set(code, Math.max(1, rank))
  })

  // Check Trend Template criteria for each stock
  const results: Types.TrendTemplateRow[] = []

  for (const [code, rows] of ohlcByCode.entries()) {
    if (rows.length < 50) {
      continue
    }

    const closes = rows.map((r) => r.close)
    const price = closes[closes.length - 1]!

    const ma50 = calcMA(closes, 50)
    const ma150 = calcMA(closes, 150)
    const ma200 = calcMA(closes, 200)

    if (ma50 == null || ma150 == null) {
      continue
    }

    // 52-week high/low from last 252 trading days
    const last252 = rows.slice(Math.max(0, rows.length - 252))
    const high52w = Math.max(...last252.map((r) => r.high))
    const low52w = Math.min(...last252.map((r) => r.low))

    // MA200 trend: current MA200 > MA200 from 22 trading days ago
    let ma200Trending = false
    if (ma200 != null && closes.length >= 222) {
      const olderCloses = closes.slice(0, closes.length - 22)
      const ma200older = calcMA(olderCloses, 200)
      if (ma200older != null) {
        ma200Trending = ma200 > ma200older
      }
    }

    const rsRank = rsRankByCode.get(code) ?? null
    const pctFrom52wLow = low52w > 0 ? ((price - low52w) / low52w) * 100 : null
    const pctFrom52wHigh = high52w > 0 ? ((price - high52w) / high52w) * 100 : null

    const criteria: Types.TrendTemplateCriteria = {
      // C1: Price > MA150 AND price > MA200
      aboveMa150Ma200: ma200 != null ? price > ma150 && price > ma200 : price > ma150,
      // C2: MA150 > MA200
      ma150AboveMa200: ma200 != null ? ma150 > ma200 : false,
      // C3: MA200 slope positive (trending up 1 month)
      ma200Trending,
      // C4: MA50 > MA150 AND MA50 > MA200
      ma50AboveMa150Ma200: ma200 != null ? ma50 > ma150 && ma50 > ma200 : ma50 > ma150,
      // C5: Price > MA50
      aboveMa50: price > ma50,
      // C6: Price >= 30% above 52-week low
      above52wLowBy30Pct: pctFrom52wLow != null ? pctFrom52wLow >= 30 : false,
      // C7: Price within 25% of 52-week high
      within25PctOf52wHigh: pctFrom52wHigh != null ? pctFrom52wHigh >= -25 : false,
      // C8: RS Rank >= 70
      rsRank70: rsRank != null ? rsRank >= 70 : false
    }

    const criteriaCount = Object.values(criteria).filter(Boolean).length
    const screener = screenerMap.get(code)

    results.push({
      code,
      name: screener?.name ?? null,
      sector: screener?.sector ?? null,
      price: Utils.round3(price),
      ma50: Utils.round3(ma50),
      ma150: Utils.round3(ma150),
      ma200: ma200 != null ? Utils.round3(ma200) : null,
      low52w: Utils.round3(low52w),
      high52w: Utils.round3(high52w),
      criteriaCount,
      criteria,
      rsRank,
      pctFrom52wLow: pctFrom52wLow != null ? Utils.round3(pctFrom52wLow) : null,
      pctFrom52wHigh: pctFrom52wHigh != null ? Utils.round3(pctFrom52wHigh) : null
    })
  }

  // Sort: most criteria first, then by RS rank descending
  results.sort((a, b) => {
    if (b.criteriaCount !== a.criteriaCount) {
      return b.criteriaCount - a.criteriaCount
    }
    return (b.rsRank ?? 0) - (a.rsRank ?? 0)
  })

  const response: Types.TrendTemplateResponse = {
    date: dateRef,
    totalCount: results.length,
    data: results
  }
  return ctx.send.json(response)
}
