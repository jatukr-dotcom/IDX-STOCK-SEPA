/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  BarChart2,
  BookOpen,
  FileDown,
  LineChart as LineChartIcon,
  TrendingUp,
  X,
  Zap
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import * as Hooks from '@app/pages/hooks/index.ts'
import * as Utils from '@app/pages/utils/index.ts'
import type * as Types from '@app/pages/Types.ts'

const foreignPeriodOptions: Types.ForeignPeriodOption[] = [
  { days: 30, label: '1 bln' },
  { days: 60, label: '2 bln' },
  { days: 90, label: '3 bln' },
  { days: 180, label: '6 bln' },
  { days: 360, label: '1 tahun' }
]

function buildRsiChartData(rsiData: Types.RsiResponse | null): {
  chartData: Types.RsiChartPoint[]
  hasSector: boolean
} {
  if (!rsiData?.data?.length) {
    return { chartData: [], hasSector: false }
  }
  const byDate = new Map<string, Types.RsiChartPoint>()
  for (const row of rsiData.data) {
    const dateStr = Utils.Format.formatDateInt(row.date)
    byDate.set(dateStr, {
      date: dateStr,
      rsi: row.rsi ?? 0,
      sectorRsi: null
    })
  }
  if (rsiData.sectorData?.length) {
    for (const row of rsiData.sectorData) {
      const dateStr = Utils.Format.formatDateInt(row.date)
      const existing = byDate.get(dateStr)
      const sectorVal = row.rsi != null && Number.isFinite(row.rsi) ? row.rsi : null
      if (existing) {
        existing.sectorRsi = sectorVal
      } else {
        byDate.set(dateStr, { date: dateStr, rsi: 0, sectorRsi: sectorVal })
      }
    }
  }
  const chartData = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date, 'en'))
  const hasSector = chartData.some((d) => d.sectorRsi != null)
  return { chartData, hasSector }
}

function calcQuarterlyEps(
  data: Types.FinancialHistoryRow[],
  year: number,
  quarter: number
): number | null {
  const byKey = new Map<string, Types.FinancialHistoryRow>()
  for (const row of data) {
    byKey.set(`${row.year}_${row.quarter}`, row)
  }
  const row = byKey.get(`${year}_${quarter}`)
  if (!row || row.profitAttrOwner == null || row.eps == null) {
    return null
  }
  // Shares = profitAttrOwner_Q4 / eps_Q4 (year-end basis only, NOT weighted-avg from interim quarters)
  // Try current year Q4 first, then previous year Q4
  let shares: number | null = null
  const q4Current = byKey.get(`${year}_4`)
  if (q4Current?.profitAttrOwner != null && q4Current.eps != null && q4Current.eps !== 0) {
    shares = q4Current.profitAttrOwner / q4Current.eps
  }
  if (shares == null || shares === 0) {
    const q4Prev = byKey.get(`${year - 1}_4`)
    if (q4Prev?.profitAttrOwner != null && q4Prev.eps != null && q4Prev.eps !== 0) {
      shares = q4Prev.profitAttrOwner / q4Prev.eps
    }
  }
  if (shares == null || shares === 0) {
    return null
  }
  const prevRow = quarter > 1 ? byKey.get(`${year}_${quarter - 1}`) : null
  const prevProfit = prevRow?.profitAttrOwner ?? 0
  return (row.profitAttrOwner - prevProfit) / shares
}

