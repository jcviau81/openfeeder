/**
 * OpenFeeder Express Adapter — Discovery handler
 *
 * Responds to GET /.well-known/openfeeder.json with the discovery document.
 */

'use strict';

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
    capabilities: ['search'],
    contact: null,
  };

  res.set(HEADERS).status(200).json(body);
}

module.exports = { handleDiscovery };
