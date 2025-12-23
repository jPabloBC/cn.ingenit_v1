#!/usr/bin/env node
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { flags: {} };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--ngrok') out.flags.ngrok = true;
    else if (a === '--no-install') out.flags.noInstall = true;
    else if (a.startsWith('--port=')) out.port = a.split('=')[1];
    else if (a.startsWith('--token=')) out.token = a.split('=')[1];
    else if (a === '--help' || a === '-h') out.flags.help = true;
  }
  return out;
}

function runCmd(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, Object.assign({ stdio: 'inherit', shell: true }, opts));
    p.on('error', reject);
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function main() {
  const argv = parseArgs();
  if (argv.flags.help) {
    console.log('Usage: node scripts/run-streamer.js [--port=4000] [--token=TOKEN] [--ngrok] [--no-install]');
    process.exit(0);
  }

  const port = argv.port || process.env.PORT || '4000';
  const token = argv.token || process.env.STREAMER_TOKEN || crypto.randomBytes(16).toString('hex');

  console.log(`Using PORT=${port}`);
  console.log(`Using STREAMER_TOKEN=${token}`);

  try {
    if (!argv.flags.noInstall) {
      console.log('Installing node modules (npm ci)...');
      await runCmd('npm', ['ci']);
    } else {
      console.log('Skipping npm install (--no-install)');
    }

    console.log('Ensuring Playwright browsers are installed (npx playwright install)...');
    await runCmd('npx', ['playwright', 'install']);

    // write .env.local
    const envLocal = `STREAMER_TOKEN=${token}\nPORT=${port}\n`;
    const envPath = path.resolve(process.cwd(), '.env.local');
    fs.writeFileSync(envPath, envLocal, { encoding: 'utf8' });
    console.log(`Wrote ${envPath}`);

    // spawn streamer
    console.log('Starting streamer: node remote-playwright/server.js');
    const server = spawn('node', ['remote-playwright/server.js'], {
      env: Object.assign({}, process.env, { STREAMER_TOKEN: token, PORT: port }),
      stdio: 'inherit',
      shell: true,
    });

    server.on('exit', (code) => {
      console.log('Streamer process exited', code);
      process.exit(code === null ? 0 : code);
    });

    let ngrokProc = null;
    if (argv.flags.ngrok) {
      console.log('Starting ngrok tunnel via npx...');
      // start with stdout pipe so we can capture url
      ngrokProc = spawn('npx', ['ngrok', 'http', port, '--log', 'stdout'], { env: process.env, shell: true });
      ngrokProc.stdout.setEncoding('utf8');
      ngrokProc.stdout.on('data', (chunk) => {
        process.stdout.write(chunk);
        const m = chunk.match(/https:\/\/[^\s]+ngrok.io/);
        if (m) console.log('ngrok URL:', m[0]);
      });
      ngrokProc.stderr.on('data', (d) => process.stderr.write(d));
      ngrokProc.on('exit', (c) => console.log('ngrok exited', c));
    }

    // handle shutdown
    const shutdown = () => {
      console.log('Shutting down...');
      if (ngrokProc && !ngrokProc.killed) ngrokProc.kill();
      if (server && !server.killed) server.kill();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    console.log('\nStreamer running. To stop: Ctrl+C');
    console.log(`If you used --ngrok, check above for an https://...ngrok.io URL to use as your WSS host.`);
    console.log(`Set your UI env: NEXT_PUBLIC_STREAMER_WS=wss://<host> NEXT_PUBLIC_STREAMER_TOKEN=${token}`);
  } catch (err) {
    console.error('Error during setup:', err && err.message ? err.message : err);
    process.exit(1);
  }
}

main();
