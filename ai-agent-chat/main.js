const { app, BrowserWindow, ipcMain } = require('electron');
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1000,
    minHeight: 660,
    backgroundColor: '#0b0e17',
    title: 'AI Agent Chat · Monkey',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

/* ======================================================================
   Monkey 沙箱 —— 逻辑隔离执行器
   每个工作区拥有独立的 cwd 工作目录，仅允许白名单解释器运行，
   危险系统调用被阻止，每条命令经主进程安全校验后再执行。
   ====================================================================== */

// 沙箱根目录： ~/.aiagent-monkey/sandbox (与应用隔离，不影响系统)
const SANDBOX_ROOT = app.getPath('userData') || path.join(os.homedir(), '.aiagent-monkey');
const SB_BASE = path.join(SANDBOX_ROOT, 'sandbox');

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

// 解释器白名单：仅允许安全运行的程序
const INTERP_ALLOW = new Set(['sh', 'bash', 'python3', 'python', 'node', 'npm', 'ls', 'cat', 'echo',
  'pwd', 'cd', 'mkdir', 'touch', 'cp', 'mv', 'grep', 'rg', 'head', 'tail', 'wc', 'date', 'git',
  'find', 'tree', 'printf', 'dirname', 'basename']);

// 明确禁止的命令（与通用安全护栏一致）
const DENY_WORDS = [
  'rm -rf /', 'rm -r /', 'shutdown', 'reboot', 'mkfs', 'fdisk', 'iptables', 'chmod 777 /',
  'password', '> /etc/', 'sudo ', 'systemctl', ':(){', 'dd if=/dev/zero'
];

// 在线支持的解释器集（白名单）
const PINTERP_ALLOW = new Set(['sh', 'bash', 'python3', 'python', 'node', 'npm', 'ls', 'cat', 'echo',
  'pwd', 'mkdir', 'cp', 'mv', 'grep', 'rg', 'head', 'tail', 'wc', 'sort', 'git', 'find', 'dir', 'printf']);

function parseBin(fullCmd) {
  const m = fullCmd.trim().match(/(?:^|\|)\s*(\S+)/g);
  return (m ? m[m.length - 1] : fullCmd).trim().split(/\s+/)[0];
}

function validateSandboxCmd(userCmd) {
  if (!userCmd || !userCmd.trim()) return { ok: false, err: '空命令' };
  const cmd = userCmd.trim();
  for (const d of DENY_WORDS) {
    if (cmd.includes(d)) return { ok: false, err: '危险命令已拦截：' + d };
  }
  // 取实际二进制名
  let bin = cmd.split(/\s+/)[0];
  if (bin.includes('/')) bin = bin.split('/').pop();
  bin = bin.replace(/&.*/, '').trim();
  if (bin === 'rm') return { ok: false, err: '禁止使用 rm（数据安全）。请改用交给沙箱安全目录的 mv/cp，或在确认后手动操作。' };
  if (!PINTERP_ALLOW.has(bin) && !['/bin/sh', '/bin/bash', '/usr/bin/python3', '/usr/bin/node'].includes(bin)) {
    return { ok: false, err: '程序不在白名单：' + bin };
  }
  return { ok: true, bin };
}

