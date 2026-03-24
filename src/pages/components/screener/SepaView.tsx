/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 */

import React, { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Zap } from 'lucide-react'
import * as Utils from '@app/pages/utils/index.ts'
import type * as Types from '@app/pages/Types.ts'

const CRITERIA_SHORT: Record<keyof Types.TrendTemplateCriteria, string> = {
  aboveMa150Ma200: 'P>MA150/200',
  ma150AboveMa200: 'MA150>MA200',
  ma200Trending: 'MA200↑',
  ma50AboveMa150Ma200: 'MA50>MA150/200',
  aboveMa50: 'P>MA50',
  above52wLowBy30Pct: '+30%Low',
  within25PctOf52wHigh: '-25%High',
  rsRank70: 'RS≥70'
}

function SepaScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score))
  const color = pct >= 75 ? 'var(--idx-up)' : pct >= 55 ? '#f59e0b' : 'var(--idx-text-muted)'
  return (
    <div className='idx-sepa-score-bar-wrap'>
      <div className='idx-sepa-score-bar-track'>
        <div
          className='idx-sepa-score-bar-fill'
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className='idx-sepa-score-label' style={{ color }}>{Utils.Format.formatNum(score, 1)}</span>
    </div>
  )
}

function CriteriaPips({ criteria }: { criteria: Types.TrendTemplateCriteria }) {
  const keys = Object.keys(CRITERIA_SHORT) as (keyof Types.TrendTemplateCriteria)[]
  return (
    <div className='idx-sepa-pips'>
      {keys.map((key) => (
        <span
          key={key}
          className={`idx-sepa-pip${criteria[key] ? ' idx-sepa-pip-on' : ''}`}
          title={CRITERIA_SHORT[key]}
        />
      ))}
    </div>
  )
}

