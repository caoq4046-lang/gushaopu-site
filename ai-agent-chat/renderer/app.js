'use strict';

/* AI Agent Chat · 渲染层
   轻量无框架 · 双模式：桌面(IPC沙箱) / Web预览(受限执行) */

const $ = s => document.querySelector(s);
const api = window.electronAPI || null;
const state = {
  desktop: !!(api && api.isDesktop),
  workspaces: [],
  current: null,
  settings: null,
  busy: false,
  adbPath: ''
};

const COLORS = ['#5ea8ff', '#9a7dff', '#3fd08f', '#ffb454', '#ff6b7a', '#31c4e3', '#f29be0', '#a3e635'];
const AVATARS = ['🧠', '⚡', '🛠', '🌙', '🔮', '✨', '🚀', '🌊', '🧭'];
let cIdx = 0, aIdx = 0;

/* ---------- 持久化 ---------- */
function persist() {
  try {
    localStorage.setItem('aichat.v3', JSON.stringify({
      workspaces: state.workspaces.map(w => ({ id: w.id, name: w.name, color: w.color, ava: w.ava, messages: w.messages, sandbox: w.sandbox || { cwd: '.' } })),
      current: state.current, settings: state.settings, adbPath: state.adbPath
    }));
  } catch (_) {}
}
function load() {
  try {
    const d = JSON.parse(localStorage.getItem('aichat.v3') || 'null');
    if (d) { state.workspaces = d.workspaces || []; state.current = d.current; state.settings = d.settings; state.adbPath = d.adbPath || ''; }
  } catch (_) {}
}

/* ---------- 沙箱 Monkey ---------- */
const Sandbox = {
  cwd: '.',
  async exec(cmd, timeout) {
    if (api) {
      const r = await api.monkeyExec({ wsId: state.current, cwd: this.cwd, cmd, timeout });
      if (r && r.error) return { ok: false, stderr: r.error };
      return r;
    }
    return this._web(cmd);
  },
  async fs(op, rel, content) {
    if (api) return api.monkeyFs({ wsId: state.current, op, path: rel, content });
    return { ok: false, error: 'Web 预览模式沙箱只读' };
  },
  _web(cmd) {
    const c = cmd.trim(), k = c.toLowerCase();
    if (k.startsWith('echo ')) return Promise.resolve({ ok: true, stdout: c.slice(5).replace(/^"|"$/g, '') + '\n', stderr: '' });
    if (k === 'pwd') return Promise.resolve({ ok: true, stdout: this.cwd + '\n', stderr: '' });
    if (k.startsWith('ls')) return Promise.resolve({ ok: true, stdout: '· src/\n· assets/\n· README.md\n（Web 预览占位）\n', stderr: '' });
    if (k.startsWith('cat ')) return Promise.resolve({ ok: true, stdout: '# 预览沙箱\n真实代码执行需桌面版。\n', stderr: '' });
    return Promise.resolve({ ok: false, stdout: '', stderr: '[Web 预览] 该命令需桌面版沙箱执行。' });
  }
};

/* ---------- 模型调用（OpenAI 兼容） ---------- */
function normBase(u) { return (u || '').trim().replace(/\/+$/, ''); }
const normUrl = normBase;
function configured() { const s = state.settings; return !!(s && s.baseUrl && s.apiKey && s.model); }

async function askModel(messages, params) {
  const s = state.settings;
  if (!configured()) throw new Error('请先在「模型接口设置」完成配置');
  const thinking = params?.thinking ?? s.thinking ?? 'off';
  const bodyExtra = {};
  if (thinking && thinking !== 'off') bodyExtra.reasoning_effort = thinking;
  const p = { baseUrl: normBase(s.baseUrl), apiKey: s.apiKey, model: s.model, messages, temperature: +(params?.temp ?? s.temperature ?? 0.7), topP: +(params?.topP ?? s.topP ?? 1), extra: bodyExtra };
  if (api) {
    const r = await api.chatComplete(p);
    if (!r.ok) throw new Error(r.error || '调用失败');
    return { text: r.text || '', usage: r.usage || null };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);
  try {
    const resp = await fetch(p.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + p.apiKey },
      body: JSON.stringify({ model: p.model, messages: p.messages, temperature: p.temperature, top_p: p.topP, ...p.extra }),
      signal: ctrl.signal
    });
    if (!resp.ok) { let d = ''; try { d = JSON.stringify(await resp.json()); } catch (_) {} throw new Error('HTTP ' + resp.status + ' ' + d.slice(0, 160)); }
    const data = await resp.json();
    return { text: data.choices?.[0]?.message?.content || '', usage: data.usage || null };
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('请求超时');
    if (e instanceof TypeError) throw new Error('网络/跨域错误：预览模式需接口允许 CORS');
    throw e;
  } finally { clearTimeout(timer); }
}

