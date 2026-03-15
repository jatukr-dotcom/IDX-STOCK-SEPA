/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 */

import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import * as Schemas from '@app/server/schemas/index.ts'

const libsqlClient = createClient({
  url: import.meta.resolve('@data/database.sqlite')
})

const db = drizzle(libsqlClient, { schema: Schemas })

export async function initDb(): Promise<void> {
  await db.run(sql`PRAGMA journal_mode=WAL`)
  await db.run(sql`PRAGMA busy_timeout=5000`)
}

export default db
