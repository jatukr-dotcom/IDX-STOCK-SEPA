/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 *
 * Smart Money Tracker — detects institutional footprint signals:
 *   1. Foreign Flow Momentum (30 pts): 5d vs 20d net foreign acceleration
 *   2. Foreign Flow Streak  (10 pts): consecutive net-buy days
 *   3. Volume-Price Divergence (15 pts): OBV trending up while price is flat/down
 *   4. Trade Size Profile (20 pts): avg trade size (value/freq) increasing — institutional blocks
 *   5. Bid/Offer Pressure (10 pts): bid vol > offer vol on latest day
 *   6. Cross-Signal Alignment (15 pts): how many of the above are bullish simultaneously
 * Broker concentration bonus (from broker_stock_metrics table, if data exists):
 *   up to 10 pts added to brokerScore based on top3VolumePct concentration:
 *   top3 ≥ 70% → 10 pts, 60–70% → 7 pts, 50–60% → 4 pts (high = institutional)
 * Total: 100 pts.  Signal: strong-buy ≥75, buy ≥55, neutral ≥35, sell ≥20, strong-sell <20
 */

import type { Context } from '@neabyte/deserve'
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm'
import Database from '@app/server/Database.ts'
import Utils from '@app/server/Utils.ts'
import * as Schemas from '@app/server/schemas/index.ts'
import type * as Types from '@app/server/Types.ts'

type OhlcvEntry = {
  date: number
  high: number
  low: number
  close: number
  volume: number
  value: number
  frequency: number
  foreignBuy: number
  foreignSell: number
  bidVolume: number
  offerVolume: number
}

// ─── Signal helpers ───────────────────────────────────────────────────────────

function calcOBVTrend(rows: OhlcvEntry[]): 'up' | 'flat' | 'down' {
  if (rows.length < 20) {
    return 'flat'
  }
  let obv = 0
  const series: number[] = []
  for (let i = 0; i < rows.length; i++) {
    if (i === 0) {
      series.push(0)
      continue
    }
    if (rows[i]!.close > rows[i - 1]!.close) {
      obv += rows[i]!.volume
    } else if (rows[i]!.close < rows[i - 1]!.close) {
      obv -= rows[i]!.volume
    }
    series.push(obv)
  }
  const recent = series.slice(-20)
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

function priceTrend(rows: OhlcvEntry[], window = 10): 'up' | 'flat' | 'down' {
  if (rows.length < window) {
    return 'flat'
  }
  const first = rows[rows.length - window]!.close
  const last = rows[rows.length - 1]!.close
  if (first <= 0) {
    return 'flat'
  }
  const pct = (last - first) / first
  if (pct > 0.03) {
    return 'up'
  }
  if (pct < -0.03) {
    return 'down'
  }
  return 'flat'
}

function calcForeignFlow(rows: OhlcvEntry[]) {
  const net5d = rows.slice(-5).reduce((s, r) => s + r.foreignBuy - r.foreignSell, 0)
  const net20d = rows.slice(-20).reduce((s, r) => s + r.foreignBuy - r.foreignSell, 0)
  const avg5 = net5d / 5
  const avg20 = net20d / 20
  const acceleration = avg5 - avg20
  let streak = 0
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i]!.foreignBuy > rows[i]!.foreignSell) {
      streak++
    } else {
      break
    }
  }
  return { net5d, net20d, acceleration, streak }
}

