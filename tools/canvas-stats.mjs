// 读取粒子画布的真实像素统计，用于判断辉光是否生效、亮度是否够。
// 比对着截图肉眼判断可靠得多 —— 截图经过缩放和有损压缩，暗部细节会被吃掉。

import { spawn } from 'node:child_process';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9334;
const url = process.argv[2] || 'http://127.0.0.1:8765/index.html?celebrate&auto';
const evalJs = process.argv[3] || 'S.UI.showPortrait()';
const waitMs = Number(process.argv[4] || 5000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  // 不禁用扩展的话，/json/list 里会混入扩展的 background_page，
  // 很容易连错 target，测出来的全是空白页数据
  '--disable-extensions',
  `--remote-debugging-port=${PORT}`, '--window-size=1440,900',
  '--no-first-run', '--user-data-dir=' + process.env.TEMP + '/hb-stats-profile',
  'about:blank',
], { stdio: 'ignore' });

let nextId = 0;
const pending = new Map();
let ws;
const send = (method, params = {}) => {
  const id = ++nextId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
};

try {
  let targets;
  for (let i = 0; i < 60; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      // 必须限定 type==='page'：扩展后台页也带 webSocketDebuggerUrl，
      // 连错了就会把空白页的数据当成渲染结果
      if (targets.some((t) => t.type === 'page' && t.webSocketDebuggerUrl)) break;
    } catch {}
    await sleep(250);
  }
  const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!page) throw new Error('没找到可调试的普通页面 target');
  console.log(`可调试 target ${targets.length} 个，选中: ${page.type} ${page.url}`);
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url });
  await sleep(3000);

  const errs = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') {
      errs.push(m.params.exceptionDetails.exception?.description
        || m.params.exceptionDetails.text);
    }
  });

  if (evalJs) {
    const r = await send('Runtime.evaluate', { expression: evalJs });
    if (r.exceptionDetails) {
      errs.push(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    }
  }
  await sleep(waitMs);

  const probe = `(function () {
    var out = {};
    // 先报告身份信息：之前踩过坑 —— 探针连到了 about:blank 而不是目标页，
    // 结果误判成「渲染失败」。
    out.href = location.href;
    out.readyState = document.readyState;

    var c = document.querySelector('.canvas');
    if (!c) return JSON.stringify(Object.assign(out, { error: '找不到 .canvas' }));

    out.canvas = { w: c.width, h: c.height };
    out.glowLevel = (typeof S !== 'undefined' && S.Drawing.getGlowLevel)
      ? S.Drawing.getGlowLevel() : 'n/a';

    var ctx = c.getContext('2d');
    var d = ctx.getImageData(0, 0, c.width, c.height).data;

    var lit = 0, sumA = 0, maxA = 0, sumLum = 0, maxLum = 0;
    var minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;

    for (var i = 0; i < d.length; i += 4) {
      var a = d[i + 3];
      if (a === 0) continue;
      lit++;
      sumA += a;
      if (a > maxA) maxA = a;
      var lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      sumLum += lum;
      if (lum > maxLum) maxLum = lum;
      var px = (i / 4) % c.width, py = Math.floor((i / 4) / c.width);
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }

    out.litPixels = lit;
    out.litPercent = +(lit / (c.width * c.height) * 100).toFixed(2);
    out.alpha = { mean: lit ? +(sumA / lit).toFixed(1) : 0, max: maxA };
    out.luminance = { mean: lit ? +(sumLum / lit).toFixed(1) : 0, max: +maxLum.toFixed(1) };
    out.bbox = lit ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : null;

    // 页面里其他视觉层的状态，判断遮挡关系
    var stars = document.querySelector('#stars, .stars, canvas.stars');
    out.starsPresent = !!stars;
    var intro = document.getElementById('intro');
    out.introDisplay = intro ? getComputedStyle(intro).display : 'n/a';
    out.bodyClass = document.body.className;

    return JSON.stringify(out);
  })()`;

  const r = await send('Runtime.evaluate', { expression: probe, returnByValue: true });
  console.log(r.result.value);
  if (errs.length) {
    console.log('页面报错:');
    errs.forEach((e) => console.log('  ' + String(e).split('\n')[0]));
  }
} finally {
  ws?.close();
  chrome.kill();
}
