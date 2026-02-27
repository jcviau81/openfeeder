/**
 * Tests for the analytics module (unit only, no network calls).
 *
 * Run with: node adapters/express/tests/test-analytics.js
 * No external dependencies required — uses Node.js built-in assert.
 */

'use strict';

const assert = require('assert');
const path = require('path');

const { detectBot, Analytics } = require(path.join(__dirname, '../src/analytics'));

// ---------------------------------------------------------------------------
// Simple test runner
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function check(condition, label) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    failed++;
  }
}

function section(title) {
  console.log(`\nUnit: ${title}`);
}

// ---------------------------------------------------------------------------
// Tests — detectBot
// ---------------------------------------------------------------------------

section('detectBot — known bots');

const openai = detectBot('Mozilla/5.0 (compatible; GPTBot/1.0)');
check(openai.botName === 'GPTBot', 'GPTBot detected by name');
check(openai.botFamily === 'openai', 'GPTBot family is openai');

const chatgpt = detectBot('ChatGPT-User/1.0');
check(chatgpt.botName === 'ChatGPT-User', 'ChatGPT-User detected');
check(chatgpt.botFamily === 'openai', 'ChatGPT-User family is openai');

const claude = detectBot('ClaudeBot/1.0');
check(claude.botName === 'ClaudeBot', 'ClaudeBot detected');
check(claude.botFamily === 'anthropic', 'ClaudeBot family is anthropic');

const anthropic = detectBot('anthropic-ai crawler');
check(anthropic.botName === 'anthropic-ai', 'anthropic-ai detected');
check(anthropic.botFamily === 'anthropic', 'anthropic-ai family is anthropic');

const perplexity = detectBot('PerplexityBot/1.0');
check(perplexity.botName === 'PerplexityBot', 'PerplexityBot detected');
check(perplexity.botFamily === 'perplexity', 'PerplexityBot family is perplexity');

const googleExt = detectBot('Google-Extended');
check(googleExt.botName === 'Google-Extended', 'Google-Extended detected');
check(googleExt.botFamily === 'google', 'Google-Extended family is google');

const googlebot = detectBot('Googlebot/2.1');
check(googlebot.botName === 'Googlebot', 'Googlebot detected');
check(googlebot.botFamily === 'google', 'Googlebot family is google');

const ccbot = detectBot('CCBot/2.0');
check(ccbot.botName === 'CCBot', 'CCBot detected');
check(ccbot.botFamily === 'common-crawl', 'CCBot family is common-crawl');

const cohere = detectBot('cohere-ai');
check(cohere.botName === 'cohere-ai', 'cohere-ai detected');
check(cohere.botFamily === 'cohere', 'cohere-ai family is cohere');

const meta = detectBot('FacebookBot/1.0');
check(meta.botName === 'FacebookBot', 'FacebookBot detected');
check(meta.botFamily === 'meta', 'FacebookBot family is meta');

const amazon = detectBot('Amazonbot/0.1');
check(amazon.botName === 'Amazonbot', 'Amazonbot detected');
check(amazon.botFamily === 'amazon', 'Amazonbot family is amazon');

const you = detectBot('YouBot/1.0');
check(you.botName === 'YouBot', 'YouBot detected');
check(you.botFamily === 'you', 'YouBot family is you');

const bytedance = detectBot('Bytespider');
check(bytedance.botName === 'Bytespider', 'Bytespider detected');
check(bytedance.botFamily === 'bytedance', 'Bytespider family is bytedance');

section('detectBot — case-insensitive matching');

const lowerCase = detectBot('mozilla/5.0 gptbot/1.0');
check(lowerCase.botName === 'GPTBot', 'case-insensitive match works');
check(lowerCase.botFamily === 'openai', 'case-insensitive family correct');

section('detectBot — empty / null user-agent');

const empty = detectBot('');
check(empty.botName === 'unknown', 'empty UA → botName unknown');
check(empty.botFamily === 'unknown', 'empty UA → botFamily unknown');

const nullUa = detectBot(null);
check(nullUa.botName === 'unknown', 'null UA → botName unknown');
check(nullUa.botFamily === 'unknown', 'null UA → botFamily unknown');

const undefinedUa = detectBot(undefined);
check(undefinedUa.botName === 'unknown', 'undefined UA → botName unknown');
check(undefinedUa.botFamily === 'unknown', 'undefined UA → botFamily unknown');

