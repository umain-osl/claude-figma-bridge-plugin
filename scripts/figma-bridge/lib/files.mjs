/**
 * Locating and reading the design system's files, and the four Figma-side JSON artifacts.
 *
 * The directory walk is hand-rolled rather than `fs.globSync`, which only arrived in Node 22 and
 * was experimental there. This copy gets vendored into other repos and run by their CI, so it
 * sticks to APIs that are years old everywhere.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import { FILE_KEY_PATTERN } from './config.mjs';
import { arrayOf, object, optional, required, str, validate, withDefault } from './validate.mjs';

const SKIP_DIRS = new Set(['node_modules', '.git', 'ios', 'android', 'build', 'dist']);

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path, out);
    } else if (entry.isFile()) {
      out.push(path);
    }
  }
  return out;
}

function rootsExist(config) {
  const missing = config.designSystem.roots.filter((root) => {
    try {
      return !statSync(root).isDirectory();
    } catch {
      return true;
    }
  });
  if (missing.length > 0) {
    throw new Error(
      `designSystem.roots names ${missing.length} path(s) that are not directories in this repo:\n` +
        missing.map((path) => `  ${path}`).join('\n') +
        `\nFix ${config.$path}, or run \`/figma-bridge:onboard\` to re-detect them.`,
    );
  }
}

function filesUnderRoots(config) {
  rootsExist(config);
  return config.designSystem.roots
    .flatMap((root) => walk(root))
    .map((path) => path.split(sep).join('/'))
    .sort();
}

/** Code Connect templates: the published mapping files. */
export function mappingFiles(config) {
  const suffix = config.designSystem.mappingSuffix;
  return filesUnderRoots(config).filter((path) => path.endsWith(suffix));
}

/**
 * Component sources, excluding mappings, drafts, and the directories a repo has declared as
 * assets or primitives rather than mappable components.
 */
export function componentFiles(config) {
  const { componentExtension, mappingSuffix, draftSuffix, ignoreDirs, roots } = config.designSystem;
  const ignored = ignoreDirs.flatMap((dir) => roots.map((root) => `${root}/${dir}/`));
  return filesUnderRoots(config)
    .filter((path) => path.endsWith(componentExtension))
    .filter((path) => !path.endsWith(mappingSuffix) && !path.endsWith(draftSuffix))
    .filter((path) => !ignored.some((prefix) => path.startsWith(prefix)));
}

/** The mapping file(s) that sit beside a component, matched on the file stem. */
export function mappingStems(config) {
  return new Set(
    mappingFiles(config).map((path) =>
      basename(path).slice(0, -config.designSystem.mappingSuffix.length),
    ),
  );
}

export function componentStem(config, path) {
  return basename(path, config.designSystem.componentExtension);
}

/**
 * Matches a Figma design URL, capturing the prefix and the file key separately so a rewrite can
 * swap only the key. Shared so the audits and the retarget command cannot drift apart.
 */
export const FIGMA_URL_PATTERN =
  /(https:\/\/www\.figma\.com\/design\/)([0-9a-zA-Z]{22,128})(\/[^?\s]*)?/g;

/** Node ids referenced by a mapping's `// url=` directive, normalised to `1:2`. */
export function nodeIdsIn(source) {
  return [...source.matchAll(/node-id=(\d+)[-:](\d+)/g)].map(([, a, b]) => `${a}:${b}`);
}

/** File keys referenced by a file, in order of appearance. */
export function fileKeysIn(source) {
  return [...source.matchAll(FIGMA_URL_PATTERN)].map(([, , key]) => key);
}

/**
 * Strips comments before analysing a template. A `// source=` directive carries a URL ending in
 * `Component.tsx`, which otherwise reads as an `Enum.Member` reference and reports a component
 * as un-imported by its own filename.
 */
export function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

/**
 * Every file naming a Figma file: the mappings, whose `// url=` directive the Code Connect CLI
 * reads, and the component sources, whose doc-comment links a developer clicks. Both must agree
 * — a link pointing elsewhere sends people to the wrong library.
 */
export function filesReferencingFigma(config) {
  return [...mappingFiles(config), ...componentFiles(config)].filter((path) =>
    /figma\.com\/design\//.test(readFileSync(path, 'utf8')),
  );
}

