#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const uiVersionPath = path.join(root, 'ui', 'version.json');

function safeReadJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}

const pkg = safeReadJson(pkgPath);
if (!pkg) {
  console.error('Could not read package.json at', pkgPath);
  process.exitCode = 1;
  process.exit(1);
}

const version = pkg.version || '0.0.0';
const out = { version };

try {
  fs.writeFileSync(uiVersionPath, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`Wrote version ${version} to ui/version.json`);
} catch (e) {
  console.error('Failed to write ui/version.json:', e);
  process.exitCode = 1;
  process.exit(1);
}
