/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 */

import React, { useMemo, useState } from 'react'
import { FileDown, RefreshCw } from 'lucide-react'
import * as Hooks from '@app/pages/hooks/index.ts'
import * as Utils from '@app/pages/utils/index.ts'
import type * as Types from '@app/pages/Types.ts'

const PATTERN_LABELS: Record<Types.BasePatternType, string> = {
  'flat': 'Flat Base',
  'cup-handle': 'Cup & Handle',
  'htf': 'High Tight Flag',
  'none': 'None'
}
const PATTERN_COLORS: Record<Types.BasePatternType, string> = {
  'flat': 'var(--idx-accent)',
  'cup-handle': 'var(--idx-purple)',
  'htf': '#f59e0b',
  'none': 'var(--idx-text-muted)'
}

function PatternBadge({ type }: { type: Types.BasePatternType }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 7px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        color: PATTERN_COLORS[type],
        background: `${PATTERN_COLORS[type]}1a`,
        whiteSpace: 'nowrap'
      }}
    >
      {PATTERN_LABELS[type]}
    </span>
  )
}

function BaseCountBadge({ count }: { count: number }) {
  const color = count <= 1 ? 'var(--idx-up)' : count === 2 ? '#f59e0b' : 'var(--idx-down)'
  return (
    <span style={{ fontWeight: 700, color, fontSize: 13 }}>
      {count}
      <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 2 }}>
        {count <= 1 ? '(1st)' : count === 2 ? '(2nd)' : `(${count}th)`}
      </span>
    </span>
  )
}

type FilterType = 'all' | Types.BasePatternType

export default function BasePatternsView({ onRowClick }: { onRowClick: (code: string) => void }) {
  const [filter, setFilter] = useState<FilterType>('all')
  const { data, loading, error, refetch } = Hooks.useBasePatterns(
    filter === 'all' ? undefined : filter as Types.BasePatternType
  )
  const rows = useMemo(() => data?.data ?? [], [data])

  const counts = useMemo(() => {
    const c: Record<string, number> = { flat: 0, 'cup-handle': 0, htf: 0 }
    for (const r of data?.data ?? []) {
      c[r.patternType] = (c[r.patternType] ?? 0) + 1
    }
    return c
  }, [data])

  return (
    <div className='idx-card'>
      <div className='idx-card-header'>
        <div>
          <div className='idx-card-title'>Base Pattern Detection</div>
          <div
            className='idx-card-subtitle'
            style={{ fontSize: 12, color: 'var(--idx-text-muted)', marginTop: 2 }}
          >
            Flat Base · Cup &amp; Handle · High Tight Flag · {data?.totalCount ?? 0} pola
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {(['all', 'htf', 'cup-handle', 'flat'] as FilterType[]).map((f) => (
            <button
              key={f}
              type='button'
              className={`idx-btn idx-btn-sm ${filter === f ? 'idx-btn-active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all'
                ? `Semua (${data?.totalCount ?? 0})`
                : f === 'htf'
                ? `HTF (${counts.htf ?? 0})`
                : f === 'cup-handle'
                ? `Cup (${counts['cup-handle'] ?? 0})`
                : `Flat (${counts.flat ?? 0})`}
            </button>
          ))}
          <button
            type='button'
            className='idx-btn idx-btn-sm idx-btn-icon'
            title='Export PDF'
            onClick={() => Utils.exportBasePatternsPdf(data, filter)}
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
              <th>Pola</th>
              <th className='idx-text-center'>Base Count</th>
              <th className='idx-text-right'>Depth %</th>
              <th className='idx-text-right'>Length (hari)</th>
              <th className='idx-text-right'>Harga</th>
              <th className='idx-text-right'>% 52w High</th>
              <th className='idx-text-right'>RS Rank</th>
              <th className='idx-text-right'>Trend ✓</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className='idx-text-center idx-text-muted' style={{ padding: 24 }}>
                  Memuat...
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className='idx-text-center idx-text-muted' style={{ padding: 24 }}>
                  Tidak ada pola terdeteksi
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
                <td>
                  <PatternBadge type={r.patternType} />
                </td>
                <td className='idx-text-center'>
                  <BaseCountBadge count={r.baseCount} />
                </td>
                <td className='idx-text-right'>
                  {r.baseDepthPct != null ? `${Utils.Format.formatNum(r.baseDepthPct, 1)}%` : '—'}
                </td>
                <td className='idx-text-right'>{r.baseLengthDays ?? '—'}</td>
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
        Base Count: makin kecil makin baik · 1st base probabilitas tertinggi · HTF = High Tight Flag
        (100%+ dalam 4-8 minggu lalu konsolidasi)
      </div>
    </div>
  )
}
