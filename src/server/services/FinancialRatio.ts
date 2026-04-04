/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 */

import { eq, sql } from 'drizzle-orm'
import Database from '@app/server/Database.ts'
import * as Schemas from '@app/server/schemas/index.ts'
import type * as Types from '@app/server/services/Types.ts'

interface FinancialRatioItem {
  code?: string
  eps?: number
  bookValue?: number
  per?: number
  priceBV?: number
  deRatio?: number
  roa?: number
  roe?: number
  npm?: number
}

interface FinancialRatioApiResponse {
  data?: FinancialRatioItem[]
}

export class FinancialRatio {
  private static readonly baseUrl =
    'https://www.idx.co.id/primary/DigitalStatistic/GetApiDataPaginated'

  static async run(client: Types.IdxClient): Promise<void> {
    const now = new Date()
    for (let offset = 0; offset <= 3; offset++) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1)
      const year = date.getFullYear()
      const month = date.getMonth() + 1
      const url = `${FinancialRatio.baseUrl}?urlName=LINK_FINANCIAL_DATA_RATIO` +
        `&periodYear=${year}&periodMonth=${month}&periodType=monthly&isPrint=False&cumulative=false&pageNumber=1&pageSize=9999`
      const response = await client.get(url)
      if (!response.ok) {
        continue
      }
      const raw = (await response.json()) as FinancialRatioApiResponse
      const items = raw?.data ?? []
      if (items.length === 0) {
        continue
      }
      console.log(`[FinancialRatio] Found ${items.length} items for ${year}-${String(month).padStart(2, '0')}`)
      await Database.transaction(async (tx) => {
        for (const item of items) {
          const code = item.code ?? ''
          if (!code) {
            continue
          }
          await tx
            .update(Schemas.screener)
            .set({
              eps: item.eps ?? sql`${Schemas.screener.eps}`,
              bookValue: item.bookValue ?? sql`${Schemas.screener.bookValue}`,
              per: item.per ?? sql`${Schemas.screener.per}`,
              pbv: item.priceBV ?? sql`${Schemas.screener.pbv}`,
              der: item.deRatio ?? sql`${Schemas.screener.der}`,
              roa: item.roa ?? sql`${Schemas.screener.roa}`,
              roe: item.roe ?? sql`${Schemas.screener.roe}`,
              npm: item.npm ?? sql`${Schemas.screener.npm}`
            })
            .where(eq(Schemas.screener.code, code))
        }
      })
      break
    }
  }
}
