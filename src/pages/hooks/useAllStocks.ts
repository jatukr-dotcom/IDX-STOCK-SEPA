/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 */

import { useCallback, useEffect, useState } from 'react'
import * as Hooks from '@app/pages/hooks/index.ts'
import type * as Types from '@app/pages/Types.ts'

export function useAllStocks(
  search: string,
  sector: string,
  offset: number,
  limit = 50
) {
  const [data, setData] = useState<Types.StockListResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(() => {
    setLoading(true)
    setError(null)
    const params: Record<string, string | number> = { limit, offset }
    if (search.trim() !== '') {
      params['search'] = search.trim()
    }
    if (sector.trim() !== '') {
      params['sector'] = sector.trim()
    }
    Hooks.fetchApi<Types.StockListResponse>('/api/stocks', params)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [search, sector, offset, limit])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { data, loading, error, refetch: fetchData }
}
