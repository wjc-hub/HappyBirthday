/*

  站点级配置
  ==========
  这里放“基本不会变”的东西：她的昵称、生日、头像、主题色。
  每年的照片和心里话不在这里 —— 去 data/ 目录，一年一个文件。

  详细的每年更新步骤见 HOW-TO-UPDATE.md

*/

var SITE = {

  // ---------- 主角 ----------

  // 她的昵称。全站文案里写 {name} 都会替换成这个。
  name: '辣椒素素素',

  // 生日，格式 'MM-DD'（月-日，不含年份）
  birthday: '10-20',

  // 生日当天起算，几天内仍显示完整演出。
  // 留缓冲是因为她未必当天就点开链接。
  celebrateDays: 3,

  // 头像图片路径。用于粒子聚形（第二阶段功能）。
  avatar: 'images/avatar.png',

  // 头像采样方式 —— 决定图上哪些部分变成粒子：
  //   'light' 取亮部  → 深色背景 + 浅色线条的图（当前头像是这种）
  //   'dark'  取暗部  → 浅色背景 + 深色线条的图
  //   'alpha' 取不透明区域 → 需要抠好的透明 PNG，轮廓最精确
  avatarSampling: 'light',

  // 亮度阈值 0~255。粒子太多就往中间调，太少就往反方向调。
  // 可以在浏览器控制台看到实际采样到的粒子数。
  avatarThreshold: 128,

  // ---------- 站点信息 ----------

  // 浏览器标签页标题
  title: '{name} 生日快乐',

  // 分享到微信/QQ 时卡片显示的描述
  description: '写给 {name} 的生日纪念站',

  // 页脚署名。留空则不显示页脚。
  footer: '粉丝自制 · 非官方 · 图片版权归原作者所有',

  // 是否允许搜索引擎收录。
  //
  // ⚠️ 默认关闭。建议先把链接私下发给她本人，确认她愿意公开后再改成 true。
  //    一旦被搜索引擎收录，即使之后删站，快照仍会存在一段时间，撤回成本很高。
  allowIndexing: false,

  // ---------- 视觉主题 ----------

  theme: {
    // 祝福语粒子的配色，随机取用。只想单色就留一个。
    palette: [
      [255, 192, 203],  // 粉
      [255, 138, 174],  // 桃红
      [186, 200, 255],  // 淡蓝紫
      [255, 236, 179],  // 暖黄
    ],

    // 头像帧专属的渐变色带。粒子按它在头像上的高度取色，
    // 从顶部第一个颜色过渡到底部最后一个，与祝福语的杂色形成对比。
    // 至少两个颜色，可以放三四个做多段渐变。
    portraitGradient: [
      [255, 226, 150],  // 顶部 暖金
      [255, 160, 190],  // 中部 樱粉
      [150, 190, 255],  // 底部 天蓝
    ],

    // 背景星空
    stars: true,
  },

  // ---------- 引导层文案 ----------

  intro: {
    title: '🎂 {name}',
    hint: '点击任意位置，开启今天的惊喜',
  },

  // ---------- 倒数页文案（非生日期间显示）----------

  countdownPage: {
    title: '距离 {name} 的生日',
    unit: '天',
    // 倒数为 0 时（生日当天但演出还没开始）显示的文字
    todayText: '就是今天 🎉',
    archiveHint: '往年的回忆在下面 ↓',
  },

  // ---------- 相册占位提示 ----------

  photoPlaceholderTip: '把照片放进 images/<br>再填写 data/ 里对应年份的文件',

  // ---------- 演出节奏 ----------

  show: {
    // 祝福语播完后，粒子聚成她的头像
    portrait: true,

    // 头像每次停留多久（毫秒）。序列是 头像 → 昵称 → 头像，
    // 所以头像总露出时间约为这个值的两倍。
    // 觉得看不够就调大，比如 9000。
    portraitHold: 10000,

    // 夹在两个头像之间的昵称停留多久（毫秒）
    accentHold: 3000,

    // 弹幕：祝福语开始后多久放出（毫秒）
    danmakuDelay: 6000,

    // 长信：整段祝福播完后多久浮出（毫秒）
    letterDelay: 2500,

    // 三连彩蛋按钮是否显示
    triple: true,
  },

  // ---------- 预留：粉丝留言 ----------

  // 第一阶段不做后端。若以后想加留言，可先填一个外部链接
  // （她的 B 站动态、QQ 群等），页面会显示“去留言”按钮。
  // 留空则不显示。
  guestbookUrl: '',
};


