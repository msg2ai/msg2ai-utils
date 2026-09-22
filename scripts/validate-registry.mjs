#!/usr/bin/env node
/**
 * Validates every registry/server.*.json against the MCP Registry schema it
 * declares, and cross-checks it against the npm package it names.
 *
 * This exists because the manifests were written once, by hand, against a
 * schema version that was already stale — and nothing would have said so until
 * a submission was rejected. Run it whenever the manifests or the package
 * versions change:
 *
 *   npm run validate:registry
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = join(ROOT, 'registry');

/** Exactly one slash: namespace, then server name. */
const NAME = /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/;
/** The registry rejects ranges — a manifest names one version, not a set. */
const RANGE = /^[\^~><=]|[x*]$/;

const problems = [];
const seenNamespaces = new Set();
let checked = 0;

const files = readdirSync(REGISTRY).filter(
  (f) => f.startsWith('server.') && f.endsWith('.json')
);
if (!files.length) problems.push('registry/: no server.*.json manifests found');

for (const file of files) {
  const where = `registry/${file}`;
  const doc = JSON.parse(readFileSync(join(REGISTRY, file), 'utf8'));
  checked += 1;

  for (const field of ['name', 'description', 'version', '$schema']) {
    if (!doc[field]) problems.push(`${where}: missing "${field}"`);
  }

  if (doc.name && !NAME.test(doc.name)) {
    problems.push(`${where}: name "${doc.name}" is not <namespace>/<server>`);
  }
  if (doc.name) seenNamespaces.add(doc.name.split('/')[0]);

  // 100 is the schema's limit. Exceeding it is rejected at submission, which
  // is a slow way to find out.
  for (const [field, max] of [
    ['description', 100],
    ['title', 100],
    ['name', 200]
  ]) {
    if (doc[field] && doc[field].length > max) {
      problems.push(
        `${where}: ${field} is ${doc[field].length} chars, max ${max}`
      );
    }
  }

  if (doc.version && RANGE.test(doc.version)) {
    problems.push(`${where}: version "${doc.version}" looks like a range`);
  }

  for (const pkg of doc.packages ?? []) {
    for (const field of ['registryType', 'identifier', 'transport']) {
      if (!pkg[field]) problems.push(`${where}: package missing "${field}"`);
    }

    // The manifest, the package reference and package.json must agree. Three
    // places to state one version is three places to drift.
    const slug = pkg.identifier?.split('/').pop();
    let manifest;
    try {
      manifest = JSON.parse(
        readFileSync(join(ROOT, 'packages', slug, 'package.json'), 'utf8')
      );
    } catch {
      problems.push(`${where}: no packages/${slug}/package.json for ${pkg.identifier}`);
      continue;
    }
    if (manifest.name !== pkg.identifier) {
      problems.push(
        `${where}: identifier ${pkg.identifier} but package.json is ${manifest.name}`
      );
    }
    if (manifest.version !== doc.version || pkg.version !== doc.version) {
      problems.push(
        `${where}: version drift — manifest ${doc.version}, package ref ${pkg.version}, npm ${manifest.version}`
      );
    }
    if (doc.repository?.subfolder && doc.repository.subfolder !== `packages/${slug}`) {
      problems.push(
        `${where}: subfolder ${doc.repository.subfolder} does not match packages/${slug}`
      );
    }
  }
}

// One namespace per repo. Two means half the servers prove ownership from a
// domain the other half cannot.
if (seenNamespaces.size > 1) {
  problems.push(
    `registry/: mixed namespaces — ${[...seenNamespaces].join(', ')}`
  );
}

if (problems.length) {
  for (const problem of problems) console.error(`✗ ${problem}`);
  console.error(`\n✗ ${problems.length} problem(s) in ${checked} manifest(s).`);
  process.exit(1);
}

const namespace = [...seenNamespaces][0];
const domain = namespace.split('.').reverse().join('.');
console.log(`✓ ${checked} manifest(s) valid.`);
console.log(`  namespace ${namespace}/* — proved by a TXT record on ${domain}`);
