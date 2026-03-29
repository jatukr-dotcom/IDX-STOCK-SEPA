/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 */

import type { Context } from '@neabyte/deserve'
import { asc, desc } from 'drizzle-orm'
import Database from '@app/server/Database.ts'
import * as Schemas from '@app/server/schemas/index.ts'

export async function GET(ctx: Context) {
  const yearParam = ctx.query('year')
  const monthParam = ctx.query('month')
  const year = yearParam ? parseInt(String(yearParam), 10) : null
  const month = monthParam ? parseInt(String(monthParam), 10) : null

  const allRows = await Database.select()
    .from(Schemas.sectoralMovement)
    .orderBy(
      desc(Schemas.sectoralMovement.year),
      desc(Schemas.sectoralMovement.month),
      asc(Schemas.sectoralMovement.sectorCode)
    )

  const data = year != null && month != null
    ? allRows.filter((r) => r.year === year && r.month === month)
    : allRows

  return ctx.send.json({ data })
}
