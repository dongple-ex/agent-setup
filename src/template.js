const VAR_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*(?:\|\s*("(?:[^"\\]|\\.)*"|'[^']*'|[^}\s]+)\s*)?\}\}/g;
const SECRET_RE = /\$\{secret:([A-Za-z0-9_./-]+)\}/g;
const ENV_RE = /\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g;

export class TemplateError extends Error {}

function lookup(vars, name) {
  let cur = vars;
  for (const part of name.split('.')) {
    if (cur === null || cur === undefined || typeof cur !== 'object' || !(part in cur)) {
      return undefined;
    }
    cur = cur[part];
  }
  return cur;
}

function unquote(s) {
  if (s === undefined) {
    return undefined;
  }
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).replace(/\\(.)/g, '$1');
  }
  return s;
}

export function renderString(text, vars, { source = 'template', missing } = {}) {
  return String(text).replace(VAR_RE, (whole, name, def) => {
    const v = lookup(vars, name);
    if (v === undefined || v === null) {
      if (def !== undefined) {
        return unquote(def);
      }
      if (missing) {
        missing.push({ name, source });
        return whole;
      }
      throw new TemplateError(`${source}: undefined variable {{${name}}}`);
    }
    return typeof v === 'object' ? JSON.stringify(v) : String(v);
  });
}

export function renderDeep(value, vars, opts = {}) {
  if (typeof value === 'string') {
    return renderString(value, vars, opts);
  }
  if (Array.isArray(value)) {
    return value.map((v) => renderDeep(v, vars, opts));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = renderDeep(v, vars, opts);
    }
    return out;
  }
  return value;
}

export function findSecretRefs(value, out = new Set()) {
  if (typeof value === 'string') {
    for (const m of value.matchAll(SECRET_RE)) {
      out.add(m[1]);
    }
  } else if (Array.isArray(value)) {
    value.forEach((v) => findSecretRefs(v, out));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((v) => findSecretRefs(v, out));
  }
  return out;
}

export function hasSecretRef(value) {
  return findSecretRefs(value).size > 0;
}

export function secretEnvName(name) {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export function replaceSecretRefs(value, fn) {
  if (typeof value === 'string') {
    return value.replace(SECRET_RE, (_, name) => fn(name));
  }
  if (Array.isArray(value)) {
    return value.map((v) => replaceSecretRefs(v, fn));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = replaceSecretRefs(v, fn);
    }
    return out;
  }
  return value;
}

export function replaceEnvRefs(value, fn) {
  if (typeof value === 'string') {
    return value.replace(ENV_RE, (_, name) => fn(name));
  }
  if (Array.isArray(value)) {
    return value.map((v) => replaceEnvRefs(v, fn));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = replaceEnvRefs(v, fn);
    }
    return out;
  }
  return value;
}

export function isPureSecretRef(s) {
  return typeof s === 'string' && /^\$\{secret:[A-Za-z0-9_./-]+\}$/.test(s);
}

export function isPureEnvRef(s) {
  return typeof s === 'string' && /^\$\{env:[A-Za-z_][A-Za-z0-9_]*\}$/.test(s);
}
