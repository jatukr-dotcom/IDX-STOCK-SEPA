/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 */

import { initDb } from '@app/server/Database.ts'
import * as Services from '@app/server/services/index.ts'

if (import.meta.main) {
  console.log('[financial-history] Initializing database...')
  await initDb()
  const client = new Services.Client()
  console.log('[financial-history] Fetching EPS Q1–Q4 for years 2022–2025...')
  await Services.FinancialHistory.run(client)
  console.log('[financial-history] Done.')
}
