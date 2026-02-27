/**
 * OpenFeeder Express Adapter — Discovery handler
 *
 * Responds to GET /.well-known/openfeeder.json with the discovery document.
 */

'use strict';

const { makeEtag } = require('../etag');

const HEADERS = {
  'Content-Type': 'application/json',
  'X-OpenFeeder': '1.0',
  'Access-Control-Allow-Origin': '*',
};

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {object} config
 */
function handleDiscovery(req, res, config) {
  const body = {
    version: '1.0',
    site: {
      name: config.siteName,
      url: config.siteUrl,
      language: config.language || 'en',
      description: config.siteDescription || '',
    },
    feed: {
      endpoint: '/openfeeder',
      type: 'paginated',
    },
    capabilities: ['search', 'diff-sync'],
    contact: null,
  };

  const etag = makeEtag(body);
  // Discovery document is static per deployment; use today (UTC) as Last-Modified
  const lastMod = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').toUTCString();

  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }

  res.set({
    ...HEADERS,
    'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
    'ETag': etag,
    'Last-Modified': lastMod,
    'Vary': 'Accept-Encoding',
  }).status(200).json(body);
}

module.exports = { handleDiscovery };
