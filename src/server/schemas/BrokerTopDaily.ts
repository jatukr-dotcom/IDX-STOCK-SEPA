/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 *
 * Top-10 broker rankings per stock per trading day.
 * Source: IDX API GetBrokerSummary?stockCode=X&date=YYYYMMDD&length=500
 * Populated by BrokerStockMetrics.run() and FetchBrokerHistory.ts.
 */

import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Per-stock per-day top-10 broker rankings by volume.
 * Enables detecting consistent institutional presence (accumulation signal).
 *
 * Key: "{dateInt}-{stockCode}-{brokerCode}" — idempotent across re-runs.
 *
 * NOTE: IDX API provides total volume per broker (buy + sell combined).
 * Accumulation is inferred from consistency of presence + rank stability,
 * not from explicit buy/sell direction.
 */
export const brokerTopDaily = sqliteTable('broker_top_daily', {
  id: text('id').primaryKey(), // "{dateInt}-{stockCode}-{brokerCode}"
  date: integer('date').notNull(),
  stockCode: text('stock_code').notNull(),
  brokerCode: text('broker_code').notNull(),
  brokerName: text('broker_name').notNull(),
  rank: integer('rank').notNull(), // 1–10 sorted by volume descending
  volume: integer('volume'), // total volume (buy + sell combined) in lots
  value: integer('value'), // total value in IDR
  frequency: integer('frequency'), // total transaction count
  volumePct: real('volume_pct') // % of total stock volume that day
})
