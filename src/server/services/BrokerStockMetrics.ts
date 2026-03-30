/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 *
 * Syncs per-stock broker concentration metrics from IDX API.
 * Endpoint: GetBrokerSummary?stockCode={code}&date={YYYYMMDD}
 * Only syncs top ~150 liquid stocks to avoid excessive API calls.
 */

import { desc, eq } from 'drizzle-orm'
import Database from '@app/server/Database.ts'
import * as Schemas from '@app/server/schemas/index.ts'
import type * as Types from '@app/server/services/Types.ts'

interface BrokerApiItem {
  IDFirm: string
  FirmName: string
  Volume: number
  Value: number
  Frequency: number
}

export class BrokerStockMetrics {
  private static readonly brokerSummaryUrl =
    'https://www.idx.co.id/primary/TradingSummary/GetBrokerSummary'

  /** Sync broker concentration metrics for top liquid stocks on a given trading date. */
  static async run(client: Types.Client, dateInt: number): Promise<void> {
    // Get top ~150 stocks by value for this date (already in DB from Summary.run)
    const topStocks = await Database.select({
      stockCode: Schemas.summary.stockCode,
      value: Schemas.summary.value
    })
      .from(Schemas.summary)
      .where(eq(Schemas.summary.date, dateInt))
      .orderBy(desc(Schemas.summary.value))
      .limit(150)

    if (topStocks.length === 0) {
      return
    }

    for (const stock of topStocks) {
      const { stockCode } = stock
      if (!stockCode) {
        continue
      }
      const id = `${dateInt}-${stockCode}`

      // Skip if already synced for this date+stock
      const existing = await Database.select({ id: Schemas.brokerStockMetrics.id })
        .from(Schemas.brokerStockMetrics)
        .where(eq(Schemas.brokerStockMetrics.id, id))
        .limit(1)
      if (existing.length > 0) {
        continue
      }

      try {
        const url =
          `${BrokerStockMetrics.brokerSummaryUrl}?date=${dateInt}&stockCode=${stockCode}&length=500&start=0`
        const response = await client.get(url)
        if (!response.ok) {
          await response.text().catch(() => {})
          await BrokerStockMetrics.wait(500)
          continue
        }
        const json = await response.json() as {
          recordsTotal?: number
          data?: BrokerApiItem[]
        }
        const brokers = json.data ?? []
        if (brokers.length === 0) {
          await BrokerStockMetrics.wait(300)
          continue
        }

        // Compute concentration metrics
        const totalVol = brokers.reduce((s, b) => s + (b.Volume ?? 0), 0)
        if (totalVol <= 0) {
          await BrokerStockMetrics.wait(300)
          continue
        }

        // Sort by volume desc
        const sorted = [...brokers].sort((a, b) => (b.Volume ?? 0) - (a.Volume ?? 0))
        const top3Vol = sorted.slice(0, 3).reduce((s, b) => s + (b.Volume ?? 0), 0)
        const top5Vol = sorted.slice(0, 5).reduce((s, b) => s + (b.Volume ?? 0), 0)
        const dominant = sorted[0]!

        const row: typeof Schemas.brokerStockMetrics.$inferInsert = {
          id,
          date: dateInt,
          stockCode,
          brokerCount: brokers.length,
          top3VolumePct: Math.round((top3Vol / totalVol) * 10000) / 100,
          top5VolumePct: Math.round((top5Vol / totalVol) * 10000) / 100,
          dominantBrokerCode: dominant.IDFirm ?? null,
          dominantBrokerName: dominant.FirmName ?? null,
          dominantBrokerVolumePct: dominant.Volume != null
            ? Math.round((dominant.Volume / totalVol) * 10000) / 100
            : null
        }

        await Database.insert(Schemas.brokerStockMetrics)
          .values(row)
          .onConflictDoUpdate({
            target: Schemas.brokerStockMetrics.id,
            set: {
              brokerCount: row.brokerCount,
              top3VolumePct: row.top3VolumePct,
              top5VolumePct: row.top5VolumePct,
              dominantBrokerCode: row.dominantBrokerCode,
              dominantBrokerName: row.dominantBrokerName,
              dominantBrokerVolumePct: row.dominantBrokerVolumePct
            }
          })
      } catch {
        // Network error for this stock — skip and continue
      }

      await BrokerStockMetrics.wait(600)
    }
  }

  private static wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
