/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 *
 * Per-stock broker concentration detail.
 * Returns broker metrics from broker_stock_metrics table for the latest date.
 * Live broker list (top 10 by volume) is fetched on-demand from IDX API.
 */

import type { Context } from '@neabyte/deserve'
import { desc, eq } from 'drizzle-orm'
import Database from '@app/server/Database.ts'
import { Client } from '@app/server/services/Client.ts'
import * as Schemas from '@app/server/schemas/index.ts'
import type * as Types from '@app/server/Types.ts'

const IDX_BROKER_URL = 'https://www.idx.co.id/primary/TradingSummary/GetBrokerSummary'

export async function GET(ctx: Context) {
  const code = ctx.param('code')
  if (!code || code.trim() === '') {
    return ctx.send.json({ error: 'Missing code' }, { status: 400 })
  }
  const stockCode = code.trim().toUpperCase()

  // Get latest metrics from DB
  const dbRows = await Database.select()
    .from(Schemas.brokerStockMetrics)
    .where(eq(Schemas.brokerStockMetrics.stockCode, stockCode))
    .orderBy(desc(Schemas.brokerStockMetrics.date))
    .limit(1)

  const dbRow = dbRows[0]
  const dateInt = dbRow ? Number(dbRow.date) : null

  // Fetch live top brokers from IDX API for the latest available date
  const topBrokers: Types.BrokerFlowTopBroker[] = []
  if (dateInt != null) {
    try {
      const client = new Client()
      const url = `${IDX_BROKER_URL}?date=${dateInt}&stockCode=${stockCode}&length=10&start=0`
      const res = await client.get(url)
      if (res.ok) {
        const json = await res.json() as {
          data?: {
            IDFirm: string
            FirmName: string
            Volume: number
            Value: number
            Frequency: number
          }[]
        }
        const items = json.data ?? []
        const totalVol = items.reduce((s, b) => s + (b.Volume ?? 0), 0)
        const sorted = [...items].sort((a, b) => (b.Volume ?? 0) - (a.Volume ?? 0))
        for (const b of sorted) {
          topBrokers.push({
            brokerCode: b.IDFirm ?? '',
            brokerName: b.FirmName ?? '',
            volume: b.Volume ?? 0,
            value: b.Value ?? 0,
            frequency: b.Frequency ?? 0,
            volumePct: totalVol > 0 ? Math.round((b.Volume / totalVol) * 10000) / 100 : 0
          })
        }
      } else {
        await res.text().catch(() => {})
      }
    } catch {
      // API unavailable — return stored metrics only
    }
  }

  const response: Types.BrokerFlowResponse = {
    code: stockCode,
    date: dateInt ?? 0,
    brokerCount: dbRow?.brokerCount != null ? Number(dbRow.brokerCount) : null,
    top3VolumePct: dbRow?.top3VolumePct != null ? Number(dbRow.top3VolumePct) : null,
    top5VolumePct: dbRow?.top5VolumePct != null ? Number(dbRow.top5VolumePct) : null,
    dominantBrokerCode: dbRow?.dominantBrokerCode ?? null,
    dominantBrokerName: dbRow?.dominantBrokerName ?? null,
    dominantBrokerVolumePct: dbRow?.dominantBrokerVolumePct != null
      ? Number(dbRow.dominantBrokerVolumePct)
      : null,
    topBrokers
  }
  return ctx.send.json(response)
}
