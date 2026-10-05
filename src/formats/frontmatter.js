export function splitFrontmatter(text) {
  const t = text.replace(/^﻿/, '').replace(/\r+\n/g, '\n');
  const lines = t.split('\n');
  if (lines[0].trimEnd() !== '---') {
    return { raw: null, data: {}, body: t };
  }
  let end = 1;
  while (end < lines.length && lines[end].trimEnd() !== '---' && lines[end].trimEnd() !== '...') {
    end += 1;
  }
  if (end >= lines.length) {
    return { raw: null, data: {}, body: t };
  }
  const raw = lines.slice(1, end).join('\n');
  const body = lines.slice(end + 1).join('\n').replace(/^\n+/, '');
  return { raw, data: parseYaml(raw), body };
}

export function joinFrontmatter(data, body) {
  const keys = Object.keys(data || {}).filter((k) => data[k] !== undefined);
  if (keys.length === 0) {
    return body;
  }
  const fm = stringifyYaml(Object.fromEntries(keys.map((k) => [k, data[k]])));
  return `---\n${fm}---\n\n${body.replace(/^\n+/, '')}`;
}

function indentOf(line) {
  return line.length - line.trimStart().length;
}

function isSkippable(line) {
  const t = line.trim();
  return t === '' || t.startsWith('#');
}

function stripComment(s) {
  let inS = false;
  let inD = false;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === "'" && !inD) {
      inS = !inS;
    } else if (ch === '"' && !inS && s[i - 1] !== '\\') {
      inD = !inD;
    } else if (ch === '#' && !inS && !inD && (i === 0 || /\s/.test(s[i - 1]))) {
      return s.slice(0, i).trimEnd();
    }
  }
  return s.trimEnd();
}

function splitFlow(inner) {
  const parts = [];
  let depth = 0;
  let cur = '';
  let inS = false;
  let inD = false;
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (ch === "'" && !inD) {
      inS = !inS;
    } else if (ch === '"' && !inS && inner[i - 1] !== '\\') {
      inD = !inD;
    } else if (!inS && !inD && (ch === '[' || ch === '{')) {
      depth += 1;
    } else if (!inS && !inD && (ch === ']' || ch === '}')) {
      depth -= 1;
    } else if (!inS && !inD && depth === 0 && ch === ',') {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim() !== '') {
    parts.push(cur);
  }
  return parts.map((p) => p.trim()).filter((p) => p !== '');
}

export function parseScalar(input) {
  const s = input.trim();
  if (s === '' || s === '~' || s === 'null' || s === 'Null' || s === 'NULL') {
    return s === '' ? '' : null;
  }
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    try {
      return JSON.parse(s);
    } catch {
      return s.slice(1, -1);
    }
  }
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) {
    return s.slice(1, -1).replace(/''/g, "'");
  }
  if (s.startsWith('[') && s.endsWith(']')) {
    return splitFlow(s.slice(1, -1)).map(parseScalar);
  }
  if (s.startsWith('{') && s.endsWith('}')) {
    const obj = {};
    for (const part of splitFlow(s.slice(1, -1))) {
      const idx = part.indexOf(':');
      if (idx > 0) {
        obj[parseScalar(part.slice(0, idx))] = parseScalar(part.slice(idx + 1));
      }
    }
    return obj;
  }
  if (/^(true|True|TRUE)$/.test(s)) {
    return true;
  }
  if (/^(false|False|FALSE)$/.test(s)) {
    return false;
  }
  if (/^[-+]?\d+$/.test(s) && Math.abs(Number(s)) <= Number.MAX_SAFE_INTEGER) {
    return Number(s);
  }
  if (/^[-+]?(\d+\.\d*|\.\d+|\d+)([eE][-+]?\d+)?$/.test(s)) {
    return Number(s);
  }
  return s;
}

function parseBlockScalar(lines, i, parentIndent, indicator) {
  const folded = indicator.startsWith('>');
  const chomp = indicator.includes('-') ? 'strip' : indicator.includes('+') ? 'keep' : 'clip';
  const collected = [];
  let blockIndent = null;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      collected.push('');
      i += 1;
      continue;
    }
    const ind = indentOf(line);
    if (ind <= parentIndent) {
      break;
    }
    if (blockIndent === null) {
      blockIndent = ind;
    }
    collected.push(line.slice(Math.min(blockIndent, ind)));
    i += 1;
  }
  let text;
  if (folded) {
    text = '';
    for (let k = 0; k < collected.length; k += 1) {
      const cur = collected[k];
      if (cur === '') {
        text += '\n';
      } else if (k > 0 && collected[k - 1] !== '' && !text.endsWith('\n')) {
        text += ` ${cur}`;
      } else {
        text += cur;
      }
    }
  } else {
    text = collected.join('\n');
  }
  const trimmed = text.replace(/\n+$/, '');
  if (chomp === 'strip') {
    text = trimmed;
  } else if (chomp === 'clip') {
    text = `${trimmed}\n`;
  }
  return [text, i];
}

