/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Power Play: range < 3% for 3-5 days, volume dried up < 50% of 20d avg, in Stage 2
 * Low Cheat: range < 5% for 5-10 days, price near base low (within 3%)
 */

import type { Context } from '@neabyte/deserve'
import { and, asc, desc, gte, lte } from 'drizzle-orm'
import Database from '@app/server/Database.ts'
import Utils from '@app/server/Utils.ts'
import * as Schemas from '@app/server/schemas/index.ts'
import type * as Types from '@app/server/Types.ts'

function calcMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null
  const slice = prices.slice(prices.length - period)
  return slice.reduce((a, b) => a + b, 0) / period
}

function returnPct(current: number, past: number): number | null {
  if (past <= 0 || !Number.isFinite(past) || !Number.isFinite(current)) return null
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
    if (ma50 != null && price > ma50 && (ma150 == null || ma50 > ma150)) return 2
    return 1
  }
  const ma200up = ma200SlopePct != null && ma200SlopePct > 0
  if (ma50 != null && ma150 != null && price > ma50 && ma50 > ma150 && ma150 > ma200 && ma200up) return 2
  if (price < ma200 && !ma200up) return 4
  if (ma50 != null && (price < ma50 || (ma150 != null && ma150 < ma200))) return 3
  return 1
}

type OhlcEntry = { date: number; close: number; high: number; low: number; volume: number }

interface SetupResult {
  setupType: Types.PowerPlaySetupType
  tightRangePct: number | null
  consolidationDays: number
  volumeDryUpPct: number | null
  nearBreakout: boolean
}

function detectSetup(rows: OhlcEntry[]): SetupResult {
  const none: SetupResult = { setupType: 'none', tightRangePct: null, consolidationDays: 0, volumeDryUpPct: null, nearBreakout: false }
  if (rows.length < 30) return none

  // Prior 20-day avg volume (before the consolidation window)
  function avgVol(slice: OhlcEntry[]): number {
    if (slice.length === 0) return 0
    return slice.reduce((s, r) => s + r.volume, 0) / slice.length
  }

  // Try Power Play (3-5 days, range < 3%)
  for (let window = 3; window <= 5; window++) {
    if (rows.length < window + 20) continue
    const recent = rows.slice(-window)
    const prior = rows.slice(-(window + 20), -window)
    const wHigh = Math.max(...recent.map((r) => r.high))
    const wLow = Math.min(...recent.map((r) => r.low))
    const mid = (wHigh + wLow) / 2
    if (mid <= 0) continue
    const rangePct = ((wHigh - wLow) / mid) * 100
    if (rangePct > 3) continue

    const avgPriorVol = avgVol(prior)
    const avgRecentVol = avgVol(recent)
    const dryUpPct = avgPriorVol > 0 ? ((avgPriorVol - avgRecentVol) / avgPriorVol) * 100 : 0

    const currentPrice = rows[rows.length - 1].close
    const nearBreakout = currentPrice >= wHigh * 0.98

    return {
      setupType: 'power-play',
      tightRangePct: Utils.round3(rangePct),
      consolidationDays: window,
      volumeDryUpPct: Utils.round3(dryUpPct),
      nearBreakout
    }
  }

  // Try Low Cheat (5-10 days, range < 5%, price near base low)
  for (let window = 5; window <= 10; window++) {
    if (rows.length < window + 20) continue
    const recent = rows.slice(-window)
    const prior = rows.slice(-(window + 20), -window)
    const wHigh = Math.max(...recent.map((r) => r.high))
    const wLow = Math.min(...recent.map((r) => r.low))
    const mid = (wHigh + wLow) / 2
    if (mid <= 0) continue
    const rangePct = ((wHigh - wLow) / mid) * 100
    if (rangePct > 5) continue

    const currentPrice = rows[rows.length - 1].close
    const pctAboveLow = wLow > 0 ? ((currentPrice - wLow) / wLow) * 100 : Infinity
    if (pctAboveLow > 3) continue  // must be near base low

    const avgPriorVol = avgVol(prior)
    const avgRecentVol = avgVol(recent)
    const dryUpPct = avgPriorVol > 0 ? ((avgPriorVol - avgRecentVol) / avgPriorVol) * 100 : 0

    return {
      setupType: 'low-cheat',
      tightRangePct: Utils.round3(rangePct),
      consolidationDays: window,
      volumeDryUpPct: Utils.round3(dryUpPct),
      nearBreakout: false
    }
  }

  return none
}

