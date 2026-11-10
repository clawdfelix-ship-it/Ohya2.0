'use strict';

// Disposable loopback-disabled PostgreSQL runner. No ambient environment or .env access.
// AGENT_TEST_PG_URL stays private to the spawned child and contains only localhost credentials.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ohya-agent-api-pg-'));
const data = path.join(root, 'data');
const socket = path.join(root, 'socket');
fs.mkdirSync(data, { mode: 0o700 });
fs.mkdirSync(socket, { mode: 0o700 });
const env = { PATH: process.env.PATH, HOME: root, TMPDIR: root, LC_ALL: 'C' };
const password = 'local-only-disposable';
let server;

function stop() {
  if (server) spawnSync('/opt/homebrew/bin/pg_ctl', ['-D', data, '-m', 'immediate', 'stop'], { env, stdio: 'ignore', timeout: 15000 });
  fs.rmSync(root, { recursive: true, force: true });
}
try {
  fs.writeFileSync(path.join(root, 'pwfile'), password + '\n', { mode: 0o600 });
  for (const [command, args] of [
    ['/opt/homebrew/bin/initdb', ['-D', data, '-U', 'fixture', '--auth=scram-sha-256', `--pwfile=${path.join(root, 'pwfile')}`, '--no-instructions']],
  ]) {
    const result = spawnSync(command, args, { env, encoding: 'utf8', timeout: 30000 });
    if (result.status !== 0) throw new Error('Local initdb failed: ' + result.stderr);
  }
  fs.writeFileSync(path.join(data, 'pg_hba.conf'), 'local all fixture scram-sha-256\n', { mode: 0o600 });
  fs.appendFileSync(path.join(data, 'postgresql.conf'), `\nlisten_addresses = ''\nunix_socket_directories = '${socket}'\nmax_connections = 10\nfsync = off\n`);
  server = spawn('/opt/homebrew/bin/pg_ctl', ['-D', data, '-w', '-t', '20', 'start'], { env, stdio: ['ignore', 'ignore', 'pipe'] });
  server.on('exit', (code) => {
    if (code !== 0) { stop(); process.exitCode = 1; }
    else {
      const args = ['--test', '--test-concurrency=1', 'test/agent-product-local-postgres.cjs'];
      const child = spawn(process.execPath, args, { cwd: path.join(__dirname, '..'), env: { PATH: process.env.PATH, HOME: root, TMPDIR: root, AGENT_TEST_PG_URL: `postgresql://fixture:${password}@localhost:5432/postgres?host=${encodeURIComponent(socket)}` }, stdio: 'inherit' });
      child.on('exit', (testCode) => { process.exitCode = testCode || 0; stop(); });
    }
  });
} catch (error) { console.error(error.message); stop(); process.exitCode = 1; }
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stop(); process.exit(1); });
