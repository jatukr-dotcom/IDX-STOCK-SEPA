/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 */

import React, { useMemo, useState } from 'react'
import { FileDown, RefreshCw } from 'lucide-react'
import * as Utils from '@app/pages/utils/index.ts'
import type * as Types from '@app/pages/Types.ts'

type BreakoutFilter = 'all' | 'breakout' | 'approaching'

function SignalBadge({ signal }: { signal: Types.BreakoutRow['breakoutSignal'] }) {
  if (signal === 'breakout') {
    return (
      <span
        className='idx-vol-badge'
        style={{ color: 'var(--idx-up)', borderColor: 'var(--idx-up)' }}
      >
        BREAKOUT
      </span>
    )
  }
  if (signal === 'approaching') {
    return (
      <span
        className='idx-vol-badge'
        style={{ color: 'var(--idx-accent)', borderColor: 'var(--idx-accent)' }}
      >
        MENDEKATI
      </span>
    )
  }
  return <span className='idx-text-muted'>—</span>
}

function PatternBadge({ patternType }: { patternType: string }) {
  if (patternType === 'none' || !patternType) {
    return <span className='idx-text-muted'>—</span>
  }
  const labelMap: Record<string, string> = {
    htf: 'HTF',
    vcp: 'VCP',
    flat: 'Flat',
    'cup-handle': 'Cup'
  }
  return (
    <span className='idx-vol-badge' style={{ fontSize: 11 }}>
      {labelMap[patternType] ?? patternType.toUpperCase()}
    </span>
  )
}

function StageBadge({ stage }: { stage: number }) {
  const colorMap: Record<number, string> = {
    1: 'var(--idx-accent)',
    2: 'var(--idx-up)',
    3: 'var(--idx-down)',
    4: 'var(--idx-down)'
  }
  return (
    <span
      className='idx-vol-badge'
      style={{
        color: colorMap[stage] ?? 'inherit',
        borderColor: colorMap[stage] ?? 'inherit',
        fontSize: 11
      }}
    >
      S{stage}
    </span>
  )
}

function BreakoutRow(
  { row, onRowClick }: { row: Types.BreakoutRow; onRowClick: (code: string) => void }
) {
  return (
    <tr
      className='idx-vol-row'
      onClick={() => onRowClick(row.code)}
      style={{ cursor: 'pointer' }}
    >
      <td>
        <div className='idx-candidate-code'>{row.code}</div>
        {row.name && <div className='idx-candidate-name'>{row.name}</div>}
      </td>
      <td className='idx-text-right'>{Utils.Format.formatNum(row.price, 0)}</td>
      <td className='idx-text-center'>
        <SignalBadge signal={row.breakoutSignal} />
      </td>
      <td className='idx-text-right'>
        {row.pivotPoint != null
          ? Utils.Format.formatNum(row.pivotPoint, 0)
          : <span className='idx-text-muted'>—</span>}
      </td>
      <td className='idx-text-right'>
        {row.breakoutVolRatio != null
          ? (
            <span style={{ color: 'var(--idx-up)', fontWeight: 600 }}>
              {Utils.Format.formatNum(row.breakoutVolRatio, 1)}x
            </span>
          )
          : <span className='idx-text-muted'>—</span>}
      </td>
      <td className='idx-text-right'>
        {row.atrPct != null
          ? Utils.Format.formatNum(row.atrPct, 2) + '%'
          : <span className='idx-text-muted'>—</span>}
      </td>
      <td className='idx-text-center'>
        {row.bbSqueeze
          ? <span style={{ color: 'var(--idx-up)', fontWeight: 600 }}>Ya</span>
          : <span className='idx-text-muted'>—</span>}
      </td>
      <td className='idx-text-center'>
        <PatternBadge patternType={row.patternType} />
      </td>
      <td className='idx-text-right'>{row.rsRank}</td>
      <td className='idx-text-center'>
        <StageBadge stage={row.stage} />
      </td>
      <td className='idx-text-right'>
        {row.pctFrom52wHigh != null
          ? (
            <span className={row.pctFrom52wHigh >= 0 ? 'idx-color-up' : 'idx-color-down'}>
              {row.pctFrom52wHigh > 0 ? '+' : ''}
              {Utils.Format.formatNum(row.pctFrom52wHigh, 1)}%
            </span>
          )
          : <span className='idx-text-muted'>—</span>}
      </td>
    </tr>
  )
}

