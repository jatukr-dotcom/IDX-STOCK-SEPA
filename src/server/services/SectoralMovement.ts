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

interface SectoralApiItem {
  sectorCode?: string
  sectorName?: string
  pctChange?: number
  volume?: number
  value?: number
}

interface SectoralApiResponse {
  data?: SectoralApiItem[]
}

const BASE_URL = 'https://www.idx.co.id/primary/StockData/GetSectoralData'

export class SectoralMovement {
  static async run(client: Types.IdxClient): Promise<void> {
    const now = new Date()
    const months: { year: number; month: number }[] = []
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
    }

    for (const { year, month } of months) {
      const url = `${BASE_URL}?year=${year}&month=${month}`
      const response = await client.get(url)
      if (!response.ok) {
        continue
      }
      const raw = (await response.json()) as SectoralApiResponse
      const items = raw?.data ?? []
      if (items.length === 0) {
        continue
      }
      await Database.transaction(async (tx) => {
        for (const item of items) {
          const sectorCode = item.sectorCode ?? ''
          if (!sectorCode) {
            continue
          }
          const id = `${year}_${String(month).padStart(2, '0')}_${sectorCode}`
          await tx
            .insert(Schemas.sectoralMovement)
            .values({
              id,
              year,
              month,
              sectorCode,
              sectorName: item.sectorName ?? null,
              pctChange: item.pctChange ?? null,
              volume: item.volume ?? null,
              value: item.value ?? null
            })
            .onConflictDoUpdate({
              target: Schemas.sectoralMovement.id,
              set: {
                sectorName: item.sectorName ?? null,
                pctChange: item.pctChange ?? null,
                volume: item.volume ?? null,
                value: item.value ?? null
              }
            })
        }
      })
    }
  }
}
