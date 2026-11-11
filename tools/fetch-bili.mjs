#!/usr/bin/env node
/*
  抓取 B 站公开数据 → data/bili.json
  ==================================

  为什么是"构建时抓"而不是"页面里抓"：
    这些接口不返回 Access-Control-Allow-Origin，浏览器 fetch 会被 CORS 拦死。
    所以数据必须由这个脚本在本地（或 CI）抓下来写成静态 JSON，页面只读自己的文件。
    好处是接口被封/改版时站点照常能开，只是数字停在最后一次成功的时间。

  用法：
    node tools/fetch-bili.mjs            # 抓基础数据（推荐，安全）
    node tools/fetch-bili.mjs --videos   # 额外抓投稿列表（有风险，见下）

  ⚠️ --videos 会走 wbi 签名接口，实测容易触发 -412 IP 封禁。
     只在需要一次性的完整投稿清单时用，不要放进定时任务。

  失败策略：
    任一接口失败都不会中断其他接口；整体失败时保留上一次的 data/bili.json，
    并在文件里写 stale:true，页面可以据此显示"数据截至 X 月 X 日"。
*/

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'data/bili.json');

const MID = 511373761;
const ROOM_ID = 31259021;

// 首次开播：直播二周年是 2026-07-17 19:00，往前推两年。
const BROADCAST_START = '2024-07-17T19:00:00+08:00';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const WITH_VIDEOS = process.argv.includes('--videos');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- wbi 签名 ----------
// 投稿列表类接口要求 w_rid + wts，算法是把 img_key/sub_key 按固定表重排后取 32 位，
// 再对"参数排序 + 拼接"做 md5。这个表是 B 站前端硬编码的，改版时需要同步。

const MIXIN_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

const md5 = (s) => createHash('md5').update(s).digest('hex');

let headers = {
  'User-Agent': UA,
  'Referer': `https://space.bilibili.com/${MID}`,
  'Accept': 'application/json, text/plain, */*',
};

// 带上 buvid 指纹，这是绕过 412 的主要手段之一
async function primeCookies() {
  try {
    const r = await get('https://api.bilibili.com/x/frontend/finger/spi');
    headers.Cookie = `buvid3=${r.data.b_3}; buvid4=${r.data.b_4}; b_nut=${Math.floor(Date.now() / 1000)}`;
    headers.Origin = 'https://space.bilibili.com';
  } catch {
    // 拿不到指纹也不致命，后续请求自己会失败并进入降级
  }
}

function mixinKeyOf(imgKey, subKey) {
  const raw = imgKey + subKey;
  return MIXIN_TAB.map((i) => raw[i] || '').join('').slice(0, 32);
}

