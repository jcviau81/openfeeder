'use strict';

const crypto = require('crypto');

/**
 * Compute a quoted MD5 ETag from an arbitrary data object.
 * @param {unknown} data
 * @returns {string}
 */
function makeEtag(data) {
  return '"' + crypto.createHash('md5').update(JSON.stringify(data)).digest('hex').slice(0, 16) + '"';
}

module.exports = { makeEtag };
