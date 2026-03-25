/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 */

import React, { useMemo, useState } from 'react'
import { FileDown, RefreshCw, TrendingUp } from 'lucide-react'
import * as Hooks from '@app/pages/hooks/index.ts'
import * as Utils from '@app/pages/utils/index.ts'
import type * as Types from '@app/pages/Types.ts'

export default function RsLineView({ onRowClick }: { onRowClick: (code: string) => void }) {
  const [onlyNewHigh, setOnlyNewHigh] = useState(false)
  const { data, loading, error, refetch } = Hooks.useRsLine(onlyNewHigh)
  const rows = useMemo(() => data?.data ?? [], [data])
  const newHighCount = useMemo(() => (data?.data ?? []).filter((r) => r.rsLineNewHigh).length, [
    data
  ])

  return (
    <div className='idx-card'>
      <div className='idx-card-header'>
        <div>
          <div className='idx-card-title'>RS Line New High</div>
          <div
            className='idx-card-subtitle'
            style={{ fontSize: 12, color: 'var(--idx-text-muted)', marginTop: 2 }}
          >
            RS Line = Harga / IHSG · New High 52w: {newHighCount} saham · Total:{' '}
            {data?.totalCount ?? 0}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type='button'
            className={`idx-btn idx-btn-sm ${onlyNewHigh ? 'idx-btn-active' : ''}`}
            onClick={() => setOnlyNewHigh((v) => !v)}
            style={{ color: onlyNewHigh ? 'var(--idx-up)' : undefined }}
          >
            <TrendingUp size={13} aria-hidden />
            <span>New High Only ({newHighCount})</span>
          </button>
          <button
            type='button'
            className='idx-btn idx-btn-sm idx-btn-icon'
            title='Export PDF'
            onClick={() => Utils.exportRsLinePdf(data, onlyNewHigh)}
          >
            <FileDown size={14} aria-hidden />
            <span>PDF</span>
          </button>
          <button
            type='button'
            className='idx-btn idx-btn-sm idx-btn-icon'
            onClick={refetch}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'idx-spin' : ''} aria-hidden />
          </button>
        </div>
      </div>

      {error && <div className='idx-error'>{error}</div>}

      <div className='idx-table-wrap'>
        <table className='idx-table'>
          <thead>
            <tr>
              <th>Kode</th>
              <th className='idx-text-center'>RS Line New High</th>
              <th className='idx-text-right'>RS Line</th>
              <th className='idx-text-right'>% dari 52w High RS</th>
              <th className='idx-text-right'>Harga</th>
              <th className='idx-text-right'>% 52w High Harga</th>
              <th className='idx-text-right'>RS Rank</th>
              <th className='idx-text-right'>Trend ✓</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className='idx-text-center idx-text-muted' style={{ padding: 24 }}>
                  Memuat...
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className='idx-text-center idx-text-muted' style={{ padding: 24 }}>
                  Tidak ada data
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.code}
                className='idx-row-clickable'
                onClick={() => onRowClick(r.code)}
              >
                <td>
                  <div className='idx-candidate-code'>{r.code}</div>
                  {r.name && <div className='idx-candidate-name'>{r.name}</div>}
                  {r.sector && <div className='idx-candidate-sector'>{r.sector}</div>}
                </td>
                <td className='idx-text-center'>
                  {r.rsLineNewHigh
                    ? (
                      <span style={{ color: 'var(--idx-up)', fontWeight: 700, fontSize: 13 }}>
                        ★ NEW HIGH
                      </span>
                    )
                    : <span className='idx-text-muted' style={{ fontSize: 12 }}>—</span>}
                </td>
                <td className='idx-text-right'>
                  {r.rsLineValue != null ? Utils.Format.formatNum(r.rsLineValue, 1) : '—'}
                </td>
                <td
                  className='idx-text-right'
                  style={{
                    color: (r.rsLinePctFrom52wHigh ?? -99) >= -2
                      ? 'var(--idx-up)'
                      : 'var(--idx-text-muted)'
                  }}
                >
                  {r.rsLinePctFrom52wHigh != null
                    ? `${r.rsLinePctFrom52wHigh > 0 ? '+' : ''}${
                      Utils.Format.formatNum(r.rsLinePctFrom52wHigh, 2)
                    }%`
                    : '—'}
                </td>
                <td className='idx-text-right'>{Utils.Format.formatNum(r.price, 0)}</td>
                <td
                  className='idx-text-right'
                  style={{
                    color: (r.pctFrom52wHigh ?? -99) >= -5
                      ? 'var(--idx-up)'
                      : 'var(--idx-text-muted)'
                  }}
                >
                  {r.pctFrom52wHigh != null
                    ? `${Utils.Format.formatNum(r.pctFrom52wHigh, 1)}%`
                    : '—'}
                </td>
                <td className='idx-text-right'>{r.rsRank ?? '—'}</td>
                <td className='idx-text-right'>{r.trendCriteriaCount}/8</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        style={{
          marginTop: 12,
          padding: '8px 0',
          borderTop: '1px solid var(--idx-border)',
          fontSize: 11,
          color: 'var(--idx-text-muted)'
        }}
      >
        RS Line New High = RS Line saat ini ≥ RS Line 52w high · Leading indicator terkuat menurut
        Minervini, Ryan, Zanger, Ritchie
      </div>
    </div>
  )
}