/* 拉取模型列表 GET {base}/models */
async function fetchModels() {
  const host = normBase($('#fBase').value);
  const key = $('#fKey').value.trim();
  if (!host) throw new Error('请先填写 Base URL');
  if (!key) throw new Error('请先填写 API Key，再拉取模型列表');
  if (api) {
    return api.listModels({ baseUrl: host, apiKey: key });
  }
  const resp = await fetch(host + '/models', { headers: { 'Authorization': 'Bearer ' + key } });
  if (!resp.ok) throw new Error('HTTP ' + resp.status + '：无法拉取模型列表');
  const data = await resp.json();
  return (data.data || []).map(m => m.id);
}

/* ---------- 轻量 Markdown ---------- */
function md(src) {
  if (!src) return '';
  let s = src.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const blocks = [];
  s = s.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, __, code) => { blocks.push(code.trim()); return '\u0000' + (blocks.length - 1) + '\u0000'; });
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/^### (.*)$/gm, '<h4>$1</h4>').replace(/^## (.*)$/gm, '<h3>$1</h3>').replace(/^# (.*)$/gm, '<h3>$1</h3>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  s = s.replace(/^\s*\* (.*)$/gm, '• $1').replace(/^\s*- (.*)$/gm, '• $1');
  const parts = s.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  return parts.map(p => {
    const m = p.match(/^\u0000(\d+)\u0000$/);
    if (m) return '<pre><code>' + (blocks[+m[1]] || '') + '</code></pre>';
    return '<p>' + p.replace(/\n/g, '<br>') + '</p>';
  }).join('');
}

/* ---------- 渲染 ---------- */
function cur() { return state.workspaces.find(w => w.id === state.current); }

function renderWs() {
  const el = $('#wsList'); el.innerHTML = '';
  if (!state.workspaces.length) { el.innerHTML = '<div class="empty">暂无工作区，点＋新建</div>'; return; }
  state.workspaces.forEach(w => {
    const i = document.createElement('div');
    i.className = 'wsitem' + (w.id === state.current ? ' active' : '');
    i.id = 'ws-' + w.id;
    i.innerHTML = `<div class="ava" style="background:${w.color}">${w.ava}</div>
      <div class="info"><div class="nm">${esc(w.name)}</div><div class="pm">${w.messages.length} 条消息</div></div>
      <button class="del" title="删除">✕</button>`;
    i.onclick = e => { if (e.target.classList.contains('del')) return; switchWs(w.id); };
    i.querySelector('.del').onclick = e => { e.stopPropagation(); deleteWs(w.id); };
    el.appendChild(i);
  });
}

function renderChat() {
  const chat = $('#chat'); chat.innerHTML = '';
  const w = cur(); if (!w) return;
  if (!w.messages.length) {
    const ok = configured();
    chat.innerHTML = `<div class="placeholder"><div><h2>${w.ava} ${esc(w.name)}</h2>
      <p>${ok ? '向 AI Agent 提问，它会在下方回答。开启「携带上下文」保持连贯。' : '先点右上角 ⚙ 配置模型接口（OpenAI 兼容 / 自定义 Base URL）。'}</p>
    </div></div>`;
    return;
  }
  w.messages.forEach(m => appendMsg(m));
}
function appendMsg(m) {
  const chat = $('#chat');
  const el = document.createElement('div');
  el.className = 'msg ' + (m.role === 'user' ? 'me' : 'ai');
  el.innerHTML = `<div class="ava">${m.role === 'user' ? '你' : 'AI'}</div>
    <div class="bubble"><div class="who">${m.role === 'user' ? '你' : 'Agent'}</div>
    <div class="text">${mdTxt(m)}</div></div>`;
  if (m.error) el.querySelector('.bubble').classList.add('errbubble');
  chat.appendChild(el); chat.scrollTop = chat.scrollHeight;
}
function mdTxt(m) { return md(m.content) + (m.streaming ? '<span class="cursor"></span>' : ''); }

