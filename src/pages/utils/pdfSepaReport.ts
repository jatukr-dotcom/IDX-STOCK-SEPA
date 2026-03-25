/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 */

import autoTable from 'jspdf-autotable'
import type * as Types from '@app/pages/Types.ts'
import {
  PDF_COLORS, addFooter, addHeader, addSectionTitle,
  createDoc, fmtN, fmtPct
} from '@app/pages/utils/pdf.ts'

export function exportSepaPdf(
  data: Types.SepaResponse,
  filters: { minTrend: number; minRs: number },
  rows: Types.SepaCandidateRow[]
): void {
  const doc = createDoc('l') // landscape
  const pw = doc.internal.pageSize.getWidth()
  const today = new Date()
  const dateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`

  let y = addHeader(
    doc,
    'Laporan SEPA Candidates',
    `Tanggal: ${dateStr}  |  Total Kandidat: ${rows.length}  |  Filter: Trend >= ${filters.minTrend}/8, RS >= ${filters.minRs}`,
    dateStr
  )

  // Sector summary
  const sectorCount: Record<string, number> = {}
  for (const r of rows) {
    const s = r.sector ?? 'Lainnya'
    sectorCount[s] = (sectorCount[s] ?? 0) + 1
  }
  const fullSepa = rows.filter((r) => r.trendCriteriaCount === 8).length
  const withAccel = rows.filter((r) => r.epsAcceleration).length

  y = addSectionTitle(doc, 'Ringkasan', y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...PDF_COLORS.text)
  doc.text(`SEPA Penuh (8/8): ${fullSepa}   |   EPS Akselerasi: ${withAccel}   |   Total Ditampilkan: ${rows.length}`, 10, y)
  y += 6

  // Sector distribution
  const sectorStr = Object.entries(sectorCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([s, n]) => `${s}: ${n}`)
    .join('  |  ')
  doc.setTextColor(...PDF_COLORS.muted)
  doc.text(`Sektor: ${sectorStr}`, 10, y)
  y += 10

  // Main table
  const head = [[
    'Kode', 'Nama', 'Sektor', 'SEPA\nScore', 'Trend\n(dari 8)', 'RS\nRank',
    'EPS YoY', 'Aksel', 'Q+', 'ROE', 'PER', 'Ret 3m', '% High\n52w'
  ]]
  const body = rows.map((r) => [
    r.code,
    r.name ? (r.name.length > 22 ? r.name.slice(0, 22) + '.' : r.name) : '-',
    r.sector ? (r.sector.length > 18 ? r.sector.slice(0, 18) + '.' : r.sector) : '-',
    fmtN(r.sepaScore, 1),
    `${r.trendCriteriaCount}/8`,
    String(r.rsRank),
    r.epsGrowthPct != null ? `${r.epsGrowthPct >= 0 ? '+' : ''}${fmtN(r.epsGrowthPct, 1)}%` : '-',
    r.epsAcceleration ? 'Ya' : 'Tidak',
    `${r.epsConsecutiveGrowth}Q`,
    r.roe != null ? `${fmtN(r.roe, 1)}%` : '-',
    r.per != null ? fmtN(r.per, 1) : '-',
    fmtPct(r.return3m),
    r.pctFrom52wHigh != null ? `${fmtN(r.pctFrom52wHigh, 1)}%` : '-'
  ])

  autoTable(doc, {
    startY: y,
    head,
    body,
    margin: { left: 10, right: 10 },
    headStyles: {
      fillColor: PDF_COLORS.headerBg,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 7,
      halign: 'center'
    },
    bodyStyles: { fontSize: 7, textColor: PDF_COLORS.text },
    alternateRowStyles: { fillColor: PDF_COLORS.bgLight },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 14 },
      1: { cellWidth: 38 },
      2: { cellWidth: 32 },
      3: { halign: 'right', cellWidth: 14 },
      4: { halign: 'center', cellWidth: 14 },
      5: { halign: 'center', cellWidth: 12 },
      6: { halign: 'right', cellWidth: 16 },
      7: { halign: 'center', cellWidth: 12 },
      8: { halign: 'center', cellWidth: 10 },
      9: { halign: 'right', cellWidth: 14 },
      10: { halign: 'right', cellWidth: 12 },
      11: { halign: 'right', cellWidth: 16 },
      12: { halign: 'right', cellWidth: 16 }
    },
    didParseCell: (data) => {
      if (data.section === 'body') {
        const col = data.column.index
        const val = data.cell.raw as string
        // Color SEPA score
        if (col === 3) {
          const n = parseFloat(val)
          if (n >= 75) data.cell.styles.textColor = PDF_COLORS.up
          else if (n >= 55) data.cell.styles.textColor = PDF_COLORS.accent
        }
        // Color EPS YoY
        if (col === 6 && val !== '-') {
          data.cell.styles.textColor = val.startsWith('+') ? PDF_COLORS.up : PDF_COLORS.down
        }
        // Acceleration
        if (col === 7) {
          data.cell.styles.textColor = val === 'Ya' ? PDF_COLORS.up : PDF_COLORS.muted
        }
        // Return 3m
        if (col === 11 && val !== '-') {
          data.cell.styles.textColor = val.startsWith('+') ? PDF_COLORS.up : PDF_COLORS.down
        }
        // Trend criteria
        if (col === 4) {
          data.cell.styles.textColor = val === '8/8' ? PDF_COLORS.up : PDF_COLORS.primary
        }
        // RS Rank
        if (col === 5) {
          const n = parseInt(val)
          if (n >= 90) data.cell.styles.textColor = PDF_COLORS.up
          else if (n >= 70) data.cell.styles.textColor = PDF_COLORS.primary
        }
      }
    }
  })

  // Footer note
  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  if (finalY + 12 < doc.internal.pageSize.getHeight() - 18) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...PDF_COLORS.muted)
    doc.text(
      'SEPA Score = 40% Trend Template + 30% RS Rank + 15% EPS Growth + 15% Fundamental (ROE+NPM)',
      10,
      finalY + 8
    )
  }

  addFooter(doc)
  doc.save(`IDX-SEPA_Candidates_${dateStr.replace(/\//g, '-')}.pdf`)
}