function calcAvgTradeSize(rows: OhlcvEntry[], window: number): number | null {
  const slice = rows.slice(-window)
  const totalFreq = slice.reduce((s, r) => s + r.frequency, 0)
  const totalVal = slice.reduce((s, r) => s + r.value, 0)
  if (totalFreq <= 0) {
    return null
  }
  return totalVal / totalFreq
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

interface SmtScores {
  foreignFlowScore: number
  foreignStreakScore: number
  volumePriceScore: number
  tradeSizeScore: number
  bidOfferScore: number
  crossSignalScore: number
  brokerScore: number | null
  total: number
}

function computeSmtScore(
  rows: OhlcvEntry[],
  brokerData: { top3VolumePct: number | null } | null
): SmtScores & {
  foreignNet5d: number | null
  foreignNet20d: number | null
  foreignAcceleration: number | null
  consecutiveForeignBuyDays: number
  avgTradeSize: number | null
  avgTradeSizeChange: number | null
  bidOfferRatio: number | null
  reasons: string[]
  bullishCount: number
} {
  const reasons: string[] = []
  let bullishCount = 0

  // --- 1. Foreign Flow Momentum (30 pts) ---
  const hasEnoughForeign = rows.length >= 20
  let foreignFlowScore = 0
  let foreignNet5d: number | null = null
  let foreignNet20d: number | null = null
  let foreignAcceleration: number | null = null
  let consecutiveForeignBuyDays = 0

  if (hasEnoughForeign) {
    const flow = calcForeignFlow(rows)
    foreignNet5d = flow.net5d
    foreignNet20d = flow.net20d
    foreignAcceleration = Utils.round3(flow.acceleration)
    consecutiveForeignBuyDays = flow.streak

    // Normalize acceleration relative to avg daily volume
    const avgVol20 = rows.slice(-20).reduce((s, r) => s + r.volume, 0) / 20
    const accelNorm = avgVol20 > 0 ? flow.acceleration / avgVol20 : 0
    // map accelNorm [-0.1, +0.1] → [0, 30]
    const rawScore = clamp((accelNorm + 0.1) / 0.2, 0, 1) * 30
    foreignFlowScore = Math.round(rawScore)
    if (foreignFlowScore >= 18) {
      bullishCount++
      reasons.push('Foreign flow accelerating')
    } else if (foreignFlowScore <= 8) {
      reasons.push('Foreign distributing')
    }
  }

  // --- 2. Foreign Flow Streak (10 pts) ---
  let foreignStreakScore = 0
  if (consecutiveForeignBuyDays >= 5) {
    foreignStreakScore = 10
    bullishCount++
    reasons.push(`Asing beli ${consecutiveForeignBuyDays} hari berturut`)
  } else if (consecutiveForeignBuyDays >= 3) {
    foreignStreakScore = 6
  } else if (consecutiveForeignBuyDays >= 1) {
    foreignStreakScore = 3
  }

  // --- 3. Volume-Price Divergence (15 pts) ---
  let volumePriceScore = 0
  const obvTrend = calcOBVTrend(rows)
  const prTrend = priceTrend(rows)
  if (obvTrend === 'up' && prTrend === 'down') {
    // Bullish divergence: OBV up while price down — strongest accumulation signal
    volumePriceScore = 15
    bullishCount++
    reasons.push('Divergence bullish: OBV naik, harga turun')
  } else if (obvTrend === 'up') {
    // OBV confirming price — normal accumulation
    volumePriceScore = 12
    bullishCount++
    reasons.push('OBV naik (akumulasi volume)')
  } else if (obvTrend === 'flat') {
    volumePriceScore = 5
  }

  // --- 4. Trade Size Profile (20 pts) ---
  let tradeSizeScore = 0
  let avgTradeSize: number | null = null
  let avgTradeSizeChange: number | null = null
  if (rows.length >= 20) {
    const ts5 = calcAvgTradeSize(rows, 5)
    const ts20 = calcAvgTradeSize(rows, 20)
    avgTradeSize = ts5
    if (ts5 != null && ts20 != null && ts20 > 0) {
      avgTradeSizeChange = Utils.round3(((ts5 - ts20) / ts20) * 100)
      // map [−30%, +50%] → [0, 20]
      const norm = clamp((avgTradeSizeChange + 30) / 80, 0, 1)
      tradeSizeScore = Math.round(norm * 20)
      if (tradeSizeScore >= 14) {
        bullishCount++
        reasons.push(`Ukuran transaksi naik ${avgTradeSizeChange.toFixed(1)}% (institusional)`)
      }
    }
  }

  // --- 5. Bid/Offer Pressure (10 pts) ---
  let bidOfferScore = 0
  let bidOfferRatio: number | null = null
  const lastRow = rows[rows.length - 1]!
  if (lastRow.bidVolume > 0 && lastRow.offerVolume > 0) {
    bidOfferRatio = Utils.round3(lastRow.bidVolume / lastRow.offerVolume)
    if (bidOfferRatio >= 1.5) {
      bidOfferScore = 10
      bullishCount++
      reasons.push(`Bid/Offer ${bidOfferRatio.toFixed(2)} (tekanan beli)`)
    } else if (bidOfferRatio >= 1.2) {
      bidOfferScore = 6
    } else if (bidOfferRatio >= 1.0) {
      bidOfferScore = 3
    }
  }

  // --- 6. Cross-Signal Alignment (15 pts) ---
  let crossSignalScore = 0
  if (bullishCount >= 4) {
    crossSignalScore = 15
  } else if (bullishCount === 3) {
    crossSignalScore = 10
  } else if (bullishCount === 2) {
    crossSignalScore = 5
  }

  // --- Broker concentration bonus ---
  let brokerScore: number | null = null
  if (brokerData != null && brokerData.top3VolumePct != null) {
    // High concentration (few big players) can signal institutional activity
    // Score: top3 > 70% → 10 pts, 60-70% → 7 pts, 50-60% → 4 pts, else 0
    if (brokerData.top3VolumePct >= 70) {
      brokerScore = 10
      bullishCount++
      reasons.push(`Broker terkonsentrasi (top3: ${brokerData.top3VolumePct.toFixed(0)}%)`)
    } else if (brokerData.top3VolumePct >= 60) {
      brokerScore = 7
    } else if (brokerData.top3VolumePct >= 50) {
      brokerScore = 4
    } else {
      brokerScore = 0
    }
  }

  // Re-calc cross-signal with broker info
  if (brokerScore != null && brokerScore >= 7) {
    if (bullishCount >= 5) {
      crossSignalScore = 15
    } else if (bullishCount === 4) {
      crossSignalScore = 12
    } else if (bullishCount === 3) {
      crossSignalScore = 8
    }
  }

  // --- Total (cap at 100) ---
  const rawTotal = foreignFlowScore + foreignStreakScore + volumePriceScore +
    tradeSizeScore + bidOfferScore + crossSignalScore + (brokerScore ?? 0)
  const total = Math.min(100, rawTotal)

  return {
    foreignFlowScore,
    foreignStreakScore,
    volumePriceScore,
    tradeSizeScore,
    bidOfferScore,
    crossSignalScore,
    brokerScore,
    total,
    foreignNet5d: foreignNet5d != null ? Utils.round3(foreignNet5d) : null,
    foreignNet20d: foreignNet20d != null ? Utils.round3(foreignNet20d) : null,
    foreignAcceleration,
    consecutiveForeignBuyDays,
    avgTradeSize: avgTradeSize != null ? Utils.round3(avgTradeSize) : null,
    avgTradeSizeChange,
    bidOfferRatio,
    reasons,
    bullishCount
  }
}

function classifySignal(
  score: number
): 'strong-buy' | 'buy' | 'neutral' | 'sell' | 'strong-sell' {
  if (score >= 75) {
    return 'strong-buy'
  }
  if (score >= 55) {
    return 'buy'
  }
  if (score >= 35) {
    return 'neutral'
  }
  if (score >= 20) {
    return 'sell'
  }
  return 'strong-sell'
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(ctx: Context) {
  const latestRows = await Database.select({ date: Schemas.summary.date })
    .from(Schemas.summary)
    .orderBy(desc(Schemas.summary.date))
    .limit(1)
  const latestDate = latestRows[0]?.date
  if (latestDate == null) {
    const empty: Types.SmartMoneyResponse = {
      date: 0,
      totalCount: 0,
      hasBrokerData: false,
      data: []
    }
    return ctx.send.json(empty)
  }

  const dateRef = Number(latestDate)
  const dateStart = Utils.addDaysToDateInt(dateRef, -60)

  // Fetch OHLCV + foreign + bid/offer
  const summaryRows = await Database.select({
    stockCode: Schemas.summary.stockCode,
    date: Schemas.summary.date,
    priceHigh: Schemas.summary.priceHigh,
    priceLow: Schemas.summary.priceLow,
    priceClose: Schemas.summary.priceClose,
    volume: Schemas.summary.volume,
    value: Schemas.summary.value,
    frequency: Schemas.summary.frequency,
    foreignBuy: Schemas.summary.foreignBuy,
    foreignSell: Schemas.summary.foreignSell,
    bidVolume: Schemas.summary.bidVolume,
    offerVolume: Schemas.summary.offerVolume
  })
    .from(Schemas.summary)
    .where(and(gte(Schemas.summary.date, dateStart), lte(Schemas.summary.date, dateRef)))
    .orderBy(asc(Schemas.summary.stockCode), asc(Schemas.summary.date))

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
      value: r.value != null ? Number(r.value) : 0,
      frequency: r.frequency != null ? Number(r.frequency) : 0,
      foreignBuy: r.foreignBuy != null ? Number(r.foreignBuy) : 0,
      foreignSell: r.foreignSell != null ? Number(r.foreignSell) : 0,
      bidVolume: r.bidVolume != null ? Number(r.bidVolume) : 0,
      offerVolume: r.offerVolume != null ? Number(r.offerVolume) : 0
    }
    const list = byCode.get(r.stockCode) ?? []
    list.push(entry)
    byCode.set(r.stockCode, list)
  }

  // Fetch screener metadata
  const screenerRows = await Database.select({
    code: Schemas.screener.code,
    name: Schemas.screener.name,
    sector: Schemas.screener.sector,
    notation: Schemas.screener.notation,
    marketCapital: Schemas.screener.marketCapital
  }).from(Schemas.screener)
  const screenerMap = new Map<string, {
    name: string | null
    sector: string | null
    notation: string | null
    mc: number | null
  }>()
  for (const r of screenerRows) {
    screenerMap.set(r.code, {
      name: r.name ?? null,
      sector: r.sector ?? null,
      notation: r.notation ?? null,
      mc: r.marketCapital != null ? Number(r.marketCapital) : null
    })
  }

  // Fetch broker concentration data for latest date
  const brokerRows = await Database.select({
    stockCode: Schemas.brokerStockMetrics.stockCode,
    top3VolumePct: Schemas.brokerStockMetrics.top3VolumePct,
    dominantBrokerCode: Schemas.brokerStockMetrics.dominantBrokerCode,
    dominantBrokerName: Schemas.brokerStockMetrics.dominantBrokerName,
    dominantBrokerVolumePct: Schemas.brokerStockMetrics.dominantBrokerVolumePct
  })
    .from(Schemas.brokerStockMetrics)
    .where(eq(Schemas.brokerStockMetrics.date, dateRef))
  const brokerMap = new Map<string, {
    top3VolumePct: number | null
    dominantBrokerName: string | null
  }>()
  for (const r of brokerRows) {
    brokerMap.set(r.stockCode, {
      top3VolumePct: r.top3VolumePct != null ? Number(r.top3VolumePct) : null,
      dominantBrokerName: r.dominantBrokerName ?? null
    })
  }
  const hasBrokerData = brokerRows.length > 0

  const results: Types.SmartMoneyRow[] = []

  for (const [code, rows] of byCode.entries()) {
    if (rows.length < 20) {
      continue
    }

    const fund = screenerMap.get(code)
    // Skip gorengan
    if (fund?.notation === 'X') {
      continue
    }
    if (fund?.mc != null && fund.mc < 100_000_000_000) {
      continue
    }

    const brokerData = brokerMap.get(code) ?? null
    const scores = computeSmtScore(rows, brokerData)

    const price = rows[rows.length - 1]!.close

    results.push({
      code,
      name: fund?.name ?? null,
      sector: fund?.sector ?? null,
      price: Utils.round3(price),
      smtScore: scores.total,
      foreignFlowScore: scores.foreignFlowScore,
      foreignStreakScore: scores.foreignStreakScore,
      volumePriceScore: scores.volumePriceScore,
      tradeSizeScore: scores.tradeSizeScore,
      bidOfferScore: scores.bidOfferScore,
      crossSignalScore: scores.crossSignalScore,
      brokerScore: scores.brokerScore,
      foreignNet5d: scores.foreignNet5d,
      foreignNet20d: scores.foreignNet20d,
      foreignAcceleration: scores.foreignAcceleration,
      consecutiveForeignBuyDays: scores.consecutiveForeignBuyDays,
      avgTradeSize: scores.avgTradeSize,
      avgTradeSizeChange: scores.avgTradeSizeChange,
      bidOfferRatio: scores.bidOfferRatio,
      signal: classifySignal(scores.total),
      reasons: scores.reasons,
      topBrokerConcentration: brokerData?.top3VolumePct ?? null,
      dominantBrokerName: brokerData?.dominantBrokerName ?? null
    })
  }

  results.sort((a, b) => b.smtScore - a.smtScore)

  const response: Types.SmartMoneyResponse = {
    date: dateRef,
    totalCount: results.length,
    hasBrokerData,
    data: results
  }
  return ctx.send.json(response)
}
