/*

  生日祝福页配置
  ==============
  只需修改本文件即可定制整个页面，无需改动其它代码。
  祝福语中的 {name} 会被自动替换为下面的 name。

*/

var CONFIG = {

  // ---------- 主角 ----------

  // 祝福对象的名字，会替换所有祝福语与标题里的 {name}
  name: '小明',

  // 浏览器标签页标题
  title: '{name} 生日快乐',

  // 引导层文案
  intro: {
    title: '🎂 {name}',
    hint: '点击任意位置，开启今天的惊喜',
  },

  // ---------- 祝福语序列 ----------

  // 开场倒数几秒（设为 0 则不倒数）
  countdown: 3,

  // 逐条显示的祝福语。每条独立成一帧粒子文字。
  // 建议每条不超过 6 个字，太长会被缩得很小。
  messages: [
    '祝',
    '{name}',
    '生日快乐',
    '祝你',
    '生日快乐',
    '祝你幸福',
    '祝你健康',
    '前途光明',
    '祝你',
    '生日快乐！',
  ],

  // 祝福语播完后依次显示的图标（对应 font-awesome/ 下的 png 文件名）
  icons: ['heart', 'heart-empty', 'heart'],

  // ---------- 视觉主题 ----------

  theme: {
    // 粒子文字的配色。多个颜色时，粒子会随机取用形成渐变效果。
    // 只想要单色就留一个元素。
    palette: [
      [255, 192, 203],  // 粉
      [255, 138, 174],  // 桃红
      [186, 200, 255],  // 淡蓝紫
      [255, 236, 179],  // 暖黄
    ],

    // 是否显示背景星空
    stars: true,
  },

  // ---------- 回忆相册 ----------

  // src 留空字符串则渲染为占位卡片（方便先搭好版式）。
  // 放好真实图片后填入相对路径，例如 'images/photo1.jpg'。
  photos: [
    { src: '', caption: '第一次见面' },
    { src: '', caption: '一起看过的风景' },
    { src: '', caption: '那年夏天' },
    { src: '', caption: '未来还很长' },
  ],

  // 相册自动播放间隔（毫秒）；设为 0 则不自动播放
  photoInterval: 4000,
};


/*  以下为内部工具函数，一般无需修改  */

// 把字符串里的 {name} 替换成配置的名字
CONFIG.fill = function (str) {
  return String(str).replace(/\{name\}/g, CONFIG.name);
};

// 拼装 Shape Shifter 引擎所需的动作序列字符串
CONFIG.buildSequence = function (withCountdown) {
  var parts = [''];   // 前导空帧：让画面先从空白开始

  if (withCountdown && CONFIG.countdown > 0) {
    parts.push('#countdown ' + CONFIG.countdown);
  }

  for (var i = 0; i < CONFIG.messages.length; i++) {
    parts.push(CONFIG.fill(CONFIG.messages[i]));
  }

  for (var j = 0; j < CONFIG.icons.length; j++) {
    parts.push('#icon ' + CONFIG.icons[j]);
  }

  return parts.join('|');
};
