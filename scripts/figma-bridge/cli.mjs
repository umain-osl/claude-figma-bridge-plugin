#!/usr/bin/env node
import auditCoverage from './commands/audit-coverage.mjs';
import auditDesignOrphans from './commands/audit-design-orphans.mjs';
import auditHardcodedValues from './commands/audit-hardcoded-values.mjs';
import auditSnippets from './commands/audit-snippets.mjs';
import doctor from './commands/doctor.mjs';
import guard from './commands/guard.mjs';
import retarget from './commands/retarget.mjs';
/**
 * Figma Bridge — the checks that keep a codebase and a Figma library honest about each other.
 *
 * Zero dependencies on purpose. This directory is vendored into a host repo by
 * `/figma-bridge:onboard` so CI can run it, and more than one target repo installs with
 * `--omit=dev`.
 *
 *   figma-bridge check              retarget --check, then every audit
 *   figma-bridge retarget --check   verify every reference names the target file
 *   figma-bridge retarget <key> [n] point the whole repo at another file
 *   figma-bridge audit-coverage     every component mapped, or declared with a reason
 *   figma-bridge audit-design-orphans   every published component mapped, or baselined
 *   figma-bridge audit-hardcoded-values no colour written down instead of bound
 *   figma-bridge audit-snippets     every snippet imports what it renders
 *   figma-bridge doctor             is this repo (and this machine) wired up?
 *   figma-bridge guard --pre-write | --post-write     hook entry points
 */
import { loadConfig, run } from './lib/config.mjs';

const USAGE = `figma-bridge <command>

  check                        retarget --check, then every audit
  retarget --check             verify every reference names the target file
  retarget <fileKey> [name]    point the whole repo at another Figma file
  audit-coverage               every component mapped, or declared with a reason
  audit-design-orphans         every published component mapped, or in the baseline
                               (--write-baseline to accept the current set)
  audit-hardcoded-values       no colour written down instead of bound to a token
  audit-snippets               every snippet imports what it renders
  doctor                       is this repo wired up?
  guard --pre-write            PreToolUse hook: restrict Figma writes to the target file
  guard --post-write           PostToolUse hook: audit the file just written
`;

const [command, ...argv] = process.argv.slice(2);

/** The guards find their own config, and stay silent in a repo that has none. */
if (command === 'guard') process.exit(guard(null, argv));

if (!command || command === '--help' || command === '-h') {
  console.info(USAGE);
  process.exit(command ? 0 : 1);
}

const config = run(() => loadConfig());

const commands = {
  check: () => {
    // Both directions of the correspondence, then the two things that can make a
    // mapping true on paper and wrong in practice.
    const steps = [
      ['Target', () => retarget(config, ['--check'])],
      ['Code with no design', () => auditCoverage(config)],
      ['Design with no code', () => auditDesignOrphans(config)],
      ['Hardcoded values', () => auditHardcodedValues(config)],
      ['Snippet imports', () => auditSnippets(config)],
    ];
    for (const [label, step] of steps) {
      console.info(`\n— ${label}`);
      const code = step();
      if (code !== 0) return code;
    }
    console.info(
      '\nAll checks pass. If you have @figma/code-connect installed, follow this with a\n' +
        '`figma connect publish --dry-run --exit-on-unreadable-files` to parse every template.\n',
    );
    return 0;
  },
  retarget: () => retarget(config, argv),
  'audit-coverage': () => auditCoverage(config),
  'audit-design-orphans': () => auditDesignOrphans(config, argv),
  'audit-hardcoded-values': () => auditHardcodedValues(config),
  'audit-snippets': () => auditSnippets(config),
  doctor: () => doctor(config),
};

const handler = commands[command];
if (!handler) {
  console.error(`Unknown command: ${command}\n\n${USAGE}`);
  process.exit(1);
}

process.exit(run(handler));