export default function BreakoutView(
  { data, loading, error, onRefetch, onRowClick }: Types.BreakoutViewProps
) {
  const [signalFilter, setSignalFilter] = useState<BreakoutFilter>('all')

  const filtered = useMemo(() => {
    if (!data) {
      return []
    }
    return data.data.filter((r) => {
      if (signalFilter === 'breakout' && r.breakoutSignal !== 'breakout') {
        return false
      }
      if (signalFilter === 'approaching' && r.breakoutSignal !== 'approaching') {
        return false
      }
      return true
    })
  }, [data, signalFilter])

  const breakoutCount = data?.data.filter((r) => r.breakoutSignal === 'breakout').length ?? 0
  const approachingCount = data?.data.filter((r) => r.breakoutSignal === 'approaching').length ?? 0

  if (loading) {
    return (
      <div className='idx-loading-wrap'>
        <div className='idx-loading-spinner' />
        <div className='idx-text-muted' style={{ marginTop: 8 }}>
          Mendeteksi pola breakout...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className='idx-error-wrap'>
        <div className='idx-error-msg'>{error}</div>
        <button type='button' className='idx-btn idx-btn-sm' onClick={onRefetch}>
          <RefreshCw size={14} /> Coba Lagi
        </button>
      </div>
    )
  }

  return (
    <div className='idx-vol-view'>
      {/* Filter pills + toolbar */}
      <div className='idx-vol-summary-row'>
        <button
          type='button'
          className={`idx-btn idx-btn-sm${signalFilter === 'all' ? ' idx-btn-active' : ''}`}
          onClick={() => setSignalFilter('all')}
        >
          Semua ({data?.totalCount ?? 0})
        </button>
        <button
          type='button'
          className={`idx-btn idx-btn-sm${signalFilter === 'breakout' ? ' idx-btn-active' : ''}`}
          onClick={() => setSignalFilter('breakout')}
          style={{ color: 'var(--idx-up)' }}
        >
          Breakout ({breakoutCount})
        </button>
        <button
          type='button'
          className={`idx-btn idx-btn-sm${signalFilter === 'approaching' ? ' idx-btn-active' : ''}`}
          onClick={() => setSignalFilter('approaching')}
          style={{ color: 'var(--idx-accent)' }}
        >
          Mendekati Pivot ({approachingCount})
        </button>
        <div className='idx-vol-pill-spacer' />
        <button
          type='button'
          className='idx-btn idx-btn-sm idx-btn-icon'
          onClick={onRefetch}
          title='Refresh'
        >
          <RefreshCw size={14} />
        </button>
        <button
          type='button'
          className='idx-btn idx-btn-sm idx-btn-icon'
          title='Export PDF'
          disabled={!data || filtered.length === 0}
          onClick={() => {
            // PDF export placeholder — same pattern as VolumeAnalysisView
          }}
        >
          <FileDown size={14} aria-hidden />
          <span>PDF</span>
        </button>
      </div>

      {/* Legend */}
      <div className='idx-vol-legend'>
        <span className='idx-text-muted' style={{ fontSize: 11 }}>
          Breakout = harga close di atas pivot + volume ≥1.5× rata-rata 50 hari.&nbsp; Mendekati =
          dalam 3% dari pivot.&nbsp; BB Squeeze = Bollinger Band sempitnya di level 6 bulan
          terendah.
        </span>
      </div>

      <div className='idx-table-scroll'>
        <table className='idx-table idx-vol-table'>
          <thead>
            <tr>
              <th>Saham</th>
              <th className='idx-text-right'>Harga</th>
              <th className='idx-text-center'>Sinyal</th>
              <th className='idx-text-right'>Pivot</th>
              <th className='idx-text-right'>Vol Ratio</th>
              <th className='idx-text-right'>ATR%</th>
              <th className='idx-text-center'>BB Squeeze</th>
              <th className='idx-text-center'>Pola</th>
              <th className='idx-text-right'>RS</th>
              <th className='idx-text-center'>Stage</th>
              <th className='idx-text-right'>Jarak 52w</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0
              ? (
                <tr>
                  <td
                    colSpan={11}
                    className='idx-text-center idx-text-muted'
                    style={{ padding: '24px 0' }}
                  >
                    Tidak ada saham breakout atau mendekati pivot saat ini.
                  </td>
                </tr>
              )
              : filtered.map((row) => (
                <BreakoutRow key={row.code} row={row} onRowClick={onRowClick ?? (() => {})} />
              ))}
          </tbody>
        </table>
      </div>

      <div className='idx-vol-count-label'>
        Menampilkan {filtered.length} dari {data?.totalCount ?? 0} saham
      </div>
    </div>
  )
}