function updateModel() {
  if (configured()) { $('#mName').textContent = state.settings.model; $('#mDot').className = 'stat-dot on'; }
  else { $('#mName').textContent = '未配置'; $('#mDot').className = 'stat-dot off'; }
}
function refreshHeader() {
  const w = cur();
  if (w) { $('#curTtl').textContent = w.ava + ' ' + w.name; $('#curSub').textContent = 'Monkey 沙箱 · ' + w.messages.length + ' 条消息'; }
}

/* ---------- 工作区 ---------- */
function newWs() {
  $('#wsName').value = '';
  $('#wsModal').classList.add('show');
  setTimeout(() => $('#wsName').focus(), 30);
}
function createWsFromInput() {
  const name = ($('#wsName').value || '').trim() || ('工作区 ' + (state.workspaces.length + 1));
  const w = { id: 'ws' + Date.now(), name, color: COLORS[cIdx++ % COLORS.length], ava: AVATARS[aIdx++ % AVATARS.length], messages: [], sandbox: { cwd: '.' } };
  w.messages.push({ role: 'assistant', content: '这是你的新工作区。我是 AI Agent，能按你的描述生成并（在桌面版）于 **Monkey 沙箱** 安全运行代码。先去右上角 ⚙ 配置模型接口，然后开始吧。' });
  state.workspaces.push(w); state.current = w.id; Sandbox.cwd = '.';
  $('#wsModal').classList.remove('show');
  persist(); renderWs(); renderChat(); refreshHeader(); updateModel();
}
function switchWs(id) {
  const w = state.workspaces.find(x => x.id === id); if (!w) return;
  state.current = id; Sandbox.cwd = w.sandbox.cwd || '.';
  persist(); renderWs(); renderChat(); refreshHeader(); updateModel();
}
function deleteWs(id) {
  const w = state.workspaces.find(x => x.id === id); if (!w) return;
  confirmDialog('删除工作区「' + w.name + '」？', '该工作区及其消息将一并删除，且不可恢复。', () => {
    const t = state.workspaces.find(x => x.id === id); if (!t) return;
    state.workspaces = state.workspaces.filter(x => x.id !== id);
    if (state.current === id) state.current = state.workspaces.length ? state.workspaces[0].id : null;
    persist(); renderWs(); renderChat(); refreshHeader();
  });
}

/* ---------- 发送 ---------- */
async function send() {
  if (state.busy) return;
  const inp = $('#input'); const text = inp.value.trim();
  if (!text) return;
  const w = cur(); if (!w) { toast('请先新建工作区', true); return; }
  if (!configured()) { toast('请先配置模型接口', true); openSettings(); return; }

  w.messages.push({ role: 'user', content: text });
  const asst = { role: 'assistant', content: '', streaming: true };
  w.messages.push(asst);
  inp.value = ''; autoGrow();
  state.busy = true; $('#sendBtn').disabled = true;
  persist(); renderChat();

  let history = w.messages.slice(0, -2).filter(m => m.role !== 'system');
  if (!$('#ctxOn').checked) history = [];
  const messages = history.concat({ role: 'user', content: text }).map(m => ({ role: m.role, content: m.content }));

  try {
    const res = await askModel(messages);
    asst.content = res.text || '(空回复)'; asst.streaming = false;
    if (res.usage) asst.meta = '↑' + (res.usage.prompt_tokens ?? '-') + ' ↓' + (res.usage.completion_tokens ?? '-');
  } catch (err) {
    asst.content = '⚠ 调用失败：' + err.message; asst.error = true; asst.streaming = false;
  }
  state.busy = false; $('#sendBtn').disabled = false;
  persist(); renderChat(); $('#input').focus();
}

