/**
 * Checks that every Code Connect template's `imports` array covers the identifiers its snippet
 * actually renders.
 *
 * `figma connect migrate` omits imports for identifiers that only appear in *values* — an enum
 * member passed to `figma.enum`, an icon injected through `jsxElement`, a component used in a
 * nested example. The published snippet then references a symbol it never imports, and nothing
 * else catches it: the template is valid JavaScript, `figma connect publish` accepts it, and the
 * fault only shows up when a developer copies the snippet.
 *
 * The fault is systematic rather than occasional, and a single migration can introduce several at
 * once, so this runs as part of `figma-bridge check` rather than living in someone's memory.
 */
import { readFileSync } from 'node:fs';
import { mappingFiles, withoutComments } from '../lib/files.mjs';

const GLOBAL_IDENTIFIERS = new Set([
  'Object',
  'Math',
  'JSON',
  'String',
  'Number',
  'Boolean',
  'Array',
  'Promise',
  'Error',
]);

function importedNames(source) {
  const names = new Set();
  const specs = [
    ...source.matchAll(/'import ([^']+?) from/g),
    ...source.matchAll(/"import ([^"]+?) from/g),
  ];
  for (const [, spec] of specs) {
    for (const name of spec.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) names.add(name[0]);
  }
  names.delete('import');
  names.delete('from');
  names.delete('type');
  return names;
}

/**
 * Names the template declares itself. An ALL-CAPS local const reads exactly like an imported
 * enum to the `Name.member` pattern below, so without this the audit reports a file's own
 * variables as missing imports.
 */
function declaredNames(source) {
  const names = new Set();
  for (const match of source.matchAll(
    /\b(?:const|let|var|function|class)\s+([A-Za-z_][A-Za-z0-9_]*)/g,
  )) {
    names.add(match[1]);
  }
  return names;
}

function usedNames(source) {
  const code = withoutComments(source);
  const declared = declaredNames(code);
  const used = new Set();
  // Everything that ends up in the rendered snippet: the `figma.code` template plus every
  // `jsxElement('<Icon … />')` string in the body, whose contents are interpolated into it.
  // Without the second source, a missing icon import goes unreported — which is the very case
  // this audit exists for.
  const snippets = [
    ...[...code.matchAll(/figma\.code`([\s\S]*?)`/g)].map((match) => match[1]),
    ...[...code.matchAll(/jsxElement\(\s*(['"`])([\s\S]*?)\1/g)].map((match) => match[2]),
  ].join('\n');
  for (const match of snippets.matchAll(/<([A-Z][A-Za-z0-9_]*)/g)) used.add(match[1]);
  // Enum.Member, wherever it is written — including the template body, since values computed
  // there are interpolated into the snippet.
  for (const match of code.matchAll(/\b([A-Z][A-Za-z0-9_]*)\.[A-Za-z0-9_]+/g)) used.add(match[1]);
  for (const name of GLOBAL_IDENTIFIERS) used.delete(name);
  for (const name of declared) used.delete(name);
  used.delete('ERROR');
  return used;
}

export default function main(config) {
  const files = mappingFiles(config);
  let failures = 0;

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const imported = importedNames(source);
    const missing = [...usedNames(source)]
      .filter((name) => !imported.has(name) && name !== 'figma')
      .sort();
    const relative = [...source.matchAll(/from '(\.\.?\/[^']+)'/g)].map((match) => match[1]);

    if (missing.length > 0) {
      failures++;
      console.error(`✗ ${file}`);
      console.error(`  snippet references but does not import: ${missing.join(', ')}`);
    }
    if (relative.length > 0) {
      failures++;
      console.error(`✗ ${file}`);
      console.error(
        `  snippet uses a relative import, which will not resolve where it is pasted: ${relative.join(', ')}`,
      );
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} snippet import problem(s). Fix the template's imports array.`);
    return 1;
  }

  console.info(`Code Connect snippet imports are complete (${files.length} mapping(s) checked).`);
  return 0;
}