function parseNode(lines, i, indent) {
  while (i < lines.length && isSkippable(lines[i])) {
    i += 1;
  }
  if (i >= lines.length) {
    return [null, i];
  }
  const t = lines[i].trim();
  if (t === '-' || t.startsWith('- ')) {
    return parseList(lines, i, indentOf(lines[i]));
  }
  return parseMap(lines, i, indent);
}

function parseList(lines, i, indent) {
  const arr = [];
  while (i < lines.length) {
    if (isSkippable(lines[i])) {
      i += 1;
      continue;
    }
    const ind = indentOf(lines[i]);
    const t = lines[i].trim();
    if (ind < indent || !(t === '-' || t.startsWith('- '))) {
      break;
    }
    if (ind > indent) {
      break;
    }
    const rest = t === '-' ? '' : t.slice(2).trim();
    if (rest === '') {
      const [child, next] = parseNode(lines, i + 1, ind + 1);
      arr.push(child);
      i = next;
      continue;
    }
    if (/^("[^"]*"|'[^']*'|[^\s"'[{][^:]*?):(\s|$)/.test(rest)) {
      const copy = lines.slice();
      copy[i] = ' '.repeat(ind + 2) + rest;
      const [child, next] = parseMap(copy, i, ind + 2);
      arr.push(child);
      i = next;
      continue;
    }
    arr.push(parseScalar(stripComment(rest)));
    i += 1;
  }
  return [arr, i];
}

function parseMap(lines, i, indent) {
  const obj = {};
  while (i < lines.length) {
    if (isSkippable(lines[i])) {
      i += 1;
      continue;
    }
    const line = lines[i];
    const ind = indentOf(line);
    if (ind < indent) {
      break;
    }
    if (ind > indent) {
      i += 1;
      continue;
    }
    const t = line.trim();
    if (t === '-' || t.startsWith('- ')) {
      break;
    }
    const m = /^("[^"]*"|'[^']*'|[^:]+?)\s*:(?:\s+(.*))?$/.exec(t);
    if (!m) {
      i += 1;
      continue;
    }
    const key = String(parseScalar(m[1]));
    const rest = stripComment(m[2] || '');
    if (rest === '') {
      let j = i + 1;
      while (j < lines.length && isSkippable(lines[j])) {
        j += 1;
      }
      if (j < lines.length && (indentOf(lines[j]) > ind || (indentOf(lines[j]) === ind && /^-(\s|$)/.test(lines[j].trim())))) {
        const [child, next] = parseNode(lines, j, indentOf(lines[j]));
        obj[key] = child;
        i = next;
      } else {
        obj[key] = null;
        i += 1;
      }
      continue;
    }
    if (/^[|>][-+]?$/.test(rest)) {
      const [text, next] = parseBlockScalar(lines, i + 1, ind, rest);
      obj[key] = text;
      i = next;
      continue;
    }
    obj[key] = parseScalar(rest);
    i += 1;
  }
  return [obj, i];
}

export function parseYaml(raw) {
  if (!raw || !raw.trim()) {
    return {};
  }
  const lines = raw.replace(/\t/g, '  ').split('\n');
  const [value] = parseNode(lines, 0, 0);
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function needsQuote(s) {
  if (s === '') {
    return true;
  }
  if (/^[\s]|[\s]$/.test(s)) {
    return true;
  }
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(s)) {
    return true;
  }
  if (/: |\s#|\n/.test(s) || s.endsWith(':')) {
    return true;
  }
  if (/^(true|false|null|yes|no|on|off|~)$/i.test(s)) {
    return true;
  }
  if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) {
    return true;
  }
  return false;
}

function yamlScalar(v) {
  if (v === null || v === undefined) {
    return 'null';
  }
  if (typeof v === 'boolean' || typeof v === 'number') {
    return String(v);
  }
  const s = String(v);
  return needsQuote(s) ? JSON.stringify(s) : s;
}

export function stringifyYaml(data, indent = 0) {
  const pad = ' '.repeat(indent);
  let out = '';
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) {
      continue;
    }
    const key = needsQuote(k) ? JSON.stringify(k) : k;
    if (Array.isArray(v)) {
      if (v.length === 0) {
        out += `${pad}${key}: []\n`;
      } else if (v.every((x) => x === null || typeof x !== 'object')) {
        out += `${pad}${key}:\n${v.map((x) => `${pad}  - ${yamlScalar(x)}\n`).join('')}`;
      } else {
        out += `${pad}${key}:\n`;
        for (const item of v) {
          if (item && typeof item === 'object' && !Array.isArray(item)) {
            const inner = stringifyYaml(item, indent + 4).split('\n').filter(Boolean);
            out += `${pad}  - ${inner[0].trimStart()}\n${inner.slice(1).map((l) => `${l}\n`).join('')}`;
          } else {
            out += `${pad}  - ${yamlScalar(item)}\n`;
          }
        }
      }
    } else if (v && typeof v === 'object') {
      out += `${pad}${key}:\n${stringifyYaml(v, indent + 2)}`;
    } else if (typeof v === 'string' && v.includes('\n')) {
      out += `${pad}${key}: |-\n${v.split('\n').map((l) => (l ? `${pad}  ${l}` : '')).join('\n')}\n`;
    } else {
      out += `${pad}${key}: ${yamlScalar(v)}\n`;
    }
  }
  return out;
}
