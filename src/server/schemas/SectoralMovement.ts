/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 */

import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const sectoralMovement = sqliteTable('sectoral_movement', {
  id: text('id').primaryKey(), // "{year}_{month}_{sectorCode}"
  year: integer('year').notNull(),
  month: integer('month').notNull(),
  sectorCode: text('sector_code'),
  sectorName: text('sector_name'),
  pctChange: real('pct_change'),
  volume: real('volume'),
  value: real('value')
})
