/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 */

export class CronDate {
  static stringToDateInt(dateStr: string): number {
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (!match) {
      return 0
    }
    return parseInt(`${match[1]}${match[2]}${match[3]}`, 10)
  }

  static todayDateInt(): number {
    return CronDate.getDateIntForDayOffset(0)
  }

  static getDateIntForDayOffset(daysOffset: number): number {
    const targetDate = new Date()
    targetDate.setDate(targetDate.getDate() + daysOffset)
    const year = targetDate.getFullYear()
    const month = String(targetDate.getMonth() + 1).padStart(2, '0')
    const day = String(targetDate.getDate()).padStart(2, '0')
    return parseInt(`${year}${month}${day}`, 10)
  }
}