/* ---------- 以下为内部工具，一般无需修改 ---------- */

// 替换 {name} 占位符
SITE.fill = function (str) {
  return String(str == null ? '' : str).replace(/\{name\}/g, SITE.name);
};

// 兼容层：粒子文字引擎 js/index.js 读取的是 CONFIG。
// 它只需要 theme / intro / icons 等少量字段，这里做一层映射，
// 避免为了改名去动那个第三方引擎。
var CONFIG = {
  name: SITE.name,
  theme: SITE.theme,
  intro: SITE.intro,
  fill: SITE.fill,

  // 下面这些由当年的 data 文件提供，在 index.html 里动态填充
  icons: ['heart', 'heart-empty', 'heart'],
  messages: [],
  countdown: 3,
  photos: [],
  photoInterval: 4000,
  showPortrait: (SITE.show && SITE.show.portrait) !== false,
};

// 拼装粒子文字引擎所需的动作序列。
// 内容取自 CONFIG，而 CONFIG 的内容字段由当年的 data 文件注入。
CONFIG.buildSequence = function (withCountdown) {
  var parts = [''];   // 前导空帧：让画面先从空白开始

  if (withCountdown && CONFIG.countdown > 0) {
    parts.push('#countdown ' + CONFIG.countdown);
  }

  (CONFIG.messages || []).forEach(function (m) {
    parts.push(SITE.fill(m));
  });

  // 祝福语之后聚成头像，这是整段演出的高潮。
  // 头像 → 昵称 → 头像，来回一次，强化「这是她」的印记。
  // 昵称用 #accent 而非普通文字帧，让它沿用头像的渐变配色，
  // 高潮段中途不会突然变回杂色。
  if (CONFIG.showPortrait && SITE.avatar) {
    parts.push('#portrait ' + SITE.avatar);
    parts.push('#accent ' + SITE.name);
    parts.push('#portrait ' + SITE.avatar);
  }

  (CONFIG.icons || []).forEach(function (icon) {
    parts.push('#icon ' + icon);
  });

  return parts.join('|');
};

// 整段祝福序列大约需要多久播完（毫秒），用于安排后续环节。
// 权重必须与 js/index.js 里 frameDelay 的规则保持一致，
// 否则长信的出场时机会算错。
CONFIG.sequenceDuration = function () {
  var big = window.innerWidth > 500 && window.innerHeight > 500,
      base = big ? 2000 : 2600,
      perCount = big ? 1000 : 1200,
      show = SITE.show || {},
      total = base * 0.6;                    // 前导空帧

  (CONFIG.messages || []).forEach(function (m) {
    var s = SITE.fill(m),
        len = s.replace(/\s/g, '').length,
        w = 1;

    if (/[！!…]$/.test(s)) w = 1.35;
    else if (len <= 2) w = 0.78;
    else if (len >= 5) w = 1.15;

    total += base * w;
  });

  if (CONFIG.showPortrait && SITE.avatar) {
    // 头像 → 昵称 → 头像，前后两个头像用绝对时长
    var hold = (show.portraitHold == null ? 7000 : show.portraitHold),
        accent = (show.accentHold == null ? 2600 : show.accentHold);

    total += hold * 2 + accent;
  }

  total += (CONFIG.icons || []).length * base * 0.72;
  total += (CONFIG.countdown || 0) * perCount;

  return Math.round(total);
};
