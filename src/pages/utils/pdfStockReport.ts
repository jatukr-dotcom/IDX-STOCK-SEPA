/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 */

import autoTable from 'jspdf-autotable'
import type * as Types from '@app/pages/Types.ts'
import {
  addFooter,
  addHeader,
  addMetricRow,
  addSectionTitle,
  checkPageBreak,
  colorForPct,
  colorForSignal,
  createDoc,
  fmtDate,
  fmtN,
  fmtPct,
  PDF_COLORS
} from '@app/pages/utils/pdf.ts'

function calcQEps(
  data: Types.FinancialHistoryRow[],
  year: number,
  quarter: number
): number | null {
  const byKey = new Map<string, Types.FinancialHistoryRow>()
  for (const r of data) {
    byKey.set(`${r.year}_${r.quarter}`, r)
  }
  const row = byKey.get(`${year}_${quarter}`)
  if (!row || row.profitAttrOwner == null || row.eps == null) {
    return null
  }
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
  if (shares == null || shares === 0) {
    return null
  }
  const prev = quarter > 1 ? byKey.get(`${year}_${quarter - 1}`) : null
  const prevP = prev?.profitAttrOwner ?? 0
  return (row.profitAttrOwner - prevP) / shares
}

export function exportStockPdf(
  detail: Types.StockDetail,
  volumeData: Types.VolumeAnalysisResponse | null,
  historyData: Types.FinancialHistoryResponse | null,
  advancedData: Types.TechnicalAnalysisApiResponse | null = null
): void {
  const doc = createDoc('p')
  const pw = doc.internal.pageSize.getWidth()
  const today = new Date()
  const dateStr = `${String(today.getDate()).padStart(2, '0')}/${
    String(today.getMonth() + 1).padStart(2, '0')
  }/${today.getFullYear()}`

  let y = addHeader(
    doc,
    `${detail.code} — ${detail.name ?? ''}`,
    `${detail.sector ?? '-'} | ${detail.industry ?? '-'}`,
    dateStr
  )

  // === Valuasi & Profitabilitas ===
  y = addSectionTitle(doc, 'Valuasi', y)
  y = addMetricRow(
    doc,
    [
      { label: 'PER', value: fmtN(detail.per, 1) },
      { label: 'PBV', value: fmtN(detail.pbv, 2) },
      { label: 'EPS (Rp)', value: fmtN(detail.eps, 2) },
      { label: 'Book Value', value: fmtN(detail.bookValue, 2) },
      {
        label: 'Market Cap (M)',
        value: detail.marketCapital != null ? fmtN(detail.marketCapital / 1e6, 0) : '-'
      }
    ],
    10,
    y,
    (pw - 20) / 5
  )

  y = addSectionTitle(doc, 'Profitabilitas', y)
  y = addMetricRow(
    doc,
    [
      {
        label: 'ROE',
        value: fmtN(detail.roe, 1) + '%',
        color: detail.roe != null && detail.roe >= 15 ? PDF_COLORS.up : undefined
      },
      { label: 'ROA', value: fmtN(detail.roa, 1) + '%' },
      { label: 'NPM', value: fmtN(detail.npm, 1) + '%' },
      {
        label: 'DER',
        value: fmtN(detail.der, 2),
        color: detail.der != null && detail.der > 2 ? PDF_COLORS.down : undefined
      }
    ],
    10,
    y,
    (pw - 20) / 5
  )

  // === Performa Harga ===
  y = addSectionTitle(doc, 'Performa Harga', y)
  y = addMetricRow(
    doc,
    [
      {
        label: '1 Bulan',
        value: fmtPct(detail.week4PC),
        color: colorForPct(detail.week4PC ?? null)
      },
      {
        label: '3 Bulan',
        value: fmtPct(detail.week13PC),
        color: colorForPct(detail.week13PC ?? null)
      },
      {
        label: '6 Bulan',
        value: fmtPct(detail.week26PC),
        color: colorForPct(detail.week26PC ?? null)
      },
      {
        label: '12 Bulan',
        value: fmtPct(detail.week52PC),
        color: colorForPct(detail.week52PC ?? null)
      }
    ],
    10,
    y,
    (pw - 20) / 5
  )

  // === Skor Komposit ===
  y = addSectionTitle(doc, 'Skor Komposit', y)
  y = addMetricRow(
    doc,
    [
      { label: 'Value', value: fmtN(detail.valueScore, 0), color: PDF_COLORS.primary },
      { label: 'Quality', value: fmtN(detail.qualityScore, 0), color: PDF_COLORS.primary },
      { label: 'Momentum', value: fmtN(detail.momentumScore, 0), color: PDF_COLORS.primary },
      { label: 'Composite', value: fmtN(detail.compositeScore, 0), color: PDF_COLORS.up },
      { label: 'Rank', value: `#${detail.rank}`, color: PDF_COLORS.accent }
    ],
    10,
    y,
    (pw - 20) / 5
  )

  // === Volume Analysis ===
  if (volumeData) {
    y = checkPageBreak(doc, y, 40)
    y = addSectionTitle(doc, 'Volume Analysis', y)
    const signalColor = colorForSignal(volumeData.signal)
    const signalText = volumeData.signal === 'accumulation'
      ? 'AKUMULASI'
      : volumeData.signal === 'distribution'
      ? 'DISTRIBUSI'
      : 'NETRAL'

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...signalColor)
    doc.text(`Sinyal: ${signalText}`, 10, y)
    if (volumeData.vcp.isVcp) {
      doc.setTextColor(...PDF_COLORS.purple)
      doc.text(
        `  |  VCP Terdeteksi (${volumeData.vcp.contractions} kontraksi${
          volumeData.vcp.volumeDrying ? ', vol menyusut' : ''
        })`,
        45,
        y
      )
    }
    y += 8

    y = addMetricRow(
      doc,
      [
        {
          label: 'CMF(20)',
          value: volumeData.cmfCurrent != null
            ? `${volumeData.cmfCurrent >= 0 ? '+' : ''}${fmtN(volumeData.cmfCurrent, 3)}`
            : '-',
          color: volumeData.cmfCurrent != null ? colorForPct(volumeData.cmfCurrent) : undefined
        },
        {
          label: 'MFI(14)',
          value: fmtN(volumeData.mfiCurrent, 1),
          color: volumeData.mfiCurrent != null && volumeData.mfiCurrent >= 70
            ? PDF_COLORS.down
            : volumeData.mfiCurrent != null && volumeData.mfiCurrent <= 30
            ? PDF_COLORS.up
            : undefined
        },
        {
          label: 'OBV Tren',
          value: volumeData.obvTrend === 'up'
            ? 'Naik'
            : volumeData.obvTrend === 'down'
            ? 'Turun'
            : 'Flat',
          color: volumeData.obvTrend === 'up'
            ? PDF_COLORS.up
            : volumeData.obvTrend === 'down'
            ? PDF_COLORS.down
            : undefined
        },
        {
          label: 'Vol Surge 5d',
          value: fmtPct(volumeData.volSurgePct),
          color: colorForPct(volumeData.volSurgePct ?? null)
        }
      ],
      10,
      y,
      (pw - 20) / 5
    )
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
      headStyles: {
        fillColor: PDF_COLORS.headerBg,
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 8
      },
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

  // === Advanced Technical Indicators ===
  if (advancedData) {
    // — MACD Summary —
    const lastMacd = advancedData.macd.length > 0
      ? advancedData.macd[advancedData.macd.length - 1]!
      : null
    const lastStoch = advancedData.stochRsi.length > 0
      ? advancedData.stochRsi[advancedData.stochRsi.length - 1]!
      : null

    if (lastMacd || lastStoch) {
      y = checkPageBreak(doc, y, 40)
      y = addSectionTitle(doc, 'Indikator Teknikal Lanjutan', y)
      const macdMetrics = []
      if (lastMacd) {
        const histVal = lastMacd.histogram
        macdMetrics.push({
          label: 'MACD Line',
          value: fmtN(lastMacd.macdLine, 3),
          color: lastMacd.macdLine != null && lastMacd.macdLine >= 0 ? PDF_COLORS.up : PDF_COLORS.down
        })
        macdMetrics.push({
          label: 'Signal',
          value: fmtN(lastMacd.signalLine, 3)
        })
        macdMetrics.push({
          label: 'Histogram',
          value: histVal != null ? (histVal >= 0 ? '+' : '') + fmtN(histVal, 3) : '-',
          color: histVal != null ? (histVal >= 0 ? PDF_COLORS.up : PDF_COLORS.down) : undefined
        })
      }
      if (lastStoch) {
        macdMetrics.push({
          label: 'StochRSI %K',
          value: fmtN(lastStoch.k, 1),
          color: lastStoch.k != null && lastStoch.k >= 80
            ? PDF_COLORS.down
            : lastStoch.k != null && lastStoch.k <= 20
            ? PDF_COLORS.up
            : undefined
        })
        macdMetrics.push({
          label: 'StochRSI %D',
          value: fmtN(lastStoch.d, 1)
        })
      }
      if (macdMetrics.length > 0) {
        y = addMetricRow(doc, macdMetrics, 10, y, (pw - 20) / 5)
      }
    }

    // — Support & Resistance —
    const srLevels = advancedData.supportResistance.levels
    if (srLevels.length > 0) {
      y = checkPageBreak(doc, y, 50)
      y = addSectionTitle(doc, `Support & Resistance  (Harga saat ini: ${fmtN(advancedData.supportResistance.currentClose, 0)})`, y)
      const srHead = [['Tipe', 'Harga', '% dari Close', 'Kekuatan', 'Terakhir Disentuh']]
      const srBody = srLevels.map((lvl) => {
        const pct = ((lvl.price - advancedData.supportResistance.currentClose) /
          advancedData.supportResistance.currentClose * 100)
        const strengthLabel = lvl.strength === 'strong' ? 'Kuat' : lvl.strength === 'moderate' ? 'Sedang' : 'Lemah'
        return [
          lvl.type === 'resistance' ? 'Resistance' : 'Support',
          fmtN(lvl.price, 0),
          (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%',
          strengthLabel,
          fmtDate(lvl.lastTouchDate)
        ]
      })
      autoTable(doc, {
        startY: y,
        head: srHead,
        body: srBody,
        margin: { left: 10, right: 10 },
        headStyles: { fillColor: PDF_COLORS.headerBg, textColor: 255, fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 8, textColor: PDF_COLORS.text },
        alternateRowStyles: { fillColor: PDF_COLORS.bgLight },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 0) {
            data.cell.styles.textColor = data.cell.raw === 'Resistance'
              ? PDF_COLORS.down
              : PDF_COLORS.up
            data.cell.styles.fontStyle = 'bold'
          }
        },
        columnStyles: {
          0: { cellWidth: 28 },
          1: { halign: 'right', cellWidth: 22 },
          2: { halign: 'right', cellWidth: 28 },
          3: { cellWidth: 22 },
          4: { halign: 'right' }
        }
      })
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
    }

    // — Fibonacci Retracement —
    if (advancedData.fibonacci) {
      const fib = advancedData.fibonacci
      y = checkPageBreak(doc, y, 50)
      y = addSectionTitle(
        doc,
        `Fibonacci Retracement (${fib.trend === 'up' ? 'Uptrend ▲' : 'Downtrend ▼'})`,
        y
      )
      const fibHead = [['Level', 'Harga', '', 'Level', 'Harga']]
      const fibLevels = fib.levels
      const fibBody: string[][] = []
      for (let fi = 0; fi < Math.ceil(fibLevels.length / 2); fi++) {
        const left = fibLevels[fi]
        const right = fibLevels[fi + Math.ceil(fibLevels.length / 2)]
        fibBody.push([
          left?.label ?? '',
          left ? fmtN(left.price, 0) : '',
          '',
          right?.label ?? '',
          right ? fmtN(right.price, 0) : ''
        ])
      }
      autoTable(doc, {
        startY: y,
        head: fibHead,
        body: fibBody,
        margin: { left: 10, right: 10 },
        headStyles: { fillColor: PDF_COLORS.headerBg, textColor: 255, fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 8, textColor: PDF_COLORS.text },
        alternateRowStyles: { fillColor: PDF_COLORS.bgLight },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { halign: 'right', cellWidth: 25 },
          2: { cellWidth: 10 },
          3: { cellWidth: 25 },
          4: { halign: 'right', cellWidth: 25 }
        }
      })
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
    }

    // — Divergences —
    if (advancedData.divergences.length > 0) {
      y = checkPageBreak(doc, y, 30)
      y = addSectionTitle(doc, 'Divergensi Terdeteksi', y)
      for (const div of advancedData.divergences) {
        y = checkPageBreak(doc, y, 8)
        const indicator = div.indicator === 'rsi' ? 'RSI' : 'StochRSI'
        const label = div.type === 'bullish' ? 'Bullish' : 'Bearish'
        const color = div.type === 'bullish' ? PDF_COLORS.up : PDF_COLORS.down
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.setTextColor(...color)
        doc.text(`• ${label} Divergence (${indicator}):`, 10, y)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...PDF_COLORS.text)
        doc.text(
          `${fmtDate(div.startDate)} → ${fmtDate(div.endDate)}  |  Harga: ${fmtN(div.priceStart, 0)} → ${fmtN(div.priceEnd, 0)}  |  ${indicator}: ${fmtN(div.indicatorStart, 1)} → ${fmtN(div.indicatorEnd, 1)}`,
          55,
          y
        )
        y += 6
      }
    }
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
