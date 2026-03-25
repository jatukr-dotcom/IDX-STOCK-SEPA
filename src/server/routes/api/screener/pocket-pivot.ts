/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
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

function determineStage(
  price: number,
  ma50: number | null,
  ma150: number | null,
  ma200: number | null,
  ma200SlopePct: number | null
): Types.StageNumber {
  if (ma200 == null) {
    if (ma50 != null && price > ma50 && (ma150 == null || ma50 > ma150)) {
      return 2
    }
    return 1
  }
  const ma200up = ma200SlopePct != null && ma200SlopePct > 0
  if (ma50 != null && ma150 != null && price > ma50 && ma50 > ma150 && ma150 > ma200 && ma200up) {
    return 2
  }
  if (price < ma200 && !ma200up) {
    return 4
  }
  if (ma50 != null && (price < ma50 || (ma150 != null && ma150 < ma200))) {
    return 3
  }
  return 1
}

type OhlcEntry = { date: number; close: number; high: number; low: number; volume: number }

function findPocketPivots(
  rows: OhlcEntry[],
  lookbackDays: number
): {
  date: number
  volume: number
  maxDownVol10d: number
  ma10: number | null
  pctAboveMa10: number | null
} | null {
  if (rows.length < 15) {
    return null
  }

  // Look back up to lookbackDays for a pocket pivot signal
  const startIdx = Math.max(11, rows.length - lookbackDays)
  for (let i = rows.length - 1; i >= startIdx; i--) {
    const today = rows[i]
    const yesterday = rows[i - 1]
    if (today.close <= yesterday.close) {
      continue // must be up day
    }

    // Max down-day volume in prior 10 sessions
    let maxDownVol = 0
    for (let j = i - 10; j < i; j++) {
      if (j < 1) {
        continue
      }
      if (rows[j].close < rows[j - 1].close) {
        maxDownVol = Math.max(maxDownVol, rows[j].volume)
      }
    }
    if (maxDownVol === 0) {
      continue // no down days to compare
    }
    if (today.volume <= maxDownVol) {
      continue // volume not strong enough
    }

    // Check MA10
    const closesUpToToday = rows.slice(0, i + 1).map((r) => r.close)
    const ma10 = calcMA(closesUpToToday, 10)
    if (ma10 == null) {
      continue
    }
    if (today.close < ma10) {
      continue // must be at or above MA10
    }

    const pctAboveMa10 = ((today.close - ma10) / ma10) * 100
    if (pctAboveMa10 > 5) {
      continue // too extended
    }

    return { date: today.date, volume: today.volume, maxDownVol10d: maxDownVol, ma10, pctAboveMa10 }
  }
  return null
}

