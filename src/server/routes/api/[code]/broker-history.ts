/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 *
 * Historical broker tracking for a specific stock.
 * Returns top-10 broker presence per day + accumulation trend analysis.
 *
 * GET /api/{code}/broker-history?days=30
 *
 * Heuristic for isAccumulating:
 *   - present in ≥50% of trading days
 *   - avgRank ≤ 5 (consistently in top half of top-10)
 *   - rankTrend !== 'declining'
 */

import type { Context } from '@neabyte/deserve'
import { and, asc, desc, eq, gte } from 'drizzle-orm'
import Database from '@app/server/Database.ts'
import Utils from '@app/server/Utils.ts'
import * as Schemas from '@app/server/schemas/index.ts'
import type * as Types from '@app/server/Types.ts'

function computeRankTrend(
  ranks: number[]
): 'improving' | 'declining' | 'stable' {
  if (ranks.length < 4) {
    return 'stable'
  }
  const half = Math.floor(ranks.length / 2)
  const firstHalf = ranks.slice(0, half)
  const secondHalf = ranks.slice(-half)
  const avgFirst = firstHalf.reduce((s, r) => s + r, 0) / firstHalf.length
  const avgLast = secondHalf.reduce((s, r) => s + r, 0) / secondHalf.length
  const diff = avgFirst - avgLast // positive = rank improved (lower number = better)
  if (diff > 1.5) {
    return 'improving'
  }
  if (diff < -1.5) {
    return 'declining'
  }
  return 'stable'
}

export async function GET(ctx: Context) {
  const code = ctx.param('code')
  if (!code || code.trim() === '') {
    return ctx.send.json({ error: 'Missing code' }, { status: 400 })
  }
  const stockCode = code.trim().toUpperCase()

  const daysParam = ctx.query?.('days')
  const daysStr = typeof daysParam === 'string' ? daysParam : undefined
  const days = daysStr ? Math.min(90, Math.max(1, parseInt(daysStr, 10) || 30)) : 30

  // Get the latest date for this stock from broker_top_daily
  const latestRows = await Database.select({ date: Schemas.brokerTopDaily.date })
    .from(Schemas.brokerTopDaily)
    .where(eq(Schemas.brokerTopDaily.stockCode, stockCode))
    .orderBy(desc(Schemas.brokerTopDaily.date))
    .limit(1)

  if (latestRows.length === 0) {
    const empty: Types.BrokerHistoryResponse = {
      code: stockCode,
      startDate: 0,
      endDate: 0,
      totalDays: 0,
      history: [],
      trend: []
    }
    return ctx.send.json(empty)
  }

  const endDate = Number(latestRows[0]!.date)
  const startDate = Utils.addDaysToDateInt(endDate, -days)

  // Fetch all broker rows for this stock in the window
  const rows = await Database.select({
    date: Schemas.brokerTopDaily.date,
    brokerCode: Schemas.brokerTopDaily.brokerCode,
    brokerName: Schemas.brokerTopDaily.brokerName,
    rank: Schemas.brokerTopDaily.rank,
    volume: Schemas.brokerTopDaily.volume,
    volumePct: Schemas.brokerTopDaily.volumePct
  })
    .from(Schemas.brokerTopDaily)
    .where(
      and(
        eq(Schemas.brokerTopDaily.stockCode, stockCode),
        gte(Schemas.brokerTopDaily.date, startDate)
      )
    )
    .orderBy(asc(Schemas.brokerTopDaily.date), asc(Schemas.brokerTopDaily.rank))

  // Group by date
  const byDate = new Map<number, Types.BrokerHistoryDay['brokers']>()
  for (const r of rows) {
    const d = Number(r.date)
    const list = byDate.get(d) ?? []
    list.push({
      brokerCode: r.brokerCode,
      brokerName: r.brokerName,
      rank: Number(r.rank),
      volume: r.volume != null ? Number(r.volume) : 0,
      volumePct: r.volumePct != null ? Number(r.volumePct) : 0
    })
    byDate.set(d, list)
  }

  const history: Types.BrokerHistoryDay[] = []
  for (const [date, brokers] of byDate.entries()) {
    history.push({ date, brokers })
  }
  history.sort((a, b) => b.date - a.date)
  const totalDays = history.length

  // Build per-broker trend stats
  const brokerStats = new Map<string, {
    name: string
    ranks: number[] // one per day present (in chronological order)
    totalVolume: number
    dates: number[]
  }>()

  for (const day of history) {
    for (const b of day.brokers) {
      const existing = brokerStats.get(b.brokerCode) ?? {
        name: b.brokerName,
        ranks: [],
        totalVolume: 0,
        dates: []
      }
      existing.ranks.push(b.rank)
      existing.totalVolume += b.volume
      existing.dates.push(day.date)
      brokerStats.set(b.brokerCode, existing)
    }
  }

  const trend: Types.BrokerTrendItem[] = []
  for (const [brokerCode, stats] of brokerStats.entries()) {
    const daysPresent = stats.ranks.length
    const avgRank = Utils.round3(stats.ranks.reduce((s, r) => s + r, 0) / daysPresent)
    const bestRank = Math.min(...stats.ranks)
    const rankTrend = computeRankTrend([...stats.ranks].reverse()) // oldest first for trend
    const presencePct = daysPresent / totalDays
    const isAccumulating = presencePct >= 0.5 && avgRank <= 5 && rankTrend !== 'declining'

    trend.push({
      brokerCode,
      brokerName: stats.name,
      daysPresent,
      totalDays,
      avgRank,
      bestRank,
      rankTrend,
      totalVolume: stats.totalVolume,
      isAccumulating
    })
  }

  // Sort: accumulating first, then by daysPresent desc, then avgRank asc
  trend.sort((a, b) => {
    if (a.isAccumulating !== b.isAccumulating) {
      return a.isAccumulating ? -1 : 1
    }
    if (b.daysPresent !== a.daysPresent) {
      return b.daysPresent - a.daysPresent
    }
    return a.avgRank - b.avgRank
  })

  const response: Types.BrokerHistoryResponse = {
    code: stockCode,
    startDate,
    endDate,
    totalDays,
    history,
    trend
  }
  return ctx.send.json(response)
}