function SepaRow({ row }: { row: Types.SepaCandidateRow }) {
  const [expanded, setExpanded] = useState(false)
  const fullPass = row.trendCriteriaCount === 8

  return (
    <>
      <tr
        className={`idx-sepa-row${fullPass ? ' idx-trend-row-pass' : ''}`}
        onClick={() => setExpanded((v) => !v)}
        style={{ cursor: 'pointer' }}
      >
        <td>
          <div className='idx-trend-code'>
            <span className='idx-table-code-bold'>{row.code}</span>
            {fullPass && <span className='idx-badge idx-badge-up'>SEPA</span>}
          </div>
          <div style={{ fontSize: 'var(--idx-text-sm)', marginTop: 2 }}>{row.name ?? '-'}</div>
          <div style={{ fontSize: 'var(--idx-text-xs)', color: 'var(--idx-text-muted)' }}>
            {row.sector ?? '-'}
          </div>
        </td>
        <td className='idx-table-td-right'>
          <SepaScoreBar score={row.sepaScore} />
        </td>
        <td className='idx-table-td-right'>
          <span style={{
            color: row.rsRank >= 90 ? 'var(--idx-up)' : row.rsRank >= 70 ? 'var(--idx-deep)' : 'var(--idx-text-muted)',
            fontWeight: 700
          }}>
            {row.rsRank}
          </span>
        </td>
        <td className='idx-table-td-right'>
          <span style={{
            color: row.trendCriteriaCount === 8 ? 'var(--idx-up)' : 'var(--idx-deep)',
            fontWeight: 600
          }}>
            {row.trendCriteriaCount}/8
          </span>
        </td>
        <td>
          <CriteriaPips criteria={row.criteria} />
        </td>
        <td className='idx-table-td-right'>
          {row.return3m != null
            ? (
              <span className={row.return3m >= 0 ? 'idx-pct-up' : 'idx-pct-down'}>
                {row.return3m >= 0 ? '+' : ''}{Utils.Format.formatNum(row.return3m, 1)}%
              </span>
            )
            : '-'}
        </td>
        <td className='idx-table-td-right'>
          {row.pctFrom52wHigh != null
            ? <span style={{ color: row.pctFrom52wHigh >= -5 ? 'var(--idx-up)' : undefined }}>
                {Utils.Format.formatNum(row.pctFrom52wHigh, 1)}%
              </span>
            : '-'}
        </td>
        <td className='idx-table-td-right'>
          {row.roe != null ? `${Utils.Format.formatNum(row.roe, 1)}%` : '-'}
        </td>
        <td className='idx-table-td-right'>
          {row.per != null ? Utils.Format.formatNum(row.per, 1) : '-'}
        </td>
        <td className='idx-table-td-right'>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={10} className='idx-trend-expand-cell'>
            <div className='idx-sepa-detail'>
              <div className='idx-sepa-detail-group'>
                <span className='idx-p-muted'>Harga</span>
                <strong>{row.price != null ? Utils.Format.formatNum(row.price) : '-'}</strong>
              </div>
              <div className='idx-sepa-detail-group'>
                <span className='idx-p-muted'>MA50</span>
                <strong>{row.ma50 != null ? Utils.Format.formatNum(row.ma50) : '-'}</strong>
              </div>
              <div className='idx-sepa-detail-group'>
                <span className='idx-p-muted'>MA150</span>
                <strong>{row.ma150 != null ? Utils.Format.formatNum(row.ma150) : '-'}</strong>
              </div>
              <div className='idx-sepa-detail-group'>
                <span className='idx-p-muted'>MA200</span>
                <strong>{row.ma200 != null ? Utils.Format.formatNum(row.ma200) : '-'}</strong>
              </div>
              <div className='idx-sepa-detail-group'>
                <span className='idx-p-muted'>High 52w</span>
                <strong>{row.high52w != null ? Utils.Format.formatNum(row.high52w) : '-'}</strong>
              </div>
              <div className='idx-sepa-detail-group'>
                <span className='idx-p-muted'>Low 52w</span>
                <strong>{row.low52w != null ? Utils.Format.formatNum(row.low52w) : '-'}</strong>
              </div>
              <div className='idx-sepa-detail-group'>
                <span className='idx-p-muted'>Return 6m</span>
                <strong>{row.return6m != null ? `${Utils.Format.formatNum(row.return6m, 1)}%` : '-'}</strong>
              </div>
              <div className='idx-sepa-detail-group'>
                <span className='idx-p-muted'>RS Score</span>
                <strong>{Utils.Format.formatNum(row.rsScore, 1)}</strong>
              </div>
              <div className='idx-sepa-detail-group'>
                <span className='idx-p-muted'>DER</span>
                <strong>{row.der != null ? Utils.Format.formatNum(row.der, 2) : '-'}</strong>
              </div>
              <div className='idx-sepa-detail-group'>
                <span className='idx-p-muted'>NPM</span>
                <strong>{row.npm != null ? `${Utils.Format.formatNum(row.npm, 1)}%` : '-'}</strong>
              </div>
            </div>
            <div className='idx-trend-criteria-detail' style={{ marginTop: 8 }}>
              {(Object.keys(CRITERIA_SHORT) as (keyof Types.TrendTemplateCriteria)[]).map((key) => (
                <div key={key} className='idx-trend-criteria-item'>
                  <span style={{
                    color: row.criteria[key] ? 'var(--idx-up)' : 'var(--idx-text-muted)',
                    fontWeight: 700,
                    fontSize: 14
                  }}>
                    {row.criteria[key] ? '✓' : '✗'}
                  </span>
                  <span style={{ color: row.criteria[key] ? 'var(--idx-deep)' : 'var(--idx-text-muted)' }}>
                    {CRITERIA_SHORT[key]}
                  </span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function SepaView({ data, loading, error, onRefetch }: Types.SepaViewProps) {
  const [minTrend, setMinTrend] = useState(6)
  const [minRs, setMinRs] = useState(70)

  const filtered = useMemo(() => {
    if (!data?.data) return []
    return data.data.filter((r) => r.trendCriteriaCount >= minTrend && r.rsRank >= minRs)
  }, [data, minTrend, minRs])

  if (loading) {
    return (
      <div className='idx-card idx-card-center'>
        <p className='idx-p-muted'>Menghitung SEPA Candidates...</p>
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
  if (!data) return null

  const fullSepa = data.data.filter((r) => r.trendCriteriaCount === 8).length

  return (
    <div className='idx-card'>
      <div className='idx-px-24 idx-py-16'>
        <div className='idx-card-header'>
          <h3 className='idx-card-title idx-card-title-with-icon'>
            <Zap size={20} aria-hidden />
            <span>SEPA Candidates</span>
          </h3>
          <div className='idx-trend-stats'>
            <span className='idx-p-muted'>
              SEPA Penuh:{' '}
              <strong style={{ color: 'var(--idx-up)' }}>{fullSepa}</strong>
            </span>
            <span className='idx-p-muted'>Lolos filter: {data.totalCount}</span>
          </div>
        </div>
        <div className='idx-trend-filter-row'>
          <span className='idx-p-muted'>Min. Trend:</span>
          {[5, 6, 7, 8].map((n) => (
            <button
              key={n}
              type='button'
              className={`idx-btn${minTrend === n ? ' idx-btn-active' : ''}`}
              onClick={() => setMinTrend(n)}
            >
              {n}/8
            </button>
          ))}
          <span className='idx-p-muted idx-sepa-divider'>|</span>
          <span className='idx-p-muted'>Min. RS:</span>
          {[60, 70, 80, 90].map((n) => (
            <button
              key={n}
              type='button'
              className={`idx-btn${minRs === n ? ' idx-btn-active' : ''}`}
              onClick={() => setMinRs(n)}
            >
              {n}+
            </button>
          ))}
          <span className='idx-p-muted'>Tampil: {filtered.length}</span>
        </div>
      </div>
      {filtered.length === 0
        ? (
          <div className='idx-px-24 idx-py-16'>
            <p className='idx-p-muted'>
              Tidak ada kandidat SEPA dengan Trend ≥{minTrend}/8 dan RS Rank ≥{minRs}.
            </p>
          </div>
        )
        : (
          <div className='idx-table-wrap'>
            <table className='idx-table'>
              <thead>
                <tr>
                  <th>Emiten</th>
                  <th className='idx-table-th-right'>SEPA Score</th>
                  <th className='idx-table-th-right'>RS Rank</th>
                  <th className='idx-table-th-right'>Trend</th>
                  <th>Kriteria</th>
                  <th className='idx-table-th-right'>Return 3m</th>
                  <th className='idx-table-th-right'>% High 52w</th>
                  <th className='idx-table-th-right'>ROE</th>
                  <th className='idx-table-th-right'>PER</th>
                  <th className='idx-table-th-right'></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <SepaRow key={row.code} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      <div className='idx-px-24 idx-py-12 idx-p-muted idx-text-xs'>
        SEPA Score = 40%×Trend Template + 35%×RS Rank + 25%×Kualitas Fundamental (ROE, NPM).
        Klik baris untuk detail lengkap MA, 52w high/low, dan semua kriteria.
      </div>
    </div>
  )
}
