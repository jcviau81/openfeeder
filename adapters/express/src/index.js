/**
 * OpenFeeder Express Adapter
 *
 * Creates Express middleware that serves the OpenFeeder protocol endpoints:
 *   GET /.well-known/openfeeder.json  → discovery document
 *   GET /openfeeder                   → paginated index / single page / search
 *
 * Usage:
 *   const { openFeederMiddleware } = require('openfeeder-express');
 *   app.use(openFeederMiddleware({
 *     siteName: 'My Blog',
 *     siteUrl: 'https://myblog.com',
 *     getItems: async (page, limit) => ({ items: [...], total: 42 }),
 *     getItem: async (url) => ({ title: '...', content: '<p>...</p>', published: '...', url: '...' }) // or null
 *   }));
 */

'use strict';

const { handleDiscovery } = require('./handlers/discovery');
const { handleContent } = require('./handlers/content');
const { createGatewayMiddleware } = require('./gateway');

/**
 * @typedef {Object} OpenFeederConfig
 * @property {string} siteName - Display name of the site
 * @property {string} siteUrl - Canonical URL of the site (e.g. "https://myblog.com")
 * @property {string} [language] - BCP-47 language tag (default: "en")
 * @property {string} [siteDescription] - Brief description of the site
 * @property {function(number, number): Promise<{items: OpenFeederRawItem[], total: number}>} getItems
 *   - Returns a page of items. Receives (page, limit).
 * @property {function(string): Promise<OpenFeederRawItem|null>} getItem
 *   - Returns a single item by URL pathname, or null if not found.
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

  return function openfeeder(req, res, next) {
    const pathname = (req.path || '/').split('?')[0];

    if (pathname === '/.well-known/openfeeder.json') {
      return handleDiscovery(req, res, config);
    }

    if (pathname === '/openfeeder') {
      return handleContent(req, res, config);
    }

    // LLM Gateway: intercept AI bots on non-OpenFeeder pages
    if (gateway) {
      return gateway(req, res, next);
    }

    return next();
  };
}

module.exports = { openFeederMiddleware };
