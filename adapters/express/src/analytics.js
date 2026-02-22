/**
 * OpenFeeder Express Adapter — Analytics
 *
 * Lightweight fire-and-forget analytics client.
 * Supports: Umami | GA4 | none
 */

'use strict';

const BOT_PATTERNS = {
  GPTBot: 'openai',
  'ChatGPT-User': 'openai',
  ClaudeBot: 'anthropic',
  'anthropic-ai': 'anthropic',
  PerplexityBot: 'perplexity',
  'Google-Extended': 'google',
  Googlebot: 'google',
  CCBot: 'common-crawl',
  'cohere-ai': 'cohere',
  FacebookBot: 'meta',
  Amazonbot: 'amazon',
  YouBot: 'you',
  Bytespider: 'bytedance',
};

/**
 * Detect bot name and family from User-Agent string.
 * @param {string} ua
 * @returns {{ botName: string, botFamily: string }}
 */
function detectBot(ua) {
  if (!ua) return { botName: 'unknown', botFamily: 'unknown' };
  const uaLower = ua.toLowerCase();
  for (const [pattern, family] of Object.entries(BOT_PATTERNS)) {
    if (uaLower.includes(pattern.toLowerCase())) {
      return { botName: pattern, botFamily: family };
    }
  }
  return { botName: 'human-or-unknown', botFamily: 'unknown' };
}

class Analytics {
  /**
   * @param {{ provider?: string, url?: string, siteId?: string, apiKey?: string }} opts
   */
  constructor({ provider = 'none', url = '', siteId = '', apiKey = '' } = {}) {
    this.provider = provider;
    this.url = (url || '').replace(/\/+$/, '');
    this.siteId = siteId;
    this.apiKey = apiKey;
    this.enabled = provider !== 'none' && !!url && !!siteId;
  }

  /**
   * Fire-and-forget event tracking — never blocks the request.
   * @param {object} eventData
   */
  track(eventData) {
    if (!this.enabled) return;
    setImmediate(() => {
      this._send(eventData).catch((err) => {
        // Swallow — analytics must never break the app
      });
    });
  }

  /** @private */
  async _send(eventData) {
    if (this.provider === 'umami') return this._sendUmami(eventData);
    if (this.provider === 'ga4') return this._sendGa4(eventData);
  }

  /** @private */
  async _sendUmami(data) {
    const payload = {
      type: 'event',
      payload: {
        website: this.siteId,
        hostname: data.hostname || '',
        url: data.url || '/openfeeder',
        name: 'openfeeder_request',
        data: {
          bot_name: data.botName || 'unknown',
          bot_family: data.botFamily || 'unknown',
          endpoint: data.endpoint || '',
          query: data.query || '',
          intent: data.intent || '',
          results: data.results || 0,
          cached: data.cached || false,
          response_ms: data.responseMs || 0,
        },
      },
    };
    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

    const response = await fetch(`${this.url}/api/send`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    // Don't need to read the body
    if (response.body) response.body.cancel().catch(() => {});
  }

  /** @private */
  async _sendGa4(data) {
    if (!this.apiKey) return;
    const payload = {
      client_id: data.botName || 'bot',
      events: [
        {
          name: 'openfeeder_request',
          params: {
            bot_name: data.botName || 'unknown',
            bot_family: data.botFamily || 'unknown',
            endpoint: data.endpoint || '',
            search_term: data.query || '',
            results: data.results || 0,
          },
        },
      ],
    };
    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${this.siteId}&api_secret=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (response.body) response.body.cancel().catch(() => {});
  }
}

module.exports = { detectBot, Analytics };
