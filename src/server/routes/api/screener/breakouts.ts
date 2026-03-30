/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Breakout & Approaching Pivot screener.
 * Detects: High Tight Flag, VCP, Flat Base — then checks price vs pivot + volume surge.
 */

import type { Context } from '@neabyte/deserve'
import { and, asc, desc, gte, lte } from 'drizzle-orm'
import Database from '@app/server/Database.ts'
import {
  calcMA,
  calcMA200SlopePct,
  determineStageConfirmed,
  returnPct
} from '@app/server/StageAnalysisHelper.ts'
import Utils from '@app/server/Utils.ts'
import * as Schemas from '@app/server/schemas/index.ts'
import type * as Types from '@app/server/Types.ts'

// ─── Helpers ────────────────────────────────────────────────────────────────

function calcATR(entries: { high: number; low: number; close: number }[]): number | null {
  if (entries.length < 15) {
    return null
  }
  const trs: number[] = []
  for (let i = 1; i < entries.length; i++) {
    const h = entries[i]!.high, l = entries[i]!.low, pc = entries[i - 1]!.close
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)))
  }
  if (trs.length < 14) {
    return null
  }
  return trs.slice(-14).reduce((a, b) => a + b, 0) / 14
}

function calcBBWidth(closes: number[]): number | null {
  if (closes.length < 20) {
    return null
  }
  const slice = closes.slice(-20)
  const mean = slice.reduce((a, b) => a + b, 0) / 20
  const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / 20
  const std = Math.sqrt(variance)
  return mean > 0 ? (4 * std / mean) * 100 : null
}

function isBBSqueeze(closes: number[], lookback = 126): boolean {
  if (closes.length < lookback + 20) {
    return false
  }
  const cur = calcBBWidth(closes)
  if (cur == null) {
    return false
  }
  let minW = Infinity
  for (let i = 20; i <= lookback; i++) {
    const w = calcBBWidth(closes.slice(0, closes.length - i + 20))
    if (w != null && w < minW) {
      minW = w
    }
  }
  return cur <= minW
}

function detectBreakout(
  entries: { date: number; close: number; high: number; low: number; volume: number }[],
  patternType: string
): { signal: 'breakout' | 'approaching' | 'none'; pivot: number | null; volRatio: number | null } {
  const closes = entries.map((e) => e.close)
  const highs = entries.map((e) => e.high)
  const price = closes[closes.length - 1]!
  // pivot lookback by pattern
  let lookback = 25
  if (patternType === 'htf') {
    lookback = 15
  } else if (patternType === 'cup-handle') {
    lookback = 5
  } else if (patternType === 'vcp') {
    lookback = 20
  }
  const pivot = Math.max(...highs.slice(-lookback))
  // vol ratio
  const todayVol = entries[entries.length - 1]!.volume
  const avg50 = entries.slice(-51, -1).reduce((s, e) => s + e.volume, 0) /
    Math.min(50, entries.length - 1)
  const volRatio = avg50 > 0 ? todayVol / avg50 : null
  if (price > pivot && volRatio != null && volRatio > 1.5) {
    return { signal: 'breakout', pivot, volRatio }
  }
  if (price >= pivot * 0.97 && price <= pivot) {
    return { signal: 'approaching', pivot, volRatio: null }
  }
  return { signal: 'none', pivot, volRatio: null }
}

