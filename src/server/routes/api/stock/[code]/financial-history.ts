/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 */

import type { Context } from '@neabyte/deserve'
import { and, asc, eq, gte, lte } from 'drizzle-orm'
import Database from '@app/server/Database.ts'
import * as Schemas from '@app/server/schemas/index.ts'
import type * as Types from '@app/server/Types.ts'

export async function GET(ctx: Context) {
  const code = ctx.param('code')
  if (!code || code.trim() === '') {
    return ctx.send.json({ error: 'Missing or invalid code' }, { status: 400 })
  }
  const stockCode = code.trim().toUpperCase()
  const rows = await Database
    .select({
      year: Schemas.financialHistory.year,
      quarter: Schemas.financialHistory.quarter,
      periodDate: Schemas.financialHistory.periodDate,
      eps: Schemas.financialHistory.eps,
      bookValue: Schemas.financialHistory.bookValue,
      sales: Schemas.financialHistory.sales,
      profit: Schemas.financialHistory.profit,
      profitAttrOwner: Schemas.financialHistory.profitAttrOwner
    })
    .from(Schemas.financialHistory)
    .where(
      and(
        eq(Schemas.financialHistory.stockCode, stockCode),
        gte(Schemas.financialHistory.year, 2022),
        lte(Schemas.financialHistory.year, 2025)
      )
    )
    .orderBy(asc(Schemas.financialHistory.year), asc(Schemas.financialHistory.quarter))

  const response: Types.FinancialHistoryResponse = {
    code: stockCode,
    data: rows.map((row) => ({
      year: row.year,
      quarter: row.quarter,
      periodDate: row.periodDate,
      eps: row.eps,
      bookValue: row.bookValue,
      sales: row.sales,
      profit: row.profit,
      profitAttrOwner: row.profitAttrOwner
    }))
  }
  return ctx.send.json(response)
}
