#!/usr/bin/env node
/**
 * Publishes the workspace to npm, in dependency order.
 *
 * This exists as a script rather than as steps in the workflow so it can be
 * run locally before anyone triggers CI:
 *
 *   node scripts/release.mjs --check 0.1.0
 *   node scripts/release.mjs --publish 0.1.0 --dry-run
 *
 * The root package is `private: true` and has no version, so there is nothing
 * to publish there — only `packages/*` are candidates.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES_DIR = join(ROOT, 'packages');

const args = process.argv.slice(2);
const mode = args.includes('--publish') ? 'publish' : 'check';
const dryRun = args.includes('--dry-run');
const version = args.find((arg) => !arg.startsWith('--'));

if (!version) {
  fail('Usage: release.mjs (--check|--publish) <version> [--dry-run]');
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function readManifest(dir) {
  return JSON.parse(readFileSync(join(PACKAGES_DIR, dir, 'package.json'), 'utf8'));
}

/**
 * npm exits non-zero with E404 when the package has never been published,
 * which is the normal state for a first release — not an error.
 */
function publishedVersions(name) {
  try {
    const out = execFileSync('npm', ['view', name, 'versions', '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const parsed = JSON.parse(out);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (error) {
    const text = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    if (text.includes('E404') || text.includes('404 Not Found')) return [];
    throw new Error(`npm view ${name} failed: ${text.trim()}`);
  }
}


/**
 * Infrastructure detail that must never reach a published tarball. These are
 * not secrets — an App Engine hostname is guessable — but they pin our
 * deployment into an artifact that can never be edited, and they hand a reader
 * the shape of the environments the network allowlist exists to protect.
 */
const FORBIDDEN_IN_ARTIFACT = [
  /appspot\.com/i,
  /googleusercontent\.com/i,
  /\.run\.app/i,
  /msg2ai-server/i,
  /\b(dev|test|prod)-service\b/i,
  /\bue\.r\./i
];

/** Every file `files` would ship, walked the way npm packs it. */
function shippedFiles(dir, manifest) {
  const root = join(PACKAGES_DIR, dir);
  const out = [];
  const walk = (abs, rel) => {
    let entries;
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const childAbs = join(abs, entry.name);
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(childAbs, childRel);
      else out.push({ abs: childAbs, rel: childRel });
    }
  };
  for (const entry of manifest.files ?? []) {
    const abs = join(root, entry);
    if (!existsSync(abs)) continue;
    if (statSync(abs).isDirectory()) walk(abs, entry);
    else out.push({ abs, rel: entry });
  }
  // package.json is always packed, whether or not `files` lists it.
  out.push({ abs: join(root, 'package.json'), rel: 'package.json' });
  return out;
}

function scanArtifact(dir, manifest) {
  const found = [];
  for (const file of shippedFiles(dir, manifest)) {
    let text;
    try {
      text = readFileSync(file.abs, 'utf8');
    } catch {
      continue; // binary or unreadable; nothing to match
    }
    const lines = text.split('\n');
    for (const pattern of FORBIDDEN_IN_ARTIFACT) {
      const index = lines.findIndex((line) => pattern.test(line));
      if (index !== -1) {
        found.push(
          `packages/${dir}/${file.rel}:${index + 1}: would publish ${pattern} ` +
            `— "${lines[index].trim().slice(0, 80)}"`
        );
      }
    }
  }
  return found;
}

// ── Discover, then order by dependency ──────────────────────────────────────

const dirs = readdirSync(PACKAGES_DIR).filter((dir) =>
  existsSync(join(PACKAGES_DIR, dir, 'package.json'))
);

const packages = dirs.map((dir) => ({ dir, manifest: readManifest(dir) }));
const names = new Set(packages.map((pkg) => pkg.manifest.name));

/**
 * Derived rather than hard-coded: an alias added later orders itself. The
 * aliases depend on the toolkit at an exact version, so publishing one before
 * the toolkit exists leaves it uninstallable on npm for as long as it takes to
 * publish the other — and npm forbids re-publishing a version to fix it.
 */
function orderByDependency(list) {
  const remaining = [...list];
  const ordered = [];
  const done = new Set();
  while (remaining.length) {
    const ready = remaining.findIndex((pkg) =>
      Object.keys(pkg.manifest.dependencies ?? {})
        .filter((dep) => names.has(dep))
        .every((dep) => done.has(dep))
    );
    if (ready === -1) {
      fail(
        `Dependency cycle among: ${remaining.map((p) => p.manifest.name).join(', ')}`
      );
    }
    const [next] = remaining.splice(ready, 1);
    done.add(next.manifest.name);
    ordered.push(next);
  }
  return ordered;
}

const ordered = orderByDependency(packages);

// ── Preflight ───────────────────────────────────────────────────────────────

const problems = [];
const publishable = [];

for (const { dir, manifest } of ordered) {
  const where = `packages/${dir}`;
  const label = manifest.name ?? where;

  if (manifest.private === true) {
    console.log(`· ${label} — private, skipping`);
    continue;
  }
  if (!manifest.name?.startsWith('@')) {
    problems.push(`${where}: expected a scoped name, got ${manifest.name}`);
  }
  if (manifest.version !== version) {
    problems.push(
      `${where}: package.json is ${manifest.version} but you asked for ${version}`
    );
  }

  // A scoped package defaults to RESTRICTED. Without this, `npm publish`
  // either fails on a free account or silently publishes something nobody
  // outside the org can install.
  if (manifest.publishConfig?.access !== 'public') {
    problems.push(`${where}: publishConfig.access must be "public"`);
  }

  // `files` is what keeps a stray .env or a local scratch file out of the
  // tarball. npm has no way to unpublish a leak after 72 hours.
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    problems.push(`${where}: no "files" allow-list`);
  }

  // Every workspace dependency must move in lockstep. An alias pinning
  // "0.1.0" while the toolkit publishes 0.2.0 installs a version that does
  // not exist.
  for (const [dep, range] of Object.entries(manifest.dependencies ?? {})) {
    if (names.has(dep) && range !== version) {
      problems.push(
        `${where}: depends on ${dep}@${range}, but this release is ${version}`
      );
    }
  }

  for (const target of Object.values(manifest.bin ?? {})) {
    if (!existsSync(join(PACKAGES_DIR, dir, target))) {
      problems.push(
        `${where}: bin target ${target} does not exist — run the build first`
      );
    }
  }

  // What actually ships is the TARBALL, not the source. A test that asserts on
  // a constant cannot see a comment, and comments are exactly where this kind
  // of detail gets reintroduced — the first version of DEFAULT_BASE_URL's
  // comment explained why not to publish the App Engine hostname by quoting
  // the App Engine hostname, into both dist/client.js and dist/client.d.ts.
  // npm has no unpublish after 72 hours, so this has to fail BEFORE publish.
  for (const leak of scanArtifact(dir, manifest)) problems.push(leak);

  const already = publishedVersions(manifest.name);
  if (already.includes(version)) {
    problems.push(
      `${where}: ${manifest.name}@${version} is already published — npm forbids re-publishing`
    );
  }

  publishable.push({ dir, manifest, isFirstRelease: already.length === 0 });
}

