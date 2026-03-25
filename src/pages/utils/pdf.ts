/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 */

import jsPDF from 'jspdf'

export const PDF_COLORS = {
  up: [34, 197, 94] as [number, number, number],
  down: [239, 68, 68] as [number, number, number],
  accent: [245, 158, 11] as [number, number, number],
  primary: [59, 130, 246] as [number, number, number],
  purple: [168, 85, 247] as [number, number, number],
  text: [17, 24, 39] as [number, number, number],
  muted: [107, 114, 128] as [number, number, number],
  border: [229, 231, 235] as [number, number, number],
  bgLight: [249, 250, 251] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  headerBg: [15, 23, 42] as [number, number, number]
}

export function fmtN(v: number | null | undefined, d = 2): string {
  if (v == null || !Number.isFinite(v)) return '-'
  return v.toFixed(d)
}

export function fmtPct(v: number | null | undefined, d = 1): string {
  if (v == null || !Number.isFinite(v)) return '-'
  return `${v >= 0 ? '+' : ''}${v.toFixed(d)}%`
}

export function fmtDate(dateInt: number): string {
  const s = String(dateInt)
  if (s.length !== 8) return s
  return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`
}

export function colorForPct(v: number | null): [number, number, number] {
  if (v == null) return PDF_COLORS.muted
  if (v >= 0) return PDF_COLORS.up
  return PDF_COLORS.down
}

export function colorForSignal(signal: string): [number, number, number] {
  if (signal === 'accumulation') return PDF_COLORS.up
  if (signal === 'distribution') return PDF_COLORS.down
  return PDF_COLORS.muted
}

export function createDoc(orientation: 'p' | 'l' = 'p'): jsPDF {
  return new jsPDF({ orientation, unit: 'mm', format: 'a4' })
}

export function addHeader(
  doc: jsPDF,
  title: string,
  subtitle: string,
  dateStr: string
): number {
  const pw = doc.internal.pageSize.getWidth()
  // Dark header bar
  doc.setFillColor(...PDF_COLORS.headerBg)
  doc.rect(0, 0, pw, 18, 'F')
  // App name
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...PDF_COLORS.white)
  doc.text('IDX-STOCK-SEPA', 10, 11)
  // Date right aligned
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...PDF_COLORS.muted)
  doc.text(dateStr, pw - 10, 11, { align: 'right' })
  // Title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...PDF_COLORS.text)
  doc.text(title, 10, 30)
  // Subtitle
  if (subtitle) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...PDF_COLORS.muted)
    doc.text(subtitle, 10, 37)
  }
  // Divider
  doc.setDrawColor(...PDF_COLORS.border)
  doc.line(10, 41, pw - 10, 41)
  return 46
}

export function addFooter(doc: jsPDF): void {
  const totalPages = doc.getNumberOfPages()
  const pw = doc.internal.pageSize.getWidth()
  const ph = doc.internal.pageSize.getHeight()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setDrawColor(...PDF_COLORS.border)
    doc.line(10, ph - 12, pw - 10, ph - 12)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...PDF_COLORS.muted)
    doc.text('IDX-STOCK-SEPA — Data bersumber dari IDX. Bukan rekomendasi jual/beli.', 10, ph - 7)
    doc.text(`Halaman ${i} / ${totalPages}`, pw - 10, ph - 7, { align: 'right' })
  }
}

export function addSectionTitle(doc: jsPDF, title: string, y: number): number {
  const pw = doc.internal.pageSize.getWidth()
  doc.setFillColor(...PDF_COLORS.bgLight)
  doc.rect(10, y, pw - 20, 7, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...PDF_COLORS.primary)
  doc.text(title.toUpperCase(), 13, y + 4.8)
  return y + 10
}

export function addMetricRow(
  doc: jsPDF,
  items: { label: string; value: string; color?: [number, number, number] }[],
  x: number,
  y: number,
  colWidth: number
): number {
  items.forEach((item, i) => {
    const cx = x + i * colWidth
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...PDF_COLORS.muted)
    doc.text(item.label, cx, y)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...(item.color ?? PDF_COLORS.text))
    doc.text(item.value, cx, y + 5)
  })
  return y + 12
}

export function checkPageBreak(doc: jsPDF, y: number, needed = 20): number {
  const ph = doc.internal.pageSize.getHeight()
  if (y + needed > ph - 20) {
    doc.addPage()
    return 20
  }
  return y
}
