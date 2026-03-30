/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 */

import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Broker concentration metrics per stock per date.
 * Aggregates which brokers dominated trading activity for a given stock.
 * Source: IDX API GetBrokerSummary?stockCode=X&date=YYYYMMDD
 */
export const brokerStockMetrics = sqliteTable('broker_stock_metrics', {
  id: text('id').primaryKey(), // "{dateInt}-{stockCode}"
  date: integer('date').notNull(),
  stockCode: text('stock_code').notNull(),
  brokerCount: integer('broker_count'), // total unique brokers active
  top3VolumePct: real('top3_volume_pct'), // % of total volume by top 3 brokers
  top5VolumePct: real('top5_volume_pct'), // % of total volume by top 5 brokers
  dominantBrokerCode: text('dominant_broker_code'), // broker with most volume
  dominantBrokerName: text('dominant_broker_name'),
  dominantBrokerVolumePct: real('dominant_broker_volume_pct') // % of total volume
})
