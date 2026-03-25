/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 */

import React, { useMemo, useState } from 'react'
import { FileDown, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react'
import * as Utils from '@app/pages/utils/index.ts'
import type * as Types from '@app/pages/Types.ts'

type SignalFilter = 'all' | 'accumulation' | 'distribution' | 'vcp'

function SignalBadge({ signal, isVcp }: { signal: Types.VolumeScreenerRow['signal']; isVcp: boolean }) {
  if (isVcp) {
    return <span className='idx-vol-badge idx-vol-badge-vcp'>VCP</span>
  }
  if (signal === 'accumulation') {
    return <span className='idx-vol-badge idx-vol-badge-accum'>AKUMULASI</span>
  }
  if (signal === 'distribution') {
    return <span className='idx-vol-badge idx-vol-badge-dist'>DISTRIBUSI</span>
  }
  return <span className='idx-vol-badge idx-vol-badge-neutral'>NETRAL</span>
}

function CmfBar({ value }: { value: number | null }) {
  if (value == null) return <span className='idx-text-muted'>—</span>
  const clamped = Math.max(-0.5, Math.min(0.5, value))
  const pct = Math.abs(clamped) / 0.5 * 100
  const isPos = value >= 0
  return (
    <div className='idx-vol-cmf-wrap'>
      <div className='idx-vol-cmf-track'>
        <div
          className={`idx-vol-cmf-bar ${isPos ? 'idx-vol-cmf-pos' : 'idx-vol-cmf-neg'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`idx-vol-cmf-label ${isPos ? 'idx-color-up' : 'idx-color-down'}`}>
        {value > 0 ? '+' : ''}{Utils.Format.formatNum(value, 3)}
      </span>
    </div>
  )
}

function MfiDot({ value }: { value: number | null }) {
  if (value == null) return <span className='idx-text-muted'>—</span>
  const color = value >= 70 ? 'var(--idx-up)' : value <= 30 ? 'var(--idx-down)' : 'var(--idx-accent)'
  return (
    <span style={{ color, fontWeight: 600 }}>{Utils.Format.formatNum(value, 1)}</span>
  )
}

function OBVIcon({ trend }: { trend: 'up' | 'down' | 'flat' }) {
  if (trend === 'up') return <TrendingUp size={14} style={{ color: 'var(--idx-up)' }} />
  if (trend === 'down') return <TrendingDown size={14} style={{ color: 'var(--idx-down)' }} />
  return <span className='idx-text-muted' style={{ fontSize: 12 }}>—</span>
}

function CriteriaPips({ count }: { count: number }) {
  return (
    <div className='idx-vol-pips'>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={`idx-vol-pip${i < count ? ' idx-vol-pip-on' : ''}`} />
      ))}
    </div>
  )
}

function VolumeRow({ row, onRowClick }: { row: Types.VolumeScreenerRow; onRowClick: (code: string) => void }) {
  return (
    <tr className='idx-vol-row' onClick={() => onRowClick(row.code)} style={{ cursor: 'pointer' }}>
      <td>
        <div className='idx-candidate-code'>{row.code}</div>
        {row.name && <div className='idx-candidate-name'>{row.name}</div>}
      </td>
      <td className='idx-text-right'>{Utils.Format.formatNum(row.close, 0)}</td>
      <td><CmfBar value={row.cmf} /></td>
      <td className='idx-text-center'><MfiDot value={row.mfi} /></td>
      <td className='idx-text-center'><OBVIcon trend={row.obvTrend} /></td>
      <td className='idx-text-right'>
        {row.foreignNetPct != null
          ? <span className={row.foreignNetPct >= 0 ? 'idx-color-up' : 'idx-color-down'}>
              {row.foreignNetPct > 0 ? '+' : ''}{Utils.Format.formatNum(row.foreignNetPct, 1)}%
            </span>
          : <span className='idx-text-muted'>—</span>}
      </td>
      <td className='idx-text-center'>
        <CriteriaPips count={row.criteriaCount} />
      </td>
      <td className='idx-text-center'>
        <SignalBadge signal={row.signal} isVcp={row.vcp.isVcp} />
      </td>
    </tr>
  )
}

export default function VolumeAnalysisView({ data, loading, error, onRefetch, onRowClick }: Types.VolumeAnalysisViewProps & { onRowClick?: (code: string) => void }) {
  const [signalFilter, setSignalFilter] = useState<SignalFilter>('all')
  const [minCriteria, setMinCriteria] = useState(0)
  const [sectorFilter, setSectorFilter] = useState('')

  const sectors = useMemo(() => {
    if (!data) return []
    const set = new Set<string>()
    for (const r of data.data) {
      if (r.sector) set.add(r.sector)
    }
    return Array.from(set).sort()
  }, [data])

  const filtered = useMemo(() => {
    if (!data) return []
    return data.data.filter((r) => {
      if (signalFilter === 'vcp' && !r.vcp.isVcp) return false
      if (signalFilter === 'accumulation' && r.signal !== 'accumulation' && !r.vcp.isVcp) return false
      if (signalFilter === 'distribution' && r.signal !== 'distribution') return false
      if (r.criteriaCount < minCriteria) return false
      if (sectorFilter && r.sector !== sectorFilter) return false
      return true
    })
  }, [data, signalFilter, minCriteria, sectorFilter])

  const vcpCount = data?.data.filter((r) => r.vcp.isVcp).length ?? 0
  const accumCount = data?.data.filter((r) => r.signal === 'accumulation').length ?? 0
  const distCount = data?.data.filter((r) => r.signal === 'distribution').length ?? 0

  if (loading) {
    return (
      <div className='idx-loading-wrap'>
        <div className='idx-loading-spinner' />
        <div className='idx-text-muted' style={{ marginTop: 8 }}>Menghitung indikator volume...</div>
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
      {/* Summary pills */}
      <div className='idx-vol-summary-row'>
        <div className='idx-vol-pill idx-vol-pill-vcp' onClick={() => setSignalFilter(signalFilter === 'vcp' ? 'all' : 'vcp')}>
          <span className='idx-vol-pill-label'>VCP</span>
          <span className='idx-vol-pill-count'>{vcpCount}</span>
        </div>
        <div className='idx-vol-pill idx-vol-pill-accum' onClick={() => setSignalFilter(signalFilter === 'accumulation' ? 'all' : 'accumulation')}>
          <span className='idx-vol-pill-label'>Akumulasi</span>
          <span className='idx-vol-pill-count'>{accumCount}</span>
        </div>
        <div className='idx-vol-pill idx-vol-pill-dist' onClick={() => setSignalFilter(signalFilter === 'distribution' ? 'all' : 'distribution')}>
          <span className='idx-vol-pill-label'>Distribusi</span>
          <span className='idx-vol-pill-count'>{distCount}</span>
        </div>
        <div className='idx-vol-pill-spacer' />
        <select
          className='idx-select idx-select-sm'
          value={sectorFilter}
          onChange={(e) => setSectorFilter(e.target.value)}
        >
          <option value=''>Semua Sektor</option>
          {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          className='idx-select idx-select-sm'
          value={minCriteria}
          onChange={(e) => setMinCriteria(Number(e.target.value))}
        >
          <option value={0}>Min Kriteria: 0</option>
          <option value={2}>Min Kriteria: 2</option>
          <option value={3}>Min Kriteria: 3</option>
          <option value={4}>Min Kriteria: 4</option>
          <option value={5}>Min Kriteria: 5</option>
        </select>
        <button type='button' className='idx-btn idx-btn-sm idx-btn-icon' onClick={onRefetch} title='Refresh'>
          <RefreshCw size={14} />
        </button>
        <button
          type='button'
          className='idx-btn idx-btn-sm idx-btn-icon'
          title='Export PDF'
          disabled={!data || filtered.length === 0}
          onClick={() => data && Utils.exportVcpPdf(data, signalFilter, filtered)}
        >
          <FileDown size={14} aria-hidden />
          <span>PDF</span>
        </button>
      </div>

      {/* Legend */}
      <div className='idx-vol-legend'>
        <span className='idx-text-muted' style={{ fontSize: 11 }}>
          CMF: Chaikin Money Flow (20) &nbsp;|&nbsp; MFI: Money Flow Index (14) &nbsp;|&nbsp;
          OBV: On-Balance Volume &nbsp;|&nbsp; Foreign: Net Asing 20h &nbsp;|&nbsp;
          VCP: Volatility Contraction Pattern
        </span>
      </div>

      <div className='idx-table-scroll'>
        <table className='idx-table idx-vol-table'>
          <thead>
            <tr>
              <th>Saham</th>
              <th className='idx-text-right'>Harga</th>
              <th>CMF(20)</th>
              <th className='idx-text-center'>MFI(14)</th>
              <th className='idx-text-center'>OBV</th>
              <th className='idx-text-right'>Foreign%</th>
              <th className='idx-text-center'>Kriteria</th>
              <th className='idx-text-center'>Sinyal</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0
              ? (
                <tr>
                  <td colSpan={8} className='idx-text-center idx-text-muted' style={{ padding: '24px 0' }}>
                    Tidak ada data
                  </td>
                </tr>
              )
              : filtered.map((row) => (
                <VolumeRow key={row.code} row={row} onRowClick={onRowClick ?? (() => {})} />
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