/* ---------- 设置 ---------- */
function openSettings() {
  const s = state.settings || { mode: 'openai' };
  document.querySelectorAll('#provSel button').forEach(b => b.classList.toggle('on', b.dataset.v === (s.mode || 'openai')));
  $('#baseGroup').style.display = (s.mode || 'openai') === 'custom' ? '' : 'none';
  $('#fBase').value = s.baseUrl || ''; $('#fKey').value = s.apiKey || ''; $('#fModel').value = s.model || '';
  $('#fTemp').value = s.temperature ?? 0.7; $('#fTop').value = s.topP ?? 1;
  const th = s.thinking || 'off';
  document.querySelectorAll('#thinkSel button').forEach(b => b.classList.toggle('on', b.dataset.v === th));
  $('#modelListWrap').style.display = 'none';
  $('#cfgResult').innerHTML = '';
  $('#settingsModal').classList.add('show');
}
function closeSettings() { $('#settingsModal').classList.remove('show'); }
function collectCfg() {
  const mode = document.querySelector('#provSel .on').dataset.v;
  return { mode, baseUrl: normUrl(mode === 'custom' ? $('#fBase').value : $('#fBase').value), apiKey: $('#fKey').value.trim(), model: $('#fModel').value.trim(), temperature: +$('#fTemp').value, topP: +$('#fTop').value, thinking: document.querySelector('#thinkSel .on').dataset.v };
}
function setCfg(r, msg) { $('#cfgResult').innerHTML = `<span class="${r}-txt">${esc(msg)}</span>`; }
function saveCfg() {
  const c = collectCfg();
  if (!norm(c.baseUrl)) { setCfg('err', '请填写 Base URL'); return; }
  if (!c.model) { setCfg('err', '请填写模型名称'); return; }
  state.settings = c; persist(); updateModel(); closeSettings(); toast('配置已保存'); renderChat();
}
async function testCfg() {
  const c = collectCfg();
  if (!norm(c.baseUrl) || !c.model) { setCfg('err', '请先填写 Base URL 与模型'); return; }
  setCfg('mut', '测试中…');
  const prev = state.settings; state.settings = c;
  try { await askModel([{ role: 'user', content: '仅回复 ok' }]); setCfg('ok', '✅ 连接成功：' + c.model); toast('连接成功'); }
  catch (e) { setCfg('err', '失败：' + e.message); }
  state.settings = prev;
}

/* ---------- ADB ---------- */
async function scanDev() {
  if (!api) { adLog('[预览] ADB 需桌面版'); return; }
  setLog('$ adb devices -l');
  const r = await api.adbExec({ adbPath: state.adbPath || 'adb', args: ['devices', '-l'] });
  setLog((r.stdout || r.stderr || '').trim());
  const devs = (r.stdout || '').split('\n').slice(1).map(l => l.trim()).filter(l => l).map(l => l.split(/\s+/)[0]);
  const list = $('#devlist');
  if (devs.length) list.innerHTML = devs.map(d => `<div class="dev on"><span class="dot"></span><span class="did">${esc(d)}</span></div>`).join('');
  else list.innerHTML = '<div class="dev-empty">无设备，请开启 USB 调试并连接。</div>';
  $('#adbPill').textContent = devs.length ? '已连接 ' + devs.length : '未连接';
  $('#adbPill').className = devs.length ? 'pill on' : 'pill off';
}
async function runAdb(args) {
  if (!api) { setLog('⛔ ADB 需桌面版'); return; }
  setLog('$ adb ' + args.join(' '));
  const r = await api.adbExec({ adbPath: state.adbPath || 'adb', args });
  const t = (r.stdout || '') || (r.stderr || '') || (r.ok ? '' : 'ERROR');
  if (t) setLog(t.trim());
}
function setLog(t) {
  const out = $('#adOut');
  const curTxt = out.textContent.trim();
  const base = curTxt === '—— ADB 输出 —— 使用上方命令按钮或输入参数' || curTxt === '' ? '' : curTxt + '\n';
  out.textContent = base + t;
  out.scrollTop = out.scrollHeight;
}
function adbCmdLine() { const v = $('#conInput').value.trim(); if (v) { runAdb(v.split(/\s+/)); $('#conInput').value = ''; } }

