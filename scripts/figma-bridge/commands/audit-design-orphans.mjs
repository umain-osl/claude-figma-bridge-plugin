#!/usr/bin/env node
/**
 * The other direction of the correspondence: published Figma components that no
 * mapping points at.
 *
 * `audit-coverage` proves no component exists in code without a design behind
 * it. On its own that is half a guarantee — it says nothing about a component
 * the design system publishes that the codebase has quietly reimplemented,
 * worked around, or never noticed. This is the half that makes the pair a
 * bijection rather than a one-way check.
 *
 * Two modes, because failing by default would be wrong. A library holds more
 * than any one codebase uses, so `report` states the coverage and passes.
 * `baseline` turns it into a ratchet: whatever is already unmapped is accepted
 * once, in writing, and anything new has to be mapped or accepted deliberately.
 */
import { writeFileSync } from 'node:fs';
import {
  liveComponents,
  mappedNodeIds,
  readComponentCache,
  readDesignOnlyBaseline,
} from '../lib/files.mjs';

function byPage(components) {
  const pages = new Map();
  for (const component of components) {
    const page = component.pageName?.trim() || '(no page)';
    if (!pages.has(page)) pages.set(page, []);
    pages.get(page).push(component);
  }
  return [...pages.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function writeBaseline(config, orphans) {
  const path = config.paths.designOnly;
  if (!path) {
    console.error(
      'paths.designOnly is not set, so there is nowhere to write the baseline.\n' +
        'Add it to the config first — see the templates in scripts/figma-bridge/templates.',
    );
    return 1;
  }
  const body = {
    $comment:
      'Published Figma components accepted as having no code counterpart. A baseline, not a ' +
      'list of decisions: the point is that the accepted set cannot grow by accident. Regenerate ' +
      'with `figma-bridge audit-design-orphans --write-baseline`, and write a reason on anything ' +
      'that is a real gap rather than simply unused.',
    components: orphans.map(({ nodeId, name }) => ({ nodeId, name })),
  };
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`);
  console.info(`Wrote ${orphans.length} component(s) to ${path}.`);
  console.info('Review it: anything in there that the codebase should be using is a finding.');
  return 0;
}

export default function main(config, argv = []) {
  const cache = readComponentCache(config);
  if (cache.length === 0) {
    console.info(
      `No component cache at ${config.paths.componentCache}, so the design side is unknown.\n` +
        'Run `/figma-bridge:refresh-cache` — until then this check cannot say anything.',
    );
    return 0;
  }

  const { live, excluded } = liveComponents(config, cache);
  const mapped = mappedNodeIds(config);
  const orphans = live.filter((component) => !mapped.has(component.nodeId));
  const covered = live.length - orphans.length;
  const percent = live.length === 0 ? 100 : Math.round((covered / live.length) * 100);

  if (argv.includes('--write-baseline')) return writeBaseline(config, orphans);

  const skipped = [
    excluded.retired > 0 ? `${excluded.retired} retired` : null,
    excluded.ignoredPages > 0 ? `${excluded.ignoredPages} on ignored pages` : null,
  ].filter(Boolean);

  console.info(
    `${covered} of ${live.length} live component(s) mapped (${percent}%); ` +
      `${orphans.length} with no code counterpart.` +
      (skipped.length > 0 ? `\n${skipped.join(' and ')} excluded from the count.` : ''),
  );

  if (!config.figma.ignorePagePattern && orphans.length > 0) {
    console.info(
      'figma.ignorePagePattern is empty. If the library has pages nothing in code could ever map ' +
        'to —\nan icon set held as SVGs, a cover page, documentation — name them, or this list ' +
        'is mostly noise.',
    );
  }

  const mode = config.figma.designOnly;

  if (mode !== 'baseline') {
    if (orphans.length > 0) {
      for (const [page, components] of byPage(orphans)) {
        console.info(`\n  ${page}`);
        for (const { name, nodeId } of components) console.info(`    ${name}  ${nodeId}`);
      }
      console.info(
        '\nThese are not failures. They are the list to read when a screen needs something the ' +
          'codebase\ndoes not have — and the list to check before anyone builds a component.\n' +
          'Set figma.designOnly to "baseline" to freeze it so it cannot grow unnoticed.',
      );
    }
    return 0;
  }

  const baseline = readDesignOnlyBaseline(config);
  if (baseline === null) {
    console.error(
      '\nfigma.designOnly is "baseline" but there is no baseline to compare against.\n' +
        'Write one with `figma-bridge audit-design-orphans --write-baseline`, then review it.',
    );
    return 1;
  }

  const accepted = new Set(baseline.map((entry) => entry.nodeId));
  const appeared = orphans.filter((component) => !accepted.has(component.nodeId));
  const mappedIds = new Set(live.map((component) => component.nodeId));
  const stale = baseline.filter(
    (entry) => !mappedIds.has(entry.nodeId) || mapped.has(entry.nodeId),
  );

  if (appeared.length === 0 && stale.length === 0) {
    console.info(`Every unmapped component is in the baseline (${baseline.length} accepted).`);
    return 0;
  }

  if (appeared.length > 0) {
    console.error('\nPublished components with no mapping and no place in the baseline:\n');
    for (const [page, components] of byPage(appeared)) {
      console.error(`  ${page}`);
      for (const { name, nodeId } of components) console.error(`    ${name}  ${nodeId}`);
    }
    console.error(
      '\nSomething was added to the library, or renamed, or moved off a retired page. Map it, or\n' +
        'accept it in the baseline with a reason — `--write-baseline` regenerates the file.\n',
    );
  }

  if (stale.length > 0) {
    console.error('\nBaseline entries that are no longer unmapped components — remove these:\n');
    for (const { nodeId, name } of stale) console.error(`  ${name}  ${nodeId}`);
    console.error(
      '\nEither the component is mapped now, or it left the library. A baseline that keeps\n' +
        'accepting things that no longer exist stops being a ratchet.\n',
    );
  }

  return 1;
}
