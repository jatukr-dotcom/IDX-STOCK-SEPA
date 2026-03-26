/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Pure technical indicator calculations: EMA, MACD, Stochastic RSI,
 * Support/Resistance, Fibonacci Retracement, Divergence Detection.
 */

import RSI from '@app/server/RSI.ts'
import type * as Types from '@app/server/Types.ts'

type OhlcRow = { date: number; high: number; low: number; close: number }

export default class TechnicalAnalysis {
  // ─── EMA ────────────────────────────────────────────────────────────────

  static calculateEMA(values: number[], period: number): (number | null)[] {
    const result: (number | null)[] = new Array(values.length).fill(null)
    if (values.length < period) return result
    const k = 2 / (period + 1)
    // Seed with SMA of first `period` values
    let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period
    result[period - 1] = ema
    for (let i = period; i < values.length; i++) {
      ema = values[i]! * k + ema * (1 - k)
      result[i] = ema
    }
    return result
  }

  // ─── MACD ────────────────────────────────────────────────────────────────

  static calculateMACD(
    closes: number[],
    fastPeriod = 12,
    slowPeriod = 26,
    signalPeriod = 9
  ): { macdLine: (number | null)[]; signalLine: (number | null)[]; histogram: (number | null)[] } {
    const ema12 = TechnicalAnalysis.calculateEMA(closes, fastPeriod)
    const ema26 = TechnicalAnalysis.calculateEMA(closes, slowPeriod)
    const macdLine: (number | null)[] = closes.map((_, i) => {
      const a = ema12[i]
      const b = ema26[i]
      return a != null && b != null ? a - b : null
    })

    // Signal = EMA(9) of MACD line
    // Extract valid MACD values with their original indices
    const validMacdValues: number[] = []
    const validMacdIndices: number[] = []
    for (let i = 0; i < macdLine.length; i++) {
      const v = macdLine[i]
      if (v != null) {
        validMacdValues.push(v)
        validMacdIndices.push(i)
      }
    }

    const signalLine: (number | null)[] = new Array(closes.length).fill(null)
    const histogram: (number | null)[] = new Array(closes.length).fill(null)

    if (validMacdValues.length >= signalPeriod) {
      const signalEma = TechnicalAnalysis.calculateEMA(validMacdValues, signalPeriod)
      for (let j = 0; j < signalEma.length; j++) {
        const sv = signalEma[j]
        const origIdx = validMacdIndices[j]
        if (sv != null && origIdx != null) {
          signalLine[origIdx] = sv
          const mv = macdLine[origIdx]
          histogram[origIdx] = mv != null ? mv - sv : null
        }
      }
    }

    return { macdLine, signalLine, histogram }
  }

  // ─── Stochastic RSI ──────────────────────────────────────────────────────

  static calculateStochRSI(
    closes: number[],
    rsiPeriod = 14,
    stochPeriod = 14,
    dSmoothing = 3
  ): { k: (number | null)[]; d: (number | null)[] } {
    const rsiValues = RSI.calculate(closes, rsiPeriod)
    const k: (number | null)[] = new Array(closes.length).fill(null)
    const d: (number | null)[] = new Array(closes.length).fill(null)

    // Calculate %K using rolling window over RSI values
    const kValid: number[] = []
    const kIndices: number[] = []

    for (let i = stochPeriod - 1; i < rsiValues.length; i++) {
      // Collect `stochPeriod` consecutive non-null RSI values ending at i
      const window: number[] = []
      for (let j = i - stochPeriod + 1; j <= i; j++) {
        const v = rsiValues[j]
        if (v != null) window.push(v)
      }
      if (window.length < stochPeriod) continue

      const hi = Math.max(...window)
      const lo = Math.min(...window)
      const cur = rsiValues[i]
      if (cur == null) continue

      const kVal = hi === lo ? 50 : ((cur - lo) / (hi - lo)) * 100
      k[i] = Math.round(kVal * 100) / 100
      kValid.push(k[i]!)
      kIndices.push(i)
    }

    // %D = SMA(3) of %K
    for (let j = dSmoothing - 1; j < kValid.length; j++) {
      const slice = kValid.slice(j - dSmoothing + 1, j + 1)
      const avg = slice.reduce((a, b) => a + b, 0) / dSmoothing
      const origIdx = kIndices[j]
      if (origIdx != null) {
        d[origIdx] = Math.round(avg * 100) / 100
      }
    }

    return { k, d }
  }

  // ─── Support & Resistance ────────────────────────────────────────────────

  static calculateSupportResistance(rows: OhlcRow[]): Types.SupportResistanceData {
    // Pivot Points from the most recent day
    const last = rows[rows.length - 1]!
    const H = last.high
    const L = last.low
    const C = last.close
    const P = (H + L + C) / 3
    const pivotLevels: Types.PivotLevels = {
      pivot: Math.round(P * 100) / 100,
      r1: Math.round((2 * P - L) * 100) / 100,
      r2: Math.round((P + (H - L)) * 100) / 100,
      r3: Math.round((H + 2 * (P - L)) * 100) / 100,
      s1: Math.round((2 * P - H) * 100) / 100,
      s2: Math.round((P - (H - L)) * 100) / 100,
      s3: Math.round((L - 2 * (H - P)) * 100) / 100
    }

    // Swing Levels from last 60 rows (5-bar pivot detection)
    const recent = rows.slice(Math.max(0, rows.length - 80))
    const swingLevels: Types.SwingLevel[] = []

    for (let i = 2; i < recent.length - 2; i++) {
      const r = recent[i]!
      const prev1 = recent[i - 1]!
      const prev2 = recent[i - 2]!
      const next1 = recent[i + 1]!
      const next2 = recent[i + 2]!

      if (
        r.high > prev1.high && r.high > prev2.high &&
        r.high > next1.high && r.high > next2.high
      ) {
        swingLevels.push({ date: r.date, price: r.high, type: 'high' })
      } else if (
        r.low < prev1.low && r.low < prev2.low &&
        r.low < next1.low && r.low < next2.low
      ) {
        swingLevels.push({ date: r.date, price: r.low, type: 'low' })
      }
    }

    // Return most recent 5 highs and 5 lows
    const highs = swingLevels.filter((s) => s.type === 'high').slice(-5)
    const lows = swingLevels.filter((s) => s.type === 'low').slice(-5)

    return { pivotLevels, swingLevels: [...highs, ...lows].sort((a, b) => a.date - b.date) }
  }

