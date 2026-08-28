/**
 * A validator small enough to vendor.
 *
 * The checks read four JSON files written by hand, so a typo has to produce a sentence a person
 * can act on rather than a stack trace two frames deep in a parse. Zod would do this, but the
 * whole point of vendoring these scripts into a host repo is that they add no dependency — CI
 * installs with `--omit=dev` in more than one of the repos this is aimed at.
 */

class Invalid extends Error {}

const typeOf = (value) => (value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value);

function fail(path, message) {
  throw new Invalid(`${path || '(root)'}: ${message}`);
}

export const str = ({ min = 1, pattern, patternLabel } = {}) => ({
  parse(value, path) {
    if (typeOf(value) !== 'string') fail(path, `expected a string, got ${typeOf(value)}`);
    if (value.length < min) fail(path, `needs at least ${min} character(s)`);
    if (pattern && !pattern.test(value)) fail(path, patternLabel ?? `does not match ${pattern}`);
    return value;
  },
});

export const bool = () => ({
  parse(value, path) {
    if (typeOf(value) !== 'boolean') fail(path, `expected true or false, got ${typeOf(value)}`);
    return value;
  },
});

export const arrayOf = (item) => ({
  parse(value, path) {
    if (!Array.isArray(value)) fail(path, `expected an array, got ${typeOf(value)}`);
    return value.map((entry, index) => item.parse(entry, `${path}[${index}]`));
  },
});

/**
 * Unknown keys pass through untouched: every one of these files carries a `$comment` or
 * `$schema` key, and a repo is free to record more of its own.
 */
export const object = (shape) => ({
  parse(value, path) {
    if (typeOf(value) !== 'object') fail(path, `expected an object, got ${typeOf(value)}`);
    const out = { ...value };
    for (const [key, field] of Object.entries(shape)) {
      const at = path ? `${path}.${key}` : key;
      if (value[key] === undefined) {
        if (field.optional) continue;
        if ('fallback' in field) {
          out[key] = field.fallback;
          continue;
        }
        fail(at, 'is required');
      }
      out[key] = field.schema.parse(value[key], at);
    }
    return out;
  },
});

export const required = (schema) => ({ schema });
export const optional = (schema) => ({ schema, optional: true });
export const withDefault = (schema, fallback) => ({ schema, fallback });

/** Parses `raw`, labelling any failure with the file it came from. */
export function validate(raw, schema, label, path) {
  try {
    return schema.parse(raw, '');
  } catch (error) {
    if (error instanceof Invalid) {
      throw new Error(`${label} (${path}) has the wrong shape:\n  ${error.message}`);
    }
    throw error;
  }
}