if (problems.length) {
  for (const problem of problems) console.error(`✗ ${problem}`);
  fail(`${problems.length} problem(s); nothing was published.`);
}

if (!publishable.length) fail('No publishable packages found.');

console.log(`\nRelease ${version} — publish order:`);
for (const { manifest, isFirstRelease } of publishable) {
  console.log(`  ${manifest.name}${isFirstRelease ? '  (first release)' : ''}`);
}

const firstReleases = publishable.filter((pkg) => pkg.isFirstRelease);
if (firstReleases.length) {
  console.log(
    `\nNote: ${firstReleases.length} package(s) have never been published.\n` +
      'npm can only accept a trusted publisher on a package that already\n' +
      'exists, so the FIRST publish of each needs NODE_AUTH_TOKEN. Configure\n' +
      'trusted publishing afterwards and the token can be revoked.'
  );
}

if (mode === 'check') {
  console.log('\n✓ Preflight passed. Nothing published (--check).');
  process.exit(0);
}

// ── Publish ─────────────────────────────────────────────────────────────────

for (const { dir, manifest } of publishable) {
  const flags = ['publish', '--provenance', '--access', 'public'];
  if (dryRun) flags.push('--dry-run');
  console.log(`\n→ npm ${flags.join(' ')}  (${manifest.name})`);
  execFileSync('npm', flags, {
    cwd: join(PACKAGES_DIR, dir),
    stdio: 'inherit'
  });
}

console.log(
  `\n✓ ${publishable.length} package(s) ${dryRun ? 'dry-run' : 'published'} at ${version}.`
);
