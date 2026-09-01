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
  name: 'XXX',

  // 生日，格式 'MM-DD'（月-日，不含年份）
  birthday: '09-15',

  // 生日当天起算，几天内仍显示完整演出。
  // 留缓冲是因为她未必当天就点开链接。
  celebrateDays: 3,

  // 头像图片路径。用于粒子聚形（第二阶段功能）。
  avatar: 'images/avatar.png',

  // 头像采样方式：
  //   'alpha'      读透明通道 —— 需要抠好的透明 PNG，轮廓最精确
  //   'brightness' 读亮度，暗部放粒子 —— 原图直接可用，剪影风格
  avatarSampling: 'brightness',

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
    // 粒子文字配色，多个颜色时随机取用。只想单色就留一个。
    palette: [
      [255, 192, 203],  // 粉
      [255, 138, 174],  // 桃红
      [186, 200, 255],  // 淡蓝紫
      [255, 236, 179],  // 暖黄
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

  (CONFIG.icons || []).forEach(function (icon) {
    parts.push('#icon ' + icon);
  });

  return parts.join('|');
};
