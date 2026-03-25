/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 */

import React, { useMemo, useState } from 'react'
import { Flame } from 'lucide-react'
import * as Utils from '@app/pages/utils/index.ts'
import type * as Types from '@app/pages/Types.ts'

function highBadge(pctFromHigh: number | null): React.ReactNode {
  if (pctFromHigh == null) {
    return null
  }
  if (pctFromHigh >= -1) {
    return <span className='idx-badge idx-badge-up'>ATH Zone</span>
  }
  if (pctFromHigh >= -5) {
    return <span className='idx-badge idx-badge-up'>New High</span>
  }
  return null
}

export default function NewHighsView({
  data,
  loading,
  error,
  onRefetch
}: Types.NewHighsViewProps) {
  const [maxPctFromHigh, setMaxPctFromHigh] = useState(10)
  const [onlyTrending, setOnlyTrending] = useState(false)

  const filtered = useMemo(() => {
    if (!data?.data) {
      return []
    }
    return data.data.filter((r) => {
      if (r.pctFrom52wHigh == null || r.pctFrom52wHigh < -maxPctFromHigh) {
        return false
      }
      if (onlyTrending && r.trendCriteriaCount < 5) {
        return false
      }
      return true
    })
  }, [data, maxPctFromHigh, onlyTrending])

  if (loading) {
    return (
      <div className='idx-card idx-card-center'>
        <p className='idx-p-muted'>Memuat daftar High 52 Minggu...</p>
      </div>
    )
  }
  if (error) {
    return (
      <div className='idx-error idx-mt-16'>
        {error}
        <button type='button' className='idx-btn idx-mt-8' onClick={onRefetch}>
          Coba lagi
        </button>
      </div>
    )
  }
  if (!data) {
    return null
  }

  const atHigh = data.data.filter((r) => r.pctFrom52wHigh != null && r.pctFrom52wHigh >= -1).length
  const near5 = data.data.filter((r) => r.pctFrom52wHigh != null && r.pctFrom52wHigh >= -5).length

  return (
    <div className='idx-card'>
      <div className='idx-px-24 idx-py-16'>
        <div className='idx-card-header'>
          <h3 className='idx-card-title idx-card-title-with-icon'>
            <Flame size={20} aria-hidden />
            <span>New High 52 Minggu</span>
          </h3>
          <div className='idx-trend-stats'>
            <span className='idx-p-muted'>
              ATH Zone: <strong style={{ color: 'var(--idx-up)' }}>{atHigh}</strong>
            </span>
            <span className='idx-p-muted'>
              ≤5%: <strong style={{ color: 'var(--idx-up)' }}>{near5}</strong>
            </span>
          </div>
        </div>
        <div className='idx-trend-filter-row'>
          <span className='idx-p-muted'>Jarak dari High:</span>
          {[3, 5, 10, 15].map((n) => (
            <button
              key={n}
              type='button'
              className={`idx-btn${maxPctFromHigh === n ? ' idx-btn-active' : ''}`}
              onClick={() => setMaxPctFromHigh(n)}
            >
              -{n}%
            </button>
          ))}
          <label className='idx-trend-filter-check'>
            <input
              type='checkbox'
              checked={onlyTrending}
              onChange={(e) => setOnlyTrending(e.target.checked)}
            />
            <span className='idx-p-muted'>Hanya trending (MA ≥5)</span>
          </label>
          <span className='idx-p-muted'>Tampil: {filtered.length} emiten</span>
        </div>
      </div>
      {filtered.length === 0
        ? (
          <div className='idx-px-24 idx-py-16'>
            <p className='idx-p-muted'>
              Tidak ada emiten dalam -{maxPctFromHigh}% dari High 52 Minggu.
            </p>
          </div>
        )
        : (
          <div className='idx-table-wrap'>
            <table className='idx-table'>
              <thead>
                <tr>
                  <th>Emiten</th>
                  <th className='idx-table-th-right'>Harga</th>
                  <th className='idx-table-th-right'>% dari High</th>
                  <th className='idx-table-th-right'>High 52w</th>
                  <th className='idx-table-th-right'>% dari Low</th>
                  <th className='idx-table-th-right'>Low 52w</th>
                  <th className='idx-table-th-right'>RS Rank</th>
                  <th className='idx-table-th-right'>MA Align</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.code}>
                    <td>
                      <div className='idx-trend-code'>
                        <span className='idx-table-code-bold'>{row.code}</span>
                        {highBadge(row.pctFrom52wHigh)}
                      </div>
                      <div style={{ fontSize: 'var(--idx-text-sm)', marginTop: 2 }}>
                        {row.name ?? '-'}
                      </div>
                      <div
                        style={{ fontSize: 'var(--idx-text-xs)', color: 'var(--idx-text-muted)' }}
                      >
                        {row.sector ?? '-'}
                      </div>
                    </td>
                    <td className='idx-table-td-right'>
                      {row.price != null ? Utils.Format.formatNum(row.price) : '-'}
                    </td>
                    <td className='idx-table-td-right'>
                      {row.pctFrom52wHigh != null
                        ? (
                          <span className={row.pctFrom52wHigh >= -5 ? 'idx-pct-up' : ''}>
                            {Utils.Format.formatNum(row.pctFrom52wHigh, 1)}%
                          </span>
                        )
                        : '-'}
                    </td>
                    <td className='idx-table-td-right'>
                      {row.high52w != null ? Utils.Format.formatNum(row.high52w) : '-'}
                    </td>
                    <td className='idx-table-td-right'>
                      {row.pctFrom52wLow != null
                        ? (
                          <span className='idx-pct-up'>
                            +{Utils.Format.formatNum(row.pctFrom52wLow, 1)}%
                          </span>
                        )
                        : '-'}
                    </td>
                    <td className='idx-table-td-right'>
                      {row.low52w != null ? Utils.Format.formatNum(row.low52w) : '-'}
                    </td>
                    <td className='idx-table-td-right'>
                      <span
                        style={{
                          color: (row.rsRank ?? 0) >= 70
                            ? 'var(--idx-up)'
                            : 'var(--idx-text-muted)',
                          fontWeight: 600
                        }}
                      >
                        {row.rsRank ?? '-'}
                      </span>
                    </td>
                    <td className='idx-table-td-right'>
                      <span
                        style={{
                          color: row.trendCriteriaCount >= 5
                            ? 'var(--idx-up)'
                            : 'var(--idx-text-muted)',
                          fontWeight: 600
                        }}
                      >
                        {row.trendCriteriaCount}/5
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      <div className='idx-px-24 idx-py-12 idx-p-muted idx-text-xs'>
        Menampilkan emiten yang harganya dalam jarak tertentu dari High 52 Minggu. ATH Zone = dalam
        1% dari high. New High = dalam 5% dari high. MA Align = kriteria alignment MA50/150/200
        (maks 5).
      </div>
    </div>
  )
}
