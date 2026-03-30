/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 */

import React, { useMemo, useState } from 'react'
import { RefreshCw, TrendingDown, TrendingUp } from 'lucide-react'
import * as Utils from '@app/pages/utils/index.ts'
import type * as Types from '@app/pages/Types.ts'

type SignalFilter = 'all' | 'strong-buy' | 'buy' | 'neutral-sell'

// ─── Sub-components ───────────────────────────────────────────────────────────

function SmtScoreBar({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score))
  const color = clamped >= 75
    ? 'var(--idx-up)'
    : clamped >= 55
    ? 'var(--idx-accent)'
    : clamped >= 35
    ? 'var(--idx-text-muted)'
    : 'var(--idx-down)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div
        style={{
          width: 60,
          height: 6,
          background: 'var(--idx-border)',
          borderRadius: 3,
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            width: `${clamped}%`,
            height: '100%',
            background: color,
            borderRadius: 3
          }}
        />
      </div>
      <span style={{ fontWeight: 600, color, minWidth: 26, fontSize: 12 }}>{clamped}</span>
    </div>
  )
}

function SignalBadge({ signal }: { signal: Types.SmartMoneyRow['signal'] }) {
  if (signal === 'strong-buy') {
    return (
      <span className='idx-vol-badge' style={{ background: 'var(--idx-up)', color: '#fff' }}>
        STRONG BUY
      </span>
    )
  }
  if (signal === 'buy') {
    return (
      <span
        className='idx-vol-badge'
        style={{ background: 'rgba(var(--idx-up-rgb,34,197,94),0.15)', color: 'var(--idx-up)' }}
      >
        BUY
      </span>
    )
  }
  if (signal === 'sell') {
    return (
      <span
        className='idx-vol-badge'
        style={{
          background: 'rgba(var(--idx-down-rgb,239,68,68),0.15)',
          color: 'var(--idx-down)'
        }}
      >
        SELL
      </span>
    )
  }
  if (signal === 'strong-sell') {
    return (
      <span className='idx-vol-badge' style={{ background: 'var(--idx-down)', color: '#fff' }}>
        STRONG SELL
      </span>
    )
  }
  return <span className='idx-vol-badge idx-vol-badge-neutral'>NETRAL</span>
}

function ForeignFlowCell({ row }: { row: Types.SmartMoneyRow }) {
  const { foreignNet5d, foreignAcceleration } = row
  if (foreignNet5d == null) {
    return <span className='idx-text-muted'>—</span>
  }
  const isPos = foreignNet5d >= 0
  const accel = foreignAcceleration != null && foreignAcceleration > 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {isPos
        ? <TrendingUp size={12} style={{ color: 'var(--idx-up)' }} />
        : <TrendingDown size={12} style={{ color: 'var(--idx-down)' }} />}
      <span className={isPos ? 'idx-color-up' : 'idx-color-down'} style={{ fontSize: 12 }}>
        {isPos ? '+' : ''}
        {Utils.Format.formatNum(foreignNet5d / 1_000_000, 1)}M
      </span>
      {accel && (
        <span
          style={{
            fontSize: 10,
            background: 'rgba(var(--idx-up-rgb,34,197,94),0.15)',
            color: 'var(--idx-up)',
            padding: '1px 4px',
            borderRadius: 3
          }}
        >
          ▲
        </span>
      )}
    </div>
  )
}

function TradeSizeCell({ row }: { row: Types.SmartMoneyRow }) {
  const { avgTradeSize, avgTradeSizeChange } = row
  if (avgTradeSize == null) {
    return <span className='idx-text-muted'>—</span>
  }
  const changeStr = avgTradeSizeChange != null
    ? ` (${avgTradeSizeChange >= 0 ? '+' : ''}${avgTradeSizeChange.toFixed(1)}%)`
    : ''
  const color = avgTradeSizeChange != null && avgTradeSizeChange >= 20
    ? 'var(--idx-up)'
    : avgTradeSizeChange != null && avgTradeSizeChange <= -10
    ? 'var(--idx-down)'
    : 'inherit'
  return (
    <span style={{ color, fontSize: 12 }}>
      {Utils.Format.formatNum(avgTradeSize / 1_000_000, 1)}M{changeStr}
    </span>
  )
}

