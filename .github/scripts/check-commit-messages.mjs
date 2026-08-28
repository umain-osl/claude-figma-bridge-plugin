#!/usr/bin/env node
/**
 * Fails a pull request whose commits — or whose title — are not Conventional
 * Commits.
 *
 * The commit log is the only changelog this repo has: `version` in plugin.json
 * says *that* something changed, and the log is what says *what*. That only
 * holds while the subjects are machine-readable, so it is enforced rather than
 * asked for.
 *
 * Both the commits and the PR title are checked, because either can become the
 * commit that lands: a merge commit keeps the individual subjects, a squash
 * merge uses the PR title.
 *
 *   check-commit-messages.mjs <base-sha> <head-sha>   # a PR range, plus $PR_TITLE
 *   check-commit-messages.mjs --file <path>           # one message (local hook)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
  'revert',
];

const HEADER = new RegExp(`^(${TYPES.join('|')})(\\([a-z0-9][a-z0-9._/-]*\\))?(!)?: (.+)$`);
const MAX_HEADER = 72;

/** A merge commit's subject is written by git, not by a person. */
const isMerge = (subject) => /^Merge (pull request|branch|remote-tracking branch) /.test(subject);

function problemsWith(message) {
  const lines = message.replace(/\r/g, '').split('\n');
  const subject = lines[0] ?? '';
  const problems = [];

  if (isMerge(subject)) return problems;

  const match = HEADER.exec(subject);
  if (!match) {
    problems.push(
      'subject is not "type(scope): description" with a known type\n' +
        `      types: ${TYPES.join(', ')}`,
    );
  } else {
    const description = match[4];
    if (description.endsWith('.')) problems.push('subject ends with a full stop');
    if (/^[A-Z][a-z]/.test(description)) {
      problems.push('subject starts with a capital — lowercase unless it is a proper noun');
    }
    if (subject.length > MAX_HEADER) {
      problems.push(`subject is ${subject.length} characters; keep it to ${MAX_HEADER}`);
    }
  }

  // A body glued to the subject renders as one paragraph everywhere git output is
  // read, so the blank line is part of the format rather than a nicety.
  if (lines.length > 1 && lines[1].trim() !== '') {
    problems.push('no blank line between the subject and the body');
  }

  return problems;
}

const EXAMPLES = [
  'feat(skills): add a token-map generator',
  'fix: keep the write guard silent in an unconfigured repo',
  'docs: explain why the checks carry no dependencies',
  'refactor(scripts)!: rename figma-bridge.json to bridge.json',
];

function report(failures) {
  if (failures.length === 0) return 0;
  console.error('Conventional Commits violations:\n');
  for (const { label, problems } of failures) {
    console.error(`  ${label}`);
    for (const problem of problems) console.error(`    - ${problem}`);
    console.error('');
  }
  console.error('Examples that pass:\n');
  for (const example of EXAMPLES) console.error(`  ${example}`);
  return 1;
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const [first, second] = process.argv.slice(2);

if (first === '--file') {
  const message = readFileSync(second, 'utf8');
  const problems = problemsWith(message);
  process.exit(report(problems.length > 0 ? [{ label: message.split('\n')[0], problems }] : []));
}

if (!first || !second) {
  console.error('Usage: check-commit-messages.mjs <base-sha> <head-sha> | --file <path>');
  process.exit(1);
}

// One `git show` per commit rather than one `git log` with a separator: a commit
// body can contain any text, so there is no separator that is safe to split on.
const shas = git('rev-list', '--reverse', `${first}..${second}`).split('\n').filter(Boolean);
const failures = [];

for (const sha of shas) {
  const message = git('show', '-s', '--format=%B', sha).trim();
  const problems = problemsWith(message);
  if (problems.length > 0) {
    failures.push({ label: `${sha.slice(0, 7)}  ${message.split('\n')[0]}`, problems });
  }
}

// Empty when run outside a pull request; nothing to check then.
const title = process.env.PR_TITLE?.trim();
if (title) {
  const problems = problemsWith(title);
  if (problems.length > 0) failures.push({ label: `PR title: ${title}`, problems });
}

if (failures.length === 0) {
  console.log(`${shas.length} commit(s) and the PR title follow Conventional Commits.`);
}

process.exit(report(failures));
