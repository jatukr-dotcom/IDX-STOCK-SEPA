/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 */

import autoTable from 'jspdf-autotable'
import type * as Types from '@app/pages/Types.ts'
import {
  addFooter,
  addHeader,
  addSectionTitle,
  createDoc,
  fmtN,
  PDF_COLORS
} from '@app/pages/utils/pdf.ts'

export function exportVcpPdf(
  data: Types.VolumeScreenerResponse,
  signalFilter: 'all' | 'accumulation' | 'distribution' | 'vcp',
  rows: Types.VolumeScreenerRow[]
): void {
  const doc = createDoc('l') // landscape
  const pw = doc.internal.pageSize.getWidth()
  const today = new Date()
  const dateStr = `${String(today.getDate()).padStart(2, '0')}/${
    String(today.getMonth() + 1).padStart(2, '0')
  }/${today.getFullYear()}`

  const filterLabel = signalFilter === 'vcp'
    ? 'VCP Only'
    : signalFilter === 'accumulation'
    ? 'Akumulasi'
    : signalFilter === 'distribution'
    ? 'Distribusi'
    : 'Semua Sinyal'

  let y = addHeader(
    doc,
    'Laporan Volume Akumulasi/Distribusi',
    `Tanggal: ${dateStr}  |  Filter: ${filterLabel}  |  Ditampilkan: ${rows.length} dari ${data.totalCount} saham`,
    dateStr
  )

  // Summary stats
  const vcpCount = rows.filter((r) => r.vcp.isVcp).length
  const accumCount = rows.filter((r) => r.signal === 'accumulation').length
  const distCount = rows.filter((r) => r.signal === 'distribution').length

  y = addSectionTitle(doc, 'Ringkasan', y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...PDF_COLORS.text)
  doc.text(
    `VCP: ${vcpCount}   |   Akumulasi: ${accumCount}   |   Distribusi: ${distCount}   |   Netral: ${
      rows.length - accumCount - distCount
    }`,
    10,
    y
  )
  y += 10

  const head = [[
    'Kode',
    'Nama',
    'Sektor',
    'Harga',
    'Sinyal',
    'VCP',
    'CMF(20)',
    'MFI(14)',
    'OBV\nTren',
    'Foreign\n%',
    'Vol\nSurge%',
    'Kriteria'
  ]]

  const body = rows.map((r) => [
    r.code,
    r.name ? (r.name.length > 22 ? r.name.slice(0, 22) + '.' : r.name) : '-',
    r.sector ? (r.sector.length > 18 ? r.sector.slice(0, 18) + '.' : r.sector) : '-',
    fmtN(r.close, 0),
    r.signal === 'accumulation'
      ? 'AKUMULASI'
      : r.signal === 'distribution'
      ? 'DISTRIBUSI'
      : 'NETRAL',
    r.vcp.isVcp ? `Ya (${r.vcp.contractions}x)` : 'Tidak',
    r.cmf != null ? `${r.cmf >= 0 ? '+' : ''}${fmtN(r.cmf, 3)}` : '-',
    r.mfi != null ? fmtN(r.mfi, 1) : '-',
    r.obvTrend === 'up' ? 'Naik' : r.obvTrend === 'down' ? 'Turun' : 'Flat',
    r.foreignNetPct != null
      ? `${r.foreignNetPct >= 0 ? '+' : ''}${fmtN(r.foreignNetPct, 1)}%`
      : '-',
    r.volSurgePct != null ? `${r.volSurgePct >= 0 ? '+' : ''}${fmtN(r.volSurgePct, 1)}%` : '-',
    `${r.criteriaCount}/5`
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
      3: { halign: 'right', cellWidth: 18 },
      4: { halign: 'center', cellWidth: 22 },
      5: { halign: 'center', cellWidth: 18 },
      6: { halign: 'right', cellWidth: 18 },
      7: { halign: 'right', cellWidth: 14 },
      8: { halign: 'center', cellWidth: 14 },
      9: { halign: 'right', cellWidth: 16 },
      10: { halign: 'right', cellWidth: 16 },
      11: { halign: 'center', cellWidth: 14 }
    },
    didParseCell: (data) => {
      if (data.section === 'body') {
        const col = data.column.index
        const val = data.cell.raw as string
        if (col === 4) {
          if (val === 'AKUMULASI') {
            data.cell.styles.textColor = PDF_COLORS.up
          } else if (val === 'DISTRIBUSI') {
            data.cell.styles.textColor = PDF_COLORS.down
          } else {
            data.cell.styles.textColor = PDF_COLORS.muted
          }
        }
        if (col === 5 && val.startsWith('Ya')) {
          data.cell.styles.textColor = PDF_COLORS.purple
          data.cell.styles.fontStyle = 'bold'
        }
        if (col === 6 && val !== '-') {
          data.cell.styles.textColor = val.startsWith('+') ? PDF_COLORS.up : PDF_COLORS.down
        }
        if (col === 8) {
          if (val === 'Naik') {
            data.cell.styles.textColor = PDF_COLORS.up
          } else if (val === 'Turun') {
            data.cell.styles.textColor = PDF_COLORS.down
          }
        }
        if (col === 9 && val !== '-') {
          data.cell.styles.textColor = val.startsWith('+') ? PDF_COLORS.up : PDF_COLORS.down
        }
      }
    }
  })

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  if (finalY + 12 < doc.internal.pageSize.getHeight() - 18) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...PDF_COLORS.muted)
    doc.text(
      'CMF: Chaikin Money Flow (20)  |  MFI: Money Flow Index (14)  |  OBV: On-Balance Volume  |  VCP: Volatility Contraction Pattern',
      10,
      finalY + 8
    )
  }

  addFooter(doc)
  doc.save(`IDX-Volume_${filterLabel.replace(/\s/g, '_')}_${dateStr.replace(/\//g, '-')}.pdf`)
}
