/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 */

import { eq } from 'drizzle-orm'
import Database from '@app/server/Database.ts'
import * as Schemas from '@app/server/schemas/index.ts'
import type * as Types from '@app/server/services/Types.ts'

interface FinancialRatioItem {
  code?: string
  eps?: number
  bookValue?: number
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
      const url =
        `${FinancialRatio.baseUrl}?urlName=LINK_FINANCIAL_DATA_RATIO` +
        `&periodYear=${year}&periodMonth=${month}&periodType=monthly&isPrint=False&cumulative=false`
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
          if (!code || item.eps == null) {
            continue
          }
          await tx
            .update(Schemas.screener)
            .set({
              eps: item.eps,
              bookValue: item.bookValue ?? null
            })
            .where(eq(Schemas.screener.code, code))
        }
      })
      break
    }
  }
}
