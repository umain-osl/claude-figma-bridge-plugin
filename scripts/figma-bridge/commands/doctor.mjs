/**
 * Reports whether this repo is wired up, without touching Figma.
 *
 * Most "the Figma workflow is broken" reports are one of these: the wrong Node on PATH, an expired
 * token, a component cache from a different file, or the design system fonts missing from Figma.
 * Each fails in a way that reads like a different problem, so they are worth ruling out before
 * debugging anything else.
 */
import { existsSync, readFileSync } from 'node:fs';
import { CONFIG_NAME } from '../lib/config.mjs';
import { componentFiles, mappingFiles, readCacheMeta, readComponentCache } from '../lib/files.mjs';

const ok = (message) => console.info(`  ok    ${message}`);
const warn = (message) => console.warn(`  warn  ${message}`);
const bad = (message) => console.error(`  FAIL  ${message}`);

function tokenPresent() {
  if (process.env.FIGMA_ACCESS_TOKEN) return '$FIGMA_ACCESS_TOKEN';
  for (const file of ['.env.local', '.env']) {
    if (existsSync(file) && /^\s*FIGMA_ACCESS_TOKEN\s*=\s*\S/m.test(readFileSync(file, 'utf8'))) {
      return file;
    }
  }
  return null;
}

export default function main(config) {
  let failures = 0;
  const fail = (message) => {
    failures++;
    bad(message);
  };

  console.info(`\nFigma Bridge — ${config.designSystem.name}\n`);

  console.info('Config');
  ok(`${CONFIG_NAME} parses, target is ${config.figma.fileName} (${config.figma.fileKey})`);
  const components = componentFiles(config);
  const mappings = mappingFiles(config);
  ok(`${components.length} component source(s) under ${config.designSystem.roots.join(', ')}`);
  ok(`${mappings.length} Code Connect mapping(s)`);
  if (mappings.length === 0) {
    warn('no mappings yet — an agent handed a Figma node has nothing to resolve it against');
  }
  if (!existsSync(config.paths.unmapped)) {
    warn(`${config.paths.unmapped} does not exist yet; the coverage check treats it as empty`);
  }

  console.info('\nComponent cache');
  const cache = readComponentCache(config);
  const meta = readCacheMeta(config);
  if (cache.length === 0) {
    warn(
      `${config.paths.componentCache} is empty or absent — run \`/figma-bridge:refresh-cache\`.\n` +
        '        Without it the retired-page check cannot fire, and component discovery falls\n' +
        '        back to live Figma reads, which cost quota.',
    );
  } else {
    ok(`${cache.length} published component(s) cached, fetched ${meta.fetchedAt ?? 'unknown'}`);
    if (meta.fileKey && meta.fileKey !== config.figma.fileKey) {
      fail(`the cache came from ${meta.fileKey}, not the target — refresh it`);
    }
    if (config.figma.retiredPagePattern) {
      const pattern = new RegExp(config.figma.retiredPagePattern, 'i');
      const retired = cache.filter((entry) => entry.pageName && pattern.test(entry.pageName));
      ok(
        `retired-page pattern /${config.figma.retiredPagePattern}/i matches ${retired.length} component(s)`,
      );
      if (retired.length === 0) {
        warn('the pattern matches nothing — confirm the page name, or clear the setting');
      }
    } else {
      warn(
        'figma.retiredPagePattern is empty. If the library has a graveyard page, name it — dead\n' +
          '        components there often carry the highest instance counts in the file.',
      );
    }
  }

  console.info('\nCredentials');
  const token = tokenPresent();
  if (token) ok(`FIGMA_ACCESS_TOKEN found in ${token}`);
  else
    warn(
      'no FIGMA_ACCESS_TOKEN — the Code Connect CLI cannot publish. Scopes needed:\n' +
        '        file_content:read and file_code_connect:write, and nothing more.',
    );
  warn(
    'Figma MCP access is per-user OAuth and cannot be checked from here. Any step that writes\n' +
      '        to Figma needs an interactive session; there is no service credential for CI.',
  );

  console.info('\nLocal toolchain');
  const [major] = process.versions.node.split('.').map(Number);
  if (major >= 20) ok(`node ${process.versions.node}`);
  else fail(`node ${process.versions.node} — these scripts need Node 20 or newer`);
  if (existsSync('node_modules/@figma/code-connect')) ok('@figma/code-connect installed');
  else warn('@figma/code-connect is not installed; `check` cannot dry-run a publish');

  if (config.fonts?.families?.length) {
    console.info('\nFonts');
    warn(
      `Figma must have ${config.fonts.families.join(', ')} installed, and only Figma can confirm\n` +
        '        it. Without them, writing text into Figma needs the substitution technique in\n' +
        '        the code-to-figma skill, and text property writes refuse outright.',
    );
    if (config.fonts.source && !existsSync(config.fonts.source)) {
      fail(`fonts.source (${config.fonts.source}) does not exist in this repo`);
    }
  }

  console.info(
    failures === 0
      ? '\nNothing failing. Warnings above are things to know, not things broken.\n'
      : `\n${failures} problem(s) to fix.\n`,
  );
  return failures === 0 ? 0 : 1;
}