export async function GET(ctx: Context) {
  const lookbackStr = Utils.queryString(ctx.query('lookback'))
  const lookbackDays = lookbackStr != null ? Math.min(10, Math.max(1, Number(lookbackStr))) : 5

  const latestRows = await Database.select({ date: Schemas.summary.date })
    .from(Schemas.summary)
    .orderBy(desc(Schemas.summary.date))
    .limit(1)
  const latestDate = latestRows[0]?.date
  if (latestDate == null) {
    const empty: Types.PocketPivotResponse = { date: 0, totalCount: 0, data: [] }
    return ctx.send.json(empty)
  }
  const dateRef = Number(latestDate)
  const dateStart = Utils.addDaysToDateInt(dateRef, -400)

  const summaryRows = await Database.select({
    stockCode: Schemas.summary.stockCode,
    date: Schemas.summary.date,
    priceClose: Schemas.summary.priceClose,
    priceHigh: Schemas.summary.priceHigh,
    priceLow: Schemas.summary.priceLow,
    volume: Schemas.summary.volume
  })
    .from(Schemas.summary)
    .where(and(gte(Schemas.summary.date, dateStart), lte(Schemas.summary.date, dateRef)))
    .orderBy(asc(Schemas.summary.stockCode), asc(Schemas.summary.date))

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
    const volume = row.volume != null && Number.isFinite(Number(row.volume))
      ? Number(row.volume)
      : 0
    const list = ohlcByCode.get(row.stockCode) ?? []
    list.push({ date: Number(row.date), close, high, low, volume })
    ohlcByCode.set(row.stockCode, list)
  }

  const screenerRows = await Database.select({
    code: Schemas.screener.code,
    name: Schemas.screener.name,
    sector: Schemas.screener.sector
  }).from(Schemas.screener)
  const screenerMap = new Map<string, { name: string | null; sector: string | null }>()
  for (const row of screenerRows) {
    screenerMap.set(row.code, { name: row.name ?? null, sector: row.sector ?? null })
  }

  // Compute RS ranks
  type RsEntry = { code: string; rsScore: number }
  const rsEntries: RsEntry[] = []
  for (const [code, rows] of ohlcByCode.entries()) {
    if (rows.length < 20) {
      continue
    }
    const price = rows[rows.length - 1].close
    const r3m = rows.length >= 63
      ? returnPct(price, rows[rows.length - 63].close)
      : returnPct(price, rows[0].close)
    if (r3m == null) {
      continue
    }
    const r6m = rows.length >= 126 ? returnPct(price, rows[rows.length - 126].close) : null
    const r9m = rows.length >= 189 ? returnPct(price, rows[rows.length - 189].close) : null
    const r12m = rows.length >= 252 ? returnPct(price, rows[rows.length - 252].close) : null
    let rsScore = r3m * 0.4
    let w = 0.4
    if (r6m != null) {
      rsScore += r6m * 0.2
      w += 0.2
    }
    if (r9m != null) {
      rsScore += r9m * 0.2
      w += 0.2
    }
    if (r12m != null) {
      rsScore += r12m * 0.2
      w += 0.2
    }
    if (w < 1) {
      rsScore = rsScore / w
    }
    rsEntries.push({ code, rsScore })
  }
  rsEntries.sort((a, b) => a.rsScore - b.rsScore)
  const rsTotal = rsEntries.length
  const rsRankByCode = new Map<string, number>()
  rsEntries.forEach(({ code }, idx) => {
    rsRankByCode.set(code, Math.max(1, Math.round(((idx + 1) / rsTotal) * 99)))
  })

  const results: Types.PocketPivotRow[] = []

  for (const [code, rows] of ohlcByCode.entries()) {
    if (rows.length < 50) {
      continue
    }

    const pivot = findPocketPivots(rows, lookbackDays)
    if (pivot == null) {
      continue
    }

    const closes = rows.map((r) => r.close)
    const price = closes[closes.length - 1]
    const ma50 = calcMA(closes, 50)
    const ma150 = calcMA(closes, 150)
    const ma200 = calcMA(closes, 200)
    if (ma50 == null) {
      continue
    }

    let ma200SlopePct: number | null = null
    if (ma200 != null && closes.length >= 222) {
      const olderCloses = closes.slice(0, closes.length - 22)
      const ma200older = calcMA(olderCloses, 200)
      if (ma200older != null && ma200older > 0) {
        ma200SlopePct = ((ma200 - ma200older) / ma200older) * 100
      }
    }
    const stage = determineStage(price, ma50, ma150, ma200, ma200SlopePct)

    // Trend criteria count
    const ma200Trending = ma200SlopePct != null && ma200SlopePct > 0
    const last252 = rows.slice(Math.max(0, rows.length - 252))
    const high52w = Math.max(...last252.map((r) => r.high))
    const low52w = Math.min(...last252.map((r) => r.low))
    const pctFrom52wHigh = high52w > 0 ? ((price - high52w) / high52w) * 100 : null
    const pctFrom52wLow = low52w > 0 ? ((price - low52w) / low52w) * 100 : null
    const rsRank = rsRankByCode.get(code) ?? 0
    const trendCriteriaCount = [
      ma200 != null ? price > (ma150 ?? 0) && price > ma200 : price > (ma150 ?? 0),
      ma200 != null ? (ma150 ?? 0) > ma200 : false,
      ma200Trending,
      ma200 != null ? ma50 > (ma150 ?? 0) && ma50 > ma200 : ma50 > (ma150 ?? 0),
      price > ma50,
      pctFrom52wLow != null ? pctFrom52wLow >= 30 : false,
      pctFrom52wHigh != null ? pctFrom52wHigh >= -25 : false,
      rsRank >= 70
    ].filter(Boolean).length

    // Only include Stage 2 or 1 stocks (quality filter)
    if (stage === 4) {
      continue
    }

    const info = screenerMap.get(code)
    results.push({
      code,
      name: info?.name ?? null,
      sector: info?.sector ?? null,
      price: Utils.round3(price),
      pivotDate: pivot.date,
      pivotVolume: pivot.volume,
      maxDownVol10d: pivot.maxDownVol10d,
      ma10: pivot.ma10 != null ? Utils.round3(pivot.ma10) : null,
      pctAboveMa10: pivot.pctAboveMa10 != null ? Utils.round3(pivot.pctAboveMa10) : null,
      rsRank,
      trendCriteriaCount,
      stage
    })
  }

  // Sort by trend criteria count then RS rank
  results.sort((a, b) => b.trendCriteriaCount - a.trendCriteriaCount || b.rsRank - a.rsRank)

  const response: Types.PocketPivotResponse = {
    date: dateRef,
    totalCount: results.length,
    data: results
  }
  return ctx.send.json(response)
}