export async function GET(ctx: Context) {
  const setupFilter = Utils.queryString(ctx.query('setup'))

  const latestRows = await Database.select({ date: Schemas.summary.date })
    .from(Schemas.summary)
    .orderBy(desc(Schemas.summary.date))
    .limit(1)
  const latestDate = latestRows[0]?.date
  if (latestDate == null) {
    const empty: Types.PowerPlayResponse = { date: 0, totalCount: 0, data: [] }
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
    const close = row.priceClose != null && Number.isFinite(Number(row.priceClose)) ? Number(row.priceClose) : null
    if (close == null || close <= 0) continue
    const high = row.priceHigh != null && Number.isFinite(Number(row.priceHigh)) ? Number(row.priceHigh) : close
    const low = row.priceLow != null && Number.isFinite(Number(row.priceLow)) ? Number(row.priceLow) : close
    const volume = row.volume != null && Number.isFinite(Number(row.volume)) ? Number(row.volume) : 0
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
  for (const row of screenerRows) screenerMap.set(row.code, { name: row.name ?? null, sector: row.sector ?? null })

  // RS ranks
  type RsEntry = { code: string; rsScore: number }
  const rsEntries: RsEntry[] = []
  for (const [code, rows] of ohlcByCode.entries()) {
    if (rows.length < 20) continue
    const price = rows[rows.length - 1].close
    const r3m = rows.length >= 63 ? returnPct(price, rows[rows.length - 63].close) : returnPct(price, rows[0].close)
    if (r3m == null) continue
    const r6m = rows.length >= 126 ? returnPct(price, rows[rows.length - 126].close) : null
    const r9m = rows.length >= 189 ? returnPct(price, rows[rows.length - 189].close) : null
    const r12m = rows.length >= 252 ? returnPct(price, rows[rows.length - 252].close) : null
    let rsScore = r3m * 0.4; let w = 0.4
    if (r6m != null) { rsScore += r6m * 0.2; w += 0.2 }
    if (r9m != null) { rsScore += r9m * 0.2; w += 0.2 }
    if (r12m != null) { rsScore += r12m * 0.2; w += 0.2 }
    if (w < 1) rsScore = rsScore / w
    rsEntries.push({ code, rsScore })
  }
  rsEntries.sort((a, b) => a.rsScore - b.rsScore)
  const rsTotal = rsEntries.length
  const rsRankByCode = new Map<string, number>()
  rsEntries.forEach(({ code }, idx) => {
    rsRankByCode.set(code, Math.max(1, Math.round(((idx + 1) / rsTotal) * 99)))
  })

  const results: Types.PowerPlayRow[] = []

  for (const [code, rows] of ohlcByCode.entries()) {
    if (rows.length < 50) continue

    const setup = detectSetup(rows)
    if (setup.setupType === 'none') continue
    if (setupFilter != null && setupFilter !== '' && setupFilter !== 'all' && setup.setupType !== setupFilter) continue

    const closes = rows.map((r) => r.close)
    const price = closes[closes.length - 1]
    const ma50 = calcMA(closes, 50)
    const ma150 = calcMA(closes, 150)
    const ma200 = calcMA(closes, 200)
    if (ma50 == null) continue

    let ma200SlopePct: number | null = null
    if (ma200 != null && closes.length >= 222) {
      const olderCloses = closes.slice(0, closes.length - 22)
      const ma200older = calcMA(olderCloses, 200)
      if (ma200older != null && ma200older > 0) ma200SlopePct = ((ma200 - ma200older) / ma200older) * 100
    }
    const stage = determineStage(price, ma50, ma150, ma200, ma200SlopePct)

    // Only show Stage 1-2 setups (declining stocks are noise)
    if (stage === 4) continue

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

    const info = screenerMap.get(code)
    results.push({
      code,
      name: info?.name ?? null,
      sector: info?.sector ?? null,
      price: Utils.round3(price),
      setupType: setup.setupType,
      tightRangePct: setup.tightRangePct,
      consolidationDays: setup.consolidationDays,
      volumeDryUpPct: setup.volumeDryUpPct,
      rsRank,
      stage,
      nearBreakout: setup.nearBreakout,
      trendCriteriaCount,
      pctFrom52wHigh: pctFrom52wHigh != null ? Utils.round3(pctFrom52wHigh) : null
    })
  }

  // Sort: Power Play first (higher quality), then by trend criteria
  results.sort((a, b) => {
    if (a.setupType !== b.setupType) {
      return a.setupType === 'power-play' ? -1 : 1
    }
    return b.trendCriteriaCount - a.trendCriteriaCount
  })

  const response: Types.PowerPlayResponse = {
    date: dateRef,
    totalCount: results.length,
    data: results
  }
  return ctx.send.json(response)
}
