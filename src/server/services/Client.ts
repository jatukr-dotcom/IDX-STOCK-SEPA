/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 */

import type * as Types from '@app/server/services/Types.ts'

export class Client implements Types.IdxClient {
  private static readonly origin = 'https://www.idx.co.id'
  private static readonly browserHeaders: Types.BrowserHeaders = {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
    Referer: `${Client.origin}/`,
    'Upgrade-Insecure-Requests': '1',
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    'X-Requested-With': 'XMLHttpRequest'
  }
  private sessionCookie = ''

  async ensureSession(): Promise<void> {
    if (this.sessionCookie) {
      return
    }
    const indexResponse = await fetch(`${Client.origin}/id`, {
      headers: Client.browserHeaders
    })
    const setCookieHeaders = indexResponse.headers.getSetCookie?.() ?? []
    this.sessionCookie = setCookieHeaders.join('; ')
    // Consume response body to clean up
    await indexResponse.text().catch(() => {})
    await this.wait(1000)
    const validationResponse = await fetch(`${Client.origin}/primary/home/GetIndexList`, {
      headers: {
        ...Client.browserHeaders,
        ...(this.sessionCookie ? { Cookie: this.sessionCookie } : {})
      }
    })
    // Consume response body to clean up
    await validationResponse.text().catch(() => {})
  }

  async get(url: string): Promise<Response> {
    await this.ensureSession()
    const headers = {
      ...Client.browserHeaders,
      ...(this.sessionCookie ? { Cookie: this.sessionCookie } : {})
    }
    const response = await fetch(url, { headers })
    if (!response.ok && response.status === 403) {
      // Session expired — clear and retry once with a fresh session
      this.sessionCookie = ''
      await response.text().catch(() => {})
      await this.ensureSession()
      const retryHeaders = {
        ...Client.browserHeaders,
        ...(this.sessionCookie ? { Cookie: this.sessionCookie } : {})
      }
      return fetch(url, { headers: retryHeaders })
    }
    return response
  }

  private wait(delayMs: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, delayMs))
  }
}
