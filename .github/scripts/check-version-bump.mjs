#!/usr/bin/env node
/**
 * Fails a PR that changes what users receive without moving the version.
 *
 * Claude Code decides whether to re-download a plugin by comparing the version
 * string in plugin.json against the copy a user already has — content changes
 * are invisible to it. So a merged skill sitting under a version that did not
 * move simply never reaches anyone, and reports success while doing it.
 *
 * Two rules follow, because the comparison is for inequality rather than order,
 * and whatever was cached under a version string is what gets served:
 * versions only go up, and a version string is never reused.
 */
import { execFileSync } from 'node:child_process';

const [base, head] = process.argv.slice(2);
if (!base || !head) {
  console.error('Usage: check-version-bump.mjs <base-sha> <head-sha>');
  process.exit(1);
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

/** Paths that do not reach a user's installed copy. */
const NOT_SHIPPED = [
  /^\.github\//,
  /^\.githooks\//,
  /^tests\//,
  /^evals\//,
  /^docs\//,
  /^\.gitignore$/,
  /^README\.md$/,
];

const changed = git('diff', '--name-only', `${base}...${head}`)
  .split('\n')
  .filter(Boolean)
  .filter((path) => !NOT_SHIPPED.some((pattern) => pattern.test(path)));

if (changed.length === 0) {
  console.log('No shipped files changed; no version bump needed.');
  process.exit(0);
}

const versionAt = (ref) => {
  try {
    return JSON.parse(git('show', `${ref}:.claude-plugin/plugin.json`)).version ?? null;
  } catch {
    return null;
  }
};

const before = versionAt(base);
const after = versionAt(head);

const rank = (version) => (version ?? '0.0.0').split('.').map(Number);
const ordered = (a, b) => {
  const [x, y] = [rank(a), rank(b)];
  for (let i = 0; i < 3; i++) {
    if (y[i] !== x[i]) return y[i] > x[i];
  }
  return false;
};

if (before === null || !ordered(before, after)) {
  console.error(
    `These files change what users receive:\n${changed.map((p) => `  ${p}`).join('\n')}\n\n` +
      `plugin.json version is ${after} and was ${before} on the base branch. Bump it — a change\n` +
      'merged under an unchanged version is never downloaded, and Claude Code reports the stale\n' +
      'copy as already up to date. Versions only go up, and a version string is never reused.',
  );
  process.exit(1);
}

console.log(`Version moved ${before} → ${after} for ${changed.length} shipped file(s).`);
