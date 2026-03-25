/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 */

import React, { useMemo, useState } from 'react'
import { FileDown, RefreshCw } from 'lucide-react'
import * as Hooks from '@app/pages/hooks/index.ts'
import * as Utils from '@app/pages/utils/index.ts'
import type * as Types from '@app/pages/Types.ts'

const _STAGE_LABELS: Record<Types.StageNumber, string> = {
  1: 'Stage 1 – Basing',
  2: 'Stage 2 – Advancing',
  3: 'Stage 3 – Topping',
  4: 'Stage 4 – Declining'
}
const STAGE_COLORS: Record<Types.StageNumber, string> = {
  1: 'var(--idx-accent)',
  2: 'var(--idx-up)',
  3: '#f59e0b',
  4: 'var(--idx-down)'
}
const STAGE_BG: Record<Types.StageNumber, string> = {
  1: 'rgba(99,179,237,0.12)',
  2: 'rgba(72,199,142,0.12)',
  3: 'rgba(245,158,11,0.12)',
  4: 'rgba(239,68,68,0.12)'
}

function StageBadge({ stage }: { stage: Types.StageNumber }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 700,
        color: STAGE_COLORS[stage],
        background: STAGE_BG[stage],
        letterSpacing: 0.3
      }}
    >
      S{stage}
    </span>
  )
}

export default function StageAnalysisView({ onRowClick }: { onRowClick: (code: string) => void }) {
  const [stageFilter, setStageFilter] = useState<Types.StageNumber | 0>(0)
  const { data, loading, error, refetch } = Hooks.useStageAnalysis(
    stageFilter === 0 ? undefined : stageFilter
  )

  const rows = useMemo(() => data?.data ?? [], [data])
  const stageCounts = useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
    for (const r of data?.data ?? []) {
      counts[r.stage] = (counts[r.stage] ?? 0) + 1
    }
    return counts
  }, [data])

  return (
    <div className='idx-card'>
      <div className='idx-card-header'>
        <div>
          <div className='idx-card-title'>Stage Analysis</div>
          <div
            className='idx-card-subtitle'
            style={{ fontSize: 12, color: 'var(--idx-text-muted)', marginTop: 2 }}
          >
            Minervini Stage 1–4 · {data?.totalCount ?? 0} saham
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {([0, 1, 2, 3, 4] as const).map((s) => (
            <button
              key={s}
              type='button'
              className={`idx-btn idx-btn-sm ${stageFilter === s ? 'idx-btn-active' : ''}`}
              onClick={() => setStageFilter(s as Types.StageNumber | 0)}
              style={s !== 0 ? { color: STAGE_COLORS[s as Types.StageNumber] } : {}}
            >
              {s === 0 ? `Semua (${data?.totalCount ?? 0})` : `S${s} (${stageCounts[s] ?? 0})`}
            </button>
          ))}
          <button
            type='button'
            className='idx-btn idx-btn-sm idx-btn-icon'
            title='Export PDF'
            onClick={() => Utils.exportStagePdf(data, stageFilter)}
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
              <th className='idx-text-right'>MA50</th>
              <th className='idx-text-right'>MA150</th>
              <th className='idx-text-right'>MA200</th>
              <th className='idx-text-right'>MA200 Slope</th>
              <th className='idx-text-right'>RS Rank</th>
              <th className='idx-text-right'>Trend ✓</th>
              <th className='idx-text-right'>% 52w High</th>
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
                  <StageBadge stage={r.stage} />
                </td>
                <td className='idx-text-right'>{Utils.Format.formatNum(r.price, 0)}</td>
                <td className='idx-text-right'>
                  {r.ma50 != null ? Utils.Format.formatNum(r.ma50, 0) : '—'}
                </td>
                <td className='idx-text-right'>
                  {r.ma150 != null ? Utils.Format.formatNum(r.ma150, 0) : '—'}
                </td>
                <td className='idx-text-right'>
                  {r.ma200 != null ? Utils.Format.formatNum(r.ma200, 0) : '—'}
                </td>
                <td
                  className='idx-text-right'
                  style={{
                    color: (r.ma200SlopePct ?? 0) >= 0 ? 'var(--idx-up)' : 'var(--idx-down)'
                  }}
                >
                  {r.ma200SlopePct != null
                    ? `${r.ma200SlopePct > 0 ? '+' : ''}${
                      Utils.Format.formatNum(r.ma200SlopePct, 2)
                    }%`
                    : '—'}
                </td>
                <td className='idx-text-right'>{r.rsRank ?? '—'}</td>
                <td className='idx-text-right'>{r.trendCriteriaCount}/8</td>
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
        Stage 1: Basing (MA200 flat) · Stage 2: Advancing (beli) · Stage 3: Topping (hati-hati) ·
        Stage 4: Declining (hindari)
      </div>
    </div>
  )
}
