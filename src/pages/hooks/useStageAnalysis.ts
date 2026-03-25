/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import * as Hooks from '@app/pages/hooks/index.ts'
import type * as Types from '@app/pages/Types.ts'

export function useStageAnalysis(stage?: Types.StageNumber) {
  const [data, setData] = useState<Types.StageAnalysisResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const fetchData = useCallback((signal?: AbortSignal) => {
    const myId = requestIdRef.current + 1
    requestIdRef.current = myId
    setLoading(true)
    setError(null)
    const query: Record<string, string | number> = {}
    if (stage != null) {
      query.stage = stage
    }
    const opts = signal ? { signal } : undefined
    Hooks.fetchApi<Types.StageAnalysisResponse>('/api/screener/stage-analysis', query, opts)
      .then((result) => {
        if (requestIdRef.current === myId) {
          setData(result)
        }
      })
      .catch((err: unknown) => {
        if (requestIdRef.current !== myId) {
          return
        }
        if (err != null && typeof err === 'object' && (err as Error).name === 'AbortError') {
          return
        }
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (requestIdRef.current === myId) {
          setLoading(false)
        }
      })
  }, [stage])

  useEffect(() => {
    const ctrl = new AbortController()
    fetchData(ctrl.signal)
    return () => ctrl.abort()
  }, [fetchData])

  const refetch = useCallback(() => fetchData(), [fetchData])
  return { data, loading, error, refetch }
}