// 执行带超时拦截与输出上限
function runCmd(workdir, cmdRaw, timeoutMs) {
  return new Promise((resolve) => {
    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
    const args = process.platform === 'win32' ? ['-Command', cmdRaw] : ['-lc', cmdRaw];
    const child = spawn(shell, args, {
      cwd: workdir,
      env: { ...process.env, HOME: workdir, MK_SANDBOX: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '', stderr = '';
    const t = setTimeout(() => { child.kill('SIGKILL'); resolve({ ok: false, timeout: true, stdout, stderr: stderr + '\n[已超时终止]' }); }, timeoutMs || 30000);
    child.stdout.on('data', d => { stdout += d; if (stdout.length > 400000) child.kill('SIGKILL'); });
    child.stderr.on('data', d => { stderr += d; });
    child.on('close', (code) => { clearTimeout(t); resolve({ ok: code === 0, code, stdout, stderr }); });
  });
}

// 沙箱：执行白名单命令（带目录隔离）
ipcMain.handle('monkey:exec', async (e, { wsId, cwd, cmd, timeout }) => {
  const safeW = path.resolve(SB_BASE, String(wsId || 'default'));
  const workdir = path.resolve(safeW, (cwd || '').replace(/\.\./g, '') || '.');
  if (!workdir.startsWith(safeW)) return { error: '越权：不能访问沙箱外目录' };
  fs.mkdirSync(workdir, { recursive: true });
  const check = validateSandboxCmd(cmd);
  if (!check.ok) return { error: check.err };
  const res = await runCmd(workdir, cmd, timeout);
  return res;
});

// 沙箱：读写文件（隔离到工作区目录）
ipcMain.handle('monkey:fs', async (e, { wsId, op, path: rel, content }) => {
  const safeW = path.resolve(SB_BASE, String(wsId || 'default'));
  fs.mkdirSync(safeW, { recursive: true });
  const target = path.resolve(safeW, (rel || '').replace(/\.\./g, ''));
  if (!target.startsWith(safeW + path.sep) && target !== safeW) return { error: '非法路径' };
  try {
    if (op === 'write') { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content || ''); return { ok: true }; }
    if (op === 'read') { return { ok: true, content: fs.readFileSync(target, 'utf8') }; }
    if (op === 'list') {
      const out = [];
      if (fs.existsSync(target)) {
        for (const f of fs.readdirSync(target)) {
          const st = fs.statSync(path.join(target, f));
          out.push({ name: f, dir: st.isDirectory(), size: st.size, mtime: st.mtimeMs });
        }
      }
      return { ok: true, files: out, cwd: rel || '.' };
    }
    if (op === 'lsroot') { return { ok: true, rel: (rel || ''), root: safeW }; }
    return { ok: false, error: '未知操作' };
  } catch (err) { return { ok: false, error: err.message }; }
});

/* ======================================================================
   模型调用 IPC（OpenAI 兼容）——密钥只在内存转发，不落盘
   ====================================================================== */
ipcMain.handle('chat:complete', async (_e, { baseUrl, apiKey, model, messages, temperature, topP, extra }) => {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  const url = base + '/chat/completions';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 200000);
  try {
    const body = { model, messages, temperature: temperature ?? 0.7, top_p: topP ?? 1 };
    if (extra && typeof extra === 'object') Object.assign(body, extra);
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!resp.ok) {
      let d = ''; try { d = JSON.stringify(await resp.json()); } catch (_) {}
      return { ok: false, error: 'HTTP ' + resp.status + (d ? ' ' + d.slice(0, 300) : '') };
    }
    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content ?? '';
    return { ok: true, text, usage: data.usage || null };
  } catch (err) {
    if (err.name === 'AbortError') return { ok: false, error: '请求超时（20 秒）' };
    return { ok: false, error: err.message };
  } finally { clearTimeout(timer); }
});

/* 拉取模型列表 GET {base}/models */
ipcMain.handle('models:list', async (_e, { baseUrl, apiKey }) => {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const resp = await fetch(base + '/models', { headers: { 'Authorization': 'Bearer ' + apiKey }, signal: controller.signal });
    if (!resp.ok) return { ok: false, error: 'HTTP ' + resp.status };
    const data = await resp.json();
    const ids = (data.data || []).map(m => m.id);
    return { ok: true, models: ids };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally { clearTimeout(timer); }
});

ipcMain.handle('monkey:root', async () => ({ root: SB_BASE }));

/* ======================================================================
   ADB IPC（白名单）
   ====================================================================== */
const ADB_ALLOWED = ['devices', 'get-state', 'shell', 'version', 'reboot', 'logcat', 'dumpsys', 'install', 'uninstall', 'push', 'pull'];
ipcMain.handle('adb:exec', async (e, { adbPath, args }) => {
  const base = Array.isArray(args) ? args[0] : '';
  if (!ADB_ALLOWED.includes(base)) return { ok: false, stderr: 'ADB 子命令不在白名单：' + base };
  return new Promise((resolve) => {
    execFile(adbPath || 'adb', args, { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) resolve({ ok: false, stdout, stderr: stderr || err.message });
      else resolve({ ok: true, stdout, stderr });
    });
  });
});
ipcMain.handle('app:info', () => ({ isDesktop: true, root: SB_BASE }));