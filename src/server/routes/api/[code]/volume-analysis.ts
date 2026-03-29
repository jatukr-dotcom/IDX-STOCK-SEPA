/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 */

import type { Context } from '@neabyte/deserve'
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm'
import Database from '@app/server/Database.ts'
import Utils from '@app/server/Utils.ts'
import * as Schemas from '@app/server/schemas/index.ts'
import type * as Types from '@app/server/Types.ts'

function calcMFM(high: number, low: number, close: number): number {
  if (high === low) {
    return 0
  }
  return ((close - low) - (high - close)) / (high - low)
}

function calcCMF(
  rows: { high: number; low: number; close: number; volume: number }[],
  period: number
): number | null {
  if (rows.length < period) {
    return null
  }
  const slice = rows.slice(rows.length - period)
  let sumMFV = 0
  let sumVol = 0
  for (const r of slice) {
    const mfm = calcMFM(r.high, r.low, r.close)
    sumMFV += mfm * r.volume
    sumVol += r.volume
  }
  if (sumVol === 0) {
    return null
  }
  return sumMFV / sumVol
}

function calcMFI(
  rows: { high: number; low: number; close: number; volume: number }[],
  period: number
): number | null {
  if (rows.length < period + 1) {
    return null
  }
  const slice = rows.slice(rows.length - period - 1)
  let posFlow = 0
  let negFlow = 0
  for (let i = 1; i < slice.length; i++) {
    const tp = (slice[i]!.high + slice[i]!.low + slice[i]!.close) / 3
    const prevTp = (slice[i - 1]!.high + slice[i - 1]!.low + slice[i - 1]!.close) / 3
    const mf = tp * slice[i]!.volume
    if (tp > prevTp) {
      posFlow += mf
    } else {
      negFlow += mf
    }
  }
  if (negFlow === 0) {
    return 100
  }
  const ratio = posFlow / negFlow
  return 100 - (100 / (1 + ratio))
}

function calcOBVSeries(rows: { close: number; volume: number }[]): number[] {
  const result: number[] = []
  let obv = 0
  for (let i = 0; i < rows.length; i++) {
    if (i === 0) {
      result.push(0)
      continue
    }
    if (rows[i]!.close > rows[i - 1]!.close) {
      obv += rows[i]!.volume
    } else if (rows[i]!.close < rows[i - 1]!.close) {
      obv -= rows[i]!.volume
    }
    result.push(obv)
  }
  return result
}

function calcOBVTrend(obvSeries: number[]): 'up' | 'down' | 'flat' {
  if (obvSeries.length < 20) {
    return 'flat'
  }
  const recent = obvSeries.slice(-20)
  const first = recent[0]!
  const last = recent[recent.length - 1]!
  const diff = last - first
  const scale = Math.abs(first) || 1
  const pct = diff / scale
  if (pct > 0.05) {
    return 'up'
  }
  if (pct < -0.05) {
    return 'down'
  }
  return 'flat'
}

function detectVCP(
  rows: { high: number; low: number; close: number; volume: number }[]
): Types.VcpResult {
  // Need at least 60 days for 3 contraction windows
  if (rows.length < 60) {
    return { isVcp: false, contractions: 0, volumeDrying: false }
  }

  // Divide last 60 trading days into 3 windows of 20
  const windows = [
    rows.slice(rows.length - 60, rows.length - 40),
    rows.slice(rows.length - 40, rows.length - 20),
    rows.slice(rows.length - 20)
  ]

  type Window = { range: number; avgVol: number; midpoint: number }
  const analyzed: Window[] = windows.map((w) => {
    const highs = w.map((r) => r.high)
    const lows = w.map((r) => r.low)
    const maxH = Math.max(...highs)
    const minL = Math.min(...lows)
    const midpoint = (maxH + minL) / 2
    const range = midpoint > 0 ? ((maxH - minL) / midpoint) * 100 : 0
    const avgVol = w.reduce((s, r) => s + r.volume, 0) / w.length
    return { range, avgVol, midpoint }
  })

  // Check each window is tighter than previous (contraction)
  let contractions = 0
  for (let i = 1; i < analyzed.length; i++) {
    const cur = analyzed[i]
    const prev = analyzed[i - 1]
    if (cur && prev && cur.range < prev.range * 0.85) {
      contractions++
    }
  }

  // Volume drying up: last window avg vol < first window avg vol
  const volumeDrying = (analyzed[2]?.avgVol ?? 0) < (analyzed[0]?.avgVol ?? 0) * 0.75

  // Price near 52w high (within 20%)
  const last252 = rows.slice(Math.max(0, rows.length - 252))
  const high52w = Math.max(...last252.map((r) => r.high))
  const currentClose = rows[rows.length - 1]?.close ?? 0
  const pctFromHigh = high52w > 0 ? ((currentClose - high52w) / high52w) * 100 : -100
  const nearHighs = pctFromHigh >= -20

  const isVcp = contractions >= 1 && volumeDrying && nearHighs

  return { isVcp, contractions, volumeDrying }
}

