/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * RS Line = stockClose / ihsgClose (IHSG computed from sum(individualIndex * weightForIndex))
 * RS Line New High = current RS Line value >= 52w high of RS Line
 */

import type { Context } from '@neabyte/deserve'
import { and, asc, desc, gte, isNotNull, lte, sql } from 'drizzle-orm'
import Database from '@app/server/Database.ts'
import Utils from '@app/server/Utils.ts'
import * as Schemas from '@app/server/schemas/index.ts'
import type * as Types from '@app/server/Types.ts'

function returnPct(current: number, past: number): number | null {
  if (past <= 0 || !Number.isFinite(past) || !Number.isFinite(current)) {
    return null
  }
  return ((current - past) / past) * 100
}

function calcMA(prices: number[], period: number): number | null {
  if (prices.length < period) {
    return null
  }
  const slice = prices.slice(prices.length - period)
  return slice.reduce((a, b) => a + b, 0) / period
}

export async function GET(ctx: Context) {
  const onlyNewHighStr = Utils.queryString(ctx.query('onlyNewHigh'))
  const onlyNewHigh = onlyNewHighStr === 'true' || onlyNewHighStr === '1'

  const latestRows = await Database.select({ date: Schemas.summary.date })
    .from(Schemas.summary)
    .orderBy(desc(Schemas.summary.date))
    .limit(1)
  const latestDate = latestRows[0]?.date
  if (latestDate == null) {
    const empty: Types.RsLineResponse = { date: 0, totalCount: 0, data: [] }
    return ctx.send.json(empty)
  }
  const dateRef = Number(latestDate)
  const dateStart = Utils.addDaysToDateInt(dateRef, -400)

  // Compute IHSG per date: SUM(individual_index * weight_for_index)
  const ihsgRaw = await Database.select({
    date: Schemas.summary.date,
    ihsg: sql<number>`SUM(${Schemas.summary.individualIndex} * ${Schemas.summary.weightForIndex})`
  })
    .from(Schemas.summary)
    .where(
      and(
        gte(Schemas.summary.date, dateStart),
        lte(Schemas.summary.date, dateRef),
        isNotNull(Schemas.summary.individualIndex),
        isNotNull(Schemas.summary.weightForIndex)
      )
    )
    .groupBy(Schemas.summary.date)
    .orderBy(asc(Schemas.summary.date))

  const ihsgByDate = new Map<number, number>()
  for (const row of ihsgRaw) {
    if (row.ihsg != null && Number.isFinite(Number(row.ihsg)) && Number(row.ihsg) > 0) {
      ihsgByDate.set(Number(row.date), Number(row.ihsg))
    }
  }

  if (ihsgByDate.size === 0) {
    const empty: Types.RsLineResponse = { date: 0, totalCount: 0, data: [] }
    return ctx.send.json(empty)
  }

  // Fetch stock OHLC
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
    if (close == null || close <= 0) {
      continue
    }
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

  const results: Types.RsLineRow[] = []

  for (const [code, rows] of ohlcByCode.entries()) {
    if (rows.length < 50) {
      continue
    }

    // Build RS Line series: rsLine[i] = stockClose[i] / ihsgClose[i]
    // Normalize: first value = 100
    const rsLineSeries: number[] = []
    let firstRs: number | null = null
    for (const r of rows) {
      const ihsg = ihsgByDate.get(r.date)
      if (ihsg == null || ihsg <= 0) {
        rsLineSeries.push(NaN)
        continue
      }
      const raw = r.close / ihsg
      if (firstRs == null) {
        firstRs = raw
      }
      rsLineSeries.push(firstRs > 0 ? (raw / firstRs) * 100 : NaN)
    }

    // Filter to valid entries
    const validRs = rsLineSeries.filter((v) => Number.isFinite(v))
    if (validRs.length < 20) {
      continue
    }

    const currentRs = validRs[validRs.length - 1]

    // 52w high of RS Line (last 252 data points)
    const rs252 = validRs.slice(-252)
    const rsHigh52w = Math.max(...rs252)

    const rsLineNewHigh = currentRs >= rsHigh52w * 0.999 // within 0.1% counts as new high
    const rsLinePctFrom52wHigh = rsHigh52w > 0 ? ((currentRs - rsHigh52w) / rsHigh52w) * 100 : null

    if (onlyNewHigh && !rsLineNewHigh) {
      continue
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

    const last252 = rows.slice(Math.max(0, rows.length - 252))
    const high52w = Math.max(...last252.map((r) => r.high))
    const low52w = Math.min(...last252.map((r) => r.low))
    const pctFrom52wHigh = high52w > 0 ? ((price - high52w) / high52w) * 100 : null
    const pctFrom52wLow = low52w > 0 ? ((price - low52w) / low52w) * 100 : null
    const rsRank = rsRankByCode.get(code) ?? null
    const ma200Trending = ma200SlopePct != null && ma200SlopePct > 0

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
      rsLineValue: Math.round(currentRs * 100) / 100,
      rsLineNewHigh,
      rsLinePctFrom52wHigh: rsLinePctFrom52wHigh != null
        ? Utils.round3(rsLinePctFrom52wHigh)
        : null,
      rsRank,
      pctFrom52wHigh: pctFrom52wHigh != null ? Utils.round3(pctFrom52wHigh) : null,
      trendCriteriaCount
    })
  }

  // Sort: RS Line New High first, then by RS rank descending
  results.sort((a, b) => {
    if (a.rsLineNewHigh !== b.rsLineNewHigh) {
      return a.rsLineNewHigh ? -1 : 1
    }
    return (b.rsLinePctFrom52wHigh ?? -999) - (a.rsLinePctFrom52wHigh ?? -999)
  })

  const response: Types.RsLineResponse = {
    date: dateRef,
    totalCount: results.length,
    data: results
  }
  return ctx.send.json(response)
}
