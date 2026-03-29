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

function calcMFM(high: number, low: number, close: number): number {
  if (high === low) {
    return 0
  }
  return ((close - low) - (high - close)) / (high - low)
}

function calcCMF20(
  rows: { high: number; low: number; close: number; volume: number }[]
): number | null {
  if (rows.length < 20) {
    return null
  }
  const slice = rows.slice(-20)
  let sumMFV = 0
  let sumVol = 0
  for (const r of slice) {
    sumMFV += calcMFM(r.high, r.low, r.close) * r.volume
    sumVol += r.volume
  }
  if (sumVol === 0) {
    return null
  }
  return sumMFV / sumVol
}

function calcMFI14(
  rows: { high: number; low: number; close: number; volume: number }[]
): number | null {
  if (rows.length < 15) {
    return null
  }
  const slice = rows.slice(-15)
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
  return 100 - (100 / (1 + posFlow / negFlow))
}

function calcOBVTrend(rows: { close: number; volume: number }[]): 'up' | 'down' | 'flat' {
  if (rows.length < 20) {
    return 'flat'
  }
  let obv = 0
  const obvSeries: number[] = []
  for (let i = 0; i < rows.length; i++) {
    if (i === 0) {
      obvSeries.push(0)
      continue
    }
    if (rows[i]!.close > rows[i - 1]!.close) {
      obv += rows[i]!.volume
    } else if (rows[i]!.close < rows[i - 1]!.close) {
      obv -= rows[i]!.volume
    }
    obvSeries.push(obv)
  }
  const recent = obvSeries.slice(-20)
  const first = recent[0]!
  const last = recent[recent.length - 1]!
  const scale = Math.abs(first) || 1
  const pct = (last - first) / scale
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
  if (rows.length < 60) {
    return { isVcp: false, contractions: 0, volumeDrying: false }
  }

  const windows = [
    rows.slice(rows.length - 60, rows.length - 40),
    rows.slice(rows.length - 40, rows.length - 20),
    rows.slice(rows.length - 20)
  ]

  const analyzed = windows.map((w) => {
    const maxH = Math.max(...w.map((r) => r.high))
    const minL = Math.min(...w.map((r) => r.low))
    const midpoint = (maxH + minL) / 2
    const range = midpoint > 0 ? ((maxH - minL) / midpoint) * 100 : 0
    const avgVol = w.reduce((s, r) => s + r.volume, 0) / w.length
    return { range, avgVol }
  })

  let contractions = 0
  for (let i = 1; i < analyzed.length; i++) {
    if (analyzed[i]!.range < analyzed[i - 1]!.range * 0.85) {
      contractions++
    }
  }

  const volumeDrying = analyzed[2]!.avgVol < analyzed[0]!.avgVol * 0.75

  const last252 = rows.slice(Math.max(0, rows.length - 252))
  const high52w = Math.max(...last252.map((r) => r.high))
  const currentClose = rows[rows.length - 1]!.close
  const pctFromHigh = high52w > 0 ? ((currentClose - high52w) / high52w) * 100 : -100
  const nearHighs = pctFromHigh >= -20

  return {
    isVcp: contractions >= 1 && volumeDrying && nearHighs,
    contractions,
    volumeDrying
  }
}

