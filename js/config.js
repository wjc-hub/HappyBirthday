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
  //   'edge'  取轮廓  → 平涂插画用这个：外形和五官都留得住（当前用这个）
  //   'light' 取亮部  → 深色背景 + 浅色主体的图，但暗部五官会被筛掉，容易糊成一团
  //   'dark'  取暗部  → 浅色背景 + 深色线条的图
  //   'alpha' 取不透明区域 → 需要抠好的透明 PNG，轮廓最精确
  avatarSampling: 'edge',

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
    //
    // 辣椒红重复两次，让红色占多数 —— 名字本身就是这个站唯一
    // 不需要解释的符号。琥珀和暖白只做高光，一多就糊成一片橙。
    palette: [
      [255, 85, 70],    // 辣椒红
      [255, 85, 70],    // 辣椒红（加权）
      [255, 120, 96],   // 浅一档，避免整片糊成同一块红
      [255, 165, 61],   // 舞台灯琥珀
      [255, 217, 168],  // 暖金
    ],

    // 生辰期的配色（生日当天起 celebrateDays 天内）。
    //
    // 一年里只有这几天，她的名字是金色的。这不是"换个颜色"，
    // 是给这几天一个区别：平时她是辣椒红，生日那天她是烛光。
    // 红留两格做点缀 —— 全金会变成红包封面。
    paletteFestive: [
      [255, 226, 152],  // 烛光金（提亮过：原来是 214,126，叠在深底上偏芥末）
      [255, 226, 152],  // 烛光金（加权）
      [255, 244, 200],  // 近白的暖光
      [255, 198, 116],  // 深金
      [255, 110, 88],   // 辣椒红，收在末尾做点缀
    ],

    // 头像帧专属的渐变色带。粒子按它在头像上的高度取色，
    // 从顶部第一个颜色过渡到底部最后一个，与祝福语的杂色形成对比。
    // 至少两个颜色，可以放三四个做多段渐变。
    portraitGradient: [
      [255, 226, 160],  // 顶部 暖金
      [255, 107, 90],   // 中部 珊瑚红
      [255, 59, 46],    // 底部 辣椒红
    ],

    // 背景浮尘（不再是星空：改成舞台灯里飘着的尘，见 index.html）
    stars: true,
  },

  // ---------- 引导层文案 ----------

  intro: {
    // 上面已经有一行「生日这天」的待机标记，标题只留名字。
    title: '{name}',
    hint: '点一下，开播',
  },

  // ---------- 倒数页文案（非生日期间显示）----------

  countdownPage: {
    title: '距离 {name} 的生日',
    unit: '天',
    // 倒数为 0 时（生日当天但演出还没开始）显示的文字
    todayText: '就是今天',
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
    portraitHold: 5000,

    // 夹在两个头像之间的昵称停留多久（毫秒）
    accentHold: 2000,

    // 弹幕：祝福语开始后多久放出（毫秒）
    danmakuDelay: 6000,

    // 头像高潮前多久让弹幕淡出（毫秒）。
    // 弹幕会在头像登场前这么久开始淡出、高潮结束后淡回来，
    // 保证最重要的那段画面干净。
    danmakuFadeLead: 2000,

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

// 逐帧累加时间轴。权重必须与 js/index.js 里 frameDelay 的规则一致，
// 否则后续环节（弹幕淡出、长信浮出）的时机会算错。
//
// 返回 { total, portraitStart, portraitEnd }，单位毫秒。
CONFIG.timeline = function () {
  var big = window.innerWidth > 500 && window.innerHeight > 500,
      base = big ? 2000 : 2600,
      perCount = big ? 1000 : 1200,
      show = SITE.show || {},
      t = 0,
      portraitStart = null,
      portraitEnd = null;

  t += base * 0.6;                          // 前导空帧
  t += (CONFIG.countdown || 0) * perCount;  // 倒数

  (CONFIG.messages || []).forEach(function (m) {
    var s = SITE.fill(m),
        len = s.replace(/\s/g, '').length,
        w = 1;

    if (/[！!…]$/.test(s)) w = 1.35;
    else if (len <= 2) w = 0.78;
    else if (len >= 5) w = 1.15;

    t += base * w;
  });

  if (CONFIG.showPortrait && SITE.avatar) {
    var hold = (show.portraitHold == null ? 7000 : show.portraitHold),
        accent = (show.accentHold == null ? 2600 : show.accentHold);

    portraitStart = t;                      // 第一个头像帧出现的时刻
    t += hold * 2 + accent;                 // 头像 → 昵称 → 头像
    portraitEnd = t;                        // 高潮段结束
  }

  t += (CONFIG.icons || []).length * base * 0.72;

  return {
    total: Math.round(t),
    portraitStart: portraitStart === null ? null : Math.round(portraitStart),
    portraitEnd: portraitEnd === null ? null : Math.round(portraitEnd)
  };
};

// 整段祝福序列大约需要多久播完（毫秒）
CONFIG.sequenceDuration = function () {
  return CONFIG.timeline().total;
};
