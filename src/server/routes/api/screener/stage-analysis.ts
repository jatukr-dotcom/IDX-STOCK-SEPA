/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 */

import type { Context } from '@neabyte/deserve'
import { and, asc, desc, gte, lte } from 'drizzle-orm'
import Database from '@app/server/Database.ts'
import {
  calcMA,
  calcMA200SlopePct,
  determineStageConfirmedWithLabel,
  returnPct
} from '@app/server/StageAnalysisHelper.ts'
import Utils from '@app/server/Utils.ts'
import * as Schemas from '@app/server/schemas/index.ts'
import type * as Types from '@app/server/Types.ts'

// calcMA, returnPct, determineStage imported from StageAnalysisHelper

export async function GET(ctx: Context) {
  const stageFilter = Utils.queryString(ctx.query('stage'))

  const latestRows = await Database.select({ date: Schemas.summary.date })
    .from(Schemas.summary)
    .orderBy(desc(Schemas.summary.date))
    .limit(1)
  const latestDate = latestRows[0]?.date
  if (latestDate == null) {
    const empty: Types.StageAnalysisResponse = { date: 0, totalCount: 0, data: [] }
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
    volume: Schemas.summary.volume,
    value: Schemas.summary.value
  })
    .from(Schemas.summary)
    .where(and(gte(Schemas.summary.date, dateStart), lte(Schemas.summary.date, dateRef)))
    .orderBy(asc(Schemas.summary.stockCode), asc(Schemas.summary.date))

  type OhlcEntry = {
    date: number
    close: number
    high: number
    low: number
    volume: number
    value: number
  }
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
    const value = row.value != null && Number.isFinite(Number(row.value)) ? Number(row.value) : 0
    const list = ohlcByCode.get(row.stockCode) ?? []
    list.push({ date: Number(row.date), close, high, low, volume, value })
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

  const results: Types.StageAnalysisRow[] = []

  for (const [code, rows] of ohlcByCode.entries()) {
    if (rows.length < 50) {
      continue
    }
    const closes = rows.map((r) => r.close)
    const price = closes[closes.length - 1]!
    const ma50 = calcMA(closes, 50)
    const ma150 = calcMA(closes, 150)
    const ma200 = calcMA(closes, 200)
    if (ma50 == null) {
      continue
    }

    const ma200SlopePct = calcMA200SlopePct(closes)

    const { stage, label: stageLabel } = determineStageConfirmedWithLabel(closes)

    if (stageFilter != null && stageFilter !== '' && stageFilter !== String(stage)) {
      continue
    }

    const last252 = rows.slice(Math.max(0, rows.length - 252))
    const high52w = Math.max(...last252.map((r) => r.high))
    const low52w = Math.min(...last252.map((r) => r.low))
    const pctFrom52wHigh = high52w > 0 ? ((price - high52w) / high52w) * 100 : null
    const pctFrom52wLow = low52w > 0 ? ((price - low52w) / low52w) * 100 : null

    // Trend criteria count (reuse logic from trend template)
    const ma200Trending = ma200SlopePct != null && ma200SlopePct > 0
    const trendCriteriaCount = [
      ma200 != null ? price > ma150! && price > ma200 : price > ma150!,
      ma200 != null ? ma150! > ma200 : false,
      ma200Trending,
      ma200 != null ? ma50 > ma150! && ma50 > ma200 : ma50 > ma150!,
      price > ma50,
      pctFrom52wLow != null ? pctFrom52wLow >= 30 : false,
      pctFrom52wHigh != null ? pctFrom52wHigh >= -25 : false,
      (rsRankByCode.get(code) ?? 0) >= 70
    ].filter(Boolean).length

    const last20 = rows.slice(-20)
    const avgVolume20d = last20.length > 0
      ? last20.reduce((s, r) => s + r.volume, 0) / last20.length
      : null
    const avgValue20d = last20.length > 0
      ? last20.reduce((s, r) => s + r.value, 0) / last20.length
      : null

    const info = screenerMap.get(code)
    results.push({
      code,
      name: info?.name ?? null,
      sector: info?.sector ?? null,
      price: Utils.round3(price),
      stage,
      stageLabel,
      ma50: Utils.round3(ma50),
      ma150: ma150 != null ? Utils.round3(ma150) : null,
      ma200: ma200 != null ? Utils.round3(ma200) : null,
      ma200SlopePct: ma200SlopePct != null ? Utils.round3(ma200SlopePct) : null,
      rsRank: rsRankByCode.get(code) ?? null,
      trendCriteriaCount,
      pctFrom52wHigh: pctFrom52wHigh != null ? Utils.round3(pctFrom52wHigh) : null,
      pctFrom52wLow: pctFrom52wLow != null ? Utils.round3(pctFrom52wLow) : null,
      avgVolume20d: avgVolume20d != null ? Math.round(avgVolume20d) : null,
      avgValue20d: avgValue20d != null ? Math.round(avgValue20d) : null
    })
  }

  // Sort: Stage 2 first, then by RS rank descending
  results.sort((a, b) => {
    if (a.stage !== b.stage) {
      return a.stage - b.stage
    }
    return (b.rsRank ?? 0) - (a.rsRank ?? 0)
  })

  const response: Types.StageAnalysisResponse = {
    date: dateRef,
    totalCount: results.length,
    data: results
  }
  return ctx.send.json(response)
}
