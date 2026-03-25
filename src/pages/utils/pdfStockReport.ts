/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 */

import autoTable from 'jspdf-autotable'
import type * as Types from '@app/pages/Types.ts'
import {
  PDF_COLORS, addFooter, addHeader, addMetricRow, addSectionTitle,
  checkPageBreak, colorForPct, colorForSignal, createDoc, fmtN, fmtPct
} from '@app/pages/utils/pdf.ts'

function calcQEps(
  data: Types.FinancialHistoryRow[],
  year: number,
  quarter: number
): number | null {
  const byKey = new Map<string, Types.FinancialHistoryRow>()
  for (const r of data) byKey.set(`${r.year}_${r.quarter}`, r)
  const row = byKey.get(`${year}_${quarter}`)
  if (!row || row.profitAttrOwner == null || row.eps == null) return null
  let shares: number | null = null
  const q4c = byKey.get(`${year}_4`)
  if (q4c?.profitAttrOwner != null && q4c.eps != null && q4c.eps !== 0) {
    shares = q4c.profitAttrOwner / q4c.eps
  }
  if (shares == null || shares === 0) {
    const q4p = byKey.get(`${year - 1}_4`)
    if (q4p?.profitAttrOwner != null && q4p.eps != null && q4p.eps !== 0) {
      shares = q4p.profitAttrOwner / q4p.eps
    }
  }
  if (shares == null || shares === 0) return null
  const prev = quarter > 1 ? byKey.get(`${year}_${quarter - 1}`) : null
  const prevP = prev?.profitAttrOwner ?? 0
  return (row.profitAttrOwner - prevP) / shares
}

