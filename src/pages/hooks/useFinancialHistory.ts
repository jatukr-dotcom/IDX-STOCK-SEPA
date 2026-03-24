/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 */

import { useEffect, useState } from 'react'
import * as Hooks from '@app/pages/hooks/index.ts'
import type * as Types from '@app/pages/Types.ts'

export function useFinancialHistory(stockCode: string | null) {
  const [data, setData] = useState<Types.FinancialHistoryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const code = stockCode?.trim()
    if (!code) {
      setData(null)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    Hooks.fetchApi<Types.FinancialHistoryResponse>(
      `/api/stock/${code.toUpperCase()}/financial-history`
    )
      .then(setData)
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        setLoading(false)
      })
  }, [stockCode])

  return { data, loading, error }
}
