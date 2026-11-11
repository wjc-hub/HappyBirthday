// 临时：算演出节奏。用法 node tools/_timing.mjs 2026 [mobile]
import fs from 'fs';
import vm from 'vm';

const year = process.argv[2] || '2026';
const mobile = process.argv[3] === 'mobile';

const ctx = { window: { innerWidth: mobile ? 390 : 1280, innerHeight: mobile ? 844 : 800 } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('js/config.js', 'utf8'), ctx);
const CONFIG = ctx.CONFIG;

const src = fs.readFileSync(`data/${year}.js`, 'utf8');
const m = src.match(/messages:\s*\[([\s\S]*?)\],/);
CONFIG.messages = vm.runInNewContext('[' + m[1] + ']');
CONFIG.countdown = 0;
CONFIG.icons = ['heart', 'heart-empty'];

const tl = CONFIG.timeline();
const s = (n) => (n / 1000).toFixed(1) + 's';

console.log(`${mobile ? '手机' : '桌面'} · ${year} · 祝福语 ${CONFIG.messages.length} 条`);
CONFIG.messages.forEach((t) => console.log(`  ${String(t.length).padStart(2)}字  ${t}`));
console.log(`总计 ${s(tl.total)}  |  头像 ${s(tl.portraitStart)}→${s(tl.portraitEnd)} (${s(tl.portraitEnd - tl.portraitStart)})  |  图标 ${s(tl.total - tl.portraitEnd)}`);
