// Contracts check: tests/fixtures/scoring.json parses + docs/SCORING.md
// criteria order matches fixture order. No secrets, no network.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = join(root, 'tests/fixtures/scoring.json');
const scoringMdPath = join(root, 'docs/SCORING.md');

let fail = (msg) => {
  console.error(`contracts-check FAILED: ${msg}`);
  process.exitCode = 1;
};

// 1. Fixture parses + has 10-key criteriaOrder.
let fixture;
try {
  fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  console.log(`parsed ${fixturePath}`);
} catch (e) {
  fail(`${fixturePath} does not parse: ${e.message}`);
  process.exit(1);
}
const order = fixture.criteriaOrder;
if (!Array.isArray(order) || order.length !== 10) {
  fail(`criteriaOrder must be an array of 10 keys, got: ${JSON.stringify(order)}`);
  process.exit(1);
}
console.log(`fixture criteriaOrder (${order.length}): ${order.join(', ')}`);

// 2. SCORING.md table order matches fixture order.
const md = readFileSync(scoringMdPath, 'utf8');
// Match rows like: | 1 | `preparation` | Preparation |
const rowRe = /^\|\s*\d+\s*\|\s*`([a-z_]+)`\s*\|/gm;
const mdKeys = [...md.matchAll(rowRe)].map((m) => m[1]);
console.log(`SCORING.md criteria order (${mdKeys.length}): ${mdKeys.join(', ')}`);

if (mdKeys.length !== 10) {
  fail(`docs/SCORING.md must list exactly 10 criteria rows, found ${mdKeys.length}`);
} else {
  const mismatch = mdKeys.findIndex((k, i) => k !== order[i]);
  if (mismatch !== -1) {
    fail(
      `order mismatch at position ${mismatch + 1}: fixture=${order[mismatch]} vs SCORING.md=${mdKeys[mismatch]}`
    );
  }
}

// 3. Frozen-key guard: `sound` must be present and must NOT be renamed to vocal delivery.
if (!order.includes('sound')) fail('fixture criteriaOrder missing frozen key `sound`');
if (!mdKeys.includes('sound')) fail('docs/SCORING.md missing frozen key `sound`');
if (/vocal.?delivery/i.test(md) && !/NOT Vocal Delivery/.test(md)) {
  fail('docs/SCORING.md appears to rename Sound to Vocal Delivery (frozen label is `Sound`)');
}

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log('contracts-check OK: scoring.json parses + SCORING.md order matches fixture order');
