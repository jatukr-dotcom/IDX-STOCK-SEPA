/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 */

import { useCallback, useEffect, useState } from 'react'
import * as Hooks from '@app/pages/hooks/index.ts'
import * as Utils from '@app/pages/utils/index.ts'
import type * as Types from '@app/pages/Types.ts'

export function useAdvancedTechnical(
  stockCode: string | null,
  periodDays: Types.ForeignPeriodDays
) {
  const [data, setData] = useState<Types.TechnicalAnalysisApiResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(() => {
    if (!stockCode?.trim()) {
      setData(null)
      return
    }
    setLoading(true)
    setError(null)
    const end = Utils.Format.getTodayDateInt()
    const start = Utils.Format.addDaysToDateInt(end, -periodDays)
    Hooks.fetchApi<Types.TechnicalAnalysisApiResponse>(
      `/api/${stockCode.trim().toUpperCase()}/technical-analysis`,
      { start, end }
    )
      .then(setData)
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        setLoading(false)
      })
  }, [stockCode, periodDays])

  useEffect(() => {
    if (stockCode?.trim()) {
      fetchData()
    } else {
      setData(null)
      setError(null)
    }
  }, [stockCode, periodDays, fetchData])

  return { data, loading, error, refetch: fetchData }
}
