/**
 * OpenFeeder Express Adapter
 *
 * Creates Express middleware that serves the OpenFeeder protocol endpoints:
 *   GET /.well-known/openfeeder.json  → discovery document (always public)
 *   GET /openfeeder                   → paginated index / single page / search
 *                                       (requires Authorization: Bearer <apiKey> if config.apiKey is set)
 *
 * Usage:
 *   const { openFeederMiddleware } = require('openfeeder-express');
 *   app.use(openFeederMiddleware({
 *     siteName: 'My Blog',
 *     siteUrl: 'https://myblog.com',
 *     getItems: async (page, limit) => ({ items: [...], total: 42 }),
 *     getItem: async (url) => ({ title: '...', content: '<p>...</p>', published: '...', url: '...' }) // or null
 *     // apiKey: 'my-secret-key',  // optional: require Authorization: Bearer <apiKey> on /openfeeder
 *   }));
 */

'use strict';

const crypto = require('crypto');
const { handleDiscovery } = require('./handlers/discovery');
const { handleContent } = require('./handlers/content');
const { createGatewayMiddleware } = require('./gateway');
const { detectBot, Analytics } = require('./analytics');

/**
 * @typedef {Object} OpenFeederConfig
 * @property {string} siteName - Display name of the site
 * @property {string} siteUrl - Canonical URL of the site (e.g. "https://myblog.com")
 * @property {string} [language] - BCP-47 language tag (default: "en")
 * @property {string} [siteDescription] - Brief description of the site
 * @property {string} [apiKey] - Optional. If set, all /openfeeder requests must include Authorization: Bearer <apiKey>
 * @property {string[]} [excludePaths] - Optional. Path prefixes to exclude from content listing (e.g. ["/checkout", "/cart", "/my-account"])
 * @property {{ provider?: string, url?: string, siteId?: string, apiKey?: string }} [analytics] - Optional. Analytics config (Umami | GA4 | none)
 * @property {function(number, number): Promise<{items: OpenFeederRawItem[], total: number}>} getItems
 *   - Returns a page of items. Receives (page, limit).
 *   - IMPORTANT: getItems should NEVER return private, internal, or user-specific data.
 *   - Only return published, public content suitable for LLM consumption.
 * @property {function(string): Promise<OpenFeederRawItem|null>} getItem
 *   - Returns a single item by URL pathname, or null if not found.
 *   - IMPORTANT: getItem should NEVER return private, internal, or user-specific data.
 */

/**
 * @typedef {Object} OpenFeederRawItem
 * @property {string} url - Pathname (e.g. "/my-post")
 * @property {string} title
 * @property {string} content - HTML or plain text content
 * @property {string} published - ISO 8601 date string
 */

/**
 * Create an Express middleware that serves OpenFeeder protocol endpoints.
 *
 * @param {OpenFeederConfig} config
 * @returns {import('express').RequestHandler}
 */
function openFeederMiddleware(config) {
  if (!config || !config.siteName || !config.siteUrl) {
    throw new Error('[openfeeder] openFeederMiddleware requires siteName and siteUrl in config.');
  }
  if (typeof config.getItems !== 'function' || typeof config.getItem !== 'function') {
    throw new Error('[openfeeder] openFeederMiddleware requires getItems and getItem functions in config.');
  }

  const gateway = config.llmGateway ? createGatewayMiddleware(config) : null;
  const analyticsClient = new Analytics(config.analytics || {});

  /**
   * Track an analytics event after response is sent.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {string} endpoint
   * @param {number} startTime
   */
  function trackAfterResponse(req, res, endpoint, startTime) {
    res.on('finish', () => {
      const { botName, botFamily } = detectBot(req.headers['user-agent'] || '');
      const query = req.query && req.query.q ? String(req.query.q) : '';
      analyticsClient.track({
        hostname: config.siteName,
        url: req.originalUrl || req.url,
        botName,
        botFamily,
        endpoint,
        query,
        intent: req.headers['x-openfeeder-intent'] || '',
        results: (res.locals && res.locals.openfeederResults) || 0,
        cached: res.getHeader('x-openfeeder-cache') === 'HIT',
        responseMs: Math.round(Date.now() - startTime),
      });
    });
  }

  return function openfeeder(req, res, next) {
    const pathname = (req.path || '/').split('?')[0];

    // Discovery document is ALWAYS public — no API key required
    if (pathname === '/.well-known/openfeeder.json') {
      trackAfterResponse(req, res, 'discovery', Date.now());
      return handleDiscovery(req, res, config);
    }

    if (pathname === '/openfeeder') {
      // API key check: if config.apiKey is set, require Authorization: Bearer <apiKey>
      if (config.apiKey) {
        const authHeader = req.headers['authorization'] || '';
        const expected = `Bearer ${config.apiKey}`;
        const a = Buffer.from(authHeader);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
          return res
            .set({
              'Content-Type': 'application/json',
              'X-OpenFeeder': '1.0',
              'Access-Control-Allow-Origin': '*',
              'X-RateLimit-Limit': '60',
              'X-RateLimit-Remaining': '60',
              'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 60),
            })
            .status(401)
            .json({
              schema: 'openfeeder/1.0',
              error: {
                code: 'UNAUTHORIZED',
                message: 'Valid API key required. Include Authorization: Bearer <key> header.',
              },
            });
        }
      }

      // Determine endpoint type for analytics
      const q = req.query && req.query.q;
      const url = req.query && req.query.url;
      const since = req.query && req.query.since;
      const until = req.query && req.query.until;
      const endpoint = q ? 'search' : (since || until) ? 'sync' : url ? 'fetch' : 'index';
      trackAfterResponse(req, res, endpoint, Date.now());

      return handleContent(req, res, config);
    }

    // LLM Gateway dialogue respond route (Mode 1 Round 2)
    if (pathname === '/openfeeder/gateway/respond' && req.method === 'POST' && gateway) {
      return gateway._handler.handleDialogueRespond(req, res);
    }

    // LLM Gateway: intercept AI bots on non-OpenFeeder pages
    if (gateway) {
      return gateway(req, res, next);
    }

    return next();
  };
}

module.exports = { openFeederMiddleware };
