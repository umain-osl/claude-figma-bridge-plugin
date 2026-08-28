/**
 * Finds and reads `figma-bridge.json` — the one file that makes these generic checks
 * repo-specific.
 *
 * Everything the audits need to know about a particular codebase lives here: where the design
 * system is, which Figma file it is linked to, which page holds retired work. That is the whole
 * generalisation. The scripts carry no knowledge of any single design system, and a repo that
 * has not been onboarded has no config, so the guards can tell the difference between
 * "misconfigured" and "not this repo's concern".
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { arrayOf, object, optional, required, str, validate, withDefault } from './validate.mjs';

export const CONFIG_NAME = 'figma-bridge.json';

export const FILE_KEY_PATTERN = /^[0-9a-zA-Z]{22,128}$/;

const fileKey = str({
  pattern: FILE_KEY_PATTERN,
  patternLabel: 'is not a Figma file key (22–128 alphanumeric characters)',
});

const configSchema = object({
  designSystem: required(
    object({
      name: required(str()),
      roots: required(arrayOf(str())),
      ignoreDirs: withDefault(arrayOf(str()), []),
      componentExtension: withDefault(str(), '.tsx'),
      mappingSuffix: withDefault(str(), '.figma.ts'),
      draftSuffix: withDefault(str(), '.figma.tsx'),
    }),
  ),
  figma: required(
    object({
      fileKey: required(fileKey),
      fileName: required(str()),
      retiredPagePattern: withDefault(str({ min: 0 }), ''),
      /**
       * What to do about published components with no mapping. `report` prints
       * them and passes: in a library larger than the slice a codebase uses,
       * most components legitimately have no counterpart, and failing on that
       * would make the check something people switch off. `baseline` turns it
       * into a ratchet — coverage can stay where it is but cannot silently get
       * worse.
       */
      designOnly: withDefault(str(), 'report'),
    }),
  ),
  paths: required(
    object({
      unmapped: required(str()),
      componentCache: required(str()),
      componentCacheMeta: required(str()),
      tokenMap: optional(str()),
      libraryNotes: optional(str()),
      designOnly: optional(str()),
    }),
  ),
  codeConnect: withDefault(
    object({
      parser: withDefault(str(), 'react'),
      label: optional(str()),
    }),
    { parser: 'react' },
  ),
  /**
   * Where a raw colour literal is still allowed: the file that defines the
   * palette has to write the values down somewhere.
   */
  tokens: withDefault(object({ allowLiteralsIn: withDefault(arrayOf(str()), []) }), {
    allowLiteralsIn: [],
  }),
  verify: withDefault(arrayOf(str()), []),
  fonts: optional(
    object({
      families: withDefault(arrayOf(str()), []),
      source: optional(str()),
      substitute: optional(object({ family: required(str()), style: required(str()) })),
    }),
  ),
});

/**
 * Walks up from `from` looking for the config. Returns null rather than throwing: the hook
 * guards run in every repo the plugin is installed in, and silence is the correct behaviour in
 * one that has never been onboarded.
 */
export function findConfig(from = process.cwd()) {
  let dir = resolve(from);
  for (;;) {
    const path = join(dir, CONFIG_NAME);
    if (existsSync(path)) return { root: dir, path };
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function parse(path) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`The Figma Bridge config (${path}) is not valid JSON: ${error.message}`);
  }
  return validate(raw, configSchema, 'The Figma Bridge config', path);
}

/**
 * Loads the config and moves the process to the repo it belongs to, so every path in it — and
 * every path a check prints — is repo-relative regardless of where the command was run from.
 */
export function loadConfig({ from = process.cwd(), required: isRequired = true } = {}) {
  const found = findConfig(from);
  if (!found) {
    if (!isRequired) return null;
    throw new Error(
      `No ${CONFIG_NAME} found in ${resolve(from)} or any parent directory.\n` +
        'Run `/figma-bridge:onboard` in the repo to create one.',
    );
  }
  process.chdir(found.root);
  return { ...parse(found.path), $root: found.root, $path: CONFIG_NAME };
}

/** Turns a thrown config error into a message instead of a stack trace. */
export function run(body) {
  try {
    return body();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