function BidOfferCell({ ratio }: { ratio: number | null }) {
  if (ratio == null) {
    return <span className='idx-text-muted'>—</span>
  }
  const color = ratio >= 1.5
    ? 'var(--idx-up)'
    : ratio >= 1.0
    ? 'var(--idx-accent)'
    : 'var(--idx-down)'
  return <span style={{ color, fontWeight: 600, fontSize: 12 }}>{ratio.toFixed(2)}</span>
}

function SmartMoneyRow(
  { row, onRowClick }: { row: Types.SmartMoneyRow; onRowClick: (code: string) => void }
) {
  return (
    <tr
      className='idx-vol-row'
      onClick={() => onRowClick(row.code)}
      style={{ cursor: 'pointer' }}
    >
      <td>
        <div className='idx-candidate-code'>{row.code}</div>
        {row.name && <div className='idx-candidate-name'>{row.name}</div>}
      </td>
      <td className='idx-text-right'>
        {row.price != null ? Utils.Format.formatNum(row.price, 0) : '—'}
      </td>
      <td>
        <SmtScoreBar score={row.smtScore} />
      </td>
      <td>
        <ForeignFlowCell row={row} />
      </td>
      <td className='idx-text-center'>
        <span style={{ fontSize: 12 }}>
          {row.consecutiveForeignBuyDays > 0
            ? <span className='idx-color-up'>{row.consecutiveForeignBuyDays}h</span>
            : <span className='idx-text-muted'>—</span>}
        </span>
      </td>
      <td>
        <TradeSizeCell row={row} />
      </td>
      <td className='idx-text-center'>
        <BidOfferCell ratio={row.bidOfferRatio} />
      </td>
      {row.topBrokerConcentration != null && (
        <td className='idx-text-center'>
          <span
            style={{
              fontSize: 12,
              color: row.topBrokerConcentration >= 70
                ? 'var(--idx-up)'
                : row.topBrokerConcentration >= 50
                ? 'var(--idx-accent)'
                : 'inherit'
            }}
          >
            {row.topBrokerConcentration.toFixed(0)}%
          </span>
        </td>
      )}
      <td className='idx-text-center'>
        <SignalBadge signal={row.signal} />
      </td>
    </tr>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SmartMoneyView(
  { data, loading, error, onRefetch, onRowClick }: Types.SmartMoneyViewProps & {
    onRowClick?: (code: string) => void
  }
) {
  const [signalFilter, setSignalFilter] = useState<SignalFilter>('all')
  const [sectorFilter, setSectorFilter] = useState('')
  const [minScore, setMinScore] = useState(0)

  const sectors = useMemo(() => {
    if (!data) {
      return []
    }
    const set = new Set<string>()
    for (const r of data.data) {
      if (r.sector) {
        set.add(r.sector)
      }
    }
    return Array.from(set).sort()
  }, [data])

  const filtered = useMemo(() => {
    if (!data) {
      return []
    }
    return data.data.filter((r) => {
      if (signalFilter === 'strong-buy' && r.signal !== 'strong-buy') {
        return false
      }
      if (signalFilter === 'buy' && r.signal !== 'buy' && r.signal !== 'strong-buy') {
        return false
      }
      if (
        signalFilter === 'neutral-sell' && r.signal !== 'neutral' && r.signal !== 'sell' &&
        r.signal !== 'strong-sell'
      ) {
        return false
      }
      if (r.smtScore < minScore) {
        return false
      }
      if (sectorFilter && r.sector !== sectorFilter) {
        return false
      }
      return true
    })
  }, [data, signalFilter, minScore, sectorFilter])

  const strongBuyCount = data?.data.filter((r) => r.signal === 'strong-buy').length ?? 0
  const buyCount = data?.data.filter((r) => r.signal === 'buy').length ?? 0
  const neutralSellCount = data?.data.filter(
    (r) => r.signal === 'neutral' || r.signal === 'sell' || r.signal === 'strong-sell'
  ).length ?? 0

  if (loading) {
    return (
      <div className='idx-loading-wrap'>
        <div className='idx-loading-spinner' />
        <div className='idx-text-muted' style={{ marginTop: 8 }}>
          Menghitung sinyal smart money...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className='idx-error-wrap'>
        <div className='idx-error-msg'>{error}</div>
        <button type='button' className='idx-btn idx-btn-sm' onClick={onRefetch}>
          <RefreshCw size={14} /> Coba Lagi
        </button>
      </div>
    )
  }

  const hasBroker = data?.hasBrokerData ?? false

  return (
    <div className='idx-vol-view'>
      {/* Summary pills */}
      <div className='idx-vol-summary-row'>
        <div
          className='idx-vol-pill'
          style={{ borderColor: 'var(--idx-up)', cursor: 'pointer' }}
          onClick={() => setSignalFilter(signalFilter === 'strong-buy' ? 'all' : 'strong-buy')}
        >
          <span className='idx-vol-pill-label'>Strong Buy</span>
          <span className='idx-vol-pill-count' style={{ color: 'var(--idx-up)' }}>
            {strongBuyCount}
          </span>
        </div>
        <div
          className='idx-vol-pill idx-vol-pill-accum'
          style={{ cursor: 'pointer' }}
          onClick={() => setSignalFilter(signalFilter === 'buy' ? 'all' : 'buy')}
        >
          <span className='idx-vol-pill-label'>Buy</span>
          <span className='idx-vol-pill-count'>{buyCount}</span>
        </div>
        <div
          className='idx-vol-pill idx-vol-pill-dist'
          style={{ cursor: 'pointer' }}
          onClick={() => setSignalFilter(signalFilter === 'neutral-sell' ? 'all' : 'neutral-sell')}
        >
          <span className='idx-vol-pill-label'>Netral/Jual</span>
          <span className='idx-vol-pill-count'>{neutralSellCount}</span>
        </div>
        <div className='idx-vol-pill-spacer' />
        <select
          className='idx-select idx-select-sm'
          value={sectorFilter}
          onChange={(e) => setSectorFilter(e.target.value)}
        >
          <option value=''>Semua Sektor</option>
          {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          className='idx-select idx-select-sm'
          value={minScore}
          onChange={(e) => setMinScore(Number(e.target.value))}
        >
          <option value={0}>Min Skor: 0</option>
          <option value={35}>Min Skor: 35</option>
          <option value={55}>Min Skor: 55</option>
          <option value={75}>Min Skor: 75</option>
        </select>
        <button
          type='button'
          className='idx-btn idx-btn-sm idx-btn-icon'
          onClick={onRefetch}
          title='Refresh'
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Legend */}
      <div className='idx-vol-legend'>
        <span className='idx-text-muted' style={{ fontSize: 11 }}>
          Skor 0-100: Foreign Flow (30) + Streak (10) + OBV Divergence (15) + Ukuran Transaksi (20)
          + Bid/Offer (10) + Alignment (15)
          {hasBroker && ' + Broker Konsentrasi (bonus)'}
          &nbsp;|&nbsp; Streak: hari berturut-turut asing beli &nbsp;|&nbsp; Bid/Offer: ratio
          terkini
        </span>
      </div>

      <div className='idx-table-scroll'>
        <table className='idx-table idx-vol-table'>
          <thead>
            <tr>
              <th>Saham</th>
              <th className='idx-text-right'>Harga</th>
              <th>SMT Skor</th>
              <th>Foreign Flow (5d)</th>
              <th className='idx-text-center'>Streak</th>
              <th>Ukuran Tx</th>
              <th className='idx-text-center'>Bid/Offer</th>
              {hasBroker && <th className='idx-text-center'>Top3 Broker</th>}
              <th className='idx-text-center'>Sinyal</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0
              ? (
                <tr>
                  <td
                    colSpan={hasBroker ? 9 : 8}
                    className='idx-text-center idx-text-muted'
                    style={{ padding: '24px 0' }}
                  >
                    Tidak ada data
                  </td>
                </tr>
              )
              : filtered.map((row) => (
                <SmartMoneyRow
                  key={row.code}
                  row={row}
                  onRowClick={onRowClick ?? (() => {})}
                />
              ))}
          </tbody>
        </table>
      </div>

      <div className='idx-vol-count-label'>
        Menampilkan {filtered.length} dari {data?.totalCount ?? 0} saham
        {hasBroker && (
          <span className='idx-text-muted' style={{ marginLeft: 8, fontSize: 11 }}>
            · Data broker tersedia
          </span>
        )}
      </div>
    </div>
  )
}
