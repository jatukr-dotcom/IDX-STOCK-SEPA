/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * AI Recommendation View with mode selector, narrative, and results table
 */

import React, { useState } from 'react'
import { Brain, ChevronDown, ChevronUp, FileDown, Sparkles } from 'lucide-react'
import * as Utils from '@app/pages/utils/index.ts'
import type * as Types from '@app/pages/Types.ts'

function buildClaudePrompt(data: Types.AiRecommendationResponse, mode: Types.AiRecommendationMode): string {
  const modeLabel = mode === 'technical' ? 'Teknikal' : mode === 'fundamental' ? 'Fundamental' : 'Kombinasi'
  const top10 = data.data.slice(0, 10)
  const dateStr = String(data.date)
  const tanggal = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`

  const rows = top10.map((r, i) =>
    `${i + 1}. ${r.code} (${r.name ?? '-'}) — Sektor: ${r.sector ?? '-'}
   Skor ${modeLabel}: ${Math.round(r.combinedScore)} | SEPA: ${Math.round(r.sepaScore)} | Stage: ${r.stage} | RS Rank: ${r.rsRank}
   EPS YoY: ${r.epsGrowthPct != null ? `${r.epsGrowthPct >= 0 ? '+' : ''}${r.epsGrowthPct.toFixed(1)}%` : 'N/A'} | ROE: ${r.roe != null ? `${r.roe.toFixed(1)}%` : 'N/A'} | DER: ${r.der != null ? r.der.toFixed(2) : 'N/A'}
   Sinyal: ${r.reasons.slice(0, 3).join(' | ')}`
  ).join('\n\n')

  return `Berikut adalah hasil screening saham IDX (Bursa Efek Indonesia) per tanggal ${tanggal} berdasarkan analisis ${modeLabel}:

${rows}

Tolong buatkan narasi pasar 3–4 paragraf dalam Bahasa Indonesia yang:
1. Mengidentifikasi tema atau pola umum dari saham-saham teratas ini
2. Menyebutkan sektor mana yang paling kuat dan kenapa
3. Menyoroti setup individual yang paling menarik untuk diperhatikan
4. Memberikan konteks risiko pasar yang relevan

Catatan: Ini adalah analisis teknikal/fundamental dari screener, bukan rekomendasi investasi.`
}

function ScoreBar({ score }: { score: number }) {
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
      <span className='idx-sepa-score-label' style={{ color }}>
        {Utils.Format.formatNum(score, 1)}
      </span>
    </div>
  )
}

function StageBadge({ stage }: { stage: Types.StageNumber }) {
  const colors: Record<Types.StageNumber, string> = {
    1: 'var(--idx-text-muted)',
    2: 'var(--idx-up)',
    3: 'var(--idx-accent)',
    4: 'var(--idx-down)'
  }
  return (
    <span style={{ color: colors[stage], fontWeight: 700, fontSize: 12 }}>
      S{stage}
    </span>
  )
}

function PatternBadge({ type }: { type: Types.BasePatternType }) {
  if (type === 'none') {
    return null
  }
  const labels: Record<Exclude<Types.BasePatternType, 'none'>, string> = {
    'flat': 'FLAT',
    'cup-handle': 'C&H',
    'htf': 'HTF'
  }
  return <span className='idx-badge idx-badge-accent'>{labels[type]}</span>
}

function SetupBadge({ type }: { type: Types.PowerPlaySetupType }) {
  if (type === 'none') {
    return null
  }
  const labels: Record<Exclude<Types.PowerPlaySetupType, 'none'>, string> = {
    'power-play': 'PP',
    'low-cheat': 'LC'
  }
  return (
    <span className='idx-badge' style={{ background: 'var(--idx-purple)' }}>{labels[type]}</span>
  )
}

function AiRecRow({ row }: { row: Types.AiRecommendationRow }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <tr
        onClick={() => setExpanded((v) => !v)}
        style={{ cursor: 'pointer' }}
      >
        <td>
          <div className='idx-trend-code'>
            <span className='idx-table-code-bold'>{row.code}</span>
          </div>
          <div style={{ fontSize: 'var(--idx-text-sm)', marginTop: 2 }}>{row.name ?? '-'}</div>
          <div style={{ fontSize: 'var(--idx-text-xs)', color: 'var(--idx-text-muted)' }}>
            {row.sector ?? '-'}
          </div>
        </td>
        <td className='idx-table-td-right'>
          <ScoreBar score={row.combinedScore} />
        </td>
        <td className='idx-table-td-right'>
          {Utils.Format.formatNum(row.techScore, 1)}
        </td>
        <td className='idx-table-td-right'>
          {Utils.Format.formatNum(row.fundScore, 1)}
        </td>
        <td className='idx-table-td-right'>
          {Utils.Format.formatNum(row.sepaScore, 1)}
        </td>
        <td className='idx-table-td-right'>
          <StageBadge stage={row.stage} />
        </td>
        <td className='idx-table-td-right'>
          <span
            style={{
              color: row.rsRank >= 90
                ? 'var(--idx-up)'
                : row.rsRank >= 70
                ? 'var(--idx-deep)'
                : 'var(--idx-text-muted)',
              fontWeight: 700
            }}
          >
            {row.rsRank}
          </span>
        </td>
        <td className='idx-table-td-right'>
          {row.epsGrowthPct != null
            ? (
              <span
                style={{
                  color: row.epsGrowthPct >= 25
                    ? 'var(--idx-up)'
                    : row.epsGrowthPct >= 0
                    ? 'var(--idx-accent)'
                    : 'var(--idx-down)'
                }}
              >
                {row.epsGrowthPct >= 0 ? '+' : ''}
                {Utils.Format.formatNum(row.epsGrowthPct, 1)}%
              </span>
            )
            : '-'}
        </td>
        <td className='idx-table-td-right'>
          {row.roe != null ? `${Utils.Format.formatNum(row.roe, 1)}%` : '-'}
        </td>
        <td className='idx-table-td-right'>
          {row.der != null ? Utils.Format.formatNum(row.der, 2) : '-'}
        </td>
        <td style={{ whiteSpace: 'nowrap' }}>
          <div
            style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'flex-start' }}
          >
            {row.hasRsLineNewHigh && (
              <span className='idx-badge' style={{ background: 'var(--idx-deep)' }}>RS NH</span>
            )}
            {row.hasPocketPivot && (
              <span className='idx-badge' style={{ background: 'var(--idx-accent)' }}>PP</span>
            )}
            <PatternBadge type={row.patternType} />
            <SetupBadge type={row.setupType} />
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={12} className='idx-trend-expand-cell'>
            <div style={{ padding: 12 }}>
              <div style={{ marginBottom: 12 }}>
                <p
                  style={{
                    fontSize: 'var(--idx-text-sm)',
                    color: 'var(--idx-text-muted)',
                    marginBottom: 8
                  }}
                >
                  <strong>Sinyal Utama:</strong>
                </p>
                <ul style={{ paddingLeft: 20, marginTop: 4 }}>
                  {row.reasons.map((reason, i) => (
                    <li
                      key={i}
                      style={{
                        fontSize: 'var(--idx-text-sm)',
                        marginBottom: 4,
                        color: 'var(--idx-text)'
                      }}
                    >
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>
              <div style={{ paddingTop: 8, borderTop: '1px solid var(--idx-border)' }}>
                <p style={{ fontSize: 'var(--idx-text-xs)', color: 'var(--idx-text-muted)' }}>
                  Gorengan Score:{' '}
                  {Math.round(row.gorenganScore)}/100 ({Math.round(row.gorenganScore)} {'<'}{' '}
                  60 = lolos filter)
                </p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function AiRecommendationView({
  data,
  loading,
  error,
  onRefetch,
  mode,
  onModeChange
}: Types.AiRecommendationViewProps) {
  const [narrativeExpanded, setNarrativeExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  function handleCopyPrompt() {
    if (!data) return
    const prompt = buildClaudePrompt(data, mode)
    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
      globalThis.open('https://claude.ai/new', '_blank')
    })
  }

  if (loading) {
    return (
      <div className='idx-card idx-card-center'>
        <p className='idx-p-muted'>Menganalisis saham dengan AI...</p>
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

  const modeLabels: Record<Types.AiRecommendationMode, string> = {
    technical: 'Teknikal',
    fundamental: 'Fundamental',
    combined: 'Kombinasi'
  }

  const filtered = data.data.slice(0, data.data.length)

  return (
    <div className='idx-card'>
      <div className='idx-px-24 idx-py-16'>
        <div className='idx-card-header'>
          <h3 className='idx-card-title idx-card-title-with-icon'>
            <Brain size={20} aria-hidden />
            <span>AI Rekomendasi Saham</span>
          </h3>
          <div className='idx-trend-stats'>
            <span className='idx-p-muted'>
              Mode: <strong>{modeLabels[mode]}</strong>
            </span>
            <span className='idx-p-muted'>Total: {data.totalCount}</span>
          </div>
        </div>

        <div className='idx-trend-filter-row' style={{ marginTop: 12 }}>
          <span className='idx-p-muted'>Pilih Mode:</span>
          {(['technical', 'fundamental', 'combined'] as const).map((m) => (
            <button
              key={m}
              type='button'
              className={`idx-btn${mode === m ? ' idx-btn-active' : ''}`}
              onClick={() => onModeChange(m)}
            >
              {modeLabels[m]}
            </button>
          ))}
          <span className='idx-sepa-divider' style={{ marginLeft: 'auto' }} />
          <button
            type='button'
            className='idx-btn idx-btn-sm idx-btn-icon'
            title='Salin prompt & buka Claude.ai untuk membuat narasi'
            disabled={filtered.length === 0}
            onClick={handleCopyPrompt}
            style={copied ? { color: 'var(--idx-up)' } : undefined}
          >
            <Sparkles size={14} aria-hidden />
            <span>{copied ? 'Tersalin! Paste di Claude' : 'Narasi di Claude'}</span>
          </button>
          <button
            type='button'
            className='idx-btn idx-btn-sm idx-btn-icon'
            title='Export PDF'
            disabled={filtered.length === 0}
            onClick={() => data && Utils.exportAiReportPdf(data, mode)}
          >
            <FileDown size={14} aria-hidden />
            <span>PDF</span>
          </button>
          <button
            type='button'
            className='idx-btn idx-btn-sm'
            onClick={onRefetch}
          >
            Refresh
          </button>
        </div>

        <div
          style={{
            marginTop: 8,
            padding: 8,
            background: 'var(--idx-bg-second)',
            borderRadius: 4,
            fontSize: 'var(--idx-text-xs)',
            color: 'var(--idx-text-muted)'
          }}
        >
          <strong>Filter Gorengan:</strong>{' '}
          AKTIF (tidak dapat dinonaktifkan) — Menghilangkan saham notation "X", UMA flag, market cap
          rendah, float ratio kecil, volume anomali.
        </div>
      </div>

      {data.claudeNarrative && (
        <div style={{ margin: '0 24px', marginTop: 12 }}>
          <div
            style={{
              background:
                'linear-gradient(135deg, var(--idx-bg-second) 0%, var(--idx-bg-muted) 100%)',
              border: '1px solid var(--idx-border)',
              borderRadius: 6,
              padding: 12,
              cursor: 'pointer'
            }}
            onClick={() => setNarrativeExpanded((v) => !v)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={16} style={{ color: 'var(--idx-accent)' }} />
              <strong style={{ fontSize: 'var(--idx-text-sm)' }}>Narasi AI oleh Claude</strong>
              <span style={{ marginLeft: 'auto' }}>
                {narrativeExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </span>
            </div>
            {narrativeExpanded && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 'var(--idx-text-sm)',
                  lineHeight: 1.5,
                  color: 'var(--idx-text)',
                  whiteSpace: 'pre-wrap'
                }}
              >
                {data.claudeNarrative}
              </div>
            )}
            <p
              style={{
                marginTop: narrativeExpanded ? 8 : 0,
                fontSize: 'var(--idx-text-xs)',
                color: 'var(--idx-text-muted)'
              }}
            >
              Dihasilkan oleh Claude AI • Bukan rekomendasi investasi
            </p>
          </div>
        </div>
      )}

      {filtered.length === 0
        ? (
          <div className='idx-px-24 idx-py-16'>
            <p className='idx-p-muted'>
              Tidak ada saham yang memenuhi kriteria {modeLabels[mode].toLowerCase()}.
            </p>
          </div>
        )
        : (
          <div className='idx-table-wrap' style={{ marginTop: 12 }}>
            <table className='idx-table'>
              <thead>
                <tr>
                  <th>Emiten</th>
                  <th className='idx-table-th-right'>Skor {modeLabels[mode]}</th>
                  <th className='idx-table-th-right'>Teknikal</th>
                  <th className='idx-table-th-right'>Fund</th>
                  <th className='idx-table-th-right'>SEPA</th>
                  <th className='idx-table-th-right'>Stage</th>
                  <th className='idx-table-th-right'>RS</th>
                  <th className='idx-table-th-right'>EPS %</th>
                  <th className='idx-table-th-right'>ROE</th>
                  <th className='idx-table-th-right'>DER</th>
                  <th className='idx-table-th-right'>Sinyal</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => <AiRecRow key={row.code} row={row} />)}
              </tbody>
            </table>
          </div>
        )}

      <div className='idx-px-24 idx-py-12 idx-p-muted idx-text-xs'>
        <strong>Skor Teknikal:</strong>{' '}
        SEPA (50%) + Stage (20%) + RS Line NH (10%) + Pocket Pivot (10%) + Pattern (6%) + Setup (4%)
        |
        <strong>Skor Fundamental:</strong>{' '}
        EPS Growth (25%) + EPS Accel (10%) + Streak (5%) + ROE (20%) + NPM (15%) + DER (10%) + Rev
        Growth (10%) + PER (5%) |
        <strong>Kombinasi:</strong>{' '}
        60% Teknikal + 40% Fundamental. Klik baris untuk lihat daftar sinyal lengkap.
      </div>
    </div>
  )
}
