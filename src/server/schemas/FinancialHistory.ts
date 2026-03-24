/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 */

import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const financialHistory = sqliteTable('stock_financial_ratio', {
  id: text('id').primaryKey(),
  stockCode: text('stock_code').notNull(),
  year: integer('year').notNull(),
  quarter: integer('quarter').notNull(),
  periodDate: text('period_date'),
  eps: real('eps'),
  bookValue: real('book_value'),
  sales: real('sales'),
  profit: real('profit'),
  profitAttrOwner: real('profit_attr_owner')
})
