/*

  内容校验
  ========
  推之前跑一遍：

      node tools/check-data.mjs

  它检查的是 v1 踩过的坑，不是风格问题：

    1. years.js 里的年份，是否真的有对应的数据文件
    2. milestones 的日期格式、是否落在该年
    3. photos / cover 引用的图，文件是否真的存在
       （v1 的坑：images/2025/ 空目录，但 data 里引了 4 张图）
    4. 占位文案有没有泄漏到线上
       （v1 的坑：「（等直播后把她说的话填在这里）」会直接显示在页面上）
    5. 必填项：milestones 至少 3 条、headline 不能空

  错误（✗）会让退出码变成 1，CI 会拦下来。
  提醒（!）不拦截，但要你自己判断。

*/

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA = path.join(ROOT, 'data');

const errors = [];
const warns = [];

let YEARS = [];   // 提前声明，方便出错时也能走到 report()

const err = (m) => errors.push(m);
const warn = (m) => warns.push(m);

// ---------- 1. 年份清单 ----------

const yearsFile = path.join(DATA, 'years.js');
if (!fs.existsSync(yearsFile)) {
  err('缺 data/years.js —— 没有年份清单，页面加载不到任何一年');
  report();
}

const yearCtx = { window: {} };
vm.createContext(yearCtx);
vm.runInContext(fs.readFileSync(yearsFile, 'utf8'), yearCtx);

YEARS = yearCtx.window.HB_YEARS;
if (!Array.isArray(YEARS) || !YEARS.length) {
  err('data/years.js 里的 window.HB_YEARS 不是非空数组');
  report();
}

// ---------- 2. 逐年加载 ----------

const KNOWN_TYPES = new Set([
  'work',      // 投稿
  'live',      // 直播 / 线下
  'milestone', // 数据节点
  'meme',      // 梗
  'birthday',  // 生日
  'me',        // 与你有关的节点
]);

const PLACEHOLDER_RE = /等直播后|填在这里|TODO|待补|xxx|XXX|占位/;

function loadYear(year) {
  const file = path.join(DATA, `${year}.js`);
  if (!fs.existsSync(file)) {
    err(`data/years.js 里有 ${year}，但 data/${year}.js 不存在`);
    return null;
  }

  const store = {};
  const ctx = {
    window: {},
    HB: { year: (y, d) => { store[y] = d; } },
    console,
  };
  vm.createContext(ctx);

  try {
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx);
  } catch (e) {
    err(`data/${year}.js 有语法错误：${e.message}`);
    return null;
  }

  const data = store[year];
  if (!data) {
    err(`data/${year}.js 没有调用 HB.year(${year}, {...})`);
    return null;
  }
  return data;
}

// ---------- 3. 校验 ----------

function checkDate(date, year, where) {
  if (!/^\d{4}(-\d{2}){0,2}$/.test(String(date))) {
    err(`${where}：date "${date}" 格式不对，应为 YYYY / YYYY-MM / YYYY-MM-DD`);
    return;
  }
  if (parseInt(String(date).slice(0, 4), 10) !== year) {
    err(`${where}：date "${date}" 不在 ${year} 年里`);
  }
}

function checkFile(rel, where) {
  if (!rel) return;
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    err(`${where}：图片不存在 → ${rel}`);
    return;
  }
  const kb = Math.round(fs.statSync(abs).size / 1024);
  if (kb > 400) warn(`${where}：${rel} 有 ${kb}KB，建议压到 300KB 以内`);
}

function checkText(text, where) {
  if (typeof text !== 'string') return;
  if (PLACEHOLDER_RE.test(text)) {
    err(`${where}：出现占位文案「${text.slice(0, 30)}」`);
  }
}

