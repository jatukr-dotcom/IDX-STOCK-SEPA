/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 */

import React, { useMemo, useState } from 'react'
import { FileDown, RefreshCw, Zap } from 'lucide-react'
import * as Hooks from '@app/pages/hooks/index.ts'
import * as Utils from '@app/pages/utils/index.ts'
import type * as Types from '@app/pages/Types.ts'

const SETUP_COLORS: Record<Types.PowerPlaySetupType, string> = {
  'power-play': '#f59e0b',
  'low-cheat': 'var(--idx-purple)',
  'none': 'var(--idx-text-muted)'
}
const SETUP_LABELS: Record<Types.PowerPlaySetupType, string> = {
  'power-play': 'Power Play',
  'low-cheat': 'Low Cheat',
  'none': 'None'
}

function SetupBadge({ type, nearBreakout }: { type: Types.PowerPlaySetupType; nearBreakout: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{
        display: 'inline-block',
        padding: '2px 7px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        color: SETUP_COLORS[type],
        background: `${SETUP_COLORS[type]}1a`
      }}>
        {SETUP_LABELS[type]}
      </span>
      {nearBreakout && (
        <span style={{ color: 'var(--idx-up)', fontSize: 11, fontWeight: 700 }}>
          <Zap size={11} style={{ display: 'inline', marginRight: 2 }} />BREAKOUT
        </span>
      )}
    </div>
  )
}

const STAGE_COLORS: Record<Types.StageNumber, string> = {
  1: 'var(--idx-accent)',
  2: 'var(--idx-up)',
  3: '#f59e0b',
  4: 'var(--idx-down)'
}

type SetupFilter = 'all' | Types.PowerPlaySetupType

export default function PowerPlayView({ onRowClick }: { onRowClick: (code: string) => void }) {
  const [filter, setFilter] = useState<SetupFilter>('all')
  const { data, loading, error, refetch } = Hooks.usePowerPlay(
    filter === 'all' ? undefined : filter as Types.PowerPlaySetupType
  )
  const rows = useMemo(() => data?.data ?? [], [data])
  const ppCount = useMemo(() => (data?.data ?? []).filter((r) => r.setupType === 'power-play').length, [data])
  const lcCount = useMemo(() => (data?.data ?? []).filter((r) => r.setupType === 'low-cheat').length, [data])
  const breakoutCount = useMemo(() => (data?.data ?? []).filter((r) => r.nearBreakout).length, [data])

  return (
    <div className='idx-card'>
      <div className='idx-card-header'>
        <div>
          <div className='idx-card-title'>Power Play / Low Cheat</div>
          <div className='idx-card-subtitle' style={{ fontSize: 12, color: 'var(--idx-text-muted)', marginTop: 2 }}>
            Minervini Setup · Power Play: {ppCount} · Low Cheat: {lcCount} · Near Breakout: {breakoutCount}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {(['all', 'power-play', 'low-cheat'] as SetupFilter[]).map((f) => (
            <button
              key={f}
              type='button'
              className={`idx-btn idx-btn-sm ${filter === f ? 'idx-btn-active' : ''}`}
              onClick={() => setFilter(f)}
              style={f !== 'all' ? { color: SETUP_COLORS[f as Types.PowerPlaySetupType] } : {}}
            >
              {f === 'all' ? `Semua (${data?.totalCount ?? 0})` :
               f === 'power-play' ? `Power Play (${ppCount})` :
               `Low Cheat (${lcCount})`}
            </button>
          ))}
          <button
            type='button'
            className='idx-btn idx-btn-sm idx-btn-icon'
            title='Export PDF'
            onClick={() => Utils.exportPowerPlayPdf(data, filter)}
          >
            <FileDown size={14} aria-hidden />
            <span>PDF</span>
          </button>
          <button type='button' className='idx-btn idx-btn-sm idx-btn-icon' onClick={refetch} disabled={loading}>
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
              <th>Setup</th>
              <th className='idx-text-center'>Stage</th>
              <th className='idx-text-right'>Harga</th>
              <th className='idx-text-right'>Range %</th>
              <th className='idx-text-right'>Hari Konsolidasi</th>
              <th className='idx-text-right'>Vol Dry-up %</th>
              <th className='idx-text-right'>% 52w High</th>
              <th className='idx-text-right'>RS Rank</th>
              <th className='idx-text-right'>Trend ✓</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr><td colSpan={10} className='idx-text-center idx-text-muted' style={{ padding: 24 }}>Memuat...</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={10} className='idx-text-center idx-text-muted' style={{ padding: 24 }}>Tidak ada setup aktif</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.code} className='idx-row-clickable' onClick={() => onRowClick(r.code)}>
                <td>
                  <div className='idx-candidate-code'>{r.code}</div>
                  {r.name && <div className='idx-candidate-name'>{r.name}</div>}
                  {r.sector && <div className='idx-candidate-sector'>{r.sector}</div>}
                </td>
                <td><SetupBadge type={r.setupType} nearBreakout={r.nearBreakout} /></td>
                <td className='idx-text-center'>
                  <span style={{ fontWeight: 700, color: STAGE_COLORS[r.stage], fontSize: 12 }}>S{r.stage}</span>
                </td>
                <td className='idx-text-right'>{Utils.Format.formatNum(r.price, 0)}</td>
                <td className='idx-text-right' style={{ color: (r.tightRangePct ?? 99) <= 2 ? 'var(--idx-up)' : 'var(--idx-accent)' }}>
                  {r.tightRangePct != null ? `${Utils.Format.formatNum(r.tightRangePct, 2)}%` : '—'}
                </td>
                <td className='idx-text-right'>{r.consolidationDays}h</td>
                <td className='idx-text-right' style={{ color: (r.volumeDryUpPct ?? 0) >= 40 ? 'var(--idx-up)' : 'var(--idx-text-muted)' }}>
                  {r.volumeDryUpPct != null ? `${Utils.Format.formatNum(r.volumeDryUpPct, 1)}%` : '—'}
                </td>
                <td className='idx-text-right' style={{ color: (r.pctFrom52wHigh ?? -99) >= -10 ? 'var(--idx-up)' : 'var(--idx-text-muted)' }}>
                  {r.pctFrom52wHigh != null ? `${Utils.Format.formatNum(r.pctFrom52wHigh, 1)}%` : '—'}
                </td>
                <td className='idx-text-right'>{r.rsRank ?? '—'}</td>
                <td className='idx-text-right'>{r.trendCriteriaCount}/8</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, padding: '8px 0', borderTop: '1px solid var(--idx-border)', fontSize: 11, color: 'var(--idx-text-muted)' }}>
        Power Play: range &lt;3% selama 3-5 hari, volume kering · Low Cheat: range &lt;5%, harga dekat base low · BREAKOUT = harga di tepi atas range
      </div>
    </div>
  )
}
