#!/usr/bin/env node
/**
 * The two manifests describe the same plugin, so they must not disagree.
 *
 * `claude plugin tag` makes this check locally; CI has no Claude Code, and the
 * failure it catches — a marketplace entry naming a plugin that isn't there — is
 * only visible to whoever tries to install it.
 */
import { readFileSync } from 'node:fs';

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const plugin = read('.claude-plugin/plugin.json');
const marketplace = read('.claude-plugin/marketplace.json');

const problems = [];
const entry = marketplace.plugins?.find((p) => p.name === plugin.name);

if (!entry) {
  problems.push(
    `marketplace.json has no entry named "${plugin.name}" (found: ` +
      `${(marketplace.plugins ?? []).map((p) => p.name).join(', ') || 'none'})`,
  );
} else {
  if (entry.source !== './') {
    problems.push(`the entry's source is ${JSON.stringify(entry.source)}, expected "./"`);
  }
  // The version lives in plugin.json alone; a second copy is a second thing to forget.
  if (entry.version !== undefined) {
    problems.push('the entry carries a version; keep it in plugin.json only');
  }
}

if (!/^\d+\.\d+\.\d+$/.test(plugin.version ?? '')) {
  problems.push(`plugin.json version ${JSON.stringify(plugin.version)} is not x.y.z`);
}

if (problems.length > 0) {
  console.error('Manifests disagree:');
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(`Manifests agree: ${plugin.name} ${plugin.version}`);