export function exportStockPdf(
  detail: Types.StockDetail,
  volumeData: Types.VolumeAnalysisResponse | null,
  historyData: Types.FinancialHistoryResponse | null
): void {
  const doc = createDoc('p')
  const pw = doc.internal.pageSize.getWidth()
  const today = new Date()
  const dateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`

  let y = addHeader(
    doc,
    `${detail.code} — ${detail.name ?? ''}`,
    `${detail.sector ?? '-'} | ${detail.industry ?? '-'}`,
    dateStr
  )

  // === Valuasi & Profitabilitas ===
  y = addSectionTitle(doc, 'Valuasi', y)
  y = addMetricRow(doc, [
    { label: 'PER', value: fmtN(detail.per, 1) },
    { label: 'PBV', value: fmtN(detail.pbv, 2) },
    { label: 'EPS (Rp)', value: fmtN(detail.eps, 2) },
    { label: 'Book Value', value: fmtN(detail.bookValue, 2) },
    { label: 'Market Cap (M)', value: detail.marketCapital != null ? fmtN(detail.marketCapital / 1e6, 0) : '-' }
  ], 10, y, (pw - 20) / 5)

  y = addSectionTitle(doc, 'Profitabilitas', y)
  y = addMetricRow(doc, [
    { label: 'ROE', value: fmtN(detail.roe, 1) + '%', color: detail.roe != null && detail.roe >= 15 ? PDF_COLORS.up : undefined },
    { label: 'ROA', value: fmtN(detail.roa, 1) + '%' },
    { label: 'NPM', value: fmtN(detail.npm, 1) + '%' },
    { label: 'DER', value: fmtN(detail.der, 2), color: detail.der != null && detail.der > 2 ? PDF_COLORS.down : undefined }
  ], 10, y, (pw - 20) / 5)

  // === Performa Harga ===
  y = addSectionTitle(doc, 'Performa Harga', y)
  y = addMetricRow(doc, [
    { label: '1 Bulan', value: fmtPct(detail.week4PC), color: colorForPct(detail.week4PC ?? null) },
    { label: '3 Bulan', value: fmtPct(detail.week13PC), color: colorForPct(detail.week13PC ?? null) },
    { label: '6 Bulan', value: fmtPct(detail.week26PC), color: colorForPct(detail.week26PC ?? null) },
    { label: '12 Bulan', value: fmtPct(detail.week52PC), color: colorForPct(detail.week52PC ?? null) }
  ], 10, y, (pw - 20) / 5)

  // === Skor Komposit ===
  y = addSectionTitle(doc, 'Skor Komposit', y)
  y = addMetricRow(doc, [
    { label: 'Value', value: fmtN(detail.valueScore, 0), color: PDF_COLORS.primary },
    { label: 'Quality', value: fmtN(detail.qualityScore, 0), color: PDF_COLORS.primary },
    { label: 'Momentum', value: fmtN(detail.momentumScore, 0), color: PDF_COLORS.primary },
    { label: 'Composite', value: fmtN(detail.compositeScore, 0), color: PDF_COLORS.up },
    { label: 'Rank', value: `#${detail.rank}`, color: PDF_COLORS.accent }
  ], 10, y, (pw - 20) / 5)

  // === Volume Analysis ===
  if (volumeData) {
    y = checkPageBreak(doc, y, 40)
    y = addSectionTitle(doc, 'Volume Analysis', y)
    const signalColor = colorForSignal(volumeData.signal)
    const signalText = volumeData.signal === 'accumulation' ? 'AKUMULASI'
      : volumeData.signal === 'distribution' ? 'DISTRIBUSI' : 'NETRAL'

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...signalColor)
    doc.text(`Sinyal: ${signalText}`, 10, y)
    if (volumeData.vcp.isVcp) {
      doc.setTextColor(...PDF_COLORS.purple)
      doc.text(`  |  VCP Terdeteksi (${volumeData.vcp.contractions} kontraksi${volumeData.vcp.volumeDrying ? ', vol menyusut' : ''})`, 45, y)
    }
    y += 8

    y = addMetricRow(doc, [
      {
        label: 'CMF(20)',
        value: volumeData.cmfCurrent != null ? `${volumeData.cmfCurrent >= 0 ? '+' : ''}${fmtN(volumeData.cmfCurrent, 3)}` : '-',
        color: volumeData.cmfCurrent != null ? colorForPct(volumeData.cmfCurrent) : undefined
      },
      {
        label: 'MFI(14)',
        value: fmtN(volumeData.mfiCurrent, 1),
        color: volumeData.mfiCurrent != null && volumeData.mfiCurrent >= 70 ? PDF_COLORS.down
          : volumeData.mfiCurrent != null && volumeData.mfiCurrent <= 30 ? PDF_COLORS.up : undefined
      },
      {
        label: 'OBV Tren',
        value: volumeData.obvTrend === 'up' ? 'Naik' : volumeData.obvTrend === 'down' ? 'Turun' : 'Flat',
        color: volumeData.obvTrend === 'up' ? PDF_COLORS.up : volumeData.obvTrend === 'down' ? PDF_COLORS.down : undefined
      },
      {
        label: 'Vol Surge 5d',
        value: fmtPct(volumeData.volSurgePct),
        color: colorForPct(volumeData.volSurgePct ?? null)
      }
    ], 10, y, (pw - 20) / 5)
  }

  // === EPS Historis ===
  if (historyData && historyData.data.length > 0) {
    y = checkPageBreak(doc, y, 50)
    y = addSectionTitle(doc, 'EPS Historis per Kuartal (Rp/saham)', y)
    const years = [2025, 2024, 2023, 2022]
    const head = [['Tahun', 'Q1', 'Q2', 'Q3', 'Q4']]
    const body = years.map((yr) => {
      return [
        String(yr),
        ...([1, 2, 3, 4] as const).map((q) => {
          const v = calcQEps(historyData.data, yr, q)
          return v != null ? fmtN(v, 2) : '-'
        })
      ]
    })
    autoTable(doc, {
      startY: y,
      head,
      body,
      margin: { left: 10, right: 10 },
      headStyles: { fillColor: PDF_COLORS.headerBg, textColor: 255, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: PDF_COLORS.text },
      alternateRowStyles: { fillColor: PDF_COLORS.bgLight },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 20 },
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' }
      }
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
  }

  // === Flags ===
  y = checkPageBreak(doc, y, 20)
  if (detail.hasNotation || detail.hasCorpAction || detail.hasUma) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...PDF_COLORS.down)
    const flags = [
      detail.hasNotation ? 'Notasi Khusus' : null,
      detail.hasCorpAction ? 'Corp Action' : null,
      detail.hasUma ? 'UMA' : null
    ].filter(Boolean).join(' | ')
    doc.text(`Perhatian: ${flags}`, 10, y)
    y += 6
  }

  addFooter(doc)
  doc.save(`IDX-SEPA_${detail.code}_${dateStr.replace(/\//g, '-')}.pdf`)
}