/* ---------- 小工具 ---------- */
let toastTimer;
function toast(msg, isErr) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.className = 'toast', 2600);
}
function autoGrow() { const t = $('#input'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 160) + 'px'; }
function norm(s) { return (s || '').trim(); }
let confirmCb = null;
function confirmDialog(title, msg, onOk) {
  $('#confirmTxt').textContent = title;
  $('#confirmMsg').textContent = msg;
  confirmCb = onOk;
  $('#confirmModal').classList.add('show');
}
$('#confirmYes').addEventListener('click', () => { $('#confirmModal').classList.remove('show'); if (confirmCb) confirmCb(); confirmCb = null; });
$('#confirmNo').addEventListener('click', () => { $('#confirmModal').classList.remove('show'); confirmCb = null; });

/* 拉取模型列表 */
async function doFetchModels() {
  const wrap = $('#modelListWrap'), sel = $('#modelList'), btn = $('#fetchModelsBtn');
  try {
    btn.disabled = true; btn.textContent = '拉取中…';
    const ids = await fetchModels();
    if (!ids || !ids.length) { setCfg('err', '该接口未返回模型列表'); return; }
    const cur = $('#fModel').value;
    sel.innerHTML = '<option value="">— 选择模型 —</option>' + ids.map(m => `<option value="${m}" ${m === cur ? 'selected' : ''}>${m}</option>`).join('');
    wrap.style.display = '';
    btn.textContent = '刷新';
    toast('已拉取 ' + ids.length + ' 个模型');
  } catch (e) { setCfg('err', '拉取失败：' + e.message); }
  finally { btn.disabled = false; }
}
$('#fetchModelsBtn').addEventListener('click', doFetchModels);
$('#modelList').addEventListener('change', () => { const v = $('#modelList').value; if (v) $('#fModel').value = v; });

/* 思考深度选择 */
$('#thinkSel').addEventListener('click', e => {
  const btn = e.target.closest('button'); if (!btn) return;
  document.querySelectorAll('#thinkSel button').forEach(b => b.classList.toggle('on', b === btn));
});

/* ---------- 启动 ---------- */
(function init() {
  $('#modeTag').textContent = api ? '桌面' : '预览';
  load();
  if (!state.workspaces.length) {
    const w = { id: 'ws0', name: '我的工作区', color: COLORS[0], ava: '🧠', messages: [], sandbox: { cwd: '.' } };
    w.messages.push({ role: 'assistant', content: '欢迎使用 **AI Agent Chat**。\n\n这是一个轻量的 AI Agent 桌面应用：\n• 多工作区，各自独立上下文与沙箱\n• 支持 OpenAI 兼容接口 + 自定义 Base URL\n• Monkey 沙箱：AI 生成的代码可安全执行\n• 内置 ADB 面板（本机需装 adb）\n\n先在右上角 ⚙ 配置你的模型接口，然后开始。' });
    state.workspaces.push(w); state.current = w.id;
  }
  state.adbPath = state.adbPath || '';

  renderWs(); renderChat(); refreshHeader(); updateModel();

  $('#addWs').addEventListener('click', newWs);
  $('#wsOk').addEventListener('click', createWsFromInput);
  $('#wsCancel').addEventListener('click', () => $('#wsModal').classList.remove('show'));
  $('#wsName').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); createWsFromInput(); } });
  $('#openSettings').addEventListener('click', openSettings);
  $('#settingsForm').addEventListener('submit', e => { e.preventDefault(); saveCfg(); });
  $('#cancelBtn').addEventListener('click', closeSettings);
  $('#testBtn').addEventListener('click', testCfg);
  $('#toggleAdb').addEventListener('click', () => $('#rightbar').classList.toggle('open'));
  $('#sendBtn').addEventListener('click', send);
  $('#input').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  $('#input').addEventListener('input', autoGrow);
  $('#scanBtn').addEventListener('click', scanDev);
  $('#conSend').addEventListener('click', adbCmdLine);
  $('#conInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); adbCmdLine(); } });
  $('#adbPath').addEventListener('change', e => { state.adbPath = e.target.value; persist(); });
  document.querySelectorAll('.acmd').forEach(b => b.addEventListener('click', () => { const c = b.dataset.c; if (c) runAdb(c.split(/\s+/)); }));
  $('#provSel').addEventListener('click', e => {
    const btn = e.target.closest('button'); if (!btn) return;
    document.querySelectorAll('#provSel button').forEach(b => b.classList.toggle('on', b === btn));
    $('#baseGroup').style.display = btn.dataset.v === 'custom' ? '' : 'none';
  });

  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSettings(); });
})();