#!/usr/bin/env node
/**
 * Fails when a design system component writes a colour down instead of binding a
 * token.
 *
 * The token map is the only sanctioned route from a Figma variable to code, and
 * until now it was a document rather than a gate — which meant the weakest link
 * in the whole correspondence was the easiest one to cross. A hardcoded colour
 * is a value no Figma variable governs: change the token and this component
 * quietly keeps the old one.
 *
 * Only colours, deliberately. A raw number in a layout is ambiguous — plenty of
 * them are not spacing at all — and a check that cries wolf gets switched off,
 * taking the colours with it.
 */
import { readFileSync } from 'node:fs';
import { componentFiles, matchesAnyPattern } from '../lib/files.mjs';

/** #rgb, #rgba, #rrggbb, #rrggbbaa — and nothing else that starts with a hash. */
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const HEX_LENGTHS = new Set([3, 4, 6, 8]);

/** rgb() rgba() hsl() hsla(), however they are spaced. */
const COLOR_FUNCTION = /\b(rgba?|hsla?)\s*\(/g;

/**
 * A value written in a comment is documentation, not a value the component
 * renders — often the very thing being explained.
 */
const isComment = (line) => {
  const trimmed = line.trimStart();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
};

function findingsIn(path) {
  const findings = [];
  const lines = readFileSync(path, 'utf8').split('\n');

  lines.forEach((line, index) => {
    if (isComment(line)) return;

    for (const match of line.matchAll(HEX)) {
      if (!HEX_LENGTHS.has(match[0].length - 1)) continue;
      findings.push({ path, line: index + 1, literal: match[0], source: line.trim() });
    }
    for (const match of line.matchAll(COLOR_FUNCTION)) {
      findings.push({ path, line: index + 1, literal: `${match[1]}(…)`, source: line.trim() });
    }
  });

  return findings;
}

export default function main(config) {
  const allowed = config.tokens?.allowLiteralsIn ?? [];
  const scanned = componentFiles(config).filter((path) => !matchesAnyPattern(path, allowed));
  const findings = scanned.flatMap(findingsIn);

  if (findings.length === 0) {
    console.info(
      `No hardcoded colours in ${scanned.length} component source(s)` +
        (allowed.length > 0 ? ` (${allowed.length} path pattern(s) allowed).` : '.'),
    );
    return 0;
  }

  console.error('\nColours written down instead of bound to a token:\n');
  for (const finding of findings) {
    console.error(`  ${finding.path}:${finding.line}  ${finding.literal}`);
    console.error(`    ${finding.source}`);
  }
  console.error(
    `\n${findings.length} literal(s). Each one is a value no Figma variable governs: change the\n` +
      'token and these keep the old colour. Take the value from the project\'s tokens instead —\n' +
      `${config.paths.tokenMap ?? 'the token map'} is the correspondence to use.\n\n` +
      'If this file is where the palette itself is defined, add it to tokens.allowLiteralsIn in\n' +
      `${config.$path}. That is the only reason to allow one.\n`,
  );
  return 1;
}
