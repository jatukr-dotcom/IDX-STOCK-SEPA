/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Hook untuk fetch technical indicators per stock (Stage, Volume, RSI, Technical Analysis)
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import * as Hooks from '@app/pages/hooks/index.ts'
import type * as Types from '@app/pages/Types.ts'

interface StockTechnical {
  stage: Types.StageAnalysisRow | null
  volume: Types.VolumeAnalysisResponse | null
  technical: Types.TechnicalAnalysisApiResponse | null
}

export function useStockTechnical(code: string | null, dateRange?: { start: number; end: number }) {
  const [data, setData] = useState<StockTechnical>({
    stage: null,
    volume: null,
    technical: null
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const fetchData = useCallback(
    async (signal?: AbortSignal) => {
      if (!code) {
        setData({ stage: null, volume: null, technical: null })
        setLoading(false)
        return
      }

      const myId = requestIdRef.current + 1
      requestIdRef.current = myId
      setLoading(true)
      setError(null)

      try {
        const opts = signal ? { signal } : undefined
        const [stageRes, volRes, techRes] = await Promise.all([
          Hooks.fetchApi<Types.StageAnalysisRow>(`/api/${code}/stage`, {}, opts).catch(() => null),
          Hooks.fetchApi<Types.VolumeAnalysisResponse>(`/api/${code}/volume-analysis`, {}, opts)
            .catch(() => null),
          Hooks.fetchApi<Types.TechnicalAnalysisApiResponse>(
            `/api/${code}/technical-analysis`,
            dateRange ? { start: dateRange.start, end: dateRange.end } : {},
            opts
          ).catch(() => null)
        ])

        if (requestIdRef.current === myId) {
          setData({
            stage: stageRes,
            volume: volRes,
            technical: techRes
          })
        }
      } catch (err: unknown) {
        if (requestIdRef.current !== myId) {
          return
        }
        if (err != null && typeof err === 'object' && (err as Error).name === 'AbortError') {
          return
        }
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (requestIdRef.current === myId) {
          setLoading(false)
        }
      }
    },
    [code, dateRange]
  )

  useEffect(() => {
    const ctrl = new AbortController()
    fetchData(ctrl.signal)
    return () => ctrl.abort()
  }, [fetchData])

  const refetch = useCallback(() => fetchData(), [fetchData])
  return { data, loading, error, refetch }
}
