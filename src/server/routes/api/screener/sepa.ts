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
  if (prices.length < period) return null
  const slice = prices.slice(prices.length - period)
  return slice.reduce((a, b) => a + b, 0) / period
}

function returnPct(current: number, past: number): number | null {
  if (past <= 0 || !Number.isFinite(past) || !Number.isFinite(current)) return null
  return ((current - past) / past) * 100
}

export async function GET(ctx: Context) {
  // Query params for thresholds (with sane defaults)
  const minTrend = Utils.parseNumber(Utils.queryString(ctx.query('minTrend')))
  const minRs = Utils.parseNumber(Utils.queryString(ctx.query('minRs')))
  const trendThreshold = minTrend != null && minTrend >= 1 && minTrend <= 8 ? minTrend : 6
  const rsThreshold = minRs != null && minRs >= 1 && minRs <= 99 ? minRs : 70

  const latestRows = await Database.select({ date: Schemas.summary.date })
    .from(Schemas.summary)
    .orderBy(desc(Schemas.summary.date))
    .limit(1)
  const latestDate = latestRows[0]?.date
  if (latestDate == null) {
    const empty: Types.SepaResponse = { date: 0, totalCount: 0, data: [] }
    return ctx.send.json(empty)
  }
  const dateRef = Number(latestDate)
  const dateStart = Utils.addDaysToDateInt(dateRef, -400)

  // Fetch OHLC data
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
    if (close == null || close <= 0) continue
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

  // Fetch fundamental data from screener
  const screenerRows = await Database.select({
    code: Schemas.screener.code,
    name: Schemas.screener.name,
    sector: Schemas.screener.sector,
    per: Schemas.screener.per,
    roe: Schemas.screener.roe,
    der: Schemas.screener.der,
    npm: Schemas.screener.npm
  }).from(Schemas.screener)

  type FundRow = { name: string | null; sector: string | null; per: unknown; roe: unknown; der: unknown; npm: unknown }
  const screenerMap = new Map<string, FundRow>()
  for (const row of screenerRows) {
    screenerMap.set(row.code, {
      name: row.name ?? null,
      sector: row.sector ?? null,
      per: row.per,
      roe: row.roe,
      der: row.der,
      npm: row.npm
    })
  }

  // --- Step 1: Calculate RS Score for all stocks to derive RS Rank ---
  type RsEntry = { code: string; rsScore: number }
  const rsEntries: RsEntry[] = []
  for (const [code, rows] of ohlcByCode.entries()) {
    if (rows.length < 20) continue
    const price = rows[rows.length - 1].close
    const r3m = rows.length >= 63
      ? returnPct(price, rows[rows.length - 63].close)
      : returnPct(price, rows[0].close)
    const r6m = rows.length >= 126
      ? returnPct(price, rows[rows.length - 126].close)
      : null
    const r9m = rows.length >= 189
      ? returnPct(price, rows[rows.length - 189].close)
      : null
    const r12m = rows.length >= 252
      ? returnPct(price, rows[rows.length - 252].close)
      : null
    if (r3m == null) continue
    let rsScore = r3m * 0.4
    let w = 0.4
    if (r6m != null) { rsScore += r6m * 0.2; w += 0.2 }
    if (r9m != null) { rsScore += r9m * 0.2; w += 0.2 }
    if (r12m != null) { rsScore += r12m * 0.2; w += 0.2 }
    if (w < 1) rsScore = rsScore / w
    rsEntries.push({ code, rsScore })
  }
  rsEntries.sort((a, b) => a.rsScore - b.rsScore)
  const rsTotal = rsEntries.length
  const rsRankByCode = new Map<string, number>()
  const rsScoreByCode = new Map<string, number>()
  rsEntries.forEach(({ code, rsScore }, idx) => {
    rsRankByCode.set(code, Math.max(1, Math.round(((idx + 1) / rsTotal) * 99)))
    rsScoreByCode.set(code, rsScore)
  })

  // --- Step 2: For each stock, compute Trend Template + SEPA Score ---
  const results: Types.SepaCandidateRow[] = []

  for (const [code, rows] of ohlcByCode.entries()) {
    if (rows.length < 50) continue

    const rsRank = rsRankByCode.get(code) ?? 0
    if (rsRank < rsThreshold) continue

    const closes = rows.map((r) => r.close)
    const price = closes[closes.length - 1]
    const ma50 = calcMA(closes, 50)
    const ma150 = calcMA(closes, 150)
    const ma200 = calcMA(closes, 200)
    if (ma50 == null || ma150 == null) continue

    // MA200 trend
    let ma200Trending = false
    if (ma200 != null && closes.length >= 222) {
      const olderCloses = closes.slice(0, closes.length - 22)
      const ma200older = calcMA(olderCloses, 200)
      if (ma200older != null) ma200Trending = ma200 > ma200older
    }

    // 52w high/low
    const last252 = rows.slice(Math.max(0, rows.length - 252))
    const high52w = Math.max(...last252.map((r) => r.high))
    const low52w = Math.min(...last252.map((r) => r.low))
    const pctFrom52wHigh = high52w > 0 ? ((price - high52w) / high52w) * 100 : null
    const pctFrom52wLow = low52w > 0 ? ((price - low52w) / low52w) * 100 : null

    const criteria: Types.TrendTemplateCriteria = {
      aboveMa150Ma200: ma200 != null ? price > ma150 && price > ma200 : price > ma150,
      ma150AboveMa200: ma200 != null ? ma150 > ma200 : false,
      ma200Trending,
      ma50AboveMa150Ma200: ma200 != null ? ma50 > ma150 && ma50 > ma200 : ma50 > ma150,
      aboveMa50: price > ma50,
      above52wLowBy30Pct: pctFrom52wLow != null ? pctFrom52wLow >= 30 : false,
      within25PctOf52wHigh: pctFrom52wHigh != null ? pctFrom52wHigh >= -25 : false,
      rsRank70: rsRank >= 70
    }
    const trendCriteriaCount = Object.values(criteria).filter(Boolean).length
    if (trendCriteriaCount < trendThreshold) continue

    // RS multi-period returns
    const r3m = rows.length >= 63
      ? returnPct(price, rows[rows.length - 63].close)
      : returnPct(price, rows[0].close)
    const r6m = rows.length >= 126
      ? returnPct(price, rows[rows.length - 126].close)
      : null

    // Fundamentals
    const fund = screenerMap.get(code)
    const per = fund?.per != null && Number.isFinite(Number(fund.per)) ? Number(fund.per) : null
    const roe = fund?.roe != null && Number.isFinite(Number(fund.roe)) ? Number(fund.roe) : null
    const der = fund?.der != null && Number.isFinite(Number(fund.der)) ? Number(fund.der) : null
    const npm = fund?.npm != null && Number.isFinite(Number(fund.npm)) ? Number(fund.npm) : null

    // SEPA Score: 0–100
    // 40% Trend Template (criteriaCount/8)
    // 35% RS Rank (/99)
    // 25% Fundamental Quality (ROE + NPM)
    const trendScore = (trendCriteriaCount / 8) * 40
    const rsScore40 = (rsRank / 99) * 35
    let fundScore = 0
    if (roe != null && roe > 0) fundScore += Math.min(roe / 30, 1) * 15 // ROE up to 30% → 15pts
    if (npm != null && npm > 0) fundScore += Math.min(npm / 20, 1) * 10 // NPM up to 20% → 10pts
    const sepaScore = trendScore + rsScore40 + fundScore

    results.push({
      code,
      name: fund?.name ?? null,
      sector: fund?.sector ?? null,
      price: Utils.round3(price),
      rsRank,
      rsScore: Utils.round3(rsScoreByCode.get(code) ?? 0),
      return3m: r3m != null ? Utils.round3(r3m) : null,
      return6m: r6m != null ? Utils.round3(r6m) : null,
      trendCriteriaCount,
      criteria,
      ma50: Utils.round3(ma50),
      ma150: Utils.round3(ma150),
      ma200: ma200 != null ? Utils.round3(ma200) : null,
      pctFrom52wHigh: pctFrom52wHigh != null ? Utils.round3(pctFrom52wHigh) : null,
      pctFrom52wLow: pctFrom52wLow != null ? Utils.round3(pctFrom52wLow) : null,
      high52w: Utils.round3(high52w),
      low52w: Utils.round3(low52w),
      per,
      roe,
      der,
      npm,
      sepaScore: Utils.round3(sepaScore)
    })
  }

  results.sort((a, b) => b.sepaScore - a.sepaScore)

  const response: Types.SepaResponse = {
    date: dateRef,
    totalCount: results.length,
    data: results
  }
  return ctx.send.json(response)
}
