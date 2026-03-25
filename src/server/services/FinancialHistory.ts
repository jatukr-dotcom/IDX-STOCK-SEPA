/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 */

import { and, count, eq } from 'drizzle-orm'
import Database from '@app/server/Database.ts'
import * as Schemas from '@app/server/schemas/index.ts'
import type * as Types from '@app/server/services/Types.ts'

interface FinancialRatioItem {
  code?: string
  fsDate?: string
  eps?: number
  bookValue?: number
  sales?: number
  profitPeriod?: number
  profitAttrOwner?: number
}

interface FinancialRatioApiResponse {
  data?: FinancialRatioItem[]
}

// Query months — IDX publishes data ~3 months after period end
// periodMonth=3/4 → Dec 31 prev year (Q4), periodMonth=6/7 → Mar 31 (Q1), etc.
// We query years 2022–2026 so December 2025 data (published Mar–Apr 2026) is included
const QUERY_YEARS = [2022, 2023, 2024, 2025, 2026]
const QUERY_MONTHS = [3, 4, 6, 7, 9, 10, 12]
const STORE_YEAR_MIN = 2022
const STORE_YEAR_MAX = 2025
const BASE_URL = 'https://www.idx.co.id/primary/DigitalStatistic/GetApiDataPaginated'

function fsDateToYearQuarter(fsDate: string): { year: number; quarter: number } | null {
  const match = fsDate.match(/^(\d{4})-(\d{2})/)
  if (!match) {
    return null
  }
  const year = parseInt(match[1]!, 10)
  const month = parseInt(match[2]!, 10)
  // Month 10-11 = Q3 filed late (Oct-Nov filing for Sep 30 period end)
  // Month 12 = Q4 period end (Dec 31)
  const quarter = month <= 3 ? 1 : month <= 6 ? 2 : month <= 11 ? 3 : 4
  return { year, quarter }
}

export class FinancialHistory {
  static async run(client: Types.IdxClient): Promise<void> {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1

    for (const year of QUERY_YEARS) {
      for (const month of QUERY_MONTHS) {
        if (year > currentYear || (year === currentYear && month > currentMonth)) {
          continue
        }
        const url = `${BASE_URL}?urlName=LINK_FINANCIAL_DATA_RATIO` +
          `&periodYear=${year}&periodMonth=${month}&periodType=monthly` +
          `&isPrint=False&cumulative=false&pageSize=9999`
        const response = await client.get(url)
        if (!response.ok) {
          continue
        }
        const raw = (await response.json()) as FinancialRatioApiResponse
        const items = raw?.data ?? []
        if (items.length === 0) {
          continue
        }
        await Database.transaction(async (tx) => {
          for (const item of items) {
            const code = item.code ?? ''
            const fsDate = item.fsDate ?? ''
            if (!code || !fsDate) {
              continue
            }
            const yq = fsDateToYearQuarter(fsDate)
            if (yq == null || yq.year < STORE_YEAR_MIN || yq.year > STORE_YEAR_MAX) {
              continue
            }
            // Skip if already exists (historical data doesn't change)
            const existing = await tx
              .select({ cnt: count() })
              .from(Schemas.financialHistory)
              .where(
                and(
                  eq(Schemas.financialHistory.stockCode, code),
                  eq(Schemas.financialHistory.year, yq.year),
                  eq(Schemas.financialHistory.quarter, yq.quarter)
                )
              )
            if ((existing[0]?.cnt ?? 0) > 0) {
              continue
            }
            const id = `${code}_${yq.year}_Q${yq.quarter}`
            await tx
              .insert(Schemas.financialHistory)
              .values({
                id,
                stockCode: code,
                year: yq.year,
                quarter: yq.quarter,
                periodDate: fsDate,
                eps: item.eps ?? null,
                bookValue: item.bookValue ?? null,
                sales: item.sales ?? null,
                profit: item.profitPeriod ?? null,
                profitAttrOwner: item.profitAttrOwner ?? null
              })
              .onConflictDoUpdate({
                target: Schemas.financialHistory.id,
                set: {
                  periodDate: fsDate,
                  eps: item.eps ?? null,
                  bookValue: item.bookValue ?? null,
                  sales: item.sales ?? null,
                  profit: item.profitPeriod ?? null,
                  profitAttrOwner: item.profitAttrOwner ?? null
                }
              })
          }
        })
      }
    }
  }
}
