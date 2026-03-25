/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import * as Hooks from '@app/pages/hooks/index.ts'
import type * as Types from '@app/pages/Types.ts'

export function useVolumeAnalysis(code: string | null, months = 3) {
  const [data, setData] = useState<Types.VolumeAnalysisResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const fetchData = useCallback(
    (signal?: AbortSignal) => {
      if (!code) { setData(null); setLoading(false); return }
      const myId = requestIdRef.current + 1
      requestIdRef.current = myId
      setLoading(true)
      setError(null)
      const opts = signal ? { signal } : undefined
      Hooks.fetchApi<Types.VolumeAnalysisResponse>(`/api/${code}/volume-analysis`, { months }, opts)
        .then((result) => {
          if (requestIdRef.current === myId) setData(result)
        })
        .catch((err: unknown) => {
          if (requestIdRef.current !== myId) return
          if (err != null && typeof err === 'object' && (err as Error).name === 'AbortError') return
          setError(err instanceof Error ? err.message : String(err))
        })
        .finally(() => {
          if (requestIdRef.current === myId) setLoading(false)
        })
    },
    [code, months]
  )

  useEffect(() => {
    const ctrl = new AbortController()
    fetchData(ctrl.signal)
    return () => ctrl.abort()
  }, [fetchData])

  const refetch = useCallback(() => fetchData(), [fetchData])
  return { data, loading, error, refetch }
}

export function useVolumeScreener() {
  const [data, setData] = useState<Types.VolumeScreenerResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const fetchData = useCallback((signal?: AbortSignal) => {
    const myId = requestIdRef.current + 1
    requestIdRef.current = myId
    setLoading(true)
    setError(null)
    const opts = signal ? { signal } : undefined
    Hooks.fetchApi<Types.VolumeScreenerResponse>('/api/screener/volume-analysis', {}, opts)
      .then((result) => {
        if (requestIdRef.current === myId) setData(result)
      })
      .catch((err: unknown) => {
        if (requestIdRef.current !== myId) return
        if (err != null && typeof err === 'object' && (err as Error).name === 'AbortError') return
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (requestIdRef.current === myId) setLoading(false)
      })
  }, [])

  useEffect(() => {
    const ctrl = new AbortController()
    fetchData(ctrl.signal)
    return () => ctrl.abort()
  }, [fetchData])

  const refetch = useCallback(() => fetchData(), [fetchData])
  return { data, loading, error, refetch }
}
