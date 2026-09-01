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
      loopQueue = true;

  var LANE_HEIGHT = 38,     // 轨道高度
      TOP_MARGIN = 60,      // 顶部留白，避开静音按钮
      BOTTOM_MARGIN = 90,   // 底部留白，避开相册按钮
      FONT_SIZE = 22,
      SPEED_MIN = 1.6,      // 像素/帧
      SPEED_MAX = 2.8,
      SPAWN_EVERY = 26;     // 每隔多少帧尝试发射一条

  // 弹幕颜色：以白色为主，少量彩色点缀，模仿真实弹幕池
  var COLORS = [
    '#ffffff', '#ffffff', '#ffffff', '#ffffff',
    '#ffd7e5', '#ffe9a8', '#a8e6ff', '#c9ffb0', '#ffc4a8'
  ];

  function ensureCanvas() {
    if (canvas) return;

    canvas = document.createElement('canvas');
    canvas.id = 'danmaku';
    // 放在粒子层之上、UI 之下；不接收点击
    canvas.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;' +
      'z-index:9200;pointer-events:none';

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

    ctx.font = 'bold ' + fontSize + 'px "PingFang SC", "Microsoft YaHei", sans-serif';

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

    // 发射
    if (frames % SPAWN_EVERY === 0 && queue.length) {
      var text = queue.shift();
      if (!spawn(text)) {
        queue.unshift(text);      // 轨道满了，放回队首下次再试
      } else if (loopQueue) {
        queue.push(text);         // 循环播放，让弹幕不断流动
      }
    }

    // 绘制并推进
    for (var i = items.length - 1; i >= 0; i--) {
      var it = items[i];

      it.x -= it.speed;

      if (it.x + it.width < -20) {
        items.splice(i, 1);
        continue;
      }

      ctx.font = 'bold ' + it.size + 'px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textBaseline = 'alphabetic';

      // 描边 + 填充：模仿 B 站弹幕的可读性处理
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,.55)';
      ctx.strokeText(it.text, it.x, it.y);

      ctx.fillStyle = it.color;
      ctx.fillText(it.text, it.x, it.y);
    }

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

      if (running) return;
      running = true;
      frames = 0;
      tick();
    },

    stop: function () {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      items = [];
      queue = [];
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    },

    isRunning: function () {
      return running;
    }
  };
}());
