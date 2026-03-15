/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 */

import * as Services from '@app/server/services/index.ts'

export class Fetcher {
  private readonly client = new Services.Client()

  async run(): Promise<void> {
    await Services.Screener.run(this.client)
    for (let offset = -5; offset <= 2; offset++) {
      const dateInt = Services.CronDate.getDateIntForDayOffset(offset)
      await Services.Summary.run(this.client, dateInt)
    }
  }
}
