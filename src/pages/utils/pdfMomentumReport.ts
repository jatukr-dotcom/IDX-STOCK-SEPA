/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * PDF export for Momentum Masters features: Stage Analysis, Pocket Pivot, RS Line, Base Patterns, Power Play
 */

import type * as Types from '@app/pages/Types.ts'
import {
  addFooter,
  addHeader,
  addSectionTitle as _addSectionTitle,
  createDoc,
  fmtDate,
  fmtN,
  fmtPct,
  PDF_COLORS
} from '@app/pages/utils/pdf.ts'
import autoTableFn from 'jspdf-autotable'
import type { CellHookData } from 'jspdf-autotable'
// deno-lint-ignore no-explicit-any
const autoTable = autoTableFn as unknown as (doc: any, options: any) => void

function nowDateStr(): string {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${
    String(d.getMonth() + 1).padStart(2, '0')
  }/${d.getFullYear()}`
}

// ─── Stage Analysis ─────────────────────────────────────────────────────────

export function exportStagePdf(
  data: Types.StageAnalysisResponse | null,
  stageFilter: Types.StageNumber | 0
): void {
  const rows = data?.data ?? []
  const doc = createDoc('l')
  const dateStr = nowDateStr()
  const filterLabel = stageFilter === 0 ? 'Semua Stage' : `Stage ${stageFilter}`

  addHeader(
    doc,
    'Stage Analysis — Minervini',
    `${filterLabel} · ${rows.length} saham · Per ${fmtDate(data?.date ?? 0)}`,
    dateStr
  )

  autoTable(doc, {
    startY: 46,
    head: [[
      'Kode',
      'Nama',
      'Sektor',
      'Stage',
      'Harga',
      'MA50',
      'MA150',
      'MA200',
      'MA200 Slope',
      'RS Rank',
      'Trend✓',
      '% 52w High'
    ]],
    body: rows.map((r) => [
      r.code,
      r.name ?? '',
      r.sector ?? '',
      `S${r.stage}`,
      fmtN(r.price, 0),
      fmtN(r.ma50, 0),
      fmtN(r.ma150, 0),
      fmtN(r.ma200, 0),
      r.ma200SlopePct != null
        ? `${r.ma200SlopePct > 0 ? '+' : ''}${fmtN(r.ma200SlopePct, 2)}%`
        : '—',
      String(r.rsRank ?? '—'),
      `${r.trendCriteriaCount}/8`,
      r.pctFrom52wHigh != null ? `${fmtN(r.pctFrom52wHigh, 1)}%` : '—'
    ]),
    styles: { fontSize: 7.5, cellPadding: 3 },
    headStyles: {
      fillColor: PDF_COLORS.headerBg as [number, number, number],
      textColor: PDF_COLORS.white as [number, number, number],
      fontStyle: 'bold',
      fontSize: 8
    },
    alternateRowStyles: { fillColor: PDF_COLORS.bgLight as [number, number, number] },
    didParseCell: (hookData: CellHookData) => {
      if (hookData.section !== 'body') {
        return
      }
      if (hookData.column.index === 3) {
        const stage = Number(String(hookData.cell.raw ?? '').replace('S', ''))
        hookData.cell.styles.textColor = stage === 2
          ? PDF_COLORS.up
          : stage === 3
          ? PDF_COLORS.accent
          : stage === 4
          ? PDF_COLORS.down
          : PDF_COLORS.primary
        hookData.cell.styles.fontStyle = 'bold'
      }
    },
    margin: { left: 10, right: 10 }
  })

  addFooter(doc)
  doc.save(`stage-analysis-${data?.date ?? 'latest'}.pdf`)
}

// ─── Pocket Pivot ────────────────────────────────────────────────────────────

export function exportPocketPivotPdf(
  data: Types.PocketPivotResponse | null,
  lookback: number
): void {
  const rows = data?.data ?? []
  const doc = createDoc('l')
  const dateStr = nowDateStr()

  addHeader(
    doc,
    'Pocket Pivot — David Ryan',
    `Lookback ${lookback} hari · ${rows.length} sinyal · Per ${fmtDate(data?.date ?? 0)}`,
    dateStr
  )

  autoTable(doc, {
    startY: 46,
    head: [[
      'Kode',
      'Nama',
      'Sektor',
      'Stage',
      'Harga',
      'Tgl Pivot',
      'Vol Pivot',
      'Max Down Vol',
      '% di MA10',
      'RS Rank',
      'Trend✓'
    ]],
    body: rows.map((r) => {
      const ds = String(r.pivotDate)
      const pivotDateStr = ds.length === 8
        ? `${ds.slice(6, 8)}/${ds.slice(4, 6)}/${ds.slice(0, 4)}`
        : ds
      return [
        r.code,
        r.name ?? '',
        r.sector ?? '',
        `S${r.stage}`,
        fmtN(r.price, 0),
        pivotDateStr,
        fmtN(r.pivotVolume, 0),
        fmtN(r.maxDownVol10d, 0),
        r.pctAboveMa10 != null ? `+${fmtN(r.pctAboveMa10, 2)}%` : '—',
        String(r.rsRank),
        `${r.trendCriteriaCount}/8`
      ]
    }),
    styles: { fontSize: 7.5, cellPadding: 3 },
    headStyles: {
      fillColor: PDF_COLORS.headerBg as [number, number, number],
      textColor: PDF_COLORS.white as [number, number, number],
      fontStyle: 'bold',
      fontSize: 8
    },
    alternateRowStyles: { fillColor: PDF_COLORS.bgLight as [number, number, number] },
    margin: { left: 10, right: 10 }
  })

  addFooter(doc)
  doc.save(`pocket-pivot-${data?.date ?? 'latest'}.pdf`)
}

// ─── RS Line ─────────────────────────────────────────────────────────────────

export function exportRsLinePdf(
  data: Types.RsLineResponse | null,
  onlyNewHigh: boolean
): void {
  const rows = data?.data ?? []
  const doc = createDoc('l')
  const dateStr = nowDateStr()
  const label = onlyNewHigh ? 'New High Only' : 'Semua'

  addHeader(
    doc,
    'RS Line New High',
    `${label} · ${rows.length} saham · Per ${fmtDate(data?.date ?? 0)}`,
    dateStr
  )

  autoTable(doc, {
    startY: 46,
    head: [[
      'Kode',
      'Nama',
      'Sektor',
      'New High',
      'RS Line',
      '% dari 52w High RS',
      'Harga',
      '% 52w High Harga',
      'RS Rank',
      'Trend✓'
    ]],
    body: rows.map((r) => [
      r.code,
      r.name ?? '',
      r.sector ?? '',
      r.rsLineNewHigh ? '★ YES' : '—',
      r.rsLineValue != null ? fmtN(r.rsLineValue, 1) : '—',
      r.rsLinePctFrom52wHigh != null ? fmtPct(r.rsLinePctFrom52wHigh, 2) : '—',
      fmtN(r.price, 0),
      r.pctFrom52wHigh != null ? fmtPct(r.pctFrom52wHigh, 1) : '—',
      String(r.rsRank ?? '—'),
      `${r.trendCriteriaCount}/8`
    ]),
    styles: { fontSize: 7.5, cellPadding: 3 },
    headStyles: {
      fillColor: PDF_COLORS.headerBg as [number, number, number],
      textColor: PDF_COLORS.white as [number, number, number],
      fontStyle: 'bold',
      fontSize: 8
    },
    alternateRowStyles: { fillColor: PDF_COLORS.bgLight as [number, number, number] },
    didParseCell: (hookData: CellHookData) => {
      if (hookData.section !== 'body') {
        return
      }
      if (hookData.column.index === 3 && hookData.cell.raw === '★ YES') {
        hookData.cell.styles.textColor = PDF_COLORS.up
        hookData.cell.styles.fontStyle = 'bold'
      }
    },
    margin: { left: 10, right: 10 }
  })

  addFooter(doc)
  doc.save(`rs-line-${data?.date ?? 'latest'}.pdf`)
}

// ─── Base Patterns ────────────────────────────────────────────────────────────

export function exportBasePatternsPdf(
  data: Types.BasePatternsResponse | null,
  filter: string
): void {
  const rows = data?.data ?? []
  const doc = createDoc('l')
  const dateStr = nowDateStr()

  addHeader(
    doc,
    'Base Pattern Detection',
    `Filter: ${filter} · ${rows.length} pola · Per ${fmtDate(data?.date ?? 0)}`,
    dateStr
  )

  autoTable(doc, {
    startY: 46,
    head: [[
      'Kode',
      'Nama',
      'Sektor',
      'Pola',
      'Base Count',
      'Depth %',
      'Length (hari)',
      'Harga',
      '% 52w High',
      'RS Rank',
      'Trend✓'
    ]],
    body: rows.map((r) => [
      r.code,
      r.name ?? '',
      r.sector ?? '',
      r.patternType === 'htf'
        ? 'High Tight Flag'
        : r.patternType === 'cup-handle'
        ? 'Cup & Handle'
        : 'Flat Base',
      `${r.baseCount}${
        r.baseCount <= 1 ? ' (1st)' : r.baseCount === 2 ? ' (2nd)' : ` (${r.baseCount}th)`
      }`,
      r.baseDepthPct != null ? fmtPct(r.baseDepthPct, 1) : '—',
      String(r.baseLengthDays ?? '—'),
      fmtN(r.price, 0),
      r.pctFrom52wHigh != null ? fmtPct(r.pctFrom52wHigh, 1) : '—',
      String(r.rsRank ?? '—'),
      `${r.trendCriteriaCount}/8`
    ]),
    styles: { fontSize: 7.5, cellPadding: 3 },
    headStyles: {
      fillColor: PDF_COLORS.headerBg as [number, number, number],
      textColor: PDF_COLORS.white as [number, number, number],
      fontStyle: 'bold',
      fontSize: 8
    },
    alternateRowStyles: { fillColor: PDF_COLORS.bgLight as [number, number, number] },
    didParseCell: (hookData: CellHookData) => {
      if (hookData.section !== 'body') {
        return
      }
      if (hookData.column.index === 4) {
        const bc = parseInt(String(hookData.cell.raw ?? '0'))
        hookData.cell.styles.textColor = bc <= 1
          ? PDF_COLORS.up
          : bc === 2
          ? PDF_COLORS.accent
          : PDF_COLORS.down
        hookData.cell.styles.fontStyle = 'bold'
      }
    },
    margin: { left: 10, right: 10 }
  })

  addFooter(doc)
  doc.save(`base-patterns-${data?.date ?? 'latest'}.pdf`)
}

// ─── Power Play ───────────────────────────────────────────────────────────────

export function exportPowerPlayPdf(
  data: Types.PowerPlayResponse | null,
  filter: string
): void {
  const rows = data?.data ?? []
  const doc = createDoc('l')
  const dateStr = nowDateStr()

  addHeader(
    doc,
    'Power Play / Low Cheat — Minervini',
    `Filter: ${filter} · ${rows.length} setup · Per ${fmtDate(data?.date ?? 0)}`,
    dateStr
  )

  autoTable(doc, {
    startY: 46,
    head: [[
      'Kode',
      'Nama',
      'Sektor',
      'Setup',
      'Stage',
      'Harga',
      'Range %',
      'Hari',
      'Vol Dry-up %',
      '% 52w High',
      'RS Rank',
      'Trend✓',
      'Breakout'
    ]],
    body: rows.map((r) => [
      r.code,
      r.name ?? '',
      r.sector ?? '',
      r.setupType === 'power-play' ? 'Power Play' : 'Low Cheat',
      `S${r.stage}`,
      fmtN(r.price, 0),
      r.tightRangePct != null ? fmtPct(r.tightRangePct, 2) : '—',
      String(r.consolidationDays),
      r.volumeDryUpPct != null ? fmtPct(r.volumeDryUpPct, 1) : '—',
      r.pctFrom52wHigh != null ? fmtPct(r.pctFrom52wHigh, 1) : '—',
      String(r.rsRank ?? '—'),
      `${r.trendCriteriaCount}/8`,
      r.nearBreakout ? 'YES' : '—'
    ]),
    styles: { fontSize: 7, cellPadding: 3 },
    headStyles: {
      fillColor: PDF_COLORS.headerBg as [number, number, number],
      textColor: PDF_COLORS.white as [number, number, number],
      fontStyle: 'bold',
      fontSize: 8
    },
    alternateRowStyles: { fillColor: PDF_COLORS.bgLight as [number, number, number] },
    didParseCell: (hookData: CellHookData) => {
      if (hookData.section !== 'body') {
        return
      }
      if (hookData.column.index === 3) {
        hookData.cell.styles.textColor = hookData.cell.raw === 'Power Play'
          ? PDF_COLORS.accent
          : PDF_COLORS.purple
        hookData.cell.styles.fontStyle = 'bold'
      }
      if (hookData.column.index === 12 && hookData.cell.raw === 'YES') {
        hookData.cell.styles.textColor = PDF_COLORS.up
        hookData.cell.styles.fontStyle = 'bold'
      }
    },
    margin: { left: 10, right: 10 }
  })

  addFooter(doc)
  doc.save(`power-play-${data?.date ?? 'latest'}.pdf`)
}
