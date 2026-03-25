/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Detects: Flat Base, High Tight Flag (HTF), simplified Cup-and-Handle
 * Base Count: number of consolidation phases since start of Stage 2 run
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

interface PatternResult {
  patternType: Types.BasePatternType
  depthPct: number | null
  lengthDays: number | null
}

function detectFlatBase(rows: OhlcEntry[], windowSize = 25): PatternResult {
  if (rows.length < windowSize) {
    return { patternType: 'none', depthPct: null, lengthDays: null }
  }
  const recent = rows.slice(-windowSize)
  const high = Math.max(...recent.map((r) => r.high))
  const low = Math.min(...recent.map((r) => r.low))
  const mid = (high + low) / 2
  if (mid <= 0) {
    return { patternType: 'none', depthPct: null, lengthDays: null }
  }
  const rangePct = ((high - low) / mid) * 100
  if (rangePct > 15) {
    return { patternType: 'none', depthPct: null, lengthDays: null }
  }
  // Volume should be declining: compare last half vs first half
  const half = Math.floor(windowSize / 2)
  const firstHalfVol = recent.slice(0, half).reduce((s, r) => s + r.volume, 0) / half
  const secondHalfVol = recent.slice(half).reduce((s, r) => s + r.volume, 0) / (windowSize - half)
  if (firstHalfVol > 0 && secondHalfVol > firstHalfVol * 0.8) {
    // Volume not declining enough — still count if range is very tight (< 8%)
    if (rangePct > 8) {
      return { patternType: 'none', depthPct: null, lengthDays: null }
    }
  }
  return { patternType: 'flat', depthPct: Utils.round3(rangePct), lengthDays: windowSize }
}

function detectHTF(rows: OhlcEntry[]): PatternResult {
  // High Tight Flag: 100%+ gain in 20-40 days, then consolidation 10-25% for 3-5 weeks
  if (rows.length < 55) {
    return { patternType: 'none', depthPct: null, lengthDays: null }
  }
  // Check last 40 days for the "flag pole" (100%+ gain)
  for (let poleLen = 20; poleLen <= 40; poleLen++) {
    if (rows.length < poleLen + 15) {
      continue
    }
    const poleStart = rows.slice(-(poleLen + 15), -15)
    if (poleStart.length === 0) {
      continue
    }
    const startClose = poleStart[0].close
    const peakClose = Math.max(...poleStart.map((r) => r.high))
    if (peakClose / startClose < 2.0) {
      continue
    }

    // Now check consolidation in last 15-25 days
    for (let consLen = 15; consLen <= 25; consLen++) {
      if (rows.length < consLen) {
        continue
      }
      const cons = rows.slice(-consLen)
      const cHigh = Math.max(...cons.map((r) => r.high))
      const cLow = Math.min(...cons.map((r) => r.low))
      if (cHigh <= 0) {
        continue
      }
      const rangePct = ((cHigh - cLow) / cHigh) * 100
      // Must be consolidating below the peak but not too far (max 25% pullback)
      const pullbackFromPeak = ((peakClose - cHigh) / peakClose) * 100
      if (rangePct <= 25 && pullbackFromPeak <= 25) {
        return { patternType: 'htf', depthPct: Utils.round3(rangePct), lengthDays: consLen }
      }
    }
  }
  return { patternType: 'none', depthPct: null, lengthDays: null }
}

function detectCupHandle(rows: OhlcEntry[]): PatternResult {
  // Simplified cup detection: U-shape over 45-90 days
  // Left high → decline 12-35% → recover to within 5% of high → optional handle
  if (rows.length < 45) {
    return { patternType: 'none', depthPct: null, lengthDays: null }
  }
  for (let cupLen = 45; cupLen <= Math.min(90, rows.length - 5); cupLen++) {
    const cup = rows.slice(-(cupLen + 5), -5)
    if (cup.length < 30) {
      continue
    }
    const leftHigh = Math.max(...cup.slice(0, 10).map((r) => r.high))
    const rightHigh = Math.max(...cup.slice(-10).map((r) => r.high))
    const bottom = Math.min(...cup.map((r) => r.low))
    if (leftHigh <= 0 || bottom <= 0) {
      continue
    }
    const depthPct = ((leftHigh - bottom) / leftHigh) * 100
    if (depthPct < 12 || depthPct > 35) {
      continue
    }
    const recoveryRatio = rightHigh / leftHigh
    if (recoveryRatio < 0.92) {
      continue // must recover to within 8% of left high
    }

    // Handle: last 5 days should be a small pullback
    const handle = rows.slice(-5)
    const handleHigh = Math.max(...handle.map((r) => r.high))
    const handleLow = Math.min(...handle.map((r) => r.low))
    const handleRange = handleHigh > 0 ? ((handleHigh - handleLow) / handleHigh) * 100 : Infinity
    if (handleRange > 12) {
      continue
    }

    return { patternType: 'cup-handle', depthPct: Utils.round3(depthPct), lengthDays: cupLen }
  }
  return { patternType: 'none', depthPct: null, lengthDays: null }
}

