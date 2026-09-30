'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFile } = require('node:child_process');
const root = __dirname;
const serverPath = path.join(root, 'server.cjs');
const build = crypto.createHash('sha256').update(fs.readFileSync(serverPath)).digest('hex');
const delay = duration => new Promise(resolve => setTimeout(resolve, duration));
async function status(url) {
  try {
    const response = await fetch(url + '/api/status', { signal: AbortSignal.timeout(700) });
    if (!response.ok) return { occupied: true };
    return await response.json();
  } catch (error) { return null; }
}
function matches(info) { return info && info.app === 'renyicai-desktop' && info.build === build && info.root === root; }
async function launch() {
  for (let port = 17683; port <= 17692; port++) {
    const origin = 'http://127.0.0.1:' + port;
    const existing = await status(origin);
    if (matches(existing)) return origin;
    if (existing) continue;
    const child = spawn(process.execPath, [serverPath, '--port', String(port)], {
      cwd: root, detached: true, windowsHide: true, stdio: 'ignore'
    });
    let failed = false;
    child.on('error', () => { failed = true; });
    child.on('exit', () => { failed = true; });
    child.unref();
    for (let attempt = 0; attempt < 30; attempt++) {
      await delay(100);
      if (matches(await status(origin))) return origin;
      if (failed) break;
    }
  }
  throw new Error('无法启动本机保存服务，请关闭占用端口的程序后重试。');
}
launch().then(origin => {
  console.log('任意裁已启动：' + origin);
  if (!process.argv.includes('--no-browser')) {
    execFile('rundll32.exe', ['url.dll,FileProtocolHandler', origin], { windowsHide: true }, error => {
      if (error) console.error('请在浏览器中打开：' + origin);
    });
  }
}).catch(error => { console.error(error.message); process.exitCode = 1; });
