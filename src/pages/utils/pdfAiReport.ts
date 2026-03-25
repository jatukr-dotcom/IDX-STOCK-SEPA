/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * PDF export for AI Recommendation results
 */

import type * as Types from '@app/pages/Types.ts'
import { addFooter, addHeader, createDoc, fmtDate, fmtN, PDF_COLORS } from '@app/pages/utils/pdf.ts'
import autoTable from 'jspdf-autotable'

function nowDateStr(): string {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${
    String(d.getMonth() + 1).padStart(2, '0')
  }/${d.getFullYear()}`
}

function getModeLabel(mode: Types.AiRecommendationMode): string {
  return mode === 'technical'
    ? 'Analisis Teknikal'
    : mode === 'fundamental'
    ? 'Analisis Fundamental'
    : 'Kombinasi'
}

function getScoreForMode(row: Types.AiRecommendationRow, mode: Types.AiRecommendationMode): number {
  if (mode === 'technical') {
    return row.techScore
  }
  if (mode === 'fundamental') {
    return row.fundScore
  }
  return row.combinedScore
}

export function exportAiReportPdf(
  data: Types.AiRecommendationResponse | null,
  mode: Types.AiRecommendationMode
): void {
  const rows = data?.data ?? []
  const doc = createDoc('l')
  const dateStr = nowDateStr()
  const modeLabel = getModeLabel(mode)

  addHeader(
    doc,
    'AI Rekomendasi Saham',
    `${modeLabel} · ${rows.length} kandidat · Per ${fmtDate(data?.date ?? 0)}`,
    dateStr
  )

  const tableBody = rows.map((r) => [
    r.code,
    r.name ?? '',
    r.sector ?? '',
    fmtN(getScoreForMode(r, mode), 1),
    fmtN(r.sepaScore, 1),
    `S${r.stage}`,
    String(r.rsRank),
    r.epsGrowthPct != null ? `${r.epsGrowthPct >= 0 ? '+' : ''}${fmtN(r.epsGrowthPct, 1)}%` : '—',
    r.roe != null ? `${fmtN(r.roe, 1)}%` : '—',
    r.der != null ? fmtN(r.der, 2) : '—',
    r.reasons[0] ?? '—'
  ])

  autoTable(doc, {
    startY: 46,
    head: [[
      'Kode',
      'Nama',
      'Sektor',
      `Skor ${modeLabel}`,
      'SEPA',
      'Stage',
      'RS',
      'EPS %',
      'ROE',
      'DER',
      'Sinyal Utama'
    ]],
    body: tableBody,
    styles: { fontSize: 7, cellPadding: 2.5 },
    headStyles: {
      fillColor: PDF_COLORS.headerBg as [number, number, number],
      textColor: PDF_COLORS.white as [number, number, number],
      fontStyle: 'bold',
      fontSize: 8
    },
    alternateRowStyles: { fillColor: PDF_COLORS.bgLight as [number, number, number] },
    didParseCell: (hookData) => {
      if (hookData.section !== 'body') {
        return
      }
      if (hookData.column.index === 5) {
        // Stage column
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
      if (hookData.column.index === 7) {
        // EPS % column
        const val = parseFloat(String(hookData.cell.raw ?? '0'))
        if (val > 0) {
          hookData.cell.styles.textColor = PDF_COLORS.up
        } else if (val < 0) {
          hookData.cell.styles.textColor = PDF_COLORS.down
        }
      }
    },
    margin: { left: 10, right: 10 }
  })

  const finalY = (doc as any).lastAutoTable.finalY || 200

  // Add Claude narrative if present
  if (data?.claudeNarrative) {
    // Check if we need a new page
    if (finalY > 200) {
      doc.addPage()
      doc.setFontSize(12)
      doc.setTextColor(0, 0, 0)
      doc.text('Narasi Pasar oleh Claude AI', 10, 20)
      doc.setFontSize(10)
      doc.setTextColor(60, 60, 60)

      // Split text into lines and add to page with word wrapping
      const lines = doc.splitTextToSize(data.claudeNarrative, 190)
      doc.text(lines, 10, 30)

      // Add disclaimer
      doc.setFontSize(8)
      doc.setTextColor(128, 128, 128)
      doc.text(
        'Disclaimer: Narasi dihasilkan oleh AI dan bukan merupakan rekomendasi investasi. Gunakan hanya sebagai referensi analisis.',
        10,
        doc.internal.pageSize.height - 20
      )
    }
  }

  addFooter(doc)
  doc.save(`ai-rekomendasi-${mode}-${data?.date ?? 'latest'}.pdf`)
}
