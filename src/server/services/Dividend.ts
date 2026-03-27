/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 */

import Database from '@app/server/Database.ts'
import * as Schemas from '@app/server/schemas/index.ts'
import type * as Types from '@app/server/services/Types.ts'

interface DividendApiItem {
  kodeEmiten?: string
  kodeDividen?: string
  jenisDividen?: string
  dividen?: number
  tanggalEksDiv?: string
  tanggalPencatatan?: string
  tanggalPembayaran?: string
  tahun?: number
}

interface DividendApiResponse {
  data?: DividendApiItem[]
}

const BASE_URL = 'https://www.idx.co.id/primary/ListedCompany/GetDividendAnnouncementData'

export class Dividend {
  static async run(client: Types.IdxClient): Promise<void> {
    const now = new Date()
    // Fetch last 24 months
    const months: { year: number; month: number }[] = []
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
    }

    for (const { year, month } of months) {
      const url = `${BASE_URL}?pageSize=9999&year=${year}&month=${month}`
      const response = await client.get(url)
      if (!response.ok) {
        continue
      }
      const raw = (await response.json()) as DividendApiResponse
      const items = raw?.data ?? []
      if (items.length === 0) {
        continue
      }
      await Database.transaction(async (tx) => {
        for (const item of items) {
          const code = item.kodeEmiten ?? ''
          const exDate = item.tanggalEksDiv ?? ''
          if (!code || !exDate) {
            continue
          }
          const id = `${code}_${exDate.replace(/\//g, '-')}`
          await tx
            .insert(Schemas.dividend)
            .values({
              id,
              stockCode: code,
              year: item.tahun ?? year,
              dividendType: item.jenisDividen ?? null,
              cashPerShare: item.dividen ?? null,
              exDate: exDate,
              recordDate: item.tanggalPencatatan ?? null,
              paymentDate: item.tanggalPembayaran ?? null
            })
            .onConflictDoUpdate({
              target: Schemas.dividend.id,
              set: {
                dividendType: item.jenisDividen ?? null,
                cashPerShare: item.dividen ?? null,
                exDate: exDate,
                recordDate: item.tanggalPencatatan ?? null,
                paymentDate: item.tanggalPembayaran ?? null
              }
            })
        }
      })
    }
  }
}
