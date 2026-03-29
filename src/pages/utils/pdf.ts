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
  if (v == null || !Number.isFinite(v)) {
    return '-'
  }
  return v.toFixed(d)
}

export function fmtPct(v: number | null | undefined, d = 1): string {
  if (v == null || !Number.isFinite(v)) {
    return '-'
  }
  return `${v >= 0 ? '+' : ''}${v.toFixed(d)}%`
}

export function fmtDate(dateInt: number): string {
  const s = String(dateInt)
  if (s.length !== 8) {
    return s
  }
  return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`
}

export function colorForPct(v: number | null): [number, number, number] {
  if (v == null) {
    return PDF_COLORS.muted
  }
  if (v >= 0) {
    return PDF_COLORS.up
  }
  return PDF_COLORS.down
}

export function colorForSignal(signal: string): [number, number, number] {
  if (signal === 'accumulation') {
    return PDF_COLORS.up
  }
  if (signal === 'distribution') {
    return PDF_COLORS.down
  }
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

export interface MiniLineSeries {
  values: (number | null)[]
  color: [number, number, number]
  dashed?: boolean
}

export interface MiniRefLine {
  value: number
  color: [number, number, number]
  label?: string
}

export function drawMiniLineChart(
  doc: jsPDF,
  title: string,
  series: MiniLineSeries[],
  refLines: MiniRefLine[],
  x: number,
  y: number,
  w: number,
  h: number,
  yDomain?: [number, number]
): number {
  const TITLE_H = 5
  const PAD_L = 6, PAD_R = 2, PAD_T = 2, PAD_B = 2
  const cx = x + PAD_L
  const cy = y + TITLE_H + PAD_T
  const cw = w - PAD_L - PAD_R
  const ch = h - TITLE_H - PAD_T - PAD_B
  const cBottom = cy + ch

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...PDF_COLORS.text)
  doc.text(title, x, y + 3.5)

  doc.setFillColor(...PDF_COLORS.bgLight)
  doc.rect(cx, cy, cw, ch, 'F')

  let yMin: number
  let yMax: number
  if (yDomain != null) {
    yMin = yDomain[0]
    yMax = yDomain[1]
  } else {
    const allVals: number[] = []
    for (const s of series) {
      for (const v of s.values) {
        if (v != null) {
          allVals.push(v)
        }
      }
    }
    for (const rl of refLines) {
      allVals.push(rl.value)
    }
    if (allVals.length === 0) {
      doc.setDrawColor(...PDF_COLORS.border)
      doc.setLineWidth(0.3)
      doc.rect(cx, cy, cw, ch)
      return y + h + 3
    }
    yMin = Math.min(...allVals)
    yMax = Math.max(...allVals)
    const rng = (yMax - yMin) || 1
    yMin -= rng * 0.08
    yMax += rng * 0.08
  }

  const scaleY = (v: number): number => cBottom - ((v - yMin) / (yMax - yMin)) * ch

  for (const rl of refLines) {
    const ry = scaleY(rl.value)
    if (ry < cy - 0.5 || ry > cBottom + 0.5) {
      continue
    }
    doc.setDrawColor(...rl.color)
    doc.setLineDashPattern([1.5, 1], 0)
    doc.setLineWidth(0.2)
    doc.line(cx, ry, cx + cw, ry)
    if (rl.label != null) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(5)
      doc.setTextColor(...rl.color)
      doc.text(rl.label, x + 0.5, ry + 1.5)
    }
  }
  doc.setLineDashPattern([], 0)

  for (const s of series) {
    const n = s.values.length
    if (n === 0) {
      continue
    }
    doc.setDrawColor(...s.color)
    doc.setLineWidth(0.5)
    if (s.dashed === true) {
      doc.setLineDashPattern([1.5, 1], 0)
    } else {
      doc.setLineDashPattern([], 0)
    }
    let prevPx: number | null = null
    let prevPy: number | null = null
    for (let i = 0; i < n; i++) {
      const v = s.values[i]
      if (v == null) {
        prevPx = null
        prevPy = null
        continue
      }
      const px = cx + i * (cw / Math.max(n - 1, 1))
      const py = Math.max(cy, Math.min(cBottom, scaleY(v)))
      if (prevPx != null && prevPy != null) {
        doc.line(prevPx, prevPy, px, py)
      }
      prevPx = px
      prevPy = py
    }
    doc.setLineDashPattern([], 0)
  }

  doc.setDrawColor(...PDF_COLORS.border)
  doc.setLineWidth(0.3)
  doc.rect(cx, cy, cw, ch)

  return y + h + 3
}

export function drawMacdChart(
  doc: jsPDF,
  histValues: (number | null)[],
  macdLine: (number | null)[],
  signalLine: (number | null)[],
  x: number,
  y: number,
  w: number,
  h: number
): number {
  const TITLE_H = 5
  const PAD_L = 6, PAD_R = 2, PAD_T = 2, PAD_B = 2
  const cx = x + PAD_L
  const cy = y + TITLE_H + PAD_T
  const cw = w - PAD_L - PAD_R
  const ch = h - TITLE_H - PAD_T - PAD_B
  const cBottom = cy + ch

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...PDF_COLORS.text)
  doc.text('MACD (12,26,9)', x, y + 3.5)

  const allVals: number[] = []
  for (const v of [...histValues, ...macdLine, ...signalLine]) {
    if (v != null) {
      allVals.push(v)
    }
  }

  doc.setFillColor(...PDF_COLORS.bgLight)
  doc.rect(cx, cy, cw, ch, 'F')

  if (allVals.length === 0) {
    doc.setDrawColor(...PDF_COLORS.border)
    doc.setLineWidth(0.3)
    doc.rect(cx, cy, cw, ch)
    return y + h + 3
  }

  const rawMax = Math.max(...allVals)
  const rawMin = Math.min(...allVals)
  const rng = (rawMax - rawMin) || 1
  const yMax = rawMax + rng * 0.1
  const yMin = rawMin - rng * 0.1

  const scaleY = (v: number): number => cBottom - ((v - yMin) / (yMax - yMin)) * ch

  const n = histValues.length
  const xStep = n > 1 ? cw / (n - 1) : 0
  const zeroY = Math.max(cy, Math.min(cBottom, scaleY(0)))

  doc.setDrawColor(...PDF_COLORS.muted)
  doc.setLineDashPattern([1.5, 1], 0)
  doc.setLineWidth(0.2)
  doc.line(cx, zeroY, cx + cw, zeroY)
  doc.setLineDashPattern([], 0)

  const barW = Math.max(0.3, xStep * 0.5)
  for (let i = 0; i < n; i++) {
    const v = histValues[i]
    if (v == null) {
      continue
    }
    const px = cx + i * xStep
    const vy = Math.max(cy, Math.min(cBottom, scaleY(v)))
    const rectTop = Math.min(zeroY, vy)
    const rectH = Math.abs(vy - zeroY)
    if (rectH < 0.05) {
      continue
    }
    if (v >= 0) {
      doc.setFillColor(...PDF_COLORS.up)
    } else {
      doc.setFillColor(...PDF_COLORS.down)
    }
    doc.rect(px - barW / 2, rectTop, barW, rectH, 'F')
  }

  doc.setDrawColor(...PDF_COLORS.primary)
  doc.setLineWidth(0.5)
  let prevPx: number | null = null
  let prevPy: number | null = null
  for (let i = 0; i < macdLine.length; i++) {
    const v = macdLine[i]
    if (v == null) {
      prevPx = null
      prevPy = null
      continue
    }
    const px = cx + i * (cw / Math.max(macdLine.length - 1, 1))
    const py = Math.max(cy, Math.min(cBottom, scaleY(v)))
    if (prevPx != null && prevPy != null) {
      doc.line(prevPx, prevPy, px, py)
    }
    prevPx = px
    prevPy = py
  }

  doc.setDrawColor(...PDF_COLORS.accent)
  prevPx = null
  prevPy = null
  for (let i = 0; i < signalLine.length; i++) {
    const v = signalLine[i]
    if (v == null) {
      prevPx = null
      prevPy = null
      continue
    }
    const px = cx + i * (cw / Math.max(signalLine.length - 1, 1))
    const py = Math.max(cy, Math.min(cBottom, scaleY(v)))
    if (prevPx != null && prevPy != null) {
      doc.line(prevPx, prevPy, px, py)
    }
    prevPx = px
    prevPy = py
  }

  doc.setFillColor(...PDF_COLORS.up)
  doc.rect(cx + 2, cy + 1.5, 2, 1.5, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5)
  doc.setTextColor(...PDF_COLORS.muted)
  doc.text('Hist', cx + 5, cy + 2.8)
  doc.setFillColor(...PDF_COLORS.primary)
  doc.rect(cx + 14, cy + 1.5, 2, 1.5, 'F')
  doc.text('MACD', cx + 17, cy + 2.8)
  doc.setFillColor(...PDF_COLORS.accent)
  doc.rect(cx + 30, cy + 1.5, 2, 1.5, 'F')
  doc.text('Signal', cx + 33, cy + 2.8)

  doc.setDrawColor(...PDF_COLORS.border)
  doc.setLineWidth(0.3)
  doc.rect(cx, cy, cw, ch)

  return y + h + 3
}
