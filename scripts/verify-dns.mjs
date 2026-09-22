#!/usr/bin/env node
/**
 * Checks that the MCP namespace proof record is live and well-formed, BEFORE
 * anyone runs `mcp-publisher login dns` and gets an opaque failure.
 *
 *   npm run verify:dns                      # read the live record
 *   npm run verify:dns -- --record "v=..."  # check a value before saving it
 *
 * The second form is the useful one at GoDaddy: paste what you are about to
 * enter and find out it is wrong before it is live, rather than after.
 *
 * The domain is derived from the namespace in registry/*.json, not passed in,
 * so this cannot be run against the wrong zone by accident — which is the
 * mistake worth preventing here, since msg2ai.com and msg2ai.xyz are both ours
 * and only one of them proves `com.msg2ai`.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTxt } from 'node:dns/promises';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = join(ROOT, 'registry');

const namespaces = new Set(
  readdirSync(REGISTRY)
    .filter((f) => f.startsWith('server.') && f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(REGISTRY, f), 'utf8')).name)
    .map((name) => name.split('/')[0])
);

if (namespaces.size !== 1) {
  console.error(`✗ expected one namespace, found: ${[...namespaces].join(', ')}`);
  process.exit(1);
}

const namespace = [...namespaces][0];
const domain = namespace.split('.').reverse().join('.');

console.log(`namespace ${namespace}/*`);
console.log(`domain    ${domain}\n`);

const flag = process.argv.indexOf('--record');
if (flag !== -1) {
  const candidate = process.argv[flag + 1];
  if (!candidate) {
    console.error('✗ --record needs a value');
    process.exit(1);
  }
  process.exit(report(candidate, { live: false }) ? 0 : 1);
}

let records;
try {
  // Each TXT record is an array of strings; a long value is split into
  // 255-byte chunks that have to be joined before matching.
  records = (await resolveTxt(domain)).map((chunks) => chunks.join(''));
} catch (error) {
  console.error(`✗ could not read TXT records for ${domain}: ${error.code ?? error.message}`);
  process.exit(1);
}

const mcp = records.filter((r) => r.startsWith('v=MCPv1'));

if (!mcp.length) {
  console.error(`✗ no v=MCPv1 record on ${domain}.`);
  console.error(`  ${records.length} other TXT record(s) present — leave them alone and ADD one.`);
  process.exit(1);
}
if (mcp.length > 1) {
  console.error(`✗ ${mcp.length} v=MCPv1 records on ${domain}; there must be exactly one.`);
  for (const r of mcp) console.error(`    ${r}`);
  process.exit(1);
}

report(mcp[0], { live: true }) || process.exit(1);

/**
 * Everything that can be wrong with the value itself, as opposed to whether
 * DNS is serving it. Split out so the same checks run against a value that has
 * not been saved yet.
 */
function report(record, { live }) {
  const problems = [];

  // GoDaddy adds the enclosing quotes itself. Pasting them produces a record
  // whose value literally starts with a quote, which never verifies.
  if (record.includes('"')) {
    problems.push('contains a literal " — the quotes were pasted into the value');
  }
  if (record !== record.trim()) {
    problems.push('has leading or trailing whitespace');
  }

  const parts = Object.fromEntries(
    record
      .split(';')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const at = p.indexOf('=');
        return at === -1 ? [p, ''] : [p.slice(0, at).trim(), p.slice(at + 1).trim()];
      })
  );

  if (parts.v !== 'MCPv1') problems.push(`v is "${parts.v}", expected MCPv1`);
  if (!['ed25519', 'ecdsap384'].includes(parts.k)) {
    problems.push(`k is "${parts.k}", expected ed25519 or ecdsap384`);
  }
  if (!parts.p) {
    problems.push('no p= public key');
  } else if (/^-----BEGIN/.test(parts.p) || parts.p.includes('PUBLIC KEY')) {
    problems.push('p is a PEM block — it must be the raw key bytes, base64');
  } else {
    const raw = Buffer.from(parts.p, 'base64');
    const expected = parts.k === 'ecdsap384' ? 49 : 32;
    if (raw.length !== expected) {
      problems.push(
        `p decodes to ${raw.length} bytes, expected ${expected} for ${parts.k || 'ed25519'} — ` +
          'likely the DER header was not stripped (use `tail -c 32`)'
      );
    }
  }

  if (problems.length) {
    console.error(`✗ ${record}\n`);
    for (const problem of problems) console.error(`  ✗ ${problem}`);
    return false;
  }

  console.log(`✓ ${record}`);
  if (live) {
    console.log(`\n  Next: mcp-publisher login dns --domain=${domain} --private-key=<64-hex>`);
  } else {
    console.log('\n  Value is well-formed. Save it at GoDaddy, then: npm run verify:dns');
  }
  return true;
}
