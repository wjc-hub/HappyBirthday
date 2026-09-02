/*

  B 站风格弹幕
  ============
  祝福语从右向左飘过，白色描边、多轨道、避免重叠。
  用独立 canvas 绘制，不干扰粒子文字层。

  用法：
    Danmaku.start(['生日快乐', '今天也要开心'])
    Danmaku.stop()

*/

var Danmaku = (function () {

  var canvas,
      ctx,
      items = [],       // 正在飞的弹幕
      queue = [],       // 待发射的文本
      lanes = [],       // 每条轨道下一次可用的时间戳（帧数）
      frames = 0,
      running = false,
      rafId = null,
      loopQueue = true,
      opacity = 0,          // 当前透明度
      targetOpacity = 0,    // 目标透明度，二者之间平滑过渡
      userOff = false;      // 用户手动关闭了弹幕

  var LANE_HEIGHT = 34,     // 轨道高度
      TOP_MARGIN = 56,      // 顶部留白，避开静音按钮
      BOTTOM_MARGIN = 84,   // 底部留白，避开相册按钮
      FONT_SIZE = 16,
      SPEED_MIN = 1.4,      // 像素/帧
      SPEED_MAX = 2.4,
      SPAWN_EVERY = 26,     // 每隔多少帧尝试发射一条
      BASE_ALPHA = 0.7,     // 整体透明度，压住存在感
      FADE_STEP = 0.035;    // 淡入淡出速度（每帧）

  // 弹幕配色。主体是柔和的粉紫暖调，与粒子文字同一色系，
  // 不用纯白 —— 纯白在深色背景上太跳，会压过纤细的粒子点阵。
  var COLORS = [
    '#ffe3ef', '#ffe3ef', '#ffe3ef',
    '#e8dcff', '#ffeccd', '#d6ecff', '#ffd9e6'
  ];

  function ensureCanvas() {
    if (canvas) return;

    canvas = document.createElement('canvas');
    canvas.id = 'danmaku';
    // 关键：放在粒子层(9000)之下、烟花(8888)之上。
    // 弹幕原本是 9200 压在粒子上，把纤细的点阵完全盖住；
    // 沉到下面后粒子始终可读，弹幕从点阵缝隙透出来形成层次。
    canvas.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;' +
      'z-index:8950;pointer-events:none';

    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');

    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    if (!canvas) return;

    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    var usable = Math.max(LANE_HEIGHT, canvas.height - TOP_MARGIN - BOTTOM_MARGIN),
        count = Math.max(1, Math.floor(usable / LANE_HEIGHT));

    // 轨道数变了就重置占用表；已在飞的弹幕不受影响
    lanes = new Array(count);
    for (var i = 0; i < count; i++) lanes[i] = 0;
  }

  // 找一条当前空闲的轨道；都忙则返回 -1
  function pickLane(width, speed) {
    var order = [];
    for (var i = 0; i < lanes.length; i++) order.push(i);

    // 随机顺序尝试，避免总是集中在最上面几条
    for (var j = order.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1)),
          t = order[j];
      order[j] = order[k];
      order[k] = t;
    }

    for (var n = 0; n < order.length; n++) {
      if (lanes[order[n]] <= frames) return order[n];
    }

    return -1;
  }

  function spawn(text) {
    var fontSize = FONT_SIZE;

    // 字体串必须与 tick() 里绘制时一致，否则测出的宽度不准，
    // 轨道防追尾的时间计算会跟着错
    ctx.font = fontSize + 'px "PingFang SC", "Microsoft YaHei", sans-serif';

    var width = ctx.measureText(text).width,
        speed = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN),
        lane = pickLane(width, speed);

    if (lane === -1) return false;    // 没有空轨道，这轮先不发

    // 这条轨道要等前一条完全离开右边缘才能再发，否则会追尾
    lanes[lane] = frames + Math.ceil((width + 40) / speed);

    items.push({
      text: text,
      x: canvas.width + 10,
      y: TOP_MARGIN + lane * LANE_HEIGHT + LANE_HEIGHT * 0.7,
      speed: speed,
      width: width,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: fontSize
    });

    return true;
  }

  function tick() {
    if (!running) return;

    frames++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 淡入淡出：朝目标透明度逼近
    if (opacity < targetOpacity) {
      opacity = Math.min(targetOpacity, opacity + FADE_STEP);
    } else if (opacity > targetOpacity) {
      opacity = Math.max(targetOpacity, opacity - FADE_STEP);
    }

    // 淡出到全透明时停止发射新弹幕，让屏幕彻底干净
    var muted = (targetOpacity === 0);

    // 发射
    if (!muted && frames % SPAWN_EVERY === 0 && queue.length) {
      var text = queue.shift();
      if (!spawn(text)) {
        queue.unshift(text);      // 轨道满了，放回队首下次再试
      } else if (loopQueue) {
        queue.push(text);         // 循环播放，让弹幕不断流动
      }
    }

    // 完全透明时无需绘制，但仍要推进位置，
    // 否则淡入回来时会看到一堆弹幕僵在原地
    for (var i = items.length - 1; i >= 0; i--) {
      var it = items[i];

      it.x -= it.speed;

      if (it.x + it.width < -20) {
        items.splice(i, 1);
        continue;
      }

      if (opacity <= 0.01) continue;

      ctx.globalAlpha = opacity;
      ctx.font = it.size + 'px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textBaseline = 'alphabetic';

      // 描边比原来细得多、也淡得多：
      // 这里的背景是深色夜空而非视频画面，不需要强描边保证可读性，
      // 粗描边反而让弹幕显得笨重、压过粒子。
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(10,4,24,.4)';
      ctx.strokeText(it.text, it.x, it.y);

      ctx.fillStyle = it.color;
      ctx.fillText(it.text, it.x, it.y);
    }

    ctx.globalAlpha = 1;
    rafId = requestAnimationFrame(tick);
  }

  return {
    // texts: 字符串数组；opts.loop 是否循环（默认 true）
    start: function (texts, opts) {
      if (!texts || !texts.length) return;

      ensureCanvas();

      opts = opts || {};
      loopQueue = opts.loop !== false;

      // 打乱顺序，每次打开看到的排列不同
      queue = texts.slice().map(function (t) { return HB.fill(t); });
      for (var i = queue.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1)),
            tmp = queue[i];
        queue[i] = queue[j];
        queue[j] = tmp;
      }

      // 用户手动关过就不要自作主张放出来
      if (!userOff) targetOpacity = BASE_ALPHA;

      if (running) return;
      running = true;
      frames = 0;
      tick();
    },

    // 淡出：高潮段让路，但保留队列，之后能淡回来
    fadeOut: function () {
      targetOpacity = 0;
    },

    fadeIn: function () {
      if (!userOff) targetOpacity = BASE_ALPHA;
    },

    // 用户手动开关。返回切换后是否可见。
    toggle: function () {
      userOff = !userOff;
      targetOpacity = userOff ? 0 : BASE_ALPHA;
      return !userOff;
    },

    isVisible: function () {
      return !userOff;
    },

    stop: function () {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      items = [];
      queue = [];
      opacity = targetOpacity = 0;
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    },

    isRunning: function () {
      return running;
    }
  };
}());
