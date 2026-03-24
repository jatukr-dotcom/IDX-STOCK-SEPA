/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 */

import React, { useMemo, useState } from 'react'
import { CheckCircle, ChevronDown, ChevronUp, TrendingUp, XCircle } from 'lucide-react'
import * as Utils from '@app/pages/utils/index.ts'
import type * as Types from '@app/pages/Types.ts'

const CRITERIA_LABELS: Record<keyof Types.TrendTemplateCriteria, string> = {
  aboveMa150Ma200: 'Harga > MA150 & MA200',
  ma150AboveMa200: 'MA150 > MA200',
  ma200Trending: 'MA200 Naik (1 bulan)',
  ma50AboveMa150Ma200: 'MA50 > MA150 & MA200',
  aboveMa50: 'Harga > MA50',
  above52wLowBy30Pct: '≥30% dari Low 52 Minggu',
  within25PctOf52wHigh: 'Dalam 25% dari High 52 Minggu',
  rsRank70: 'RS Rank ≥ 70'
}

function criteriaCountColor(count: number): string {
  if (count === 8) return 'var(--idx-up)'
  if (count >= 6) return 'var(--idx-deep)'
  return 'var(--idx-text-muted)'
}

function CriteriaDetail({ criteria }: { criteria: Types.TrendTemplateCriteria }) {
  const keys = Object.keys(CRITERIA_LABELS) as (keyof Types.TrendTemplateCriteria)[]
  return (
    <div className='idx-trend-criteria-detail'>
      {keys.map((key) => (
        <div key={key} className='idx-trend-criteria-item'>
          {criteria[key]
            ? <CheckCircle size={13} style={{ color: 'var(--idx-up)', flexShrink: 0 }} />
            : <XCircle size={13} style={{ color: 'var(--idx-text-muted)', flexShrink: 0 }} />}
          <span style={{ color: criteria[key] ? 'var(--idx-deep)' : 'var(--idx-text-muted)' }}>
            {CRITERIA_LABELS[key]}
          </span>
        </div>
      ))}
    </div>
  )
}

function TrendRow({ row }: { row: Types.TrendTemplateRow }) {
  const [expanded, setExpanded] = useState(false)
  const allPass = row.criteriaCount === 8

  return (
    <>
      <tr
        className={`idx-trend-row${allPass ? ' idx-trend-row-pass' : ''}`}
        onClick={() => setExpanded((v) => !v)}
        style={{ cursor: 'pointer' }}
      >
        <td>
          <div className='idx-trend-code'>
            <span className='idx-table-code-bold'>{row.code}</span>
            {allPass && <span className='idx-badge idx-badge-up'>SEPA</span>}
          </div>
          <div style={{ fontSize: 'var(--idx-text-sm)', marginTop: 2 }}>{row.name ?? '-'}</div>
          <div style={{ fontSize: 'var(--idx-text-xs)', color: 'var(--idx-text-muted)' }}>
            {row.sector ?? '-'}
          </div>
        </td>
        <td className='idx-table-td-right'>
          {row.price != null ? Utils.Format.formatNum(row.price) : '-'}
        </td>
        <td className='idx-table-td-right'>
          <span style={{ color: criteriaCountColor(row.criteriaCount), fontWeight: 600 }}>
            {row.criteriaCount}/8
          </span>
        </td>
        <td className='idx-table-td-right'>
          {row.rsRank != null ? row.rsRank : '-'}
        </td>
        <td className='idx-table-td-right'>
          {row.ma50 != null ? Utils.Format.formatNum(row.ma50) : '-'}
        </td>
        <td className='idx-table-td-right'>
          {row.ma150 != null ? Utils.Format.formatNum(row.ma150) : '-'}
        </td>
        <td className='idx-table-td-right'>
          {row.ma200 != null ? Utils.Format.formatNum(row.ma200) : '-'}
        </td>
        <td className='idx-table-td-right'>
          {row.pctFrom52wLow != null
            ? `+${Utils.Format.formatNum(row.pctFrom52wLow, 1)}%`
            : '-'}
        </td>
        <td className='idx-table-td-right'>
          {row.pctFrom52wHigh != null
            ? `${Utils.Format.formatNum(row.pctFrom52wHigh, 1)}%`
            : '-'}
        </td>
        <td className='idx-table-td-right'>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={10} className='idx-trend-expand-cell'>
            <CriteriaDetail criteria={row.criteria} />
          </td>
        </tr>
      )}
    </>
  )
}

export default function TrendTemplateView({
  data,
  loading,
  error,
  onRefetch
}: Types.TrendTemplateViewProps) {
  const [minCriteria, setMinCriteria] = useState(6)

  const filtered = useMemo(() => {
    if (!data?.data) return []
    return data.data.filter((r) => r.criteriaCount >= minCriteria)
  }, [data, minCriteria])

  if (loading) {
    return (
      <div className='idx-card idx-card-center'>
        <p className='idx-p-muted'>Menghitung Trend Template Minervini...</p>
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

  const passAll = data.data.filter((r) => r.criteriaCount === 8).length

  return (
    <div className='idx-card'>
      <div className='idx-px-24 idx-py-16'>
        <div className='idx-card-header'>
          <h3 className='idx-card-title idx-card-title-with-icon'>
            <TrendingUp size={20} aria-hidden />
            <span>Trend Template Minervini</span>
          </h3>
          <div className='idx-trend-stats'>
            <span className='idx-p-muted'>
              Lolos 8/8:{' '}
              <strong style={{ color: 'var(--idx-up)' }}>{passAll}</strong>
            </span>
            <span className='idx-p-muted'>Total: {data.totalCount}</span>
          </div>
        </div>
        <div className='idx-trend-filter-row'>
          <span className='idx-p-muted'>Min. Kriteria:</span>
          {[4, 5, 6, 7, 8].map((n) => (
            <button
              key={n}
              type='button'
              className={`idx-btn${minCriteria === n ? ' idx-btn-active' : ''}`}
              onClick={() => setMinCriteria(n)}
            >
              {n}+
            </button>
          ))}
          <span className='idx-p-muted'>Tampil: {filtered.length} emiten</span>
        </div>
      </div>
      {filtered.length === 0
        ? (
          <div className='idx-px-24 idx-py-16'>
            <p className='idx-p-muted'>
              Tidak ada emiten yang memenuhi {minCriteria}+ kriteria Trend Template.
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
                  <th className='idx-table-th-right'>Kriteria</th>
                  <th className='idx-table-th-right'>RS Rank</th>
                  <th className='idx-table-th-right'>MA50</th>
                  <th className='idx-table-th-right'>MA150</th>
                  <th className='idx-table-th-right'>MA200</th>
                  <th className='idx-table-th-right'>% Low 52w</th>
                  <th className='idx-table-th-right'>% High 52w</th>
                  <th className='idx-table-th-right'></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <TrendRow key={row.code} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      <div className='idx-px-24 idx-py-12 idx-p-muted idx-text-xs'>
        Kriteria: (1) Harga &gt; MA150 &amp; MA200 · (2) MA150 &gt; MA200 ·
        (3) MA200 naik 1 bulan · (4) MA50 &gt; MA150 &amp; MA200 · (5) Harga &gt; MA50 ·
        (6) Harga ≥30% di atas Low 52w · (7) Dalam 25% dari High 52w · (8) RS Rank ≥70.
        Klik baris untuk detail kriteria.
      </div>
    </div>
  )
}