function EpsHistoryTable({ data }: { data: Types.FinancialHistoryRow[] }) {
  const years = [2025, 2024, 2023, 2022]
  const quarters = [1, 2, 3, 4]
  return (
    <div className='idx-table-wrap'>
      <table className='idx-table'>
        <thead>
          <tr>
            <th>Tahun</th>
            <th className='idx-table-th-right'>Q1</th>
            <th className='idx-table-th-right'>Q2</th>
            <th className='idx-table-th-right'>Q3</th>
            <th className='idx-table-th-right'>Q4</th>
          </tr>
        </thead>
        <tbody>
          {years.map((year) => (
            <tr key={year}>
              <td>
                <strong>{year}</strong>
              </td>
              {quarters.map((q) => {
                const eps = calcQuarterlyEps(data, year, q)
                return (
                  <td key={q} className='idx-table-td-right'>
                    {eps != null
                      ? (
                        <span
                          style={{
                            color: eps >= 0 ? 'var(--idx-up)' : 'var(--idx-down)',
                            fontWeight: 600
                          }}
                        >
                          {Utils.Format.formatNum(eps, 2)}
                        </span>
                      )
                      : <span className='idx-p-muted'>-</span>}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function StockDetailModal({
  detail,
  loading,
  error,
  onClose
}: Types.StockDetailModalProps) {
  const [activeTab, setActiveTab] = useState<Types.DetailTab>('fundamental')
  const { data: volumeData, loading: volumeLoading } = Hooks.useVolumeAnalysis(
    detail?.code ?? null,
    3
  )
  const [foreignPeriodDays, setForeignPeriodDays] = useState<Types.ForeignPeriodDays>(90)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previousActiveRef = useRef<HTMLElement | null>(null)
  const {
    data: rsiData,
    loading: rsiLoading,
    error: rsiError
  } = Hooks.useRSI(detail?.code ?? null, foreignPeriodDays)
  const {
    data: ohlcData,
    loading: ohlcLoading,
    error: ohlcError
  } = Hooks.useOHLC(detail?.code ?? null, foreignPeriodDays)
  const {
    data: foreignData,
    loading: foreignLoading,
    error: foreignError
  } = Hooks.useForeign(detail?.code ?? null, foreignPeriodDays)
  const {
    data: technicalData,
    loading: technicalLoading
  } = Hooks.useStockTechnical(detail?.code ?? null)
  const { data: financialHistoryData, loading: financialHistoryLoading } = Hooks
    .useFinancialHistory(detail?.code ?? null)
  const {
    data: advancedData,
    loading: advancedLoading
  } = Hooks.useAdvancedTechnical(detail?.code ?? null, foreignPeriodDays)
  const chartData = detail?.ohlc?.map((ohlcRow: Types.StockDetailOhlcRow) => ({
    date: Utils.Format.formatDateInt(ohlcRow.date),
    close: ohlcRow.close ?? 0
  })) ?? []
  const yDomain = useMemo((): [number, number] | undefined => {
    if (chartData.length === 0) {
      return undefined
    }
    const closes = chartData
      .map((chartPoint: Types.PriceLinePoint) => chartPoint.close)
      .filter((closePrice: number) => closePrice > 0)
    if (closes.length === 0) {
      return undefined
    }
    const minClose = Math.min(...closes)
    const maxClose = Math.max(...closes)
    return [Math.max(minClose, 1), maxClose]
  }, [chartData])

  const rsiChartData = useMemo(() => buildRsiChartData(rsiData ?? null), [rsiData])

  useEffect(() => {
    if (!detail) {
      return
    }
    previousActiveRef.current = document.activeElement as HTMLElement | null
    closeButtonRef.current?.focus()
    return () => {
      previousActiveRef.current?.focus?.()
    }
  }, [detail])

  const handleClose = useCallback(() => {
    previousActiveRef.current?.focus?.()
    onClose()
  }, [onClose])

  return (
    <div className='idx-modal-overlay' onClick={handleClose} role='presentation'>
      <div
        className='idx-modal'
        onClick={(event) => event.stopPropagation()}
        role='dialog'
        aria-modal='true'
      >
        <div className='idx-modal-header'>
          <h2 className='idx-modal-title idx-modal-title-with-icon'>
            <LineChartIcon size={22} aria-hidden />
            <span>{detail ? `${detail.code}: ${detail.name ?? ''}` : 'Detail Saham'}</span>
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {detail && (
              <button
                type='button'
                className='idx-btn idx-btn-sm idx-btn-icon'
                title='Download PDF'
                onClick={() =>
                  Utils.exportStockPdf(detail, volumeData ?? null, financialHistoryData ?? null, advancedData ?? null)}
              >
                <FileDown size={15} aria-hidden />
                <span>PDF</span>
              </button>
            )}
            <button
              ref={closeButtonRef}
              type='button'
              className='idx-modal-close'
              onClick={handleClose}
              aria-label='Tutup Modal'
            >
              <X size={20} aria-hidden />
            </button>
          </div>
        </div>
        <div className='idx-modal-body'>
          {loading && <div className='idx-loading'>Memuat...</div>}
          {error && <div className='idx-error'>{error}</div>}
          {detail && !loading && (
            <>
              <div className='idx-tabs idx-mb-16'>
                <button
                  type='button'
                  className={`idx-tab idx-tab-inline ${
                    activeTab === 'fundamental' ? 'idx-tab-active' : ''
                  }`}
                  onClick={() => setActiveTab('fundamental')}
                >
                  <BarChart2 size={16} aria-hidden />
                  <span>Analisa Fundamental</span>
                </button>
                <button
                  type='button'
                  className={`idx-tab idx-tab-inline ${
                    activeTab === 'technical' ? 'idx-tab-active' : ''
                  }`}
                  onClick={() => setActiveTab('technical')}
                >
                  <TrendingUp size={16} aria-hidden />
                  <span>Analisa Teknikal</span>
                </button>
                <button
                  type='button'
                  className={`idx-tab idx-tab-inline ${
                    activeTab === 'eps' ? 'idx-tab-active' : ''
                  }`}
                  onClick={() => setActiveTab('eps')}
                >
                  <BookOpen size={16} aria-hidden />
                  <span>EPS Historis</span>
                </button>
                <button
                  type='button'
                  className={`idx-tab idx-tab-inline ${
                    activeTab === 'volume' ? 'idx-tab-active' : ''
                  }`}
                  onClick={() => setActiveTab('volume')}
                >
                  <Activity size={16} aria-hidden />
                  <span>Volume A/D</span>
                </button>
                <button
                  type='button'
                  className={`idx-tab idx-tab-inline ${
                    activeTab === 'advanced' ? 'idx-tab-active' : ''
                  }`}
                  onClick={() => setActiveTab('advanced')}
                >
                  <Zap size={16} aria-hidden />
                  <span>Teknikal Lanjutan</span>
                </button>
              </div>
              {activeTab === 'fundamental' && (
                <>
                  <div className='idx-detail-sections'>
                    <section className='idx-detail-section'>
                      <h4 className='idx-detail-section-title'>Klasifikasi</h4>
                      <div className='idx-detail-grid'>
                        <div className='idx-detail-item idx-detail-item-full'>
                          <label>Sektor / Industri</label>
                          <span>{[detail.sector ?? '-', detail.industry ?? '-'].join(' / ')}</span>
                        </div>
                      </div>
                    </section>
                    <section className='idx-detail-section'>
                      <h4 className='idx-detail-section-title'>Valuasi</h4>
                      <div className='idx-detail-grid'>
                        <div className='idx-detail-item'>
                          <label>PER</label>
                          <span>{Utils.Format.formatNum(detail.per, 1)}</span>
                        </div>
                        <div className='idx-detail-item'>
                          <label>PBV</label>
                          <span>{Utils.Format.formatNum(detail.pbv, 1)}</span>
                        </div>
                        <div className='idx-detail-item'>
                          <label>EPS</label>
                          <span>
                            {detail.eps != null ? Utils.Format.formatNum(detail.eps, 0) : '-'}
                          </span>
                        </div>
                        <div className='idx-detail-item'>
                          <label>Book Value</label>
                          <span>
                            {detail.bookValue != null
                              ? Utils.Format.formatNum(detail.bookValue, 0)
                              : '-'}
                          </span>
                        </div>
                        <div className='idx-detail-item'>
                          <label>Harga Saat Ini</label>
                          <span>
                            {detail.currentPrice != null
                              ? `Rp ${Utils.Format.formatNum(detail.currentPrice, 0)}`
                              : '-'}
                          </span>
                        </div>
                        <div className='idx-detail-item'>
                          <label>Market Cap</label>
                          <span>{Utils.Format.formatRp(detail.marketCapital)}</span>
                        </div>
                        <div className='idx-detail-item'>
                          <label>Saham Beredar</label>
                          <span>
                            {detail.listedShares != null
                              ? `${(detail.listedShares / 1e9).toFixed(2)}M`
                              : '-'}
                          </span>
                        </div>
                        <div className='idx-detail-item'>
                          <label>Div. Yield</label>
                          <span>
                            {detail.dividendYield != null
                              ? `${Utils.Format.formatNum(detail.dividendYield, 2)}%`
                              : '-'}
                          </span>
                        </div>
                      </div>
                    </section>
                    <section className='idx-detail-section'>
                      <h4 className='idx-detail-section-title'>Profitabilitas</h4>
                      <div className='idx-detail-grid'>
                        <div className='idx-detail-item'>
                          <label>ROE</label>
                          <span>{Utils.Format.formatNum(detail.roe, 1)}</span>
                        </div>
                        <div className='idx-detail-item'>
                          <label>ROA</label>
                          <span>{Utils.Format.formatNum(detail.roa, 1)}</span>
                        </div>
                      </div>
                    </section>
                    <section className='idx-detail-section'>
                      <h4 className='idx-detail-section-title'>Leverage</h4>
                      <div className='idx-detail-grid'>
                        <div className='idx-detail-item'>
                          <label>DER</label>
                          <span>{Utils.Format.formatNum(detail.der, 1)}</span>
                        </div>
                      </div>
                    </section>
                    <section className='idx-detail-section'>
                      <h4 className='idx-detail-section-title'>Likuiditas</h4>
                      <div className='idx-detail-grid'>
                        <div className='idx-detail-item'>
                          <label>Value</label>
                          <span>{Utils.Format.formatRp(detail.value)}</span>
                        </div>
                        <div className='idx-detail-item'>
                          <label>Volume</label>
                          <span>{Utils.Format.formatNum(detail.volume, 0)}</span>
                        </div>
                      </div>
                    </section>
                    <section className='idx-detail-section'>
                      <h4 className='idx-detail-section-title'>Kondisi Teknikal</h4>
                      <div className='idx-detail-grid'>
                        <div className='idx-detail-item'>
                          <label>Stage</label>
                          <span style={{ fontWeight: 'bold', color: '#f59e0b' }}>
                            {technicalLoading ? '...' : (
                              technicalData?.stage
                                ? `${technicalData.stage.stage} - ${['Akumulasi', 'Markup', 'Distribusi', 'Markdown'][technicalData.stage.stage - 1]}`
                                : '-'
                            )}
                          </span>
                        </div>
                        <div className='idx-detail-item'>
                          <label>Volume Signal</label>
                          <span style={{
                            fontWeight: 'bold',
                            color: technicalData?.volume?.signal === 'accumulation' ? '#10b981'
                              : technicalData?.volume?.signal === 'distribution' ? '#ef4444'
                              : '#6b7280'
                          }}>
                            {technicalLoading ? '...' : (
                              technicalData?.volume?.signal
                                ? technicalData.volume.signal === 'accumulation' ? 'Akumulasi'
                                  : technicalData.volume.signal === 'distribution' ? 'Distribusi'
                                  : 'Netral'
                                : '-'
                            )}
                          </span>
                        </div>
                        <div className='idx-detail-item'>
                          <label>VCP</label>
                          <span style={{ color: technicalData?.volume?.vcp?.isVcp ? '#ef4444' : '#6b7280' }}>
                            {technicalLoading ? '...' : (
                              technicalData?.volume?.vcp?.isVcp ? `Ya (${technicalData.volume.vcp.contractions} kontraksi)` : 'Tidak'
                            )}
                          </span>
                        </div>
                        <div className='idx-detail-item'>
                          <label>Trend Criteria</label>
                          <span>{technicalLoading ? '...' : (technicalData?.stage?.trendCriteriaCount ?? 0)}/7</span>
                        </div>
                        <div className='idx-detail-item idx-detail-item-full'>
                          <label>Support/Resistance</label>
                          <span style={{ fontSize: '0.9em', color: '#6b7280' }}>
                            {technicalLoading ? '...' : (
                              technicalData?.technical?.supportResistance?.levels
                                ? `${technicalData.technical.supportResistance.levels.length} level(s) terdeteksi`
                                : '-'
                            )}
                          </span>
                        </div>
                      </div>
                    </section>
                  </div>
                  <div className='idx-detail-block'>
                    <label className='idx-form-label'>Skor</label>
                    <table className='idx-detail-table'>
                      <thead>
                        <tr>
                          <th>Value</th>
                          <th>Quality</th>
                          <th>Momentum</th>
                          <th>Composite</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>{Utils.Format.formatNum(detail.valueScore, 3)}</td>
                          <td>{Utils.Format.formatNum(detail.qualityScore, 3)}</td>
                          <td>{Utils.Format.formatNum(detail.momentumScore, 3)}</td>
                          <td className='idx-detail-composite-cell'>
                            {Utils.Format.formatNum(detail.compositeScore, 3)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className='idx-detail-block'>
                    <label className='idx-form-label'>Momentum</label>
                    <table className='idx-detail-table'>
                      <thead>
                        <tr>
                          <th>4w</th>
                          <th>13w</th>
                          <th>26w</th>
                          <th>52w</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td
                            className={detail.week4PC != null
                              ? detail.week4PC >= 0 ? 'idx-pct idx-pct-up' : 'idx-pct idx-pct-down'
                              : ''}
                          >
                            {Utils.Format.formatPct(detail.week4PC ?? null)}
                          </td>
                          <td
                            className={detail.week13PC != null
                              ? detail.week13PC >= 0 ? 'idx-pct idx-pct-up' : 'idx-pct idx-pct-down'
                              : ''}
                          >
                            {Utils.Format.formatPct(detail.week13PC ?? null)}
                          </td>
                          <td
                            className={detail.week26PC != null
                              ? detail.week26PC >= 0 ? 'idx-pct idx-pct-up' : 'idx-pct idx-pct-down'
                              : ''}
                          >
                            {Utils.Format.formatPct(detail.week26PC ?? null)}
                          </td>
                          <td
                            className={detail.week52PC != null
                              ? detail.week52PC >= 0 ? 'idx-pct idx-pct-up' : 'idx-pct idx-pct-down'
                              : ''}
                          >
                            {Utils.Format.formatPct(detail.week52PC ?? null)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {chartData.length > 0 && (
                    <>
                      <label className='idx-form-label'>Pergerakan Harga (Close)</label>
                      <div className='idx-chart-container'>
                        <ResponsiveContainer width='100%' height='100%'>
                          <AreaChart data={chartData}>
                            <defs>
                              <linearGradient id='detailChartGrad' x1='0' y1='0' x2='0' y2='1'>
                                <stop
                                  offset='5%'
                                  stopColor='var(--idx-primary)'
                                  stopOpacity={0.2}
                                />
                                <stop offset='95%' stopColor='var(--idx-primary)' stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <XAxis
                              dataKey='date'
                              axisLine={false}
                              tickLine={false}
                              tick={{ fill: 'var(--idx-text-muted)', fontSize: 10 }}
                            />
                            <YAxis
                              orientation='right'
                              scale={yDomain ? 'log' : 'linear'}
                              {...(yDomain !== undefined && { domain: yDomain })}
                              axisLine={false}
                              tickLine={false}
                              tick={{ fill: 'var(--idx-text-muted)', fontSize: 10 }}
                            />
                            <Tooltip
                              contentStyle={{
                                background: 'var(--idx-deep)',
                                color: 'white',
                                borderRadius: 12,
                                fontSize: 12
                              }}
                            />
                            <Area
                              type='monotone'
                              dataKey='close'
                              stroke='var(--idx-primary)'
                              strokeWidth={2}
                              fill='url(#detailChartGrad)'
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </>
                  )}
                </>
              )}
              {activeTab === 'eps' && (
                <div>
                  <p className='idx-p-muted idx-mb-8' style={{ fontSize: 'var(--idx-text-sm)' }}>
                    EPS per saham (Rp) — Q1=Mar, Q2=Jun, Q3=Sep, Q4=Des
                  </p>
                  {financialHistoryLoading && <div className='idx-loading'>Memuat EPS...</div>}
                  {!financialHistoryLoading && financialHistoryData && (
                    financialHistoryData.data.length > 0
                      ? <EpsHistoryTable data={financialHistoryData.data} />
                      : (
                        <p className='idx-p-muted'>
                          Data EPS historis belum tersedia. Jalankan server untuk mengambil data
                          dari IDX.
                        </p>
                      )
                  )}
                </div>
              )}
              {activeTab === 'volume' && (
                <div>
                  {volumeLoading && (
                    <div className='idx-loading'>Menghitung indikator volume...</div>
                  )}
                  {!volumeLoading && volumeData && (
                    <>
                      <div className='idx-vol-modal-summary'>
                        <div className={`idx-vol-modal-signal idx-vol-signal-${volumeData.signal}`}>
                          {volumeData.signal === 'accumulation'
                            ? 'AKUMULASI'
                            : volumeData.signal === 'distribution'
                            ? 'DISTRIBUSI'
                            : 'NETRAL'}
                        </div>
                        {volumeData.vcp.isVcp && (
                          <div className='idx-vol-modal-vcp'>
                            VCP — {volumeData.vcp.contractions}{' '}
                            kontraksi{volumeData.vcp.volumeDrying ? ', volume menyusut' : ''}
                          </div>
                        )}
                        <div className='idx-vol-modal-metrics'>
                          <div className='idx-vol-modal-metric'>
                            <span className='idx-vol-modal-metric-label'>CMF(20)</span>
                            <span
                              className={`idx-vol-modal-metric-val ${
                                (volumeData.cmfCurrent ?? 0) >= 0
                                  ? 'idx-color-up'
                                  : 'idx-color-down'
                              }`}
                            >
                              {volumeData.cmfCurrent != null
                                ? ((volumeData.cmfCurrent > 0 ? '+' : '') +
                                  Utils.Format.formatNum(volumeData.cmfCurrent, 3))
                                : '—'}
                            </span>
                          </div>
                          <div className='idx-vol-modal-metric'>
                            <span className='idx-vol-modal-metric-label'>MFI(14)</span>
                            <span
                              style={{
                                color: (volumeData.mfiCurrent ?? 50) >= 70
                                  ? 'var(--idx-up)'
                                  : (volumeData.mfiCurrent ?? 50) <= 30
                                  ? 'var(--idx-down)'
                                  : 'var(--idx-accent)',
                                fontWeight: 600
                              }}
                            >
                              {volumeData.mfiCurrent != null
                                ? Utils.Format.formatNum(volumeData.mfiCurrent, 1)
                                : '—'}
                            </span>
                          </div>
                          <div className='idx-vol-modal-metric'>
                            <span className='idx-vol-modal-metric-label'>OBV Tren</span>
                            <span
                              className={volumeData.obvTrend === 'up'
                                ? 'idx-color-up'
                                : volumeData.obvTrend === 'down'
                                ? 'idx-color-down'
                                : ''}
                            >
                              {volumeData.obvTrend === 'up'
                                ? '↑ Naik'
                                : volumeData.obvTrend === 'down'
                                ? '↓ Turun'
                                : '— Flat'}
                            </span>
                          </div>
                          <div className='idx-vol-modal-metric'>
                            <span className='idx-vol-modal-metric-label'>Vol Surge</span>
                            <span
                              className={(volumeData.volSurgePct ?? 0) >= 0
                                ? 'idx-color-up'
                                : 'idx-color-down'}
                            >
                              {volumeData.volSurgePct != null
                                ? ((volumeData.volSurgePct > 0 ? '+' : '') +
                                  Utils.Format.formatNum(volumeData.volSurgePct, 1) + '%')
                                : '—'}
                            </span>
                          </div>
                        </div>
                      </div>
                      {volumeData.series.length > 0 && (
                        <>
                          <div className='idx-detail-block idx-mb-16'>
                            <label className='idx-form-label'>A/D Line & OBV</label>
                            <div className='idx-chart-container'>
                              <ResponsiveContainer width='100%' height='100%'>
                                <LineChart
                                  data={volumeData.series.map((r) => ({
                                    date: Utils.Format.formatDateInt(r.date),
                                    adLine: r.adLine,
                                    obv: r.obv
                                  }))}
                                  margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
                                >
                                  <XAxis
                                    dataKey='date'
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'var(--idx-text-muted)', fontSize: 10 }}
                                  />
                                  <YAxis
                                    orientation='right'
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'var(--idx-text-muted)', fontSize: 10 }}
                                    tickFormatter={(v) => Utils.Format.formatNum(v, 0)}
                                  />
                                  <Tooltip
                                    content={({ active, payload, label }) => {
                                      if (!active || !payload?.length || !label) {
                                        return null
                                      }
                                      return (
                                        <div className='idx-tooltip'>
                                          <div className='idx-tooltip-label'>{label}</div>
                                          {payload.map((p) => (
                                            <div
                                              key={p.dataKey as string}
                                              className='idx-tooltip-row'
                                            >
                                              <span style={{ color: p.color }}>{p.name}</span>
                                              <span>
                                                {Utils.Format.formatNum(p.value as number, 0)}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      )
                                    }}
                                  />
                                  <Line
                                    type='monotone'
                                    dataKey='adLine'
                                    name='A/D Line'
                                    stroke='var(--idx-primary)'
                                    strokeWidth={2}
                                    dot={false}
                                    isAnimationActive={false}
                                  />
                                  <Line
                                    type='monotone'
                                    dataKey='obv'
                                    name='OBV'
                                    stroke='var(--idx-accent)'
                                    strokeWidth={1.5}
                                    strokeDasharray='4 2'
                                    dot={false}
                                    isAnimationActive={false}
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                          <div className='idx-detail-block idx-mb-16'>
                            <label className='idx-form-label'>CMF(20) — Chaikin Money Flow</label>
                            <div className='idx-chart-container'>
                              <ResponsiveContainer width='100%' height='100%'>
                                <BarChart
                                  data={volumeData.series.map((r) => ({
                                    date: Utils.Format.formatDateInt(r.date),
                                    cmf: r.cmf ?? 0
                                  }))}
                                  margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
                                >
                                  <XAxis
                                    dataKey='date'
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'var(--idx-text-muted)', fontSize: 10 }}
                                  />
                                  <YAxis
                                    orientation='right'
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'var(--idx-text-muted)', fontSize: 10 }}
                                    tickFormatter={(v) => Utils.Format.formatNum(v, 2)}
                                  />
                                  <ReferenceLine y={0} stroke='var(--idx-border)' />
                                  <Tooltip
                                    content={({ active, payload, label }) => {
                                      if (!active || !payload?.length || !label) {
                                        return null
                                      }
                                      const val = payload[0]?.value as number
                                      return (
                                        <div className='idx-tooltip'>
                                          <div className='idx-tooltip-label'>{label}</div>
                                          <div className='idx-tooltip-row'>
                                            <span>CMF</span>
                                            <span
                                              style={{
                                                color: val >= 0
                                                  ? 'var(--idx-up)'
                                                  : 'var(--idx-down)'
                                              }}
                                            >
                                              {Utils.Format.formatNum(val, 3)}
                                            </span>
                                          </div>
                                        </div>
                                      )
                                    }}
                                  />
                                  <Bar
                                    dataKey='cmf'
                                    name='CMF'
                                    isAnimationActive={false}
                                    radius={[2, 2, 0, 0]}
                                  >
                                    {volumeData.series.map((r) => (
                                      <Cell
                                        key={r.date}
                                        fill={(r.cmf ?? 0) >= 0
                                          ? 'var(--idx-up)'
                                          : 'var(--idx-down)'}
                                      />
                                    ))}
                                  </Bar>
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                          <div className='idx-detail-block idx-mb-12'>
                            <label className='idx-form-label'>MFI(14) — Money Flow Index</label>
                            <div className='idx-chart-container'>
                              <ResponsiveContainer width='100%' height='100%'>
                                <LineChart
                                  data={volumeData.series.map((r) => ({
                                    date: Utils.Format.formatDateInt(r.date),
                                    mfi: r.mfi ?? null
                                  }))}
                                  margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
                                >
                                  <XAxis
                                    dataKey='date'
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'var(--idx-text-muted)', fontSize: 10 }}
                                  />
                                  <YAxis
                                    orientation='right'
                                    domain={[0, 100]}
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'var(--idx-text-muted)', fontSize: 10 }}
                                  />
                                  <ReferenceLine
                                    y={70}
                                    stroke='var(--idx-down)'
                                    strokeDasharray='3 3'
                                    label={{ value: 'OB', fill: 'var(--idx-down)', fontSize: 10 }}
                                  />
                                  <ReferenceLine
                                    y={30}
                                    stroke='var(--idx-up)'
                                    strokeDasharray='3 3'
                                    label={{ value: 'OS', fill: 'var(--idx-up)', fontSize: 10 }}
                                  />
                                  <Tooltip
                                    content={({ active, payload, label }) => {
                                      if (!active || !payload?.length || !label) {
                                        return null
                                      }
                                      return (
                                        <div className='idx-tooltip'>
                                          <div className='idx-tooltip-label'>{label}</div>
                                          <div className='idx-tooltip-row'>
                                            <span>MFI</span>
                                            <span>
                                              {Utils.Format.formatNum(
                                                payload[0]?.value as number,
                                                1
                                              )}
                                            </span>
                                          </div>
                                        </div>
                                      )
                                    }}
                                  />
                                  <Line
                                    type='linear'
                                    dataKey='mfi'
                                    name='MFI'
                                    stroke='#7c3aed'
                                    strokeWidth={2}
                                    dot={false}
                                    isAnimationActive={false}
                                    connectNulls
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        </>
                      )}
                    </>
                  )}
                  {!volumeLoading && !volumeData && (
                    <p className='idx-p-muted'>Data volume tidak tersedia.</p>
                  )}
                </div>
              )}
              {activeTab === 'technical' && (
                <>
                  <div className='idx-foreign-header idx-mb-16'>
                    <label className='idx-form-label'>Periode</label>
                    <div className='idx-tabs'>
                      {foreignPeriodOptions.map(({ days, label }) => (
                        <button
                          key={days}
                          type='button'
                          className={`idx-tab idx-tab-inline ${
                            foreignPeriodDays === days ? 'idx-tab-active' : ''
                          }`}
                          onClick={() => setForeignPeriodDays(days)}
                        >
                          <span>{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className='idx-detail-block idx-mb-16'>
                    <label className='idx-form-label'>
                      RSI (14)
                      {rsiData?.sector != null && rsiData.sector !== '' && (
                        <span className='idx-text-muted idx-ml-4'>vs Sektor {rsiData.sector}</span>
                      )}
                    </label>
                    {rsiLoading && <div className='idx-loading'>Memuat RSI...</div>}
                    {rsiError && <div className='idx-error'>{rsiError}</div>}
                    {!rsiLoading && !rsiError && rsiChartData.chartData.length > 0 && (
                      <div className='idx-chart-container'>
                        <ResponsiveContainer width='100%' height='100%'>
                          <LineChart
                            data={rsiChartData.chartData}
                            margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
                          >
                            <XAxis
                              dataKey='date'
                              axisLine={false}
                              tickLine={false}
                              tick={{ fill: 'var(--idx-text-muted)', fontSize: 10 }}
                            />
                            <YAxis
                              domain={[0, 100]}
                              orientation='right'
                              axisLine={false}
                              tickLine={false}
                              tick={{ fill: 'var(--idx-text-muted)', fontSize: 10 }}
                            />
                            <Tooltip
                              content={({ active, payload, label }) => {
                                if (!active || !payload?.length || !label) {
                                  return null
                                }
                                const p = payload[0]?.payload
                                if (p == null) {
                                  return null
                                }
                                return (
                                  <div className='idx-foreign-tooltip'>
                                    <div className='idx-foreign-tooltip-label'>
                                      {Utils.Format.formatTitleCase(String(label))}
                                    </div>
                                    <div className='idx-tooltip-row'>
                                      <span className='idx-tooltip-swatch idx-tooltip-swatch-emiten' />
                                      <span>
                                        {Utils.Format.formatTitleCase('RSI (emiten)')}:{' '}
                                        {Utils.Format.formatNum(p.rsi, 2)}
                                      </span>
                                    </div>
                                    {p.sectorRsi != null && (
                                      <div className='idx-tooltip-row'>
                                        <span className='idx-tooltip-swatch idx-tooltip-swatch-sector' />
                                        <span>
                                          {Utils.Format.formatTitleCase('RSI sektor (rata)')}:{' '}
                                          {Utils.Format.formatNum(p.sectorRsi, 2)}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                )
                              }}
                            />
                            <ReferenceLine
                              y={30}
                              stroke='var(--idx-text-muted)'
                              strokeDasharray='2 2'
                            />
                            <ReferenceLine
                              y={70}
                              stroke='var(--idx-text-muted)'
                              strokeDasharray='2 2'
                            />
                            <Line
                              type='monotone'
                              dataKey='rsi'
                              name='Emiten'
                              stroke='var(--idx-primary)'
                              strokeWidth={2}
                              dot={false}
                              isAnimationActive={false}
                            />
                            {rsiChartData.hasSector && (
                              <Line
                                type='monotone'
                                dataKey='sectorRsi'
                                name='Sektor'
                                stroke='var(--idx-text-secondary)'
                                strokeWidth={1.5}
                                strokeDasharray='4 2'
                                dot={false}
                                isAnimationActive={false}
                              />
                            )}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    {!rsiLoading && !rsiError && rsiData && rsiData.data.length === 0 && (
                      <p className='idx-p-muted'>Tidak ada data RSI untuk periode ini.</p>
                    )}
                  </div>
                  <div className='idx-detail-block idx-mb-16'>
                    <label className='idx-form-label'>Volume (Bid vs Offer)</label>
                    {ohlcLoading && <div className='idx-loading'>Memuat volume...</div>}
                    {ohlcError && <div className='idx-error'>{ohlcError}</div>}
                    {!ohlcLoading && !ohlcError && ohlcData && ohlcData.length > 0 && (
                      <div className='idx-chart-container'>
                        <ResponsiveContainer width='100%' height='100%'>
                          <BarChart
                            data={ohlcData.map((row) => ({
                              date: Utils.Format.formatDateInt(row.date),
                              bidVolume: row.bidVolume ?? 0,
                              offerVolume: row.offerVolume ?? 0
                            }))}
                            margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
                          >
                            <XAxis
                              dataKey='date'
                              axisLine={false}
                              tickLine={false}
                              tick={{ fill: 'var(--idx-text-muted)', fontSize: 10 }}
                            />
                            <YAxis
                              orientation='right'
                              axisLine={false}
                              tickLine={false}
                              tick={{ fill: 'var(--idx-text-muted)', fontSize: 10 }}
                              tickFormatter={(v) => Utils.Format.formatNum(v, 0)}
                            />
                            <Tooltip
                              content={({ active, payload, label }) => {
                                if (!active || !payload?.length || !label) {
                                  return null
                                }
                                const row = payload[0]?.payload
                                if (row == null) {
                                  return null
                                }
                                const bid = row.bidVolume ?? 0
                                const offer = row.offerVolume ?? 0
                                return (
                                  <div className='idx-foreign-tooltip'>
                                    <div className='idx-foreign-tooltip-label'>
                                      {Utils.Format.formatTitleCase(String(label))}
                                    </div>
                                    <div className='idx-tooltip-row'>
                                      <span className='idx-tooltip-swatch idx-tooltip-swatch-up' />
                                      <span>
                                        {Utils.Format.formatTitleCase('Bid')}:{' '}
                                        {Utils.Format.formatNum(bid, 0)}
                                      </span>
                                    </div>
                                    <div className='idx-tooltip-row'>
                                      <span className='idx-tooltip-swatch idx-tooltip-swatch-down' />
                                      <span>
                                        {Utils.Format.formatTitleCase('Offer')}:{' '}
                                        {Utils.Format.formatNum(offer, 0)}
                                      </span>
                                    </div>
                                    <div>
                                      {Utils.Format.formatTitleCase('Total')}:{' '}
                                      {Utils.Format.formatNum(bid + offer, 0)}
                                    </div>
                                  </div>
                                )
                              }}
                            />
                            <Bar
                              dataKey='bidVolume'
                              name='Bid'
                              stackId='vol'
                              fill='var(--idx-up)'
                              isAnimationActive={false}
                            />
                            <Bar
                              dataKey='offerVolume'
                              name='Offer'
                              stackId='vol'
                              fill='var(--idx-down)'
                              radius={[4, 4, 0, 0]}
                              isAnimationActive={false}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    {!ohlcLoading && !ohlcError && ohlcData && ohlcData.length === 0 && (
                      <p className='idx-p-muted'>Tidak ada data volume untuk periode ini.</p>
                    )}
                  </div>
                  <div className='idx-detail-block idx-mb-12'>
                    <label className='idx-form-label'>Aliran Asing (Net)</label>
                    {foreignLoading && <div className='idx-loading'>Memuat aliran asing...</div>}
                    {foreignError && <div className='idx-error'>{foreignError}</div>}
                    {!foreignLoading && !foreignError && foreignData && (
                      <>
                        {foreignData.summary.dayCount > 0 && (
                          <p className='idx-p-muted idx-mb-8'>
                            Total NET Flow Dalam {foreignData.summary.dayCount} Hari:{' '}
                            <span
                              className={foreignData.summary.totalNet >= 0
                                ? 'idx-pct idx-pct-up'
                                : 'idx-pct idx-pct-down'}
                            >
                              {Utils.Format.formatRp(foreignData.summary.totalNet)}
                            </span>
                          </p>
                        )}
                        {foreignData.data.length > 0
                          ? (
                            <div className='idx-chart-container'>
                              <ResponsiveContainer width='100%' height='100%'>
                                <BarChart
                                  data={foreignData.data.map((row) => ({
                                    date: Utils.Format.formatDateInt(row.date),
                                    buy: row.buy ?? 0,
                                    sell: row.sell ?? 0,
                                    net: row.net ?? 0
                                  }))}
                                  margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
                                >
                                  <XAxis
                                    dataKey='date'
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'var(--idx-text-muted)', fontSize: 10 }}
                                  />
                                  <YAxis
                                    orientation='right'
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'var(--idx-text-muted)', fontSize: 10 }}
                                    tickFormatter={(v) => Utils.Format.formatRp(v)}
                                  />
                                  <Tooltip
                                    content={({ active, payload, label }) => {
                                      if (!active || !payload?.length || !label) {
                                        return null
                                      }
                                      const row = payload[0]?.payload
                                      if (row == null) {
                                        return null
                                      }
                                      return (
                                        <div className='idx-foreign-tooltip'>
                                          <div className='idx-foreign-tooltip-label'>
                                            {Utils.Format.formatTitleCase(String(label))}
                                          </div>
                                          <div>
                                            {Utils.Format.formatTitleCase('Beli')}:{' '}
                                            {Utils.Format.formatRp(row.buy)}
                                          </div>
                                          <div>
                                            {Utils.Format.formatTitleCase('Jual')}:{' '}
                                            {Utils.Format.formatRp(row.sell)}
                                          </div>
                                          <div>
                                            {Utils.Format.formatTitleCase('Net')}:{' '}
                                            <span
                                              style={{
                                                color: (row.net ?? 0) >= 0 ? '#10b981' : '#ef4444'
                                              }}
                                            >
                                              {Utils.Format.formatRp(row.net)}
                                            </span>
                                          </div>
                                        </div>
                                      )
                                    }}
                                  />
                                  <Bar
                                    dataKey='net'
                                    radius={[4, 4, 0, 0]}
                                    isAnimationActive={false}
                                  >
                                    {foreignData.data.map((row) => (
                                      <Cell
                                        key={row.date}
                                        fill={(row.net ?? 0) >= 0
                                          ? 'var(--idx-up)'
                                          : 'var(--idx-down)'}
                                      />
                                    ))}
                                  </Bar>
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          )
                          : <p className='idx-p-muted'>Tidak ada data untuk periode ini.</p>}
                      </>
                    )}
                  </div>
                </>
              )}
              {activeTab === 'advanced' && (
                <>
                  <div className='idx-foreign-header idx-mb-16'>
                    <label className='idx-form-label'>Periode</label>
                    <div className='idx-tabs'>
                      {foreignPeriodOptions.map(({ days, label }) => (
                        <button
                          key={days}
                          type='button'
                          className={`idx-tab idx-tab-sm ${
                            foreignPeriodDays === days ? 'idx-tab-active' : ''
                          }`}
                          onClick={() => setForeignPeriodDays(days)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {advancedLoading && <p className='idx-p-muted'>Memuat indikator...</p>}
                  {!advancedLoading && advancedData && (
                    <div className='idx-detail-sections'>
                      {advancedData.divergences.length > 0 && (
                        <section className='idx-detail-section'>
                          <h4 className='idx-detail-section-title'>Sinyal Divergence</h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {advancedData.divergences.map((div, i) => (
                              <div
                                key={i}
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: 4,
                                  fontSize: 'var(--idx-text-sm)',
                                  background: div.type === 'bullish'
                                    ? 'rgba(34,197,94,0.12)'
                                    : 'rgba(239,68,68,0.12)',
                                  color: div.type === 'bullish'
                                    ? 'var(--idx-up)'
                                    : 'var(--idx-down)',
                                  borderLeft: `3px solid ${
                                    div.type === 'bullish' ? 'var(--idx-up)' : 'var(--idx-down)'
                                  }`
                                }}
                              >
                                <strong>
                                  {div.type === 'bullish' ? '▲ Bullish' : '▼ Bearish'}{' '}
                                  Divergence ({div.indicator === 'rsi' ? 'RSI' : 'StochRSI'})
                                </strong>
                                {' — '}
                                {Utils.Format.formatDateInt(div.startDate)}
                                {' → '}
                                {Utils.Format.formatDateInt(div.endDate)}
                                {' | Harga: '}
                                {Utils.Format.formatNum(div.priceStart, 0)}
                                {' → '}
                                {Utils.Format.formatNum(div.priceEnd, 0)}
                                {' | Indikator: '}
                                {Utils.Format.formatNum(div.indicatorStart, 1)}
                                {' → '}
                                {Utils.Format.formatNum(div.indicatorEnd, 1)}
                              </div>
                            ))}
                          </div>
                        </section>
                      )}
                      <section className='idx-detail-section'>
                        <h4 className='idx-detail-section-title'>MACD (12, 26, 9)</h4>
                        {advancedData.macd.length > 0
                          ? (
                            <div style={{ height: 200 }}>
                              <ResponsiveContainer width='100%' height='100%'>
                                <LineChart
                                  data={advancedData.macd.map((r) => ({
                                    date: Utils.Format.formatDateInt(r.date),
                                    macd: r.macdLine,
                                    signal: r.signalLine,
                                    hist: r.histogram
                                  }))}
                                  margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                                >
                                  <XAxis
                                    dataKey='date'
                                    tick={{ fontSize: 10 }}
                                    tickLine={false}
                                    interval='preserveStartEnd'
                                  />
                                  <YAxis
                                    tick={{ fontSize: 10 }}
                                    tickLine={false}
                                    width={50}
                                    tickFormatter={(v: number) =>
                                      v != null ? v.toFixed(1) : ''}
                                  />
                                  <Tooltip
                                    formatter={(v: number) => v?.toFixed(3) ?? '-'}
                                    contentStyle={{
                                      fontSize: 11,
                                      background: 'var(--idx-bg)',
                                      border: '1px solid var(--idx-border)'
                                    }}
                                  />
                                  <ReferenceLine y={0} stroke='var(--idx-border)' />
                                  <Bar dataKey='hist' isAnimationActive={false}>
                                    {advancedData.macd.map((r) => (
                                      <Cell
                                        key={r.date}
                                        fill={(r.histogram ?? 0) >= 0
                                          ? 'var(--idx-up)'
                                          : 'var(--idx-down)'}
                                        fillOpacity={0.6}
                                      />
                                    ))}
                                  </Bar>
                                  <Line
                                    type='monotone'
                                    dataKey='macd'
                                    stroke='var(--idx-accent)'
                                    dot={false}
                                    strokeWidth={1.5}
                                    isAnimationActive={false}
                                    connectNulls
                                    name='MACD'
                                  />
                                  <Line
                                    type='monotone'
                                    dataKey='signal'
                                    stroke='#f59e0b'
                                    dot={false}
                                    strokeWidth={1.5}
                                    strokeDasharray='4 2'
                                    isAnimationActive={false}
                                    connectNulls
                                    name='Signal'
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          )
                          : <p className='idx-p-muted'>Data MACD tidak tersedia.</p>}
                      </section>
                      <section className='idx-detail-section'>
                        <h4 className='idx-detail-section-title'>Stochastic RSI (14, 14, 3)</h4>
                        {advancedData.stochRsi.length > 0
                          ? (
                            <div style={{ height: 180 }}>
                              <ResponsiveContainer width='100%' height='100%'>
                                <LineChart
                                  data={advancedData.stochRsi.map((r) => ({
                                    date: Utils.Format.formatDateInt(r.date),
                                    k: r.k,
                                    d: r.d
                                  }))}
                                  margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                                >
                                  <XAxis
                                    dataKey='date'
                                    tick={{ fontSize: 10 }}
                                    tickLine={false}
                                    interval='preserveStartEnd'
                                  />
                                  <YAxis
                                    domain={[0, 100]}
                                    tick={{ fontSize: 10 }}
                                    tickLine={false}
                                    width={35}
                                  />
                                  <Tooltip
                                    formatter={(v: number) => v?.toFixed(1) ?? '-'}
                                    contentStyle={{
                                      fontSize: 11,
                                      background: 'var(--idx-bg)',
                                      border: '1px solid var(--idx-border)'
                                    }}
                                  />
                                  <ReferenceLine
                                    y={80}
                                    stroke='var(--idx-down)'
                                    strokeDasharray='3 3'
                                    strokeOpacity={0.5}
                                  />
                                  <ReferenceLine
                                    y={20}
                                    stroke='var(--idx-up)'
                                    strokeDasharray='3 3'
                                    strokeOpacity={0.5}
                                  />
                                  <Line
                                    type='monotone'
                                    dataKey='k'
                                    stroke='var(--idx-accent)'
                                    dot={false}
                                    strokeWidth={1.5}
                                    isAnimationActive={false}
                                    connectNulls
                                    name='%K'
                                  />
                                  <Line
                                    type='monotone'
                                    dataKey='d'
                                    stroke='#f59e0b'
                                    dot={false}
                                    strokeWidth={1.5}
                                    strokeDasharray='4 2'
                                    isAnimationActive={false}
                                    connectNulls
                                    name='%D'
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                              <div
                                style={{
                                  display: 'flex',
                                  gap: 12,
                                  fontSize: 'var(--idx-text-xs)',
                                  color: 'var(--idx-text-muted)',
                                  marginTop: 4
                                }}
                              >
                                <span style={{ color: 'var(--idx-down)' }}>─ 80 Overbought</span>
                                <span style={{ color: 'var(--idx-up)' }}>─ 20 Oversold</span>
                              </div>
                            </div>
                          )
                          : <p className='idx-p-muted'>Data Stochastic RSI tidak tersedia.</p>}
                      </section>
                      {/* Support & Resistance */}
                      <section className='idx-detail-section'>
                        <h4 className='idx-detail-section-title'>
                          Support &amp; Resistance
                          <span style={{ fontSize: 'var(--idx-text-xs)', fontWeight: 400, color: 'var(--idx-text-muted)', marginLeft: 8 }}>
                            Berbasis cluster level yang sering disentuh harga (1 tahun)
                          </span>
                        </h4>
                        {advancedData.supportResistance.levels.length === 0
                          ? <p className='idx-p-muted'>Tidak cukup data untuk mendeteksi level S/R.</p>
                          : (
                            <div>
                              {/* Current price reference */}
                              <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '5px 10px', marginBottom: 6, borderRadius: 4,
                                background: 'rgba(99,102,241,0.1)', borderLeft: '3px solid var(--idx-accent)'
                              }}>
                                <span style={{ fontSize: 'var(--idx-text-sm)', fontWeight: 700, color: 'var(--idx-accent)' }}>Harga Saat Ini</span>
                                <span style={{ fontSize: 'var(--idx-text-sm)', fontWeight: 700, color: 'var(--idx-accent)' }}>
                                  {Utils.Format.formatNum(advancedData.supportResistance.currentClose, 0)}
                                </span>
                              </div>
                              {/* Levels sorted price descending: resistance above, support below */}
                              {advancedData.supportResistance.levels.map((lvl, i) => {
                                const isRes = lvl.type === 'resistance'
                                const strengthDot = lvl.strength === 'strong' ? '●●●' : lvl.strength === 'moderate' ? '●●○' : '●○○'
                                const bg = isRes ? 'rgba(239,68,68,0.07)' : 'rgba(34,197,94,0.07)'
                                const border = isRes ? 'var(--idx-down)' : 'var(--idx-up)'
                                const pctFromClose = ((lvl.price - advancedData.supportResistance.currentClose) /
                                  advancedData.supportResistance.currentClose * 100)
                                return (
                                  <div
                                    key={i}
                                    style={{
                                      display: 'flex', alignItems: 'center',
                                      justifyContent: 'space-between', gap: 8,
                                      padding: '5px 10px', marginBottom: 3,
                                      borderRadius: 4, background: bg,
                                      borderLeft: `3px solid ${border}`
                                    }}
                                  >
                                    <span style={{ fontSize: 'var(--idx-text-xs)', fontWeight: 700, color: border, minWidth: 40 }}>
                                      {isRes ? '▲ Res' : '▼ Sup'}
                                    </span>
                                    <span style={{ fontSize: 'var(--idx-text-sm)', fontWeight: 700, flex: 1 }}>
                                      {Utils.Format.formatNum(lvl.price, 0)}
                                    </span>
                                    <span style={{ fontSize: 'var(--idx-text-xs)', color: isRes ? 'var(--idx-down)' : 'var(--idx-up)', minWidth: 52, textAlign: 'right' }}>
                                      {pctFromClose >= 0 ? '+' : ''}{pctFromClose.toFixed(1)}%
                                    </span>
                                    <span style={{ fontSize: 10, color: 'var(--idx-text-muted)', minWidth: 28, textAlign: 'center' }} title={`Kekuatan: ${lvl.strength} (${lvl.touchCount} sentuhan)`}>
                                      {strengthDot}
                                    </span>
                                    <span style={{ fontSize: 'var(--idx-text-xs)', color: 'var(--idx-text-muted)', minWidth: 52, textAlign: 'right' }}>
                                      {Utils.Format.formatDateInt(lvl.lastTouchDate)}
                                    </span>
                                  </div>
                                )
                              })}
                              <p style={{ fontSize: 'var(--idx-text-xs)', color: 'var(--idx-text-muted)', marginTop: 8 }}>
                                ●●● Kuat &nbsp;·&nbsp; ●●○ Sedang &nbsp;·&nbsp; ●○○ Lemah &nbsp;·&nbsp; Tanggal = sentuhan terakhir
                              </p>
                            </div>
                          )}
                      </section>

                      {/* Fibonacci Retracement */}
                      <section className='idx-detail-section'>
                        <h4 className='idx-detail-section-title'>Fibonacci Retracement</h4>
                        {advancedData.fibonacci
                          ? (
                            <>
                              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                                <span
                                  style={{
                                    fontSize: 'var(--idx-text-sm)',
                                    fontWeight: 700,
                                    color: advancedData.fibonacci.trend === 'up' ? 'var(--idx-up)' : 'var(--idx-down)',
                                    padding: '2px 8px',
                                    borderRadius: 4,
                                    background: advancedData.fibonacci.trend === 'up' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'
                                  }}
                                >
                                  {advancedData.fibonacci.trend === 'up' ? '▲ Uptrend' : '▼ Downtrend'}
                                </span>
                                <span style={{ fontSize: 'var(--idx-text-xs)', color: 'var(--idx-text-muted)' }}>
                                  High: <strong>{Utils.Format.formatNum(advancedData.fibonacci.swingHigh, 0)}</strong>
                                  {` (${Utils.Format.formatDateInt(advancedData.fibonacci.swingHighDate)})`}
                                </span>
                                <span style={{ fontSize: 'var(--idx-text-xs)', color: 'var(--idx-text-muted)' }}>
                                  Low: <strong>{Utils.Format.formatNum(advancedData.fibonacci.swingLow, 0)}</strong>
                                  {` (${Utils.Format.formatDateInt(advancedData.fibonacci.swingLowDate)})`}
                                </span>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                {advancedData.fibonacci.levels.map((lvl) => {
                                  const currentPrice = advancedData.supportResistance.currentClose ?? 0
                                  const range = advancedData.fibonacci!.swingHigh - advancedData.fibonacci!.swingLow
                                  const pct = range > 0 ? Math.min(100, Math.max(0, ((lvl.price - advancedData.fibonacci!.swingLow) / range) * 100)) : 0
                                  const isCurrent = Math.abs(currentPrice - lvl.price) / Math.max(lvl.price, 1) < 0.03
                                  const fibColors: Record<string, string> = {
                                    '0%': 'var(--idx-text-muted)',
                                    '23.6%': '#6366f1',
                                    '38.2%': '#8b5cf6',
                                    '50%': 'var(--idx-accent)',
                                    '61.8%': '#f59e0b',
                                    '78.6%': '#f97316',
                                    '100%': 'var(--idx-text-muted)'
                                  }
                                  const levelColor = fibColors[lvl.label] ?? 'var(--idx-text-muted)'
                                  return (
                                    <div
                                      key={lvl.label}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        padding: '4px 8px',
                                        borderRadius: 4,
                                        background: isCurrent ? 'var(--idx-bg-second)' : 'transparent',
                                        border: isCurrent ? `1px solid ${levelColor}` : '1px solid transparent'
                                      }}
                                    >
                                      <span style={{ fontSize: 'var(--idx-text-xs)', color: levelColor, fontWeight: 700, minWidth: 42, textAlign: 'right' }}>
                                        {lvl.label}
                                      </span>
                                      <div style={{ flex: 1, height: 6, background: 'var(--idx-bg-second)', borderRadius: 3, overflow: 'hidden' }}>
                                        <div style={{ width: `${pct}%`, height: '100%', background: levelColor, borderRadius: 3, opacity: 0.7 }} />
                                      </div>
                                      <span style={{ fontSize: 'var(--idx-text-sm)', fontWeight: isCurrent ? 700 : 400, minWidth: 70, textAlign: 'right' }}>
                                        {Utils.Format.formatNum(lvl.price, 0)}
                                      </span>
                                      {isCurrent && (
                                        <span style={{ fontSize: 'var(--idx-text-xs)', color: levelColor, whiteSpace: 'nowrap' }}>
                                          ← saat ini
                                        </span>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </>
                          )
                          : <p className='idx-p-muted'>Data Fibonacci tidak tersedia.</p>}
                      </section>
                    </div>
                  )}
                  {!advancedLoading && !advancedData && (
                    <p className='idx-p-muted'>Data indikator lanjutan tidak tersedia.</p>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
