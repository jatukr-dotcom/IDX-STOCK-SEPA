/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 */

import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const dividend = sqliteTable('stock_dividend', {
  id: text('id').primaryKey(),              // "{stockCode}_{exDate}"
  stockCode: text('stock_code').notNull(),
  year: integer('year').notNull(),
  dividendType: text('dividend_type'),      // "interim" | "final" | "special"
  cashPerShare: real('cash_per_share'),     // dividen per lembar (Rp)
  exDate: text('ex_date'),                  // tanggal ex-dividend
  recordDate: text('record_date'),
  paymentDate: text('payment_date')
})
