const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const outLog = path.resolve(process.cwd(), 'build.log');
const exitFile = path.resolve(process.cwd(), 'build.exit');
const out = fs.createWriteStream(outLog, { flags: 'a' });

console.log('Running npm run build, logging to', outLog);

const child = spawn('npm', ['run', 'build'], { shell: true });
child.stdout.on('data', (d) => { process.stdout.write(d); out.write(d); });
child.stderr.on('data', (d) => { process.stderr.write(d); out.write(d); });
child.on('close', (code) => {
  fs.writeFileSync(exitFile, `EXIT_CODE:${code}\n`);
  out.end(() => {
    console.log('Build finished with code', code);
    process.exit(code === 0 ? 0 : 0); // don't fail workflow here; we capture logs and let later steps decide
  });
});
