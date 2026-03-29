/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Stage analysis: 4-stage cycle (Basing, Advancing, Topping, Declining)
 * Logic aligned with screener/stage-analysis.ts
 */

import type { Context } from '@neabyte/deserve'
import { and, asc, eq, gte, lte } from 'drizzle-orm'
import Database from '@app/server/Database.ts'
import {
  calcMA,
  calcMA200SlopePct,
  determineStageConfirmedWithLabel
} from '@app/server/StageAnalysisHelper.ts'
import Utils from '@app/server/Utils.ts'
import * as Schemas from '@app/server/schemas/index.ts'
import * as Services from '@app/server/services/index.ts'

// calcMA, returnPct, determineStage imported from StageAnalysisHelper

export async function GET(ctx: Context) {
  const code = ctx.param('code')
  if (!code || code.trim() === '') {
    return ctx.send.json({ error: 'Missing or invalid code' }, { status: 400 })
  }
  const stockCode = code.trim().toUpperCase()

  const dateParsed = Utils.parseDate(Utils.queryString(ctx.query('date')))
  const dateInt = dateParsed ?? Services.CronDate.todayDateInt()

  // Load OHLC for past 400 calendar days (~280 trading days) — enough for MA200
  const perfRows = await Database.select({
    date: Schemas.summary.date,
    priceClose: Schemas.summary.priceClose,
    priceHigh: Schemas.summary.priceHigh,
    priceLow: Schemas.summary.priceLow
  })
    .from(Schemas.summary)
    .where(
      and(
        eq(Schemas.summary.stockCode, stockCode),
        gte(Schemas.summary.date, Utils.addDaysToDateInt(dateInt, -400)),
        lte(Schemas.summary.date, dateInt)
      )
    )
    .orderBy(asc(Schemas.summary.date))

  type OhlcEntry = { date: number; close: number; high: number; low: number }
  const rows: OhlcEntry[] = []
  for (const r of perfRows) {
    const close = r.priceClose != null && Number.isFinite(Number(r.priceClose))
      ? Number(r.priceClose)
      : null
    if (close == null || close <= 0) {
      continue
    }
    const high = r.priceHigh != null && Number.isFinite(Number(r.priceHigh))
      ? Number(r.priceHigh)
      : close
    const low = r.priceLow != null && Number.isFinite(Number(r.priceLow))
      ? Number(r.priceLow)
      : close
    rows.push({ date: Number(r.date), close, high, low })
  }

  if (rows.length === 0) {
    return ctx.send.json({
      code: stockCode,
      stage: 1,
      stageLabel: 'Stage 1: Basing',
      trendCriteriaCount: 0,
      currentPrice: null,
      ma50: null,
      ma150: null,
      ma200: null,
      ma200SlopePct: null,
      low52w: null,
      high52w: null
    })
  }

  const closes = rows.map((r) => r.close)
  const price = closes[closes.length - 1]!

  const ma50 = calcMA(closes, 50)
  const ma150 = calcMA(closes, 150)
  const ma200 = calcMA(closes, 200)

  // MA200 slope: compare current MA200 vs MA200 from 22 trading days ago (fixed)
  const ma200SlopePct = calcMA200SlopePct(closes)

  const { stage, label: stageLabel } = determineStageConfirmedWithLabel(closes)

  // 52-week high/low using high and low prices (not close)
  const last252 = rows.slice(Math.max(0, rows.length - 252))
  const high52w = Math.max(...last252.map((r) => r.high))
  const low52w = Math.min(...last252.map((r) => r.low))
  const pctFrom52wHigh = high52w > 0 ? ((price - high52w) / high52w) * 100 : null
  const pctFrom52wLow = low52w > 0 ? ((price - low52w) / low52w) * 100 : null

  // Trend criteria count — 7 criteria (RS Rank excluded: requires cross-sectional ranking of all stocks)
  const ma200Trending = ma200SlopePct != null && ma200SlopePct > 0
  const trendCriteriaCount = [
    ma200 != null ? price > ma150! && price > ma200 : price > ma150!,
    ma200 != null ? ma150! > ma200 : false,
    ma200Trending,
    ma200 != null ? ma50! > ma150! && ma50! > ma200 : ma50! > ma150!,
    price > ma50!,
    pctFrom52wLow != null ? pctFrom52wLow >= 30 : false,
    pctFrom52wHigh != null ? pctFrom52wHigh >= -25 : false
  ].filter(Boolean).length

  return ctx.send.json({
    code: stockCode,
    stage,
    stageLabel,
    currentPrice: Utils.round3(price),
    ma50: ma50 != null ? Utils.round3(ma50) : null,
    ma150: ma150 != null ? Utils.round3(ma150) : null,
    ma200: ma200 != null ? Utils.round3(ma200) : null,
    ma200SlopePct: ma200SlopePct != null ? Utils.round3(ma200SlopePct) : null,
    low52w,
    high52w,
    trendCriteriaCount
  })
}
