/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Shared Stage Analysis helpers: determineStage, calcMA, returnPct, calcMA200SlopePct.
 * Single source of truth — imported by all endpoints that need stage determination.
 */

import type * as Types from '@app/server/Types.ts'

// ─── Helpers ────────────────────────────────────────────────────────────────

export function calcMA(prices: number[], period: number): number | null {
  if (prices.length < period) {
    return null
  }
  const slice = prices.slice(prices.length - period)
  return slice.reduce((a, b) => a + b, 0) / period
}

export function returnPct(current: number, past: number): number | null {
  if (past <= 0 || !Number.isFinite(past) || !Number.isFinite(current)) {
    return null
  }
  return ((current - past) / past) * 100
}

/**
 * Calculate the percentage slope of the MA200 over the last ~22 trading days.
 * Compares current MA200 against the MA200 computed from closes up to 22 days ago.
 */
export function calcMA200SlopePct(closes: number[]): number | null {
  const ma200 = calcMA(closes, 200)
  if (ma200 == null || closes.length < 222) {
    return null
  }
  const olderCloses = closes.slice(0, closes.length - 22)
  const ma200older = calcMA(olderCloses, 200)
  if (ma200older == null || ma200older <= 0) {
    return null
  }
  return ((ma200 - ma200older) / ma200older) * 100
}

// ─── Stage Determination (single data point) ────────────────────────────────

/** MA proximity tolerance — 1% margin to prevent flipping on minor moves */
const PROXIMITY_PCT = 0.99

/**
 * Determines the current market stage based on Minervini's stage analysis.
 * Uses 1% proximity tolerance on MA comparisons to reduce noise-driven flipping.
 *
 * Stage 2 criteria are STRICT (all must be met):
 *   price > MA50, MA50 > MA150, MA150 > MA200, MA200 slope positive
 * Stage 4 criteria: price < MA200, MA200 slope negative
 * Stage 3 criteria: price < MA50 OR MA150 < MA200
 * Stage 1: everything else (basing/accumulation)
 */
export function determineStage(
  price: number,
  ma50: number | null,
  ma150: number | null,
  ma200: number | null,
  ma200SlopePct: number | null
): Types.StageNumber {
  if (ma200 == null) {
    if (
      ma50 != null && price > ma50 * PROXIMITY_PCT &&
      (ma150 == null || ma50 > ma150 * PROXIMITY_PCT)
    ) {
      return 2
    }
    return 1
  }
  const ma200up = ma200SlopePct != null && ma200SlopePct > 0
  // Stage 2: Full bullish alignment
  if (
    ma50 != null && ma150 != null &&
    price > ma50 * PROXIMITY_PCT &&
    ma50 > ma150 * PROXIMITY_PCT &&
    ma150 > ma200 * PROXIMITY_PCT &&
    ma200up
  ) {
    return 2
  }
  // Stage 4: Clear decline
  if (price < ma200 * (2 - PROXIMITY_PCT) && !ma200up) {
    return 4
  }
  // Stage 3: Distribution/topping
  if (
    ma50 != null &&
    (price < ma50 * (2 - PROXIMITY_PCT) || (ma150 != null && ma150 < ma200 * (2 - PROXIMITY_PCT)))
  ) {
    return 3
  }
  // Stage 1: Basing
  return 1
}

/**
 * Determines the stage with a label string.
 * Convenience wrapper for endpoints that return stage label.
 */
export function determineStageWithLabel(
  price: number,
  ma50: number | null,
  ma150: number | null,
  ma200: number | null,
  ma200SlopePct: number | null
): { stage: Types.StageNumber; label: string } {
  const stage = determineStage(price, ma50, ma150, ma200, ma200SlopePct)
  const labels: Record<Types.StageNumber, string> = {
    1: 'Stage 1: Basing',
    2: 'Stage 2: Advancing',
    3: 'Stage 3: Topping',
    4: 'Stage 4: Declining'
  }
  return { stage, label: labels[stage] }
}

// ─── Stage with Confirmation (multi-day voting) ─────────────────────────────

/**
 * Determines stage with 3-of-5 day confirmation to prevent daily flipping.
 *
 * Computes the raw stage for the last 5 trading days. If ≥3 days agree on the
 * same stage, that stage wins. Otherwise falls back to the latest day's stage.
 *
 * @param closes - Full array of close prices (oldest first)
 * @param confirmDays - Number of days to look back for confirmation (default 5)
 * @param majority - Minimum days that must agree (default 3)
 */
export function determineStageConfirmed(
  closes: number[],
  confirmDays = 5,
  majority = 3
): Types.StageNumber {
  if (closes.length < 50) {
    return 1
  }

  const votes: Types.StageNumber[] = []
  const maxOffset = Math.min(confirmDays, closes.length - 222)

  // If not enough data for multi-day, just compute current
  if (maxOffset < 1) {
    const price = closes[closes.length - 1]!
    const ma50 = calcMA(closes, 50)
    const ma150 = calcMA(closes, 150)
    const ma200 = calcMA(closes, 200)
    const slopePct = calcMA200SlopePct(closes)
    return determineStage(price, ma50, ma150, ma200, slopePct)
  }

  // Compute stage for each of the last N days
  for (let offset = 0; offset < Math.min(confirmDays, maxOffset + 1); offset++) {
    const endIdx = closes.length - offset
    const slice = closes.slice(0, endIdx)
    if (slice.length < 50) {
      break
    }

    const price = slice[slice.length - 1]!
    const ma50 = calcMA(slice, 50)
    const ma150 = calcMA(slice, 150)
    const ma200 = calcMA(slice, 200)
    const slopePct = calcMA200SlopePct(slice)
    votes.push(determineStage(price, ma50, ma150, ma200, slopePct))
  }

  if (votes.length === 0) {
    return 1
  }

  // Count occurrences of each stage
  const counts = new Map<Types.StageNumber, number>()
  for (const v of votes) {
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }

  // Find the stage that appears ≥ majority times
  for (const [stage, count] of counts) {
    if (count >= majority) {
      return stage
    }
  }

  // No majority — use latest day's stage (votes[0] is day 0 = latest)
  return votes[0]!
}

/**
 * Confirmed stage with label string.
 */
export function determineStageConfirmedWithLabel(
  closes: number[],
  confirmDays = 5,
  majority = 3
): { stage: Types.StageNumber; label: string } {
  const stage = determineStageConfirmed(closes, confirmDays, majority)
  const labels: Record<Types.StageNumber, string> = {
    1: 'Stage 1: Basing',
    2: 'Stage 2: Advancing',
    3: 'Stage 3: Topping',
    4: 'Stage 4: Declining'
  }
  return { stage, label: labels[stage] }
}
