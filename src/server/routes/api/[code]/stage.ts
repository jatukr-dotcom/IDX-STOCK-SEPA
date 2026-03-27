/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Stage analysis: 4-stage cycle (Accumulation, Markup, Distribution, Markdown)
 */

import type { Context } from '@neabyte/deserve'
import { and, asc, eq, gte, lte } from 'drizzle-orm'
import Database from '@app/server/Database.ts'
import Utils from '@app/server/Utils.ts'
import * as Schemas from '@app/server/schemas/index.ts'
import * as Services from '@app/server/services/index.ts'

function calcMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null
  const sum = prices.slice(-period).reduce((a, b) => a + b, 0)
  return sum / period
}

function calcSMA(prices: number[], period: number): number | null {
  return calcMA(prices, period)
}

function identifyStage(
  price: number,
  ma50: number | null,
  ma150: number | null,
  ma200: number | null,
  ma200Slope: number | null,
  low52w: number | null,
  high52w: number | null
): 1 | 2 | 3 | 4 {
  if (ma50 == null || ma150 == null || ma200 == null) return 2

  // Stage 1: Accumulation — price between MA200 ± 2%, MA50 < MA150 < MA200, slope flat
  if (
    price >= ma200 * 0.98 &&
    price <= ma200 * 1.02 &&
    ma50 < ma150 &&
    ma150 < ma200 &&
    (ma200Slope == null || Math.abs(ma200Slope) < 2)
  ) {
    return 1
  }

  // Stage 2: Markup — price above MA50, MA50 > MA150 > MA200, price trending up
  if (price > ma50 && ma50 > ma150 && ma150 > ma200) {
    return 2
  }

  // Stage 3: Distribution — price near MA150 or MA200, but above low 52w
  if (price < ma50 && ma150 != null && price >= (low52w ?? 0) * 1.2) {
    return 3
  }

  // Stage 4: Markdown — price below MA50, MA200 trending down, near 52w low
  if (price < ma50 && price < (high52w ?? price) * 0.8) {
    return 4
  }

  return 2 // Default to markup if unclear
}

export async function GET(ctx: Context) {
  const code = ctx.param('code')
  if (!code || code.trim() === '') {
    return ctx.send.json({ error: 'Missing or invalid code' }, { status: 400 })
  }
  const stockCode = code.trim().toUpperCase()

  const dateParsed = Utils.parseDate(Utils.queryString(ctx.query('date')))
  const dateInt = dateParsed ?? Services.CronDate.todayDateInt()

  // Load OHLC for past 250 days (~1 year)
  const perfRows = await Database.select({
    date: Schemas.summary.date,
    priceClose: Schemas.summary.priceClose
  })
    .from(Schemas.summary)
    .where(
      and(
        eq(Schemas.summary.stockCode, stockCode),
        gte(Schemas.summary.date, Utils.addDaysToDateInt(dateInt, -250)),
        lte(Schemas.summary.date, dateInt)
      )
    )
    .orderBy(asc(Schemas.summary.date))

  const prices = perfRows
    .filter((r) => r.priceClose != null && Number.isFinite(Number(r.priceClose)) && Number(r.priceClose) > 0)
    .map((r) => Number(r.priceClose))

  if (prices.length === 0) {
    return ctx.send.json({
      code: stockCode,
      stage: 2,
      trendCriteriaCount: 0,
      currentPrice: null,
      ma50: null,
      ma150: null,
      ma200: null,
      low52w: null,
      high52w: null
    })
  }

  const currentPrice = prices[prices.length - 1]!
  const ma50 = calcSMA(prices, 50)
  const ma150 = calcSMA(prices, 150)
  const ma200 = calcSMA(prices, 200)
  const low52w = Math.min(...prices.slice(-250))
  const high52w = Math.max(...prices.slice(-250))

  // MA200 slope (change over last 20 days, based on 200-period MA)
  const ma200_20ago = prices.length >= 220 ? calcSMA(prices.slice(0, -20), 200) : null
  const ma200Slope =
    ma50 != null && ma200_20ago != null && ma200 != null
      ? ((ma200 - ma200_20ago) / ma200_20ago) * 100
      : null

  const stage = identifyStage(currentPrice, ma50, ma150, ma200, ma200Slope, low52w, high52w)

  // Count trend criteria (same as screener stage-analysis) — 0-8
  const pctFrom52wLow = low52w > 0 ? ((currentPrice - low52w) / low52w) * 100 : null
  const pctFrom52wHigh = high52w > 0 ? ((currentPrice - high52w) / high52w) * 100 : null
  const ma200Trending = ma200Slope != null && ma200Slope > 0

  const criteriaCount = [
    ma200 != null ? currentPrice > ma150! && currentPrice > ma200 : currentPrice > ma150!,
    ma200 != null ? ma150! > ma200 : false,
    ma200Trending,
    ma200 != null ? ma50! > ma150! && ma50! > ma200 : ma50! > ma150!,
    currentPrice > ma50!,
    pctFrom52wLow != null ? pctFrom52wLow >= 30 : false,
    pctFrom52wHigh != null ? pctFrom52wHigh >= -25 : false
  ].filter(Boolean).length

  return ctx.send.json({
    code: stockCode,
    stage,
    stageLabel: ['Accumulation', 'Markup', 'Distribution', 'Markdown'][stage - 1],
    currentPrice: currentPrice ?? null,
    ma50: ma50 ?? null,
    ma150: ma150 ?? null,
    ma200: ma200 ?? null,
    ma200SlopePct: ma200Slope ?? null,
    low52w: low52w ?? null,
    high52w: high52w ?? null,
    trendCriteriaCount: criteriaCount
  })
}