export async function GET(ctx: Context) {
  const latestRows = await Database.select({ date: Schemas.summary.date })
    .from(Schemas.summary)
    .orderBy(desc(Schemas.summary.date))
    .limit(1)
  const latestDate = latestRows[0]?.date
  if (latestDate == null) {
    return ctx.send.json({ date: 0, totalCount: 0, data: [] })
  }

  const dateRef = Number(latestDate)
  const dateStart = Utils.addDaysToDateInt(dateRef, -120)

  // Fetch OHLCV for all stocks
  const summaryRows = await Database.select({
    stockCode: Schemas.summary.stockCode,
    date: Schemas.summary.date,
    priceHigh: Schemas.summary.priceHigh,
    priceLow: Schemas.summary.priceLow,
    priceClose: Schemas.summary.priceClose,
    volume: Schemas.summary.volume,
    foreignBuy: Schemas.summary.foreignBuy,
    foreignSell: Schemas.summary.foreignSell
  })
    .from(Schemas.summary)
    .where(and(gte(Schemas.summary.date, dateStart), lte(Schemas.summary.date, dateRef)))
    .orderBy(asc(Schemas.summary.stockCode), asc(Schemas.summary.date))

  type OhlcvEntry = {
    date: number
    high: number
    low: number
    close: number
    volume: number
    foreignBuy: number
    foreignSell: number
  }
  const byCode = new Map<string, OhlcvEntry[]>()
  for (const r of summaryRows) {
    const close = r.priceClose != null && Number.isFinite(Number(r.priceClose))
      ? Number(r.priceClose)
      : null
    if (close == null || close <= 0) {
      continue
    }
    const entry: OhlcvEntry = {
      date: Number(r.date),
      high: r.priceHigh != null ? Number(r.priceHigh) : close,
      low: r.priceLow != null ? Number(r.priceLow) : close,
      close,
      volume: r.volume != null ? Number(r.volume) : 0,
      foreignBuy: r.foreignBuy != null ? Number(r.foreignBuy) : 0,
      foreignSell: r.foreignSell != null ? Number(r.foreignSell) : 0
    }
    const list = byCode.get(r.stockCode) ?? []
    list.push(entry)
    byCode.set(r.stockCode, list)
  }

  // Screener fundamentals
  const screenerRows = await Database.select({
    code: Schemas.screener.code,
    name: Schemas.screener.name,
    sector: Schemas.screener.sector
  }).from(Schemas.screener)

  const screenerMap = new Map<string, { name: string | null; sector: string | null }>()
  for (const row of screenerRows) {
    screenerMap.set(row.code, { name: row.name ?? null, sector: row.sector ?? null })
  }

  const results: Types.VolumeScreenerRow[] = []

  for (const [code, rows] of byCode.entries()) {
    if (rows.length < 25) {
      continue
    }

    const cmf = calcCMF20(rows)
    const mfi = calcMFI14(rows)
    const obvTrend = calcOBVTrend(rows)
    const vcp = detectVCP(rows)

    // Volume surge: avg 5d vs avg 20d
    const vol5 = rows.slice(-5).reduce((s, r) => s + r.volume, 0) / 5
    const vol20 = rows.slice(-20).reduce((s, r) => s + r.volume, 0) / 20
    const volSurgePct = vol20 > 0 ? ((vol5 - vol20) / vol20) * 100 : null

    // Net foreign (last 20d as % of total volume)
    const totalForeignNet = rows.slice(-20).reduce((s, r) => s + (r.foreignBuy - r.foreignSell), 0)
    const totalVol20 = rows.slice(-20).reduce((s, r) => s + r.volume, 0)
    const foreignNetPct = totalVol20 > 0 ? (totalForeignNet / totalVol20) * 100 : null

    // 5 Accumulation criteria
    const c1 = cmf != null && cmf > 0 // CMF positive
    const c2 = mfi != null && mfi >= 40 && mfi <= 80 // MFI healthy
    const c3 = obvTrend === 'up' // OBV trending up
    const c4 = volSurgePct != null && volSurgePct > 20 // Volume surge
    const c5 = foreignNetPct != null && foreignNetPct > 0 // Foreign net buy
    const criteriaCount = [c1, c2, c3, c4, c5].filter(Boolean).length

    let signal: 'accumulation' | 'distribution' | 'neutral' = 'neutral'
    const distC1 = cmf != null && cmf < -0.05
    const distC2 = mfi != null && mfi < 35
    const distC3 = obvTrend === 'down'
    const accumScore = [c1, c3, cmf != null && cmf > 0.05].filter(Boolean).length
    const distScore = [distC1, distC2, distC3].filter(Boolean).length
    if (accumScore >= 2) {
      signal = 'accumulation'
    } else if (distScore >= 2) {
      signal = 'distribution'
    }

    const fund = screenerMap.get(code)
    const currentClose = rows[rows.length - 1]!.close

    results.push({
      code,
      name: fund?.name ?? null,
      sector: fund?.sector ?? null,
      close: Utils.round3(currentClose),
      cmf: cmf != null ? Utils.round3(cmf) : null,
      mfi: mfi != null ? Utils.round3(mfi) : null,
      obvTrend,
      signal,
      foreignNetPct: foreignNetPct != null ? Utils.round3(foreignNetPct) : null,
      volSurgePct: volSurgePct != null ? Utils.round3(volSurgePct) : null,
      criteriaCount,
      vcp
    })
  }

  // Sort: VCP first, then by criteriaCount desc, then CMF desc
  results.sort((a, b) => {
    if (a.vcp.isVcp !== b.vcp.isVcp) {
      return a.vcp.isVcp ? -1 : 1
    }
    if (b.criteriaCount !== a.criteriaCount) {
      return b.criteriaCount - a.criteriaCount
    }
    const aCmf = a.cmf ?? -99
    const bCmf = b.cmf ?? -99
    return bCmf - aCmf
  })

  const response: Types.VolumeScreenerResponse = {
    date: dateRef,
    totalCount: results.length,
    data: results
  }
  return ctx.send.json(response)
}
