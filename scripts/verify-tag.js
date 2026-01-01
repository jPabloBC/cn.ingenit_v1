const fs = require('fs');
const path = require('path');

const pkgPath = path.resolve(process.cwd(), 'package.json');
if (!fs.existsSync(pkgPath)) {
  console.error('package.json not found at ' + pkgPath);
  process.exit(2);
}
const pkg = require(pkgPath);
const tag = (process.env.GITHUB_TAG || '');
const tagVer = tag.replace(/^v/, '');
if (tagVer !== pkg.version) {
  console.error(`Tag ${tag} does not match package.json version ${pkg.version}`);
  process.exit(1);
}
console.log('Tag matches package.json version:', pkg.version);
