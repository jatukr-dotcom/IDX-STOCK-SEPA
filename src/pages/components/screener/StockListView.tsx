/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 */

import React, { useCallback, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Search, Star } from 'lucide-react'
import * as Hooks from '@app/pages/hooks/index.ts'
import * as Utils from '@app/pages/utils/index.ts'
import type * as Types from '@app/pages/Types.ts'

const PAGE_SIZE = 50

function toCandidateRow(item: Types.StockListItem): Types.CandidateTableRow {
  return {
    code: item.code,
    name: item.name,
    sector: item.sector,
    valueScore: 0,
    qualityScore: 0,
    momentumScore: 0,
    compositeScore: item.compositeScore,
    rank: item.rank,
    hasNotation: false,
    hasCorpAction: false,
    hasUma: false,
    per: item.per,
    roe: item.roe,
    der: item.der,
    week26PC: null,
    week52PC: null,
    value: null,
    volume: null,
    changePct: null,
    compositePercentile: 0
  }
}

interface StockListViewProps {
  sectors: string[]
  watchlistCodes: string[]
  onWatchlistToggle: (code: string, row?: Types.CandidateTableRow) => void
  onRowClick: (code: string) => void
}

export default function StockListView({
  sectors,
  watchlistCodes,
  onWatchlistToggle,
  onRowClick
}: StockListViewProps) {
  const [search, setSearch] = useState('')
  const [searchApplied, setSearchApplied] = useState('')
  const [sector, setSector] = useState('')
  const [offset, setOffset] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data, loading, error } = Hooks.useAllStocks(searchApplied, sector, offset, PAGE_SIZE)

  const totalCount = data?.totalCount ?? 0
  const rows = data?.data ?? []
  const fromRow = totalCount === 0 ? 0 : offset + 1
  const toRow = Math.min(offset + rows.length, offset + totalCount)
  const hasPrev = offset > 0
  const hasNext = offset + PAGE_SIZE < totalCount

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setSearch(v)
    if (debounceRef.current != null) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      setSearchApplied(v)
      setOffset(0)
    }, 300)
  }, [])

  const handleSectorChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setSector(e.target.value)
    setOffset(0)
  }, [])

  const handleRowKeyDown = useCallback((code: string, e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onRowClick(code)
    }
  }, [onRowClick])

  const handleStarClick = useCallback((item: Types.StockListItem, e: React.MouseEvent) => {
    e.stopPropagation()
    const inList = watchlistCodes.includes(item.code)
    onWatchlistToggle(item.code, inList ? undefined : toCandidateRow(item))
  }, [watchlistCodes, onWatchlistToggle])

  const handleStarKeyDown = useCallback((item: Types.StockListItem, e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()
      const inList = watchlistCodes.includes(item.code)
      onWatchlistToggle(item.code, inList ? undefined : toCandidateRow(item))
    }
  }, [watchlistCodes, onWatchlistToggle])

  return (
    <div className='idx-card'>
      {/* Search & filter bar */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '10px 12px',
          borderBottom: '1px solid var(--idx-border)',
          flexWrap: 'wrap'
        }}
      >
        <div className='idx-table-search' style={{ flex: '1 1 220px', minWidth: 180 }}>
          <Search size={18} className='idx-table-search-icon' aria-hidden />
          <input
            type='search'
            className='idx-table-search-input'
            placeholder='Cari kode, nama, sektor, industri...'
            value={search}
            onChange={handleSearchChange}
            aria-label='Cari saham'
          />
        </div>
        <select
          className='idx-select'
          value={sector}
          onChange={handleSectorChange}
          aria-label='Filter sektor'
          style={{ flex: '0 0 auto', minWidth: 160 }}
        >
          <option value=''>Semua Sektor</option>
          {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className='idx-table-wrap'>
        <table className='idx-table'>
          <thead>
            <tr>
              <th className='idx-table-col-watchlist' scope='col' aria-label='Watchlist'>
                <Star size={14} aria-hidden className='idx-table-star-header' />
              </th>
              <th className='idx-table-col-kode'>Kode</th>
              <th className='idx-table-col-nama'>Nama Emiten</th>
              <th className='idx-table-col-sector'>Sektor</th>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>Industri</th>
              <th className='idx-table-th-right'>PER</th>
              <th className='idx-table-th-right'>ROE</th>
              <th className='idx-table-th-right'>DER</th>
              <th className='idx-table-th-right'>Skor</th>
              <th className='idx-table-th-right'>Rank</th>
            </tr>
          </thead>
          <tbody>
            {error != null && error !== '' && (
              <tr className='idx-table-message-row'>
                <td colSpan={10} className='idx-table-empty-cell idx-table-error-cell'>{error}</td>
              </tr>
            )}
            {loading && rows.length === 0 && (
              <tr className='idx-table-message-row'>
                <td colSpan={10} className='idx-table-empty-cell'>Memuat daftar saham...</td>
              </tr>
            )}
            {!loading && rows.length === 0 && error == null && (
              <tr className='idx-table-message-row'>
                <td colSpan={10} className='idx-table-empty-cell'>Tidak ada saham ditemukan.</td>
              </tr>
            )}
            {rows.map((item) => (
              <tr
                key={item.code}
                tabIndex={0}
                role='button'
                onClick={() => onRowClick(item.code)}
                onKeyDown={(e) => handleRowKeyDown(item.code, e)}
                aria-label={`Buka detail ${item.code} ${item.name ?? ''}`}
              >
                <td className='idx-table-col-watchlist'>
                  <button
                    type='button'
                    className={`idx-watchlist-btn ${
                      watchlistCodes.includes(item.code) ? 'idx-watchlist-on' : ''
                    }`}
                    onClick={(e) => handleStarClick(item, e)}
                    onKeyDown={(e) => handleStarKeyDown(item, e)}
                    aria-label={watchlistCodes.includes(item.code)
                      ? `Hapus ${item.code} dari watchlist`
                      : `Tambah ${item.code} ke watchlist`}
                  >
                    <Star size={16} aria-hidden />
                  </button>
                </td>
                <td className='idx-table-col-kode'>
                  <span className='idx-table-code-bold'>{item.code}</span>
                </td>
                <td className='idx-table-col-nama'>{item.name ?? '-'}</td>
                <td className='idx-table-col-sector'>{item.sector ?? '-'}</td>
                <td style={{ padding: '6px 8px', fontSize: 12, color: 'var(--idx-muted)' }}>
                  {item.industry ?? '-'}
                </td>
                <td className='idx-table-td-right'>{Utils.Format.formatNum(item.per, 1)}</td>
                <td className='idx-table-td-right'>{Utils.Format.formatNum(item.roe, 1)}</td>
                <td className='idx-table-td-right'>{Utils.Format.formatNum(item.der, 1)}</td>
                <td className='idx-table-td-right'>
                  <span style={{ fontWeight: 600, color: 'var(--idx-primary)' }}>
                    {Utils.Format.formatNum(item.compositeScore, 0)}
                  </span>
                </td>
                <td className='idx-table-td-right'>
                  <span style={{ color: 'var(--idx-muted)', fontSize: 12 }}>#{item.rank}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className='idx-pagination'>
        <span className='idx-pagination-info'>
          {totalCount === 0
            ? 'Tidak Ada Data'
            : `Baris ${fromRow}–${toRow} dari ${totalCount.toLocaleString('id-ID')} emiten`}
        </span>
        <div className='idx-pagination-actions'>
          <button
            type='button'
            className='idx-btn'
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={!hasPrev}
            aria-label='Halaman Sebelumnya'
          >
            <ChevronLeft size={16} aria-hidden />
            <span>Sebelumnya</span>
          </button>
          <button
            type='button'
            className='idx-btn'
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={!hasNext}
            aria-label='Halaman Berikutnya'
          >
            <span>Berikutnya</span>
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  )
}
