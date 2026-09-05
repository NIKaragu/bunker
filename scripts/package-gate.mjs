import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const [scope, script] = process.argv.slice(2);
if (!['.', 'frontend', 'backend'].includes(scope) || !/^[a-z][a-z0-9:-]*$/.test(script ?? '')) throw new Error('Invalid package gate');
const cwd = path.resolve(scope);
const file = path.join(cwd, 'package.json');
if (!fs.existsSync(file) || !JSON.parse(fs.readFileSync(file, 'utf8')).scripts?.[script]) {
  console.error(`BLOCKED: ${scope}/package.json has no ${script} script. Bootstrap the real product gate first.`);
  process.exitCode = 1;
} else {
  // cmd.exe is used only to execute pnpm.cmd with validated fixed arguments on Windows.
  const result = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', `pnpm.cmd run ${script}`], { cwd, stdio: 'inherit', windowsHide: true })
    : spawnSync('pnpm', ['run', script], { cwd, stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
}