function detectPatternType(
  highs: number[],
  lows: number[],
  entries: { close: number; high: number; low: number; volume: number }[]
): string {
  // HTF
  if (entries.length >= 55) {
    const poleStart = entries[entries.length - 40]!.close
    const poleHigh = Math.max(...highs.slice(-40, -15))
    if (poleStart > 0 && poleHigh / poleStart >= 1.80) {
      const flagH = Math.max(...highs.slice(-15)), flagL = Math.min(...lows.slice(-15))
      if (flagH > 0 && (flagH - flagL) / flagH <= 0.25) {
        return 'htf'
      }
    }
  }
  // VCP: 3x20 windows
  if (entries.length >= 60) {
    const wins = [entries.slice(-60, -40), entries.slice(-40, -20), entries.slice(-20)]
    const analyzed = wins.map((w) => {
      const mh = Math.max(...w.map((r) => r.high)), ml = Math.min(...w.map((r) => r.low))
      const mid = (mh + ml) / 2
      return {
        range: mid > 0 ? (mh - ml) / mid * 100 : 0,
        avgVol: w.reduce((s, r) => s + r.volume, 0) / w.length
      }
    })
    let contractions = 0
    for (let i = 1; i < analyzed.length; i++) {
      if (analyzed[i]!.range < analyzed[i - 1]!.range * 0.85) {
        contractions++
      }
    }
    const volDry = analyzed[2]!.avgVol < analyzed[0]!.avgVol * 0.75
    const last252 = entries.slice(-252)
    const h52w = Math.max(...last252.map((r) => r.high))
    const near = h52w > 0 && entries[entries.length - 1]!.close >= h52w * 0.80
    if (contractions >= 1 && volDry && near) {
      return 'vcp'
    }
  }
  // Flat base
  if (entries.length >= 25) {
    const last25H = highs.slice(-25), last25L = lows.slice(-25)
    const rng = Math.max(...last25H) - Math.min(...last25L)
    const mid = (Math.max(...last25H) + Math.min(...last25L)) / 2
    if (mid > 0 && rng / mid <= 0.15) {
      return 'flat'
    }
  }
  return 'none'
}

// ─── GET Handler ─────────────────────────────────────────────────────────────

