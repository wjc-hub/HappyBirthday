// 无头截图工具：用 CDP 精确控制演出进度后截图，供开发时核对视觉效果。
//
// 为什么不用 chrome --screenshot：那条路径只能在页面 load 后立刻截图，
// 而本项目的画面要靠 rAF 缓动若干秒才成形。--virtual-time-budget 虽能快进，
// 但它同时快进 rAF，粒子会停在半路，截出来的东西不能代表真实观感。
//
// 用法：
//   node tools/shot.mjs <输出png> [选项]
//     --url=<地址>        默认 http://127.0.0.1:8765/index.html?celebrate&auto
//     --wait=<毫秒>       截图前等待的真实时间，默认 4000
//     --eval=<JS>         等待前执行的表达式，例如 "S.UI.showPortrait()"
//     --evalDelay=<毫秒>  eval 前额外等一会儿，默认 0
//                         本机 loadEventFired 有时早于真实导航完成，此时
//                         eval 会落在 about:blank 上（document 里什么都没有），
//                         改成"过 1500 毫秒再 eval"即可绕开
//     --clip=x,y,w,h      只截取该矩形，便于放大看细节
//     --size=<宽x高>      视口尺寸，默认 1440x900

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;

const args = process.argv.slice(2);
const out = args.find((a) => !a.startsWith('--'));
if (!out) {
  console.error('用法: node tools/shot.mjs <输出png> [--url=..] [--wait=ms] [--eval=js] [--clip=x,y,w,h] [--size=WxH]');
  process.exit(1);
}

const opt = (name, dflt) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? dflt : hit.slice(name.length + 3);
};

const url = opt('url', 'http://127.0.0.1:8765/index.html?celebrate&auto');
const wait = Number(opt('wait', '4000'));
const evalJs = opt('eval', '');
const evalDelay = Number(opt('evalDelay', '0'));
const clip = opt('clip', '');
const [vw, vh] = opt('size', '1440x900').split('x').map(Number);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  // 不禁用扩展的话 /json/list 会混入扩展的 background_page，
  // 连错 target 就会截出一张空白页
  '--disable-extensions',
  `--remote-debugging-port=${PORT}`,
  `--window-size=${vw},${vh}`,
  '--no-first-run',
  '--user-data-dir=' + process.env.TEMP + '/hb-shot-profile',
  'about:blank',
], { stdio: 'ignore' });

// CDP 请求/响应配对
let nextId = 0;
const pending = new Map();
let ws;

function send(method, params = {}, sessionId) {
  const id = ++nextId;
  ws.send(JSON.stringify({ id, method, params, sessionId }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

try {
  // 等 DevTools 端点就绪
  let targets;
  for (let i = 0; i < 60; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      // 必须限定 type==='page'：扩展后台页也带 webSocketDebuggerUrl
      if (targets.some((t) => t.type === 'page' && t.webSocketDebuggerUrl)) break;
    } catch {}
    await sleep(250);
  }
  const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!page) throw new Error('没找到可调试的普通页面 target');

  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');

  // 视口必须显式钉死。--window-size 只是窗口，不等于页面视口 ——
  // 实测报回过"窗口 1080、innerWidth 1418"，截图被缩过一道，
  // 于是 --clip 的坐标整体对不上，曾经顺着这个假象改了两轮样式。
  // 这里覆盖成 1:1，之后 clip 的坐标系和截图逐像素一致。
  await send('Emulation.setDeviceMetricsOverride', {
    width: vw, height: vh, deviceScaleFactor: 1, mobile: false,
  });

  // 关掉 HTTP 缓存。
  //
  // 这个工具复用同一个用户目录（加快启动），代价是 js/config.js 这类
  // 子资源会被磁盘缓存留住 —— 改完配色截图，看到的还是上一版的颜色。
  // 已经因此误判过一次，这里直接禁掉。
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });

  // 收集页面报错，渲染崩了要能看见，而不是只看到一张黑图
  const errors = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(msg.params.exceptionDetails.exception?.description
        || msg.params.exceptionDetails.text);
    }
  });

  await send('Page.navigate', { url });
  await new Promise((res) => {
    const on = (ev) => {
      if (JSON.parse(ev.data).method === 'Page.loadEventFired') {
        ws.removeEventListener('message', on);
        res();
      }
    };
    ws.addEventListener('message', on);
    setTimeout(res, 15000);
  });

  if (evalJs) {
    if (evalDelay > 0) await sleep(evalDelay);
    const r = await send('Runtime.evaluate', {
      expression: evalJs,
      awaitPromise: true,
      returnByValue: true,
    });
    // 把返回值打出来：eval 落在错误上下文时（例如 about:blank），
    // 只看"报错/没报错"分不清，能读到 document.URL 才查得下去
    if (r.result && r.result.value !== undefined) {
      console.log(`eval → ${JSON.stringify(r.result.value)}`);
    }
    if (r.exceptionDetails) {
      errors.push(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    }
  }

  await sleep(wait);

  // 顺手量一下帧率，判断辉光有没有把性能吃掉
  const fps = await send('Runtime.evaluate', {
    expression: `new Promise(res => {
      let n = 0, t0 = performance.now();
      function tick() { n++; performance.now() - t0 < 1000 ? requestAnimationFrame(tick) : res(n); }
      requestAnimationFrame(tick);
    })`,
    awaitPromise: true,
  });

  const shotParams = { format: 'png' };
  if (clip) {
    const [x, y, w, h] = clip.split(',').map(Number);
    shotParams.clip = { x, y, width: w, height: h, scale: 1 };
  }
  const shot = await send('Page.captureScreenshot', shotParams);

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(shot.data, 'base64'));

  console.log(`已保存 ${out}`);
  console.log(`帧率约 ${fps.result.value} fps`);
  if (errors.length) {
    console.log('页面报错:');
    errors.forEach((e) => console.log('  ' + String(e).split('\n')[0]));
  } else {
    console.log('无页面报错');
  }
} finally {
  ws?.close();
  chrome.kill();
}
