/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 *
 * Downloads historical broker data for the past N trading days.
 * Populates both broker_stock_metrics and broker_top_daily tables.
 *
 * Usage:
 *   deno run -A src/server/FetchBrokerHistory.ts           # default: 60 days
 *   deno run -A src/server/FetchBrokerHistory.ts --days 30 # custom window
 *
 * Idempotent: already-synced date+stock combinations are skipped.
 * Estimated runtime: ~90 minutes for 60 days × 150 stocks (600ms delay/stock).
 */

import { desc } from 'drizzle-orm'
import { initDb } from '@app/server/Database.ts'
import Database from '@app/server/Database.ts'
import * as Schemas from '@app/server/schemas/index.ts'
import * as Services from '@app/server/services/index.ts'

function parseDaysArg(): number {
  const idx = Deno.args.indexOf('--days')
  if (idx !== -1 && Deno.args[idx + 1]) {
    const n = parseInt(Deno.args[idx + 1]!, 10)
    if (!isNaN(n) && n > 0) {
      return n
    }
  }
  return 60
}

function dateIntToDate(dateInt: number): Date {
  const s = String(dateInt)
  return new Date(parseInt(s.slice(0, 4)), parseInt(s.slice(4, 6)) - 1, parseInt(s.slice(6, 8)))
}

function dateToDateInt(date: Date): number {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return parseInt(`${y}${m}${d}`, 10)
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function isWeekend(date: Date): boolean {
  const dow = date.getDay()
  return dow === 0 || dow === 6 // Sunday or Saturday
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

if (import.meta.main) {
  await initDb()
  const client = new Services.Client()
  const days = parseDaysArg()

  // Find latest trading date in DB
  const latestRows = await Database.select({ date: Schemas.summary.date })
    .from(Schemas.summary)
    .orderBy(desc(Schemas.summary.date))
    .limit(1)
  const latestDateInt = latestRows[0]?.date
  if (!latestDateInt) {
    console.error('[broker-history] No data in stock_summary. Run db:update first.')
    Deno.exit(1)
  }

  console.log(`[broker-history] Starting: ${days} calendar days back from ${latestDateInt}`)
  console.log(`[broker-history] Estimated time: ~${Math.round(days * 150 * 0.6 / 60)} minutes`)
  console.log(`[broker-history] (weekends skipped, already-synced dates skipped)`)

  const endDate = dateIntToDate(latestDateInt)
  const startDate = addDays(endDate, -(days - 1))

  let totalDays = 0
  let processedDays = 0
  let current = new Date(startDate)
  while (current <= endDate) {
    if (!isWeekend(current)) {
      totalDays++
    }
    current = addDays(current, 1)
  }

  current = new Date(startDate)
  let dayIdx = 0
  while (current <= endDate) {
    if (!isWeekend(current)) {
      dayIdx++
      const dateInt = dateToDateInt(current)
      const progress = `(${dayIdx}/${totalDays})`
      console.log(`[broker-history] ${progress} Processing date=${dateInt}...`)
      try {
        await Services.BrokerStockMetrics.run(client, dateInt)
        processedDays++
      } catch (err) {
        console.warn(`[broker-history] ${progress} date=${dateInt} failed:`, err)
      }
      await sleepMs(200) // extra inter-day delay
    }
    current = addDays(current, 1)
  }

  console.log(`\n[broker-history] Done — ${processedDays}/${totalDays} trading days processed`)
  Deno.exit(0)
}
