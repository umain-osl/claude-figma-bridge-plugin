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
 * Blanks out comments, keeping the line length so a column still lines up with
 * the source. Block state has to carry across lines: the case that made this
 * necessary was a value quoted from a design inside a `{/* … *\/}` block, where
 * only the opening line looks like a comment.
 *
 * A value written in a comment is documentation — often a note about the very
 * token that replaced it — so flagging it teaches people to delete the
 * explanation.
 */
function stripComments(lines) {
  let inBlock = false;
  return lines.map((line) => {
    let out = '';
    let index = 0;
    while (index < line.length) {
      if (inBlock) {
        const close = line.indexOf('*/', index);
        if (close === -1) {
          out += ' '.repeat(line.length - index);
          index = line.length;
        } else {
          out += ' '.repeat(close + 2 - index);
          index = close + 2;
          inBlock = false;
        }
        continue;
      }
      const open = line.indexOf('/*', index);
      const lineComment = line.indexOf('//', index);
      if (lineComment !== -1 && (open === -1 || lineComment < open)) {
        out += line.slice(index, lineComment) + ' '.repeat(line.length - lineComment);
        index = line.length;
        continue;
      }
      if (open === -1) {
        out += line.slice(index);
        index = line.length;
        continue;
      }
      out += line.slice(index, open);
      index = open;
      inBlock = true;
    }
    return out;
  });
}

function findingsIn(path) {
  const findings = [];
  const source = readFileSync(path, 'utf8').split('\n');
  const code = stripComments(source);

  code.forEach((line, index) => {
    for (const match of line.matchAll(HEX)) {
      if (!HEX_LENGTHS.has(match[0].length - 1)) continue;
      findings.push({ path, line: index + 1, literal: match[0], source: source[index].trim() });
    }
    for (const match of line.matchAll(COLOR_FUNCTION)) {
      findings.push({
        path,
        line: index + 1,
        literal: `${match[1]}(…)`,
        source: source[index].trim(),
      });
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
