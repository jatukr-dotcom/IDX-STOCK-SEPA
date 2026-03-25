/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 */

import React, { useMemo, useState } from 'react'
import { Award } from 'lucide-react'
import * as Utils from '@app/pages/utils/index.ts'
import type * as Types from '@app/pages/Types.ts'

function rsRankColor(rank: number): string {
  if (rank >= 90) {
    return 'var(--idx-up)'
  }
  if (rank >= 70) {
    return 'var(--idx-deep)'
  }
  return 'var(--idx-text-muted)'
}

function pctCell(value: number | null): React.ReactNode {
  if (value == null) {
    return <span className='idx-p-muted'>-</span>
  }
  const cls = value >= 0 ? 'idx-pct-up' : 'idx-pct-down'
  const sign = value >= 0 ? '+' : ''
  return <span className={cls}>{sign}{Utils.Format.formatNum(value, 1)}%</span>
}

export default function RsRankingView({
  data,
  loading,
  error,
  onRefetch
}: Types.RsRankingViewProps) {
  const [minRank, setMinRank] = useState(70)
  const [onlyTrending, setOnlyTrending] = useState(false)

  const filtered = useMemo(() => {
    if (!data?.data) {
      return []
    }
    return data.data.filter((r) => {
      if (r.rsRank < minRank) {
        return false
      }
      if (onlyTrending && r.trendCriteriaCount < 5) {
        return false
      }
      return true
    })
  }, [data, minRank, onlyTrending])

  if (loading) {
    return (
      <div className='idx-card idx-card-center'>
        <p className='idx-p-muted'>Menghitung RS Ranking Minervini...</p>
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

  const top90 = data.data.filter((r) => r.rsRank >= 90).length

  return (
    <div className='idx-card'>
      <div className='idx-px-24 idx-py-16'>
        <div className='idx-card-header'>
          <h3 className='idx-card-title idx-card-title-with-icon'>
            <Award size={20} aria-hidden />
            <span>RS Ranking Minervini</span>
          </h3>
          <div className='idx-trend-stats'>
            <span className='idx-p-muted'>
              RS ≥90: <strong style={{ color: 'var(--idx-up)' }}>{top90}</strong>
            </span>
            <span className='idx-p-muted'>Total: {data.totalCount}</span>
          </div>
        </div>
        <div className='idx-trend-filter-row'>
          <span className='idx-p-muted'>Min. RS Rank:</span>
          {[50, 60, 70, 80, 90].map((n) => (
            <button
              key={n}
              type='button'
              className={`idx-btn${minRank === n ? ' idx-btn-active' : ''}`}
              onClick={() => setMinRank(n)}
            >
              {n}+
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
              Tidak ada emiten dengan RS Rank {minRank}+.
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
                  <th className='idx-table-th-right'>RS Rank</th>
                  <th className='idx-table-th-right'>RS Score</th>
                  <th className='idx-table-th-right'>3 Bulan</th>
                  <th className='idx-table-th-right'>6 Bulan</th>
                  <th className='idx-table-th-right'>9 Bulan</th>
                  <th className='idx-table-th-right'>12 Bulan</th>
                  <th className='idx-table-th-right'>MA Align</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.code}>
                    <td>
                      <div className='idx-trend-code'>
                        <span className='idx-table-code-bold'>{row.code}</span>
                        {row.rsRank >= 90 && (
                          <span className='idx-badge idx-badge-up'>
                            Top 10%
                          </span>
                        )}
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
                      <span style={{ color: rsRankColor(row.rsRank), fontWeight: 700 }}>
                        {row.rsRank}
                      </span>
                    </td>
                    <td className='idx-table-td-right'>
                      {Utils.Format.formatNum(row.rsScore, 1)}
                    </td>
                    <td className='idx-table-td-right'>{pctCell(row.return3m)}</td>
                    <td className='idx-table-td-right'>{pctCell(row.return6m)}</td>
                    <td className='idx-table-td-right'>{pctCell(row.return9m)}</td>
                    <td className='idx-table-td-right'>{pctCell(row.return12m)}</td>
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
        RS Score = 40%×Return3m + 20%×Return6m + 20%×Return9m + 20%×Return12m (formula Minervini).
        RS Rank = persentil 1–99 vs semua emiten. MA Align = jumlah kriteria alignment MA50/150/200.
      </div>
    </div>
  )
}
