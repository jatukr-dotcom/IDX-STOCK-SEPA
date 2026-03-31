/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 */

import { desc } from 'drizzle-orm'
import { initDb } from '@app/server/Database.ts'
import Database from '@app/server/Database.ts'
import * as Schemas from '@app/server/schemas/index.ts'
import * as Services from '@app/server/services/index.ts'

function dateIntFromDate(date: Date): number {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return parseInt(`${year}${month}${day}`, 10)
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

if (import.meta.main) {
  await initDb()
  const client = new Services.Client()

  // Find latest date already in DB
  const latestRows = await Database.select({ date: Schemas.summary.date })
    .from(Schemas.summary)
    .orderBy(desc(Schemas.summary.date))
    .limit(1)
  const latestDateInt = latestRows[0]?.date ?? 0

  const endDate = new Date()
  endDate.setHours(0, 0, 0, 0)

  let startDate: Date
  if (latestDateInt > 0) {
    const s = String(latestDateInt)
    startDate = addDays(
      new Date(parseInt(s.slice(0, 4)), parseInt(s.slice(4, 6)) - 1, parseInt(s.slice(6, 8))),
      1
    )
  } else {
    startDate = new Date()
  }

  if (startDate > endDate) {
    console.log(`[update] DB sudah up-to-date (latest: ${latestDateInt})`)
  } else {
    console.log(`[update] Fetch screener & financial ratio...`)
    await Services.Screener.run(client)
    await Services.FinancialRatio.run(client)

    let current = startDate
    let count = 0
    while (current <= endDate) {
      const dateInt = dateIntFromDate(current)
      console.log(`[update] summary date=${dateInt}`)
      await Services.Summary.run(client, dateInt)
      await Services.BrokerStockMetrics.run(client, dateInt)
      count++
      current = addDays(current, 1)
      await sleepMs(150)
    }
    console.log(`[update] Done — ${count} hari diperbarui`)

  }
}