  // ─── Fibonacci Retracement ───────────────────────────────────────────────

  static calculateFibonacci(rows: OhlcRow[]): Types.FibonacciData | null {
    if (rows.length < 2) return null

    let swingHighIdx = 0
    let swingLowIdx = 0
    let swingHigh = rows[0]!.high
    let swingLow = rows[0]!.low

    for (let i = 1; i < rows.length; i++) {
      if (rows[i]!.high > swingHigh) {
        swingHigh = rows[i]!.high
        swingHighIdx = i
      }
      if (rows[i]!.low < swingLow) {
        swingLow = rows[i]!.low
        swingLowIdx = i
      }
    }

    const range = swingHigh - swingLow
    if (range <= 0) return null

    const trend: 'up' | 'down' = swingHighIdx > swingLowIdx ? 'up' : 'down'
    const ratios = [
      { ratio: 0, label: '0%' },
      { ratio: 0.236, label: '23.6%' },
      { ratio: 0.382, label: '38.2%' },
      { ratio: 0.5, label: '50%' },
      { ratio: 0.618, label: '61.8%' },
      { ratio: 0.786, label: '78.6%' },
      { ratio: 1, label: '100%' }
    ]

    const levels: Types.FibonacciLevel[] = ratios.map(({ ratio, label }) => {
      const price = trend === 'up'
        ? swingHigh - ratio * range
        : swingLow + ratio * range
      return { ratio, label, price: Math.round(price * 100) / 100 }
    })

    return {
      swingHigh: Math.round(swingHigh * 100) / 100,
      swingHighDate: rows[swingHighIdx]!.date,
      swingLow: Math.round(swingLow * 100) / 100,
      swingLowDate: rows[swingLowIdx]!.date,
      trend,
      levels
    }
  }

  // ─── Divergence Detection ────────────────────────────────────────────────

  static detectDivergences(
    rows: OhlcRow[],
    rsiValues: (number | null)[],
    stochK: (number | null)[]
  ): Types.DivergenceSignal[] {
    const signals: Types.DivergenceSignal[] = []

    // Use last 60 rows for divergence scan
    const startIdx = Math.max(0, rows.length - 60)

    // Find price swing lows and highs (3-bar pivot for more signals)
    const priceLows: { idx: number; price: number }[] = []
    const priceHighs: { idx: number; price: number }[] = []

    for (let i = startIdx + 1; i < rows.length - 1; i++) {
      const r = rows[i]!
      const prev = rows[i - 1]!
      const next = rows[i + 1]!
      if (r.low < prev.low && r.low < next.low) {
        priceLows.push({ idx: i, price: r.low })
      }
      if (r.high > prev.high && r.high > next.high) {
        priceHighs.push({ idx: i, price: r.high })
      }
    }

    const indicators: Array<{ name: 'rsi' | 'stochRsi'; values: (number | null)[] }> = [
      { name: 'rsi', values: rsiValues },
      { name: 'stochRsi', values: stochK }
    ]

    for (const { name, values } of indicators) {
      // Bullish divergence: price lower low, indicator higher low
      for (let i = 1; i < priceLows.length; i++) {
        const prev = priceLows[i - 1]!
        const curr = priceLows[i]!
        const indPrev = values[prev.idx]
        const indCurr = values[curr.idx]
        if (indPrev == null || indCurr == null) continue
        if (curr.price < prev.price && indCurr > indPrev) {
          signals.push({
            type: 'bullish',
            indicator: name,
            startDate: rows[prev.idx]!.date,
            endDate: rows[curr.idx]!.date,
            priceStart: prev.price,
            priceEnd: curr.price,
            indicatorStart: Math.round(indPrev * 10) / 10,
            indicatorEnd: Math.round(indCurr * 10) / 10
          })
        }
      }

      // Bearish divergence: price higher high, indicator lower high
      for (let i = 1; i < priceHighs.length; i++) {
        const prev = priceHighs[i - 1]!
        const curr = priceHighs[i]!
        const indPrev = values[prev.idx]
        const indCurr = values[curr.idx]
        if (indPrev == null || indCurr == null) continue
        if (curr.price > prev.price && indCurr < indPrev) {
          signals.push({
            type: 'bearish',
            indicator: name,
            startDate: rows[prev.idx]!.date,
            endDate: rows[curr.idx]!.date,
            priceStart: prev.price,
            priceEnd: curr.price,
            indicatorStart: Math.round(indPrev * 10) / 10,
            indicatorEnd: Math.round(indCurr * 10) / 10
          })
        }
      }
    }

    // Return most recent 5, sorted by endDate desc
    return signals
      .sort((a, b) => b.endDate - a.endDate)
      .slice(0, 5)
  }
}