function wbiSign(params, mixinKey) {
  const wts = Math.round(Date.now() / 1000);
  const p = { ...params, wts };
  const query = Object.keys(p).sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(p[k]).replace(/[!'()*]/g, ''))}`)
    .join('&');
  return `${query}&w_rid=${md5(query + mixinKey)}`;
}

// ---------- 请求 ----------
// 412 = 风控封禁，重试只会延长封禁时间，所以只退避一次就放弃。

async function get(url, { retries = 1 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, { headers });
    const type = res.headers.get('content-type') || '';

    if (!type.includes('json')) {
      throw new Error(`HTTP ${res.status} 返回的不是 JSON（多为风控拦截）`);
    }

    const json = await res.json();
    if (json.code !== 0) {
      throw new Error(`code ${json.code}: ${json.message || json.msg || '未知'}`);
    }
    return json;
  }
}

// 单个数据块失败不影响其他块
async function attempt(label, fn) {
  try {
    const value = await fn();
    console.log(`  ✓ ${label}`);
    return value;
  } catch (e) {
    console.warn(`  ✗ ${label}：${e.message}`);
    return null;
  }
}

// ---------- 主流程 ----------

console.log(`抓取 UID ${MID} / 直播间 ${ROOM_ID}\n`);

await primeCookies();

const stat = await attempt('粉丝数', async () => {
  const r = await get(`https://api.bilibili.com/x/relation/stat?vmid=${MID}`);
  return { followers: r.data.follower, following: r.data.following };
});
await sleep(800);

const card = await attempt('用户名片', async () => {
  const r = await get(`https://api.bilibili.com/x/web-interface/card?mid=${MID}`);
  const c = r.data.card;
  return {
    name: c.name,
    sign: c.sign || '',
    face: c.face || '',
    level: c.level_info && c.level_info.current_level,
    nameplate: (c.nameplate && c.nameplate.name) || '',
  };
});
await sleep(800);

const room = await attempt('直播间信息', async () => {
  const r = await get(`https://api.live.bilibili.com/room/v1/Room/get_info?room_id=${ROOM_ID}`);
  const d = r.data;
  return {
    roomId: d.room_id,
    title: d.title || '',
    areaName: d.area_name || '',
    parentAreaName: d.parent_area_name || '',
    liveStatus: d.live_status,
    online: d.online,
    hotWords: (d.hot_words || []).slice(0, 12),
  };
});
await sleep(800);

const counts = await attempt('投稿数', async () => {
  const r = await get(`https://api.bilibili.com/x/space/navnum?mid=${MID}`);
  return { videos: r.data.video, albums: r.data.album, opus: r.data.opus };
});

// ---------- 可选：投稿列表 ----------
// 单独放在开关后面。这段最容易吃 412，失败就整体跳过，不影响上面的数据。

let videos = null;
if (WITH_VIDEOS) {
  console.log('\n抓取投稿列表（可能触发风控）…');
  videos = await attempt('投稿列表', async () => {
    const nav = await get('https://api.bilibili.com/x/web-interface/nav');
    const img = (nav.data.wbi_img.img_url || '').split('/').pop().split('.')[0];
    const sub = (nav.data.wbi_img.sub_url || '').split('/').pop().split('.')[0];
    const key = mixinKeyOf(img, sub);

    const out = [];
    for (let pn = 1; pn <= 5; pn++) {          // 最多抓 5 页
      const qs = wbiSign({ mid: MID, ps: 30, pn, order: 'pubdate' }, key);
      const r = await get(`https://api.bilibili.com/x/space/wbi/arc/search?${qs}`);
      const list = (r.data.list && r.data.list.vlist) || [];
      out.push(...list.map((v) => ({
        bvid: v.bvid,
        title: v.title,
        created: v.created,                  // unix 秒
        play: v.play,
        length: v.length,
        cover: 'https:' + String(v.pic || '').replace(/^http:/, ''),
      })));
      if (list.length < 30) break;
      await sleep(1500);
    }
    return out;
  });
}

// ---------- 落盘 ----------

const prev = existsSync(OUT) ? safeRead(OUT) : null;

const everythingFailed = !stat && !card && !room && !counts;

if (everythingFailed && prev) {
  console.warn('\n全部接口失败，保留上一次的数据并标记 stale。');
  prev.stale = true;
  writeFileSync(OUT, JSON.stringify(prev, null, 2) + '\n');
  process.exit(0);
}

const now = new Date();

const data = {
  mid: MID,
  roomId: ROOM_ID,
  fetchedAt: now.toISOString(),
  fetchedAtLocal: formatCN(now),
  stale: false,
  broadcastStart: BROADCAST_START,

  name: card?.name || prev?.name || '',
  sign: card?.sign || prev?.sign || '',
  face: card?.face || prev?.face || '',
  level: card?.level ?? prev?.level ?? null,
  nameplate: card?.nameplate || prev?.nameplate || '',

  followers: stat?.followers ?? prev?.followers ?? null,
  following: stat?.following ?? prev?.following ?? null,
  videos: counts?.videos ?? prev?.videos ?? null,
  albums: counts?.albums ?? prev?.albums ?? null,
  opus: counts?.opus ?? prev?.opus ?? null,

  room: room || prev?.room || null,
};

if (videos) data.videoList = videos;

writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n');

function safeRead(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

function formatCN(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---------- 汇总 ----------

const days = Math.floor((now - new Date(BROADCAST_START)) / 86400000);

console.log('\n已写入 data/bili.json');
console.log(`  ${data.name} · Lv${data.level} · ${data.followers?.toLocaleString() ?? '?'} 粉丝`);
console.log(`  ${data.videos ?? '?'} 个投稿 · 开播第 ${days} 天`);
if (data.sign) console.log(`  签名：${data.sign}`);
if (data.room) console.log(`  直播间：${data.room.title}（${data.room.areaName}）`);
if (videos) console.log(`  投稿列表：${videos.length} 条`);