for (const year of YEARS) {
  const d = loadYear(year);
  if (!d) continue;

  const tag = `${year}`;

  // 必填
  if (!d.headline) err(`${tag}：headline 为空（年鉴里这一年的一句话标题）`);

  // 里程碑
  const ms = d.milestones || [];
  if (!Array.isArray(ms)) {
    err(`${tag}：milestones 不是数组`);
  } else {
    if (ms.length < 3) {
      err(`${tag}：milestones 只有 ${ms.length} 条，至少 3 条（design §10）`);
    }
    let prev = '';
    ms.forEach((m, i) => {
      const where = `${tag} milestones[${i}]`;
      if (!m || typeof m !== 'object') { err(`${where}：不是对象`); return; }
      if (!m.date) err(`${where}：缺 date`);
      else checkDate(m.date, year, where);
      if (!m.title) err(`${where}：缺 title`);
      if (!m.type) warn(`${where}：缺 type`);
      else if (!KNOWN_TYPES.has(m.type)) {
        warn(`${where}：type "${m.type}" 不在已知枚列里（${[...KNOWN_TYPES].join(' / ')}）`);
      }
      if (m.note && String(m.note).length > 24) {
        warn(`${where}：note 超过 24 字，年鉴是扫读的`);
      }
      if (!m.source) warn(`${where}：「${m.title}」没有写 source，以后无从核对`);
      checkText(m.title, where);
      checkFile(m.cover, where);

      // 时间正序。同月内「2026-06」和「2026-06-05」不比较 ——
      // 前者是"六月里某天"，后者是确切日，谁前谁后说不清。
      const key = String(m.date || '');
      if (prev && key < prev && key.slice(0, 7) !== prev.slice(0, 7)) {
        warn(`${where}：${key} 排在 ${prev} 之后，里程碑建议按时间正序`);
      }
      prev = key;
    });
  }

  // 照片
  (d.photos || []).forEach((p, i) => {
    const where = `${tag} photos[${i}]`;
    if (!p || !p.src) {
      warn(`${where}：src 为空（页面上会是占位卡）`);
      return;
    }
    checkFile(p.src, where);
    checkText(p.caption, where);
  });

  // 她说过的话
  (d.quotes || []).forEach((q, i) => {
    const where = `${tag} quotes[${i}]`;
    if (!q || !q.text) { err(`${where}：缺 text`); return; }
    checkText(q.text, where);
    if (!q.link) warn(`${where}：没有 link，无法回溯原文`);
  });

  // 私密长信
  const letter = (d.letter || []).filter((s) => s && String(s).trim());
  if (!letter.length) {
    warn(`${tag}：letter 还是空的（这一年的信没写）`);
  } else {
    letter.forEach((line, i) => checkText(String(line), `${tag} letter[${i}]`));
  }

  // 坐标
  if (!d.snapshot) {
    warn(`${tag}：没有 snapshot（这一年的粉丝/投稿数快照）`);
  } else {
    if (d.snapshot.followers == null) {
      warn(`${tag}：snapshot.followers 为空，年鉴里会显示「—」`);
    }
    if (d.snapshot.date) checkDate(d.snapshot.date, year, `${tag} snapshot`);
  }

  // 演出的祝福语。这是全站唯一「一年一变」的内容 ——
  // 曾经三年共用一套占位文案，页面照跑，谁也发现不了，所以这里必须查。
  const msgs = (d.messages || []).filter((s) => s && String(s).trim());
  if (!msgs.length) {
    err(`${tag}：messages 为空，生日演出没有任何内容`);
  } else {
    if (msgs.length < 5) {
      warn(`${tag}：messages 只有 ${msgs.length} 条，建议 5 条（3 帧仪式 + 2 帧当年）`);
    }
    if (msgs.length > 7) {
      warn(`${tag}：messages ${msgs.length} 条，手机上整段会超过 40 秒`);
    }
    msgs.forEach((s, i) => {
      const where = `${tag} messages[${i}]`;
      checkText(String(s), where);
      if (String(s).length > 6) {
        warn(`${where}：「${s}」有 ${String(s).length} 字，粒子会被缩得很小，建议 ≤6 字`);
      }
    });

    // 前三帧是仪式，年年一样，改了要确认是有意的
    const ritual = msgs.slice(0, 3).join('|');
    if (msgs.length >= 3 && ritual !== ['祝', '{name}', '生日快乐'].join('|')) {
      warn(`${tag}：前三帧仪式被改了（现在是「${msgs.slice(0, 3).join(' / ')}」），确认是有意的`);
    }
  }
}

// ---------- 祝福语逐年雷同 ----------
//
// 三年填同一套「又一年啦 / 继续发光」，页面完全正常、年份照样切换，
// 只有把三年的文件并排看才发现。这条检查就是为了不让它再发生。

{
  const groups = new Map();
  YEARS.forEach((y) => {
    const d = loadYear(y);
    if (!d) return;
    const sig = (d.messages || []).filter((s) => s && String(s).trim()).join('|');
    if (!sig) return;
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig).push(y);
  });
  groups.forEach((list) => {
    if (list.length > 1) {
      warn(`${list.join(' / ')} 的祝福语完全相同 —— 演出是每年唯一会变的地方，别复制`);
    }
  });
}

// ---------- 4. 粉丝曲线 ----------