export async function GET(ctx: Context) {
  const filterParam = Utils.queryString(ctx.query('filter'))

  const latestRows = await Database.select({ date: Schemas.summary.date })
    .from(Schemas.summary)
    .orderBy(desc(Schemas.summary.date))
    .limit(1)
  const latestDate = latestRows[0]?.date
  if (latestDate == null) {
    const empty: Types.BreakoutsResponse = { date: 0, totalCount: 0, data: [] }
    return ctx.send.json(empty)
  }
  const dateRef = Number(latestDate)
  const dateStart = Utils.addDaysToDateInt(dateRef, -420)

  // ── OHLCV data ───────────────────────────────────────────────────────────
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

  type OhlcEntry = { date: number; close: number; high: number; low: number; volume: number }
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

  // ── Screener data ────────────────────────────────────────────────────────
  const screenerRows = await Database.select({
    code: Schemas.screener.code,
    name: Schemas.screener.name,
    sector: Schemas.screener.sector,
    marketCapital: Schemas.screener.marketCapital,
    notation: Schemas.screener.notation
  }).from(Schemas.screener)

  type ScRow = {
    name: string | null
    sector: string | null
    marketCapital: number | null
    notation: string | null
  }
  const screenerMap = new Map<string, ScRow>()
  for (const row of screenerRows) {
    screenerMap.set(row.code, {
      name: row.name ?? null,
      sector: row.sector ?? null,
      marketCapital: row.marketCapital != null ? Number(row.marketCapital) : null,
      notation: row.notation ?? null
    })
  }

  // ── RS Ranks ─────────────────────────────────────────────────────────────
  type RsEntry = { code: string; rsScore: number }
  const rsEntries: RsEntry[] = []
  for (const [code, rows] of ohlcByCode.entries()) {
    if (rows.length < 20) {
      continue
    }
    const price = rows[rows.length - 1]!.close
    const r3m = rows.length >= 63
      ? returnPct(price, rows[rows.length - 63]!.close)
      : returnPct(price, rows[0]!.close)
    if (r3m == null) {
      continue
    }
    const r6m = rows.length >= 126 ? returnPct(price, rows[rows.length - 126]!.close) : null
    const r9m = rows.length >= 189 ? returnPct(price, rows[rows.length - 189]!.close) : null
    const r12m = rows.length >= 252 ? returnPct(price, rows[rows.length - 252]!.close) : null
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

  // ── Per-stock analysis ───────────────────────────────────────────────────
  const results: Types.BreakoutRow[] = []

  for (const [code, rows] of ohlcByCode.entries()) {
    if (rows.length < 50) {
      continue
    }

    // Gorengan filter
    const sc = screenerMap.get(code)
    if (sc?.notation === 'X') {
      continue
    }
    if (sc?.marketCapital != null && sc.marketCapital < 100_000_000_000) {
      continue
    }

    const closes = rows.map((r) => r.close)
    const highs = rows.map((r) => r.high)
    const lows = rows.map((r) => r.low)
    const price = closes[closes.length - 1]!

    // Stage filter
    const stage = determineStageConfirmed(closes)
    if (stage === 3 || stage === 4) {
      continue
    }

    // ATR
    const atr = calcATR(rows)
    const atrPct = atr != null && price > 0 ? atr / price * 100 : null

    // BB
    const bbWidth = calcBBWidth(closes)
    const bbSqueeze = isBBSqueeze(closes)

    // Pattern type
    const patternType = detectPatternType(highs, lows, rows)

    // Breakout signal
    const { signal: breakoutSignal, pivot, volRatio: breakoutVolRatio } = detectBreakout(
      rows,
      patternType
    )

    // Skip 'none' unless filter=all
    if (breakoutSignal === 'none' && filterParam !== 'all') {
      continue
    }

    // VCP detection (same as VCP pattern)
    const vcpIsVcp = patternType === 'vcp'

    // Shakeout: last 5 days any day where low < ma50 but close > ma50
    const ma50 = calcMA(closes, 50)
    let shakeoutDetected = false
    if (ma50 != null) {
      const last5 = rows.slice(-5)
      for (const r of last5) {
        if (r.low < ma50 && r.close > ma50) {
          shakeoutDetected = true
          break
        }
      }
    }

    // pctFrom52wHigh
    const last252 = rows.slice(Math.max(0, rows.length - 252))
    const high52w = Math.max(...last252.map((r) => r.high))
    const pctFrom52wHigh = high52w > 0 ? ((price - high52w) / high52w) * 100 : null

    // trendCriteriaCount
    const ma150 = calcMA(closes, 150)
    const ma200 = calcMA(closes, 200)
    const ma200SlopePct = calcMA200SlopePct(closes)
    const pctFrom52wLow = (() => {
      const low52w = Math.min(...last252.map((r) => r.low))
      return low52w > 0 ? ((price - low52w) / low52w) * 100 : null
    })()
    const ma200Trending = ma200SlopePct != null && ma200SlopePct > 0
    const trendCriteriaCount = [
      ma200 != null ? price > (ma150 ?? 0) && price > ma200 : price > (ma150 ?? 0),
      ma200 != null && ma150 != null ? ma150 > ma200 : false,
      ma200Trending,
      ma200 != null && ma150 != null && ma50 != null
        ? ma50 > ma150 && ma50 > ma200
        : ma50 != null && ma150 != null
        ? ma50 > ma150
        : false,
      ma50 != null ? price > ma50 : false,
      pctFrom52wLow != null ? pctFrom52wLow >= 30 : false,
      pctFrom52wHigh != null ? pctFrom52wHigh >= -25 : false,
      (rsRankByCode.get(code) ?? 0) >= 70
    ].filter(Boolean).length

    const rsRank = rsRankByCode.get(code) ?? 0

    results.push({
      code,
      name: sc?.name ?? null,
      sector: sc?.sector ?? null,
      price: Utils.round3(price),
      stage,
      rsRank,
      breakoutSignal,
      pivotPoint: pivot != null ? Utils.round3(pivot) : null,
      breakoutVolRatio: breakoutVolRatio != null ? Utils.round3(breakoutVolRatio) : null,
      atr: atr != null ? Utils.round3(atr) : null,
      atrPct: atrPct != null ? Utils.round3(atrPct) : null,
      bbSqueeze,
      bbWidth: bbWidth != null ? Utils.round3(bbWidth) : null,
      vcpIsVcp,
      shakeoutDetected,
      patternType,
      trendCriteriaCount,
      pctFrom52wHigh: pctFrom52wHigh != null ? Utils.round3(pctFrom52wHigh) : null
    })
  }

  // Sort: breakout first, then approaching; within each group by rsRank desc
  results.sort((a, b) => {
    const signalOrder = (s: string) => s === 'breakout' ? 0 : s === 'approaching' ? 1 : 2
    const so = signalOrder(a.breakoutSignal) - signalOrder(b.breakoutSignal)
    if (so !== 0) {
      return so
    }
    return b.rsRank - a.rsRank
  })

  const response: Types.BreakoutsResponse = {
    date: dateRef,
    totalCount: results.length,
    data: results
  }
  return ctx.send.json(response)
}
