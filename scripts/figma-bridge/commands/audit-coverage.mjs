/**
 * Fails when a design system component exists in code without a Figma counterpart, or when a
 * mapping points at retired work.
 *
 * This is the guard against inventing components. A component that exists only in code has no
 * design authority behind it: nobody reviewed it, no Figma node governs its tokens, and an agent
 * building the next screen cannot find it from a design. So every component under the design
 * system roots must either
 *
 *   1. have a Code Connect mapping beside it, or
 *   2. be declared in the unmapped list with a written reason.
 *
 * Adding a component therefore forces a deliberate act: map it in Figma, or state on the record
 * why it has no counterpart. Neither can be done by accident.
 */
import { readFileSync } from 'node:fs';
import {
  componentFiles,
  componentStem,
  mappingFiles,
  mappingStems,
  nodeIdsIn,
  readDeclaredUnmapped,
  retiredComponents,
} from '../lib/files.mjs';

/**
 * A component file is one exporting something named after the file. Case is compared loosely,
 * because a filename and the symbol it exports disagree on capitalisation more often than anyone
 * would like. Helper modules and multi-primitive modules like `typography.tsx` export nothing
 * matching their filename and are left alone — treating them as components would demand a Figma
 * node for a file that never rendered anything on its own.
 */
const EXPORT_PATTERNS = [
  /export function ([A-Z][A-Za-z0-9_]*)/g,
  /export const ([A-Z][A-Za-z0-9_]*)\s*[:=]/g,
  /export default function ([A-Z][A-Za-z0-9_]*)/g,
  /export class ([A-Z][A-Za-z0-9_]*)/g,
];

function componentNameOf(config, path, source) {
  const stem = componentStem(config, path).toLowerCase();
  for (const pattern of EXPORT_PATTERNS) {
    for (const [, name] of source.matchAll(pattern)) {
      if (name.toLowerCase() === stem) return name;
    }
  }
  return null;
}

export default function main(config) {
  const mappings = mappingFiles(config);
  const mapped = mappingStems(config);
  const declared = new Map(readDeclaredUnmapped(config).map((entry) => [entry.path, entry.reason]));
  const componentPaths = new Set(componentFiles(config));

  const missing = [];
  for (const path of componentPaths) {
    const name = componentNameOf(config, path, readFileSync(path, 'utf8'));
    if (!name) continue;
    if (mapped.has(componentStem(config, path))) continue;
    if (declared.has(path)) continue;
    missing.push({ path, name });
  }

  /** A declaration pointing at a file that no longer exists is stale and should be removed. */
  const stale = [...declared.keys()].filter((path) => !componentPaths.has(path));

  const retired = retiredComponents(config);
  const retiredTargets = [];
  for (const path of mappings) {
    for (const nodeId of nodeIdsIn(readFileSync(path, 'utf8'))) {
      if (retired.has(nodeId)) {
        retiredTargets.push({ path, nodeId, component: retired.get(nodeId) });
      }
    }
  }

  if (missing.length === 0 && stale.length === 0 && retiredTargets.length === 0) {
    console.info(
      `Every ${config.designSystem.name} component is either mapped in Figma or declared as unmapped.`,
    );
    if (retired.size > 0) console.info('No mapping targets a retired component.');
    return 0;
  }

  if (missing.length > 0) {
    console.error('\nComponents with no Figma counterpart and no declaration:\n');
    for (const { path, name } of missing) console.error(`  ${name}  (${path})`);
    console.error(
      `\nEach one needs a Figma component plus a mapping beside it, or an entry in\n` +
        `${config.paths.unmapped} explaining why it has no counterpart. Do not add the\n` +
        'declaration to silence this check — an unmapped component is a design decision, so ask\n' +
        'first.\n',
    );
  }

  if (stale.length > 0) {
    console.error('\nDeclared but no longer present — remove these entries:\n');
    for (const path of stale) console.error(`  ${path}`);
  }

  if (retiredTargets.length > 0) {
    console.error('\nMappings pointing at retired components:\n');
    for (const { path, nodeId, component } of retiredTargets) {
      console.error(`  ${path} -> ${nodeId}  ${component}`);
    }
    console.error(
      '\nA retired page holds work the team no longer follows, and it tends to carry the highest\n' +
        'instance counts in the file — so instance count alone will point you at dead components.\n' +
        'Re-point the mapping at the current component, and ask the design owner if unsure.\n',
    );
  }

  return 1;
}
