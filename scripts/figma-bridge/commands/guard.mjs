/**
 * The hook entry points. An instruction is a request; a hook is enforcement.
 *
 * Both guards are silent on success and silent in a repo that has no `figma-bridge.json` — the
 * plugin is installed globally, so most repos a session runs in are none of its business.
 *
 *   --pre-write   PreToolUse on the Figma write tools: denies a write to any file but the target.
 *   --post-write  PostToolUse on Write|Edit: runs the audit the touched path implicates.
 */
import { readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { findConfig, loadConfig } from '../lib/config.mjs';
import auditCoverage from './audit-coverage.mjs';
import auditHardcodedValues from './audit-hardcoded-values.mjs';
import auditSnippets from './audit-snippets.mjs';

function payload() {
  try {
    return JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

function deny(reason) {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    })}\n`,
  );
  return 0;
}

/**
 * Fails closed in every direction once a config exists: a call with no `fileKey` is denied, and
 * so is one made when the config cannot be read — otherwise an unreadable config would compare
 * `"" === ""` and let anything through.
 */
function preWrite(input) {
  if (!findConfig()) return 0;

  let config;
  try {
    config = loadConfig();
  } catch (error) {
    return deny(
      `Cannot read the Figma Bridge config, so the allowed Figma file is unknown, and the write is refused.\n${error.message}`,
    );
  }

  const requested = input?.tool_input?.fileKey ?? '';
  if (requested === config.figma.fileKey) return 0;

  return deny(
    `Figma writes from this repo are restricted to ${config.figma.fileKey} ` +
      `(${config.figma.fileName}, set in ${config.$path}). Refused fileKey: ${requested || 'none'}.`,
  );
}

function under(root, path) {
  const rel = relative(root, path);
  return rel !== '' && !rel.startsWith('..') && !rel.startsWith(`..${sep}`);
}

/**
 * Reports a violation the moment the file is written rather than at some later gate. The audits
 * print to stderr and the exit code is 2, which is what feeds their message back to the agent.
 */
function postWrite(input) {
  const written = input?.tool_input?.file_path;
  if (!written) return 0;
  const found = findConfig(resolve(written, '..'));
  if (!found) return 0;

  const config = loadConfig({ from: found.root });
  const path = relative(config.$root, resolve(written)).split(sep).join('/');

  const inDesignSystem = config.designSystem.roots.some((root) => under(root, path));
  const isMapping = path.endsWith(config.designSystem.mappingSuffix);
  if (!inDesignSystem && !isMapping) return 0;

  const audits = [];
  if (inDesignSystem) audits.push(auditCoverage, auditHardcodedValues);
  if (isMapping) audits.push(auditSnippets);

  const log = console.info;
  console.info = () => {};
  let failed = false;
  try {
    for (const audit of audits) if (audit(config) !== 0) failed = true;
  } finally {
    console.info = log;
  }
  return failed ? 2 : 0;
}

export default function main(_config, argv) {
  const input = payload();
  if (argv.includes('--pre-write')) return preWrite(input);
  if (argv.includes('--post-write')) return postWrite(input);
  console.error('Usage: figma-bridge guard --pre-write | --post-write   (hook payload on stdin)');
  return 1;
}