section('detectBot — human user-agent');

const human = detectBot('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
check(human.botName === 'human-or-unknown', 'human UA → botName human-or-unknown');
check(human.botFamily === 'unknown', 'human UA → botFamily unknown');

// ---------------------------------------------------------------------------
// Tests — Analytics constructor
// ---------------------------------------------------------------------------

section('Analytics — constructor defaults');

const defaultAnalytics = new Analytics();
check(defaultAnalytics.provider === 'none', 'default provider is none');
check(defaultAnalytics.url === '', 'default url is empty');
check(defaultAnalytics.siteId === '', 'default siteId is empty');
check(defaultAnalytics.apiKey === '', 'default apiKey is empty');
check(defaultAnalytics.enabled === false, 'default instance is disabled');

section('Analytics — enabled calculation');

const umamiEnabled = new Analytics({
  provider: 'umami',
  url: 'https://analytics.example.com',
  siteId: 'site-123',
  apiKey: 'key-456',
});
check(umamiEnabled.enabled === true, 'umami with url + siteId is enabled');
check(umamiEnabled.provider === 'umami', 'provider stored correctly');
check(umamiEnabled.url === 'https://analytics.example.com', 'url stored correctly');
check(umamiEnabled.siteId === 'site-123', 'siteId stored correctly');

const ga4Enabled = new Analytics({
  provider: 'ga4',
  url: 'https://ga.example.com',
  siteId: 'GA-12345',
  apiKey: 'secret',
});
check(ga4Enabled.enabled === true, 'ga4 with url + siteId is enabled');

// Missing url → disabled
const noUrl = new Analytics({ provider: 'umami', siteId: 'site-1' });
check(noUrl.enabled === false, 'missing url → disabled');

// Missing siteId → disabled
const noSite = new Analytics({ provider: 'umami', url: 'https://x.com' });
check(noSite.enabled === false, 'missing siteId → disabled');

// Provider is 'none' → disabled even with url and siteId
const noneProvider = new Analytics({
  provider: 'none',
  url: 'https://x.com',
  siteId: 'site-1',
});
check(noneProvider.enabled === false, 'provider=none → disabled');

section('Analytics — URL trailing slash stripping');

const trailingSlash = new Analytics({
  provider: 'umami',
  url: 'https://analytics.example.com///',
  siteId: 'site-1',
});
check(trailingSlash.url === 'https://analytics.example.com', 'trailing slashes stripped');

section('Analytics — disabled mode skips tracking');

const disabled = new Analytics(); // provider=none, not enabled
let trackCalled = false;

// Monkey-patch _send to verify it's NOT called
const origSend = disabled._send;
disabled._send = async () => { trackCalled = true; };

disabled.track({ hostname: 'test.com', url: '/test' });

// Give setImmediate a chance to fire (it won't, since enabled=false)
setTimeout(() => {
  check(trackCalled === false, 'disabled analytics does not call _send');

  section('Analytics — enabled mode calls track');

  const enabled = new Analytics({
    provider: 'umami',
    url: 'https://analytics.example.com',
    siteId: 'site-123',
  });

  let sendCalled = false;
  let sentData = null;
  // Mock _send to avoid actual HTTP calls
  enabled._send = async (data) => {
    sendCalled = true;
    sentData = data;
  };

  enabled.track({ hostname: 'test.com', url: '/openfeeder', botName: 'GPTBot' });

  // setImmediate fires after the current microtask queue
  setImmediate(() => {
    check(sendCalled === true, 'enabled analytics calls _send via track()');
    check(sentData.hostname === 'test.com', 'event data passed to _send');
    check(sentData.botName === 'GPTBot', 'bot name in event data');

    section('Analytics — track swallows errors');

    const errAnalytics = new Analytics({
      provider: 'umami',
      url: 'https://analytics.example.com',
      siteId: 'site-123',
    });
    errAnalytics._send = async () => { throw new Error('network failure'); };

    // Should not throw
    errAnalytics.track({ hostname: 'test.com' });

    setImmediate(() => {
      check(true, 'track() does not throw on _send error');

      // ---------------------------------------------------------------------------
      // Summary
      // ---------------------------------------------------------------------------
      console.log('\n' + '='.repeat(55));
      console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
      if (failed > 0) process.exit(1);
    });
  });
}, 50);