function countBases(rows: OhlcEntry[]): number {
  // Simple base count: count distinct tight consolidations (flat base ≤ 15%)
  // that were followed by a breakout to new high
  if (rows.length < 40) {
    return 0
  }
  let bases = 0
  let i = 20
  let prevHigh = Math.max(...rows.slice(0, 20).map((r) => r.high))

  while (i < rows.length - 10) {
    // Look for 15-40 day consolidation
    for (let winLen = 15; winLen <= 40 && i + winLen < rows.length; winLen++) {
      const win = rows.slice(i, i + winLen)
      const wHigh = Math.max(...win.map((r) => r.high))
      const wLow = Math.min(...win.map((r) => r.low))
      const mid = (wHigh + wLow) / 2
      if (mid <= 0) {
        continue
      }
      const rangePct = ((wHigh - wLow) / mid) * 100
      if (rangePct > 15) {
        break // not tight, no base
      }

      // Check if the next candle breaks above the base high
      const afterBase = rows.slice(i + winLen, i + winLen + 10)
      const breakoutHigh = Math.max(...afterBase.map((r) => r.high))
      if (breakoutHigh > wHigh && breakoutHigh > prevHigh) {
        bases++
        prevHigh = breakoutHigh
        i = i + winLen + 1
        break
      }
    }
    i++
  }
  return bases
}

export async function GET(ctx: Context) {
  const patternFilter = Utils.queryString(ctx.query('pattern'))

  const latestRows = await Database.select({ date: Schemas.summary.date })
    .from(Schemas.summary)
    .orderBy(desc(Schemas.summary.date))
    .limit(1)
  const latestDate = latestRows[0]?.date
  if (latestDate == null) {
    const empty: Types.BasePatternsResponse = { date: 0, totalCount: 0, data: [] }
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

  // RS ranks
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

  const results: Types.BasePatternRow[] = []

  for (const [code, rows] of ohlcByCode.entries()) {
    if (rows.length < 50) {
      continue
    }

    // Detect patterns (priority: HTF > Cup-Handle > Flat)
    let pattern: PatternResult = detectHTF(rows)
    if (pattern.patternType === 'none') {
      pattern = detectCupHandle(rows)
    }
    if (pattern.patternType === 'none') {
      pattern = detectFlatBase(rows)
    }

    if (patternFilter != null && patternFilter !== '' && patternFilter !== 'all') {
      if (pattern.patternType !== patternFilter) {
        continue
      }
    } else {
      if (pattern.patternType === 'none') {
        continue
      }
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
    const ma200Trending = ma200SlopePct != null && ma200SlopePct > 0
    const last252 = rows.slice(Math.max(0, rows.length - 252))
    const high52w = Math.max(...last252.map((r) => r.high))
    const low52w = Math.min(...last252.map((r) => r.low))
    const pctFrom52wHigh = high52w > 0 ? ((price - high52w) / high52w) * 100 : null
    const pctFrom52wLow = low52w > 0 ? ((price - low52w) / low52w) * 100 : null
    const rsRank = rsRankByCode.get(code) ?? null
    const trendCriteriaCount = [
      ma200 != null ? price > (ma150 ?? 0) && price > ma200 : price > (ma150 ?? 0),
      ma200 != null ? (ma150 ?? 0) > ma200 : false,
      ma200Trending,
      ma200 != null ? ma50 > (ma150 ?? 0) && ma50 > ma200 : ma50 > (ma150 ?? 0),
      price > ma50,
      pctFrom52wLow != null ? pctFrom52wLow >= 30 : false,
      pctFrom52wHigh != null ? pctFrom52wHigh >= -25 : false,
      (rsRank ?? 0) >= 70
    ].filter(Boolean).length

    const baseCount = countBases(rows)

    const info = screenerMap.get(code)
    results.push({
      code,
      name: info?.name ?? null,
      sector: info?.sector ?? null,
      price: Utils.round3(price),
      patternType: pattern.patternType,
      baseCount,
      baseDepthPct: pattern.depthPct,
      baseLengthDays: pattern.lengthDays,
      rsRank,
      stage,
      trendCriteriaCount,
      pctFrom52wHigh: pctFrom52wHigh != null ? Utils.round3(pctFrom52wHigh) : null
    })
  }

  // Sort: HTF first, then cup-handle, then flat; within same pattern by RS rank
  const patternOrder: Record<Types.BasePatternType, number> = {
    htf: 0,
    'cup-handle': 1,
    flat: 2,
    none: 3
  }
  results.sort((a, b) => {
    const po = patternOrder[a.patternType] - patternOrder[b.patternType]
    if (po !== 0) {
      return po
    }
    return (b.rsRank ?? 0) - (a.rsRank ?? 0)
  })

  const response: Types.BasePatternsResponse = {
    date: dateRef,
    totalCount: results.length,
    data: results
  }
  return ctx.send.json(response)
}
