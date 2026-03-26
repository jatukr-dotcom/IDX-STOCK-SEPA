/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Advanced technical indicators endpoint: MACD, Stochastic RSI,
 * Support/Resistance, Fibonacci Retracement, Divergence Detection.
 */

import type { Context } from '@neabyte/deserve'
import { and, asc, eq, gte, lte } from 'drizzle-orm'
import Database from '@app/server/Database.ts'
import Utils from '@app/server/Utils.ts'
import RSI from '@app/server/RSI.ts'
import TechnicalAnalysis from '@app/server/TechnicalAnalysis.ts'
import * as Schemas from '@app/server/schemas/index.ts'
import type * as Types from '@app/server/Types.ts'

export async function GET(ctx: Context) {
  const code = ctx.param('code')
  if (!code || code.trim() === '') {
    return ctx.send.json({ error: 'Missing or invalid code' }, { status: 400 })
  }
  const start = Utils.parseDate(Utils.queryString(ctx.query('start')))
  const end = Utils.parseDate(Utils.queryString(ctx.query('end')))
  if (start === null || end === null) {
    return ctx.send.json({ error: 'start and end required (yyyymmdd, 8 digits)' }, { status: 400 })
  }
  if (end < start) {
    return ctx.send.json({ error: 'end must be >= start' }, { status: 400 })
  }

  const stockCode = code.trim().toUpperCase()
  // Fetch extra 90 days before display range for indicator warmup
  const fetchStart = Utils.addDaysToDateInt(start, -90)

  const rawRows = await Database.select({
    date: Schemas.summary.date,
    priceHigh: Schemas.summary.priceHigh,
    priceLow: Schemas.summary.priceLow,
    priceClose: Schemas.summary.priceClose
  })
    .from(Schemas.summary)
    .where(
      and(
        eq(Schemas.summary.stockCode, stockCode),
        gte(Schemas.summary.date, fetchStart),
        lte(Schemas.summary.date, end)
      )
    )
    .orderBy(asc(Schemas.summary.date))

  // Clean rows — filter null/invalid prices
  type CleanRow = { date: number; high: number; low: number; close: number }
  const rows: CleanRow[] = []
  for (const row of rawRows) {
    const close = row.priceClose != null && Number.isFinite(Number(row.priceClose))
      ? Number(row.priceClose)
      : null
    const high = row.priceHigh != null && Number.isFinite(Number(row.priceHigh))
      ? Number(row.priceHigh)
      : null
    const low = row.priceLow != null && Number.isFinite(Number(row.priceLow))
      ? Number(row.priceLow)
      : null
    if (close == null || close <= 0 || high == null || low == null) continue
    rows.push({ date: Number(row.date), high, low, close })
  }

  if (rows.length === 0) {
    const empty: Types.TechnicalAnalysisApiResponse = {
      code: stockCode,
      start,
      end,
      macd: [],
      stochRsi: [],
      supportResistance: {
        pivotLevels: { pivot: 0, s1: 0, s2: 0, s3: 0, r1: 0, r2: 0, r3: 0 },
        swingLevels: []
      },
      fibonacci: null,
      divergences: []
    }
    return ctx.send.json(empty)
  }

  const closes = rows.map((r) => r.close)

  // ── Compute all indicators ───────────────────────────────────────────────
  const { macdLine, signalLine, histogram } = TechnicalAnalysis.calculateMACD(closes)
  const { k: stochK, d: stochD } = TechnicalAnalysis.calculateStochRSI(closes)
  const rsiValues = RSI.calculate(closes)
  const sr = TechnicalAnalysis.calculateSupportResistance(rows)
  const fib = TechnicalAnalysis.calculateFibonacci(
    rows.filter((r) => r.date >= start)
  )
  const divergences = TechnicalAnalysis.detectDivergences(rows, rsiValues, stochK)

  // ── Filter series to display range only ─────────────────────────────────
  const macd: Types.MacdSeriesRow[] = []
  const stochRsi: Types.StochRsiSeriesRow[] = []

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!
    if (r.date < start) continue

    macd.push({
      date: r.date,
      macdLine: macdLine[i] != null ? Math.round(macdLine[i]! * 1000) / 1000 : null,
      signalLine: signalLine[i] != null ? Math.round(signalLine[i]! * 1000) / 1000 : null,
      histogram: histogram[i] != null ? Math.round(histogram[i]! * 1000) / 1000 : null
    })

    stochRsi.push({
      date: r.date,
      k: stochK[i] != null ? Math.round(stochK[i]! * 10) / 10 : null,
      d: stochD[i] != null ? Math.round(stochD[i]! * 10) / 10 : null
    })
  }

  const response: Types.TechnicalAnalysisApiResponse = {
    code: stockCode,
    start,
    end,
    macd,
    stochRsi,
    supportResistance: sr,
    fibonacci: fib,
    divergences
  }
  return ctx.send.json(response)
}