export async function GET(ctx: Context) {
  const code = ctx.param('code')
  if (!code || code.trim() === '') {
    return ctx.send.json({ error: 'Missing or invalid code' }, { status: 400 })
  }

  const monthsParam = Utils.parseNumber(Utils.queryString(ctx.query('months')))
  const months = monthsParam != null && monthsParam >= 1 && monthsParam <= 24 ? monthsParam : 3

  const latestRows = await Database.select({ date: Schemas.summary.date })
    .from(Schemas.summary)
    .where(eq(Schemas.summary.stockCode, code.trim().toUpperCase()))
    .orderBy(desc(Schemas.summary.date))
    .limit(1)
  const latestDate = latestRows[0]?.date
  if (latestDate == null) {
    return ctx.send.json({ error: 'No data found' }, { status: 404 })
  }

  const dateEnd = Number(latestDate)
  // Fetch extra 30 days before the range for indicator warmup
  const dateStartDisplay = Utils.addDaysToDateInt(dateEnd, -(months * 30))
  const dateStartFetch = Utils.addDaysToDateInt(dateEnd, -(months * 30 + 60))

  const rows = await Database.select({
    date: Schemas.summary.date,
    open: Schemas.summary.priceOpen,
    high: Schemas.summary.priceHigh,
    low: Schemas.summary.priceLow,
    close: Schemas.summary.priceClose,
    volume: Schemas.summary.volume,
    foreignBuy: Schemas.summary.foreignBuy,
    foreignSell: Schemas.summary.foreignSell
  })
    .from(Schemas.summary)
    .where(
      and(
        eq(Schemas.summary.stockCode, code.trim().toUpperCase()),
        gte(Schemas.summary.date, dateStartFetch),
        lte(Schemas.summary.date, dateEnd)
      )
    )
    .orderBy(asc(Schemas.summary.date))

  type OhlcvEntry = {
    date: number
    high: number
    low: number
    close: number
    volume: number
    foreignBuy: number
    foreignSell: number
  }
  const clean: OhlcvEntry[] = []
  for (const r of rows) {
    const close = r.close != null && Number.isFinite(Number(r.close)) ? Number(r.close) : null
    if (close == null || close <= 0) {
      continue
    }
    clean.push({
      date: Number(r.date),
      high: r.high != null && Number.isFinite(Number(r.high)) ? Number(r.high) : close,
      low: r.low != null && Number.isFinite(Number(r.low)) ? Number(r.low) : close,
      close,
      volume: r.volume != null && Number.isFinite(Number(r.volume)) ? Number(r.volume) : 0,
      foreignBuy: r.foreignBuy != null ? Number(r.foreignBuy) : 0,
      foreignSell: r.foreignSell != null ? Number(r.foreignSell) : 0
    })
  }

  if (clean.length === 0) {
    return ctx.send.json({ error: 'No OHLCV data' }, { status: 404 })
  }

  // Calculate OBV series for all data
  const obvFull = calcOBVSeries(clean)

  // Build series for display range only
  const series: Types.VolumeAnalysisSeriesRow[] = []
  let cumulativeAdl = 0
  let cumulativeNetForeign = 0

  for (let i = 0; i < clean.length; i++) {
    const r = clean[i]
    if (!r) {
      continue
    }
    // ADL
    const mfm = calcMFM(r.high, r.low, r.close)
    cumulativeAdl += mfm * r.volume
    // Net foreign
    cumulativeNetForeign += r.foreignBuy - r.foreignSell

    // CMF(20): rolling 20-day
    const cmf20 = i >= 19 ? calcCMF(clean.slice(i - 19, i + 1), 20) : null

    // MFI(14): rolling 14-day
    const mfi14 = i >= 14 ? calcMFI(clean.slice(i - 14, i + 1), 14) : null

    // Only include in display range
    if (r.date < dateStartDisplay) {
      continue
    }

    series.push({
      date: r.date,
      close: Utils.round3(r.close),
      volume: r.volume,
      adLine: Utils.round3(cumulativeAdl),
      obv: Math.round(obvFull[i] ?? 0),
      cmf: cmf20 != null ? Utils.round3(cmf20) : null,
      mfi: mfi14 != null ? Utils.round3(mfi14) : null,
      netForeign: Math.round(cumulativeNetForeign)
    })
  }

  // Current signal indicators from last available data
  const cmfCurrent = calcCMF(clean, 20)
  const mfiCurrent = calcMFI(clean, 14)
  const obvTrend = calcOBVTrend(obvFull)
  const vcp = detectVCP(clean)

  // Volume surge: last 5 days avg vs last 20 days avg
  const vol5 = clean.slice(-5).reduce((s, r) => s + r.volume, 0) / 5
  const vol20 = clean.slice(-20).reduce((s, r) => s + r.volume, 0) / Math.min(20, clean.length)
  const volSurgePct = vol20 > 0 ? ((vol5 - vol20) / vol20) * 100 : null

  // Signal
  let signal: 'accumulation' | 'distribution' | 'neutral' = 'neutral'
  const cmfOk = cmfCurrent != null && cmfCurrent > 0.05
  const mfiOk = mfiCurrent != null && mfiCurrent > 40 && mfiCurrent < 80
  const obvOk = obvTrend === 'up'
  const accumScore = [cmfOk, mfiOk, obvOk].filter(Boolean).length
  const distScore = [
    cmfCurrent != null && cmfCurrent < -0.05,
    mfiCurrent != null && mfiCurrent < 35,
    obvTrend === 'down'
  ].filter(Boolean).length
  if (accumScore >= 2) {
    signal = 'accumulation'
  } else if (distScore >= 2) {
    signal = 'distribution'
  }

  const response: Types.VolumeAnalysisResponse = {
    code: code.trim().toUpperCase(),
    series,
    signal,
    cmfCurrent: cmfCurrent != null ? Utils.round3(cmfCurrent) : null,
    mfiCurrent: mfiCurrent != null ? Utils.round3(mfiCurrent) : null,
    obvTrend,
    volSurgePct: volSurgePct != null ? Utils.round3(volSurgePct) : null,
    vcp
  }
  return ctx.send.json(response)
}
