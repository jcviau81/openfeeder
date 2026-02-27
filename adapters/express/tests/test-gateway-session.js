/**
 * Tests for the GatewaySessionStore.
 *
 * Run with: node adapters/express/tests/test-gateway-session.js
 * No external dependencies required — uses Node.js built-in assert.
 */

'use strict';

const assert = require('assert');
const path = require('path');

const { GatewaySessionStore } = require(path.join(__dirname, '../src/gateway-session'));

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
// Tests
// ---------------------------------------------------------------------------

section('GatewaySessionStore — create() and get()');

const store = new GatewaySessionStore(5000); // 5 second TTL for testing

const data1 = { userId: 'user-1', context: 'test' };
const id1 = store.create(data1);

check(typeof id1 === 'string', 'create() returns a string');
check(id1.startsWith('gw_'), 'session ID starts with gw_ prefix');
check(id1.length === 19, 'session ID is gw_ + 16 hex chars = 19 chars');

const retrieved = store.get(id1);
check(retrieved !== null, 'get() returns data for valid session');
check(retrieved.userId === 'user-1', 'retrieved data matches stored data');
check(retrieved.context === 'test', 'all fields preserved');

section('GatewaySessionStore — get() with non-existent ID');

check(store.get('gw_nonexistent') === null, 'non-existent ID returns null');
check(store.get('') === null, 'empty string returns null');

section('GatewaySessionStore — delete()');

const data2 = { temp: true };
const id2 = store.create(data2);
check(store.get(id2) !== null, 'session exists before delete');

store.delete(id2);
check(store.get(id2) === null, 'session gone after delete');

// delete on non-existent ID should not throw
store.delete('gw_doesnotexist');
check(true, 'delete on non-existent ID does not throw');

section('GatewaySessionStore — multiple sessions do not interfere');

const storeMulti = new GatewaySessionStore(60000);
const idA = storeMulti.create({ name: 'Alice' });
const idB = storeMulti.create({ name: 'Bob' });
const idC = storeMulti.create({ name: 'Charlie' });

check(idA !== idB && idB !== idC, 'all session IDs are unique');
check(storeMulti.get(idA).name === 'Alice', 'session A has correct data');
check(storeMulti.get(idB).name === 'Bob', 'session B has correct data');
check(storeMulti.get(idC).name === 'Charlie', 'session C has correct data');

storeMulti.delete(idB);
check(storeMulti.get(idA).name === 'Alice', 'session A unaffected after deleting B');
check(storeMulti.get(idB) === null, 'session B deleted');
check(storeMulti.get(idC).name === 'Charlie', 'session C unaffected after deleting B');

section('GatewaySessionStore — sessions expire after TTL');

// Use very short TTL
const shortStore = new GatewaySessionStore(50); // 50ms TTL
const idShort = shortStore.create({ ephemeral: true });
check(shortStore.get(idShort) !== null, 'session accessible immediately');

// Wait for expiry
setTimeout(() => {
  check(shortStore.get(idShort) === null, 'session expired after TTL');

  section('GatewaySessionStore — _sweep() removes expired sessions');

  const sweepStore = new GatewaySessionStore(50); // 50ms TTL
  const sw1 = sweepStore.create({ a: 1 });
  const sw2 = sweepStore.create({ b: 2 });

  setTimeout(() => {
    // Create a fresh session after the first two expire
    const sw3 = sweepStore.create({ c: 3 });

    // Run sweep manually
    sweepStore._sweep();

    // Expired sessions should be gone
    check(sweepStore.get(sw1) === null, 'expired session sw1 swept');
    check(sweepStore.get(sw2) === null, 'expired session sw2 swept');
    // Fresh session should survive
    check(sweepStore.get(sw3) !== null, 'fresh session sw3 survives sweep');
    check(sweepStore.get(sw3).c === 3, 'fresh session data intact');

    section('GatewaySessionStore — default TTL');

    const defaultStore = new GatewaySessionStore();
    const idDef = defaultStore.create({ x: 1 });
    check(defaultStore.get(idDef) !== null, 'session works with default TTL');
    check(defaultStore._ttl === 300_000, 'default TTL is 300000ms (5 minutes)');

    // ---------------------------------------------------------------------------
    // Summary
    // ---------------------------------------------------------------------------
    console.log('\n' + '='.repeat(55));
    console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
    if (failed > 0) process.exit(1);
  }, 100);
}, 100);