const histFile = path.join(DATA, 'history.js');
if (fs.existsSync(histFile)) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  try {
    vm.runInContext(fs.readFileSync(histFile, 'utf8'), ctx);
    const h = ctx.window.HB_HISTORY || {};
    const pts = h.points || [];

    let prevDate = '';
    let prevFans = -1;
    pts.forEach((p, i) => {
      const where = `history points[${i}]`;
      if (!p.date) return err(`${where}：缺 date`);
      if (p.date < prevDate) err(`${where}：${p.date} 早于上一个点 ${prevDate}，采样点要按时间正序`);
      if (typeof p.followers !== 'number') err(`${where}：followers 不是数字`);
      else if (p.followers < prevFans) {
        warn(`${where}：${p.date} 的粉丝数比上一个点还少，确认一下是不是掉粉或填错`);
      }
      if (!p.source) warn(`${where}：没有 source`);
      prevDate = p.date;
      prevFans = p.followers;
    });

    if (pts.length && pts.length < 4) {
      warn(`history 只有 ${pts.length} 个采样点，画不出台阶（至少 4 个）`);
    }
    (h.stages || []).forEach((s, i) => {
      if (!s.quote) warn(`history stages[${i}]：没有配她的原话`);
    });
  } catch (e) {
    err(`data/history.js 解析失败：${e.message}`);
  }
} else {
  warn('没有 data/history.js（粉丝曲线会缺席）');
}

// ---------- 5. 陪你的人（关系线 + 大家留下的） ----------

function loadWindow(file, key) {
  const abs = path.join(DATA, file);
  if (!fs.existsSync(abs)) return null;
  const ctx = { window: {} };
  vm.createContext(ctx);
  try {
    vm.runInContext(fs.readFileSync(abs, 'utf8'), ctx);
    return ctx.window[key] || null;
  } catch (e) {
    err(`data/${file} 解析失败：${e.message}`);
    return null;
  }
}

const BV_RE = /^BV[0-9A-Za-z]{10}$/;

const me = loadWindow('me.js', 'HB_ME');
if (!me) {
  warn('没有 data/me.js（「我」的那条线会缺席）');
} else {
  const nodes = me.nodes || [];
  if (!nodes.length) warn('me.js：nodes 为空');
  nodes.forEach((n, i) => {
    const where = `me nodes[${i}]`;
    if (!n || !n.title) { err(`${where}：缺 title`); return; }
    if (!n.date) err(`${where}：缺 date`);
    else if (!/^\d{4}-\d{2}(-\d{2})?$/.test(n.date)) err(`${where}：date "${n.date}" 格式不对`);
    if (n.bvid && !BV_RE.test(n.bvid)) err(`${where}：bvid "${n.bvid}" 不像 BV 号`);
    checkText(n.title, where);
    checkText(n.note, where);
  });
}

const fd = loadWindow('fandom.js', 'HB_FANDOM');
if (!fd) {
  warn('没有 data/fandom.js（「大家」那一栏会缺席）');
} else {
  let total = 0;
  (fd.groups || []).forEach((g, gi) => {
    const where = `fandom groups[${gi}]`;
    if (!g.label) err(`${where}：缺 label`);
    const items = g.items || [];
    if (!items.length) warn(`${where}：没有条目`);
    items.forEach((it, i) => {
      const w = `${where}.items[${i}]`;
      total++;
      if (!it.title) err(`${w}：缺 title`);
      if (!it.author) err(`${w}：缺 author`);
      if (it.mid == null) warn(`${w}：没有 mid，以后核对要找半天`);
      if (!it.bvid) err(`${w}：缺 bvid（没有链接就没法回溯）`);
      else if (!BV_RE.test(it.bvid)) err(`${w}：bvid "${it.bvid}" 不像 BV 号`);
      if (it.date && !/^\d{4}-\d{2}(-\d{2})?$/.test(it.date)) {
        err(`${w}：date "${it.date}" 格式不对`);
      }
      checkText(it.title, w);
    });
  });
  if (!total) warn('fandom.js：一条都没有');
}

// ---------- 输出 ----------

function report() {
  const ok = errors.length === 0;

  console.log('');
  YEARS.forEach((y) => {
    const d = loadYear(y);
    if (!d) return;
    const n = (d.milestones || []).length;
    console.log(
      `  ${y}  ${String(n).padStart(2)} 条节点  ` +
      `${(d.photos || []).length} 张图  ` +
      `${(d.quotes || []).length} 句原话  ` +
      `信 ${((d.letter || []).filter(Boolean).length) ? '有' : '无'}`
    );
  });
  console.log('');

  if (warns.length) {
    console.log(`提醒 ${warns.length} 条：`);
    warns.forEach((w) => console.log(`  ! ${w}`));
    console.log('');
  }

  if (errors.length) {
    console.log(`错误 ${errors.length} 条 —— 现在还不能推：`);
    errors.forEach((e) => console.log(`  ✗ ${e}`));
    console.log('');
    process.exit(1);
  }

  console.log('✓ 内容校验通过');
  console.log('');
  process.exit(0);
}

report();
