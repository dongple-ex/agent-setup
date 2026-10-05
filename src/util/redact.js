export const SECRET_KEY = /(pass(word)?|pwd|secret|token|api[_-]?key|private[_-]?key|credential)/i;
export const REFERENCE = /^\$\{[^}]+\}$|^\$[A-Za-z_][A-Za-z0-9_]*$|^\{env:[^}]+\}$|^@@secret:/;

const ASSIGNMENT = /([A-Za-z0-9_.-]+)(?:\\?["'])?[ \t]*[:=][ \t]*/g;
const LITERAL = /^(true|false|null)$/;

function lineEnd(s, from) {
  const i = s.indexOf('\n', from);
  return i < 0 ? s.length : i;
}

function valueSpan(s, from) {
  const eol = lineEnd(s, from);
  if (s.startsWith('\\"', from)) {
    const end = s.indexOf('\\"', from + 2);
    return { from: from + 2, to: end < 0 || end > eol ? eol : end };
  }
  const q = s[from];
  if (q === '"' || q === "'") {
    let i = from + 1;
    while (i < eol && s[i] !== q) {
      i += q === '"' && s[i] === '\\' ? 2 : 1;
    }
    return { from: from + 1, to: Math.min(i, eol) };
  }
  let i = from;
  while (i < eol && !/[\s,;}\]"'\\]/.test(s[i])) {
    i += 1;
  }
  return { from, to: i };
}

export function maskSecretFields(text) {
  const s = String(text);
  let out = '';
  let last = 0;
  ASSIGNMENT.lastIndex = 0;
  let m;
  while ((m = ASSIGNMENT.exec(s)) !== null) {
    if (!SECRET_KEY.test(m[1])) {
      continue;
    }
    if (/^(secret|env)$/i.test(m[1]) && /[{@]/.test(s[m.index - 1] || '')) {
      continue;
    }
    const span = valueSpan(s, m.index + m[0].length);
    const value = s.slice(span.from, span.to);
    ASSIGNMENT.lastIndex = Math.max(ASSIGNMENT.lastIndex, span.to);
    if (!value || value === '***' || REFERENCE.test(value) || LITERAL.test(value)) {
      continue;
    }
    out += `${s.slice(last, span.from)}***`;
    last = span.to;
  }
  return out + s.slice(last);
}
