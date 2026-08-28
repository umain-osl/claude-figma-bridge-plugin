/**
 * Points the repo at a Figma file, and verifies it is pointed at exactly one.
 *
 * The file key appears in three places that must agree: `figma-bridge.json` (the single source
 * of truth), the `// url=` directive of every Code Connect mapping (the CLI reads it), and the
 * doc-comment links in the component sources (a developer clicks them). Rewriting these by hand
 * means a partial job — and a partial job publishes a mixture, or sends someone to the wrong
 * library.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { FILE_KEY_PATTERN } from '../lib/config.mjs';
import {
  FIGMA_URL_PATTERN,
  fileKeysIn,
  filesReferencingFigma,
  readCacheMeta,
} from '../lib/files.mjs';

function checkOnly(config) {
  const files = filesReferencingFigma(config);
  const byKey = new Map();
  for (const file of files) {
    for (const key of fileKeysIn(readFileSync(file, 'utf8'))) {
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(file);
    }
  }

  console.info(`Target: ${config.figma.fileName} (${config.figma.fileKey})`);
  console.info(`Files naming a Figma file: ${files.length}`);

  const strays = [...byKey.entries()].filter(([key]) => key !== config.figma.fileKey);
  if (strays.length > 0) {
    console.error('\nThese point somewhere other than the target:\n');
    for (const [key, paths] of strays) {
      console.error(`  ${key}`);
      for (const path of [...new Set(paths)]) console.error(`    ${path}`);
    }
    console.error(
      `\nRun \`figma-bridge retarget ${config.figma.fileKey}\` to bring them in line, or\n` +
        'retarget the whole repo at the file you actually want.\n',
    );
    return 1;
  }

  // A cache snapshotted from a different file describes components that may not exist here.
  const meta = readCacheMeta(config);
  if (meta.fileKey && meta.fileKey !== config.figma.fileKey) {
    console.error(
      `\nThe committed component cache came from ${meta.fileKey}, not the target ` +
        `${config.figma.fileKey}.\nRefresh ${config.paths.componentCache} against the target — ` +
        'the coverage check reads it to decide\nwhich components are retired.\n',
    );
    return 1;
  }

  console.info('Every reference agrees with the target, and the component cache matches it.');
  return 0;
}

function retarget(config, key, name) {
  if (!FILE_KEY_PATTERN.test(key)) {
    console.error(
      `Not a usable Figma file key: ${key}\n` +
        'Usage: figma-bridge retarget --check | <fileKey> [fileName]',
    );
    return 1;
  }

  const next = { fileKey: key, fileName: name ?? key };
  const slug = next.fileName.replace(/\s+/g, '-');
  const files = filesReferencingFigma(config);

  let changed = 0;
  for (const file of files) {
    const before = readFileSync(file, 'utf8');
    const after = before.replace(
      FIGMA_URL_PATTERN,
      (_match, prefix) => `${prefix}${next.fileKey}/${slug}`,
    );
    if (after !== before) {
      writeFileSync(file, after);
      changed++;
    }
  }

  const raw = JSON.parse(readFileSync(config.$path, 'utf8'));
  raw.figma = { ...raw.figma, ...next };
  writeFileSync(config.$path, `${JSON.stringify(raw, null, 2)}\n`);

  console.info(
    `Retargeted ${changed} of ${files.length} files to ${next.fileName} (${next.fileKey}).`,
  );
  console.info('Next: review the diff, then `figma-bridge check` before publishing.');

  const meta = readCacheMeta(config);
  if (meta.fileKey && meta.fileKey !== next.fileKey) {
    console.info(
      `\nThe component cache still comes from ${meta.fileKey}. Refresh ` +
        `${config.paths.componentCache}\nagainst the new target, or the coverage check reasons ` +
        'about the wrong library.',
    );
  }
  console.info(
    '\nIf this is a published library rather than a scratch copy, remember the write guard now\n' +
      'permits writes to it — a wrong write there is expensive to undo.',
  );
  return 0;
}

export default function main(config, argv) {
  const [arg, name] = argv;
  if (!arg || arg === '--check') return checkOnly(config);
  return retarget(config, arg, name);
}
