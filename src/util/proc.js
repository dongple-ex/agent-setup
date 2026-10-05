import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const IS_WIN = process.platform === 'win32';
const META = /([()\][%!^"`<>&|;, *?])/g;

export function which(cmd, env = process.env) {
  if (!cmd) {
    return null;
  }
  if (cmd.includes('/') || cmd.includes('\\')) {
    return fs.existsSync(cmd) ? cmd : null;
  }
  const dirs = (env.PATH || env.Path || '').split(path.delimiter).filter(Boolean);
  const exts = IS_WIN ? (env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').map((e) => e.toLowerCase()) : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, IS_WIN && !cmd.toLowerCase().endsWith(ext) ? cmd + ext : cmd);
      try {
        const st = fs.statSync(candidate);
        if (st.isFile()) {
          return candidate;
        }
      } catch {
        continue;
      }
    }
  }
  return null;
}

export function escapeCmdCommand(cmd) {
  return cmd.replace(META, '^$1');
}

export function escapeCmdArgument(arg, batch) {
  let a = String(arg);
  a = a.replace(/(\\*)"/g, '$1$1\\"');
  a = a.replace(/(\\*)$/, '$1$1');
  a = `"${a}"`;
  a = a.replace(META, '^$1');
  if (batch) {
    a = a.replace(META, '^$1');
  }
  return a;
}

function windowsShimInvocation(resolved, args) {
  const line = [escapeCmdCommand(path.normalize(resolved)), ...args.map((a) => escapeCmdArgument(a, true))].join(' ');
  return { file: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', `"${line}"`], verbatim: true };
}

function invocation(cmd, args, env) {
  const resolved = which(cmd, env || process.env) || cmd;
  if (IS_WIN && /\.(cmd|bat)$/i.test(resolved)) {
    return windowsShimInvocation(resolved, args);
  }
  return { file: resolved, args, verbatim: false };
}

export function run(cmd, args = [], opts = {}) {
  const inv = invocation(cmd, args, opts.env);
  const r = spawnSync(inv.file, inv.args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: opts.timeout || 60000,
    cwd: opts.cwd,
    env: opts.env,
    input: opts.input,
    maxBuffer: 32 * 1024 * 1024,
    windowsVerbatimArguments: inv.verbatim,
  });
  return {
    code: typeof r.status === 'number' ? r.status : -1,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    error: r.error || null,
  };
}

export function runInherit(cmd, args = [], opts = {}) {
  const inv = invocation(cmd, args, opts.env);
  const r = spawnSync(inv.file, inv.args, { stdio: 'inherit', windowsHide: false, cwd: opts.cwd, env: opts.env, windowsVerbatimArguments: inv.verbatim });
  if (r.error) {
    throw r.error;
  }
  return typeof r.status === 'number' ? r.status : 1;
}

export function firstLine(text) {
  return (text || '').split(/\r?\n/).find((l) => l.trim()) || '';
}