function readJson(path, schema, label, { optional: isOptional = false } = {}) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    if (isOptional) return null;
    throw new Error(`${label} (${path}) is missing.`);
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} (${path}) is not valid JSON: ${error.message}`);
  }
  return validate(raw, schema, label, path);
}

const declaredSchema = object({
  components: withDefault(
    arrayOf(
      object({
        path: required(str()),
        // Long enough that "n/a" cannot pass for a decision.
        reason: required(str({ min: 20 })),
        decidedOn: optional(str()),
      }),
    ),
    [],
  ),
});

/** Components deliberately without a Figma counterpart. */
export function readDeclaredUnmapped(config) {
  const path = config.paths.unmapped;
  const parsed = readJson(path, declaredSchema, 'The declared-unmapped list', { optional: true });
  return parsed ? parsed.components : [];
}

const cacheSchema = arrayOf(
  object({ nodeId: required(str()), name: required(str()), pageName: optional(str()) }),
);

/**
 * The committed Figma component graph. Absent means an empty list rather than a failure, so a
 * repo can start using the coverage check before it has snapshotted the library.
 */
export function readComponentCache(config) {
  return (
    readJson(config.paths.componentCache, cacheSchema, 'The Figma component cache', {
      optional: true,
    }) ?? []
  );
}

const cacheMetaSchema = object({
  fileKey: optional(str({ pattern: FILE_KEY_PATTERN, patternLabel: 'is not a Figma file key' })),
  fetchedAt: optional(str()),
});

/** Which file the committed component cache was snapshotted from. */
export function readCacheMeta(config) {
  return (
    readJson(config.paths.componentCacheMeta, cacheMetaSchema, 'The component cache metadata', {
      optional: true,
    }) ?? {}
  );
}

/**
 * Map of nodeId → label for every component on a page the repo has declared retired.
 *
 * Retired pages are the trap that costs the most: they hold the work a team no longer follows,
 * and they tend to carry the highest instance counts in a mature file, so ranking candidates by
 * popularity points at dead components first.
 */
export function retiredComponents(config, cache = readComponentCache(config)) {
  const retired = new Map();
  const source = config.figma.retiredPagePattern;
  if (!source) return retired;
  const pattern = new RegExp(source, 'i');
  for (const component of cache) {
    if (component.pageName && pattern.test(component.pageName)) {
      retired.set(component.nodeId, `${component.name} (${component.pageName.trim()})`);
    }
  }
  return retired;
}

const designOnlySchema = object({
  components: withDefault(
    arrayOf(
      object({
        nodeId: required(str()),
        name: required(str()),
        reason: optional(str()),
      }),
    ),
    [],
  ),
});

/**
 * Published components accepted as having no code counterpart. This is a
 * baseline rather than a list of decisions: a library holds more than any one
 * codebase uses, so the point is that the accepted set cannot grow by accident.
 */
export function readDesignOnlyBaseline(config) {
  const path = config.paths.designOnly;
  if (!path) return null;
  const parsed = readJson(path, designOnlySchema, 'The design-only baseline', { optional: true });
  return parsed ? parsed.components : null;
}

/**
 * Figma's convention for a component the library does not publish: a leading dot
 * (and, by local habit in some libraries, an underscore). Mapping one would link
 * code against something consumers cannot instantiate.
 */
export function isPrivateComponentName(name) {
  return /^[._]/.test(name.trim());
}

/** Node ids every mapping in the repo targets. */
export function mappedNodeIds(config) {
  const ids = new Set();
  for (const path of mappingFiles(config)) {
    for (const nodeId of nodeIdsIn(readFileSync(path, 'utf8'))) ids.add(nodeId);
  }
  return ids;
}

/**
 * A path matcher small enough to vendor: `*` stops at a slash, `**` does not.
 * Anything without a wildcard matches as a literal path or a directory prefix,
 * which is what people write in a config by hand.
 */
export function matchesAnyPattern(path, patterns) {
  return patterns.some((pattern) => {
    if (!pattern.includes('*')) {
      return path === pattern || path.startsWith(pattern.endsWith('/') ? pattern : `${pattern}/`);
    }
    const source = pattern
      .split('**')
      .map((part) =>
        part
          .split('*')
          .map((literal) => literal.replace(/[.+^${}()|[\]\\]/g, '\\$&'))
          .join('[^/]*'),
      )
      .join('.*');
    return new RegExp(`^${source}$`).test(path);
  });
}

/** Components on a page the repo has declared out of scope for mapping. */
export function ignoredPageComponents(config, cache = readComponentCache(config)) {
  const source = config.figma.ignorePagePattern;
  if (!source) return new Map();
  const pattern = new RegExp(source, 'i');
  const ignored = new Map();
  for (const component of cache) {
    if (component.pageName && pattern.test(component.pageName)) {
      ignored.set(component.nodeId, `${component.name} (${component.pageName.trim()})`);
    }
  }
  return ignored;
}

/**
 * The components a mapping could reasonably point at: everything published,
 * minus retired pages, minus pages declared out of scope, minus Figma's private
 * components. This is the denominator of any coverage number, so it lives here
 * rather than in each caller — a report and a doctor disagreeing about what
 * counts is worse than either being wrong.
 */
export function liveComponents(config, cache = readComponentCache(config)) {
  const retired = retiredComponents(config, cache);
  const ignored = ignoredPageComponents(config, cache);
  const live = cache.filter(
    (component) =>
      !retired.has(component.nodeId) &&
      !ignored.has(component.nodeId) &&
      !isPrivateComponentName(component.name),
  );
  return { live, excluded: { retired: retired.size, ignoredPages: ignored.size } };
}

export const rel = (path) => relative(process.cwd(), path).split(sep).join('/');
