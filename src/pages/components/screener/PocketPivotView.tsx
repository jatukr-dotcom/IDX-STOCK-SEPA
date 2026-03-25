/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 */

import React, { useMemo, useState } from 'react'
import { FileDown, RefreshCw } from 'lucide-react'
import * as Hooks from '@app/pages/hooks/index.ts'
import * as Utils from '@app/pages/utils/index.ts'
import type * as Types from '@app/pages/Types.ts'

const STAGE_COLORS: Record<Types.StageNumber, string> = {
  1: 'var(--idx-accent)',
  2: 'var(--idx-up)',
  3: '#f59e0b',
  4: 'var(--idx-down)'
}

function dateIntToStr(d: number): string {
  const s = String(d)
  if (s.length !== 8) {
    return String(d)
  }
  return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`
}

export default function PocketPivotView({ onRowClick }: { onRowClick: (code: string) => void }) {
  const [lookback, setLookback] = useState(5)
  const { data, loading, error, refetch } = Hooks.usePocketPivot(lookback)
  const rows = useMemo(() => data?.data ?? [], [data])

  return (
    <div className='idx-card'>
      <div className='idx-card-header'>
        <div>
          <div className='idx-card-title'>Pocket Pivot</div>
          <div
            className='idx-card-subtitle'
            style={{ fontSize: 12, color: 'var(--idx-text-muted)', marginTop: 2 }}
          >
            David Ryan · Volume up-day &gt; max down-day vol 10d · {data?.totalCount ?? 0} sinyal
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--idx-text-muted)' }}>Lookback:</span>
          {[3, 5, 7, 10].map((d) => (
            <button
              key={d}
              type='button'
              className={`idx-btn idx-btn-sm ${lookback === d ? 'idx-btn-active' : ''}`}
              onClick={() => setLookback(d)}
            >
              {d}h
            </button>
          ))}
          <button
            type='button'
            className='idx-btn idx-btn-sm idx-btn-icon'
            title='Export PDF'
            onClick={() => Utils.exportPocketPivotPdf(data, lookback)}
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
              <th className='idx-text-center'>Stage</th>
              <th className='idx-text-right'>Harga</th>
              <th className='idx-text-right'>Tgl Pivot</th>
              <th className='idx-text-right'>Vol Pivot</th>
              <th className='idx-text-right'>Max Down Vol</th>
              <th className='idx-text-right'>MA10</th>
              <th className='idx-text-right'>% di atas MA10</th>
              <th className='idx-text-right'>RS Rank</th>
              <th className='idx-text-right'>Trend ✓</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr>
                <td colSpan={10} className='idx-text-center idx-text-muted' style={{ padding: 24 }}>
                  Memuat...
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={10} className='idx-text-center idx-text-muted' style={{ padding: 24 }}>
                  Tidak ada pocket pivot dalam {lookback} hari terakhir
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={`${r.code}-${r.pivotDate}`}
                className='idx-row-clickable'
                onClick={() => onRowClick(r.code)}
              >
                <td>
                  <div className='idx-candidate-code'>{r.code}</div>
                  {r.name && <div className='idx-candidate-name'>{r.name}</div>}
                  {r.sector && <div className='idx-candidate-sector'>{r.sector}</div>}
                </td>
                <td className='idx-text-center'>
                  <span style={{ fontWeight: 700, color: STAGE_COLORS[r.stage], fontSize: 12 }}>
                    S{r.stage}
                  </span>
                </td>
                <td className='idx-text-right'>{Utils.Format.formatNum(r.price, 0)}</td>
                <td className='idx-text-right' style={{ fontSize: 11 }}>
                  {dateIntToStr(r.pivotDate)}
                </td>
                <td className='idx-text-right' style={{ color: 'var(--idx-up)' }}>
                  {Utils.Format.formatNum(r.pivotVolume, 0)}
                </td>
                <td className='idx-text-right' style={{ color: 'var(--idx-down)' }}>
                  {Utils.Format.formatNum(r.maxDownVol10d, 0)}
                </td>
                <td className='idx-text-right'>
                  {r.ma10 != null ? Utils.Format.formatNum(r.ma10, 0) : '—'}
                </td>
                <td
                  className='idx-text-right'
                  style={{ color: (r.pctAboveMa10 ?? 0) <= 3 ? 'var(--idx-up)' : '#f59e0b' }}
                >
                  {r.pctAboveMa10 != null ? `+${Utils.Format.formatNum(r.pctAboveMa10, 2)}%` : '—'}
                </td>
                <td className='idx-text-right'>{r.rsRank}</td>
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
        Pocket Pivot: hari naik dengan volume melebihi volume terbesar hari turun dalam 10 hari
        sebelumnya · Harga ≤ 5% di atas MA10
      </div>
    </div>
  )
}
