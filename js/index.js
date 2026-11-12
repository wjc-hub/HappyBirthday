
/*

  Shape Shifter
  =============
  A canvas experiment by Kenneth Cachia
  http://www.kennethcachia.com

  Updated code
  ------------
  https://github.com/kennethcachia/Shape-Shifter

*/


// 采样网格间距：桌面大屏 9px，小屏 6px。
// 采样（ShapeBuilder）和绘制（Drawing.drawCircle 的光斑上限）都要用它，
// 所以提到最外面共用一个值 —— 两边一旦不一致，光斑就会盖住网格的缝。
var GRID_GAP = (window.innerWidth > 500 && window.innerHeight > 500) ? 9 : 6;

var S = {
  init: function (start) {
    var action = window.location.href,
        i = action.indexOf('?a=');

    S.Drawing.init('.canvas', start);
    document.body.classList.add('body--ready');

    // 切到正式序列前清掉待机序列，避免两段动作叠加
    S.UI.reset();

    if (i !== -1) {
      // 允许通过 ?a=... 覆盖序列，便于调试
      S.UI.simulate(decodeURI(action).substring(i + 3));
    } else if (start != 0) {
      // 待机状态：只显示一个图标，等用户点击
      S.UI.simulate('|#icon ' + (CONFIG.icons[0] || 'heart'));
    } else {
      // 正式播放：倒数 + 祝福语 + 图标
      S.UI.simulate(CONFIG.buildSequence(true));
    }

    S.Drawing.loop(function () {
      S.Shape.render();
    });
  }
};


S.Drawing = (function () {
  var canvas,
      context,
      renderFn,
      looping = false,
      resizeBound = false,
      glowLevel = 1,        // 0=关, 1=中, 2=高; 依设备性能在 init 里决定
      requestFrame = window.requestAnimationFrame       ||
                     window.webkitRequestAnimationFrame ||
                     window.mozRequestAnimationFrame    ||
                     window.oRequestAnimationFrame      ||
                     window.msRequestAnimationFrame     ||
                     function(callback) {
                       window.setTimeout(callback, 1000 / 60);
                     };

  // ---- 粒子辉光 ----
  //
  // 每帧为每颗粒子新建 createRadialGradient 太贵：800 粒子 × 60fps 意味着
  // 每秒近 5 万个渐变对象和 20 万次 rgba 字符串解析，而渐变填充还走不了
  // GPU 加速。改为按颜色预渲染一张离屏光晕纹理，之后每颗粒子只做一次
  // drawImage 缩放绘制。
  //
  // 透明度不烘进纹理，改由 globalAlpha 施加 —— 否则每个 alpha 值都要各存
  // 一份纹理，缓存会炸。
  var glowCache = {},
      SPRITE_SIZE = 64;

  // 颜色量化到 8 的倍数。渐变配色模式下粒子颜色是按坐标连续插值出来的，
  // 不量化缓存条目会无上限增长；8/255 的偏差肉眼不可辨。
  function quantize(v) {
    v = (v + 4) & ~7;
    return v < 0 ? 0 : (v > 255 ? 255 : v);
  }

  function glowSprite(c) {
    var r = quantize(c.r),
        g = quantize(c.g),
        b = quantize(c.b),
        key = r + '_' + g + '_' + b,
        sprite = glowCache[key];

    if (sprite) return sprite;

    sprite = document.createElement('canvas');
    sprite.width = sprite.height = SPRITE_SIZE;

    var ctx = sprite.getContext('2d'),
        half = SPRITE_SIZE / 2,
        rgb = r + ',' + g + ',' + b,
        grad = ctx.createRadialGradient(half, half, 0, half, half, half);

    // 核心不能是白的。
    //
    // 原来这里固定 rgba(255,252,246,1)，于是每一颗粒子的中心都是近纯白；
    // 一个字由几百颗粒子叠成，再经 lighter 相加 —— 核心全推到 255，
    // 整块字就过曝成一片白，配色只在边缘露一条红边。
    // 改成「本色提亮 22%」：密集处依然会亮起来，但底子始终是红的。
    var cr = Math.round(r + (255 - r) * 0.22),
        cg = Math.round(g + (255 - g) * 0.22),
        cb = Math.round(b + (255 - b) * 0.22);

    // 亮度必须和粒子密度一起看：这里用的 lighter 是加法混合，
    // 同一处叠 5 颗就接近打满。间距从 13 收到 9 之后重叠翻倍，
    // 原来的峰值 1.0 会直接烧成白芯 —— 所以峰值压过一档到 0.62。
    //
    // 0.62 时字在暗底上发闷（四边被背景的暖雾吃掉），
    // 但抬到 0.78 会直接糊掉：笔画的横竖之间被加法混合填满，
    // 一个字涨成一条发光的横条。0.70 是这两个失败之间的位置。
    grad.addColorStop(0.00, 'rgba(' + cr + ',' + cg + ',' + cb + ',0.70)');
    grad.addColorStop(0.22, 'rgba(' + rgb + ',0.54)');
    grad.addColorStop(0.50, 'rgba(' + rgb + ',0.19)');
    grad.addColorStop(0.76, 'rgba(' + rgb + ',0.06)');
    grad.addColorStop(1.00, 'rgba(' + rgb + ',0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);

    glowCache[key] = sprite;
    return sprite;
  }

  return {
    init: function (el, s) {
      canvas = document.querySelector(el);
      context = canvas.getContext('2d');
      this.adjustCanvas();

      // 根据设备性能和屏幕尺寸决定辉光等级，避免低端机动画卡顿
      var area = window.innerWidth * window.innerHeight,
          dpr = window.devicePixelRatio || 1,
          mobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

      if (area < 360000 || mobile || dpr > 2) {
        glowLevel = 1;                    // 中质量：两层圆叠加
      } else {
        glowLevel = 2;                    // 高质量：径向渐变光晕
      }

      // 尊重系统「减少动画」偏好
      if (window.matchMedia &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        glowLevel = 0;
      }

      // init 会被调用两次（待机 / 正式播放），监听只绑一次
      if (!resizeBound) {
        resizeBound = true;
        window.addEventListener('resize', function (e) {
          S.Drawing.adjustCanvas();
        });
      }
    },

    loop: function (fn) {
      renderFn = !renderFn ? fn : renderFn;
      // 防止重复调用 init 时启动多条 rAF 链，导致粒子以双倍速度运动
      if (looping) return;
      looping = true;
      this._tick();
    },

    _tick: function () {
      this.clearFrame();
      renderFn();
      requestFrame.call(window, this._tick.bind(this));
    },

    adjustCanvas: function () {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    },

    clearFrame: function () {
      // 先恢复默认混合模式，否则 clearRect 在某些浏览器上可能行为异常
      context.globalCompositeOperation = 'source-over';
      context.clearRect(0, 0, canvas.width, canvas.height);
    },

    getArea: function () {
      return { w: canvas.width, h: canvas.height };
    },

    setBlendMode: function (mode) {
      context.globalCompositeOperation = mode;
    },

    resetBlendMode: function () {
      context.globalCompositeOperation = 'source-over';
      // drawCircle 会为每颗粒子改 globalAlpha，这里一并复位，
      // 否则后续绘制会继承最后一颗粒子的透明度
      context.globalAlpha = 1;
    },

    getGlowLevel: function () {
      return glowLevel;
    },

    drawCircle: function (p, c) {
      var r = p.z;
      if (r <= 0) return;

      // 最低质量（系统开启「减少动画」时）：保留原版实心圆
      if (glowLevel === 0) {
        context.fillStyle = c.render();
        context.beginPath();
        context.arc(p.x, p.y, r, 0, 2 * Math.PI, true);
        context.closePath();
        context.fill();
        return;
      }

      // 光晕直径。等级 2 铺得更开，等级 1 收紧以减少填充面积。
      //
      // 这两个系数直接决定字能不能认出来：光斑一旦明显大于采样间距，
      // 相邻两颗粒子的光晕就会叠在一起，加法混合下笔画之间被填满 ——
      // 四个字糊成一条发光的灯管。
      // 所以再加一道硬上限：光斑不超过网格的 1.45 倍。
      // 手机网格是 6，粒子半径却还是同一套随机值，不设上限的话
      // 手机上光斑相对字宽会比桌面大一倍，字直接糊掉。
      var d = Math.min(r * (glowLevel >= 2 ? 2.8 : 2.2), GRID_GAP * 1.45),
          a = c.a < 0 ? 0 : (c.a > 1 ? 1 : c.a);

      context.globalAlpha = a;
      context.drawImage(glowSprite(c), p.x - d / 2, p.y - d / 2, d, d);
    }
  }
}());


S.UI = (function () {
  var delay1 = 3000,
      delay2 = 5000,
      interval,
      actionToken = 0,      // 定时器链的代次，防止嵌套调用互相覆盖
      isTouch = false,
      currentAction,
      time,
      maxShapeSize = 30,
      sequence = [],
      cmd = '#';

  function formatTime(date) {
    var h = date.getHours(),
        m = date.getMinutes(),
    m = m < 10 ? '0' + m : m;
    return h + ':' + m;
  }

  function getValue(value) {
    // 取第一个空格之后的全部内容，这样文件路径里含空格也不会被截断
    if (!value) return value;
    var i = value.indexOf(' ');
    return i === -1 ? undefined : value.substring(i + 1);
  }

  function getAction(value) {
    value = value && value.split(' ')[0];
    return value && value[0] === cmd && value.substring(1);
  }

  // delay 可以是数字（固定间隔），也可以是函数 () => 毫秒，
  // 后者用于让每帧停留时间不同，避免整段演出节奏平铺直叙。
  //
  // 注意：fn 内部可能再次调用 timedAction（倒数指令就是如此）。
  // 过去这里用一个共享的 interval 句柄，嵌套调用会互相覆盖，
  // 导致旧链无法被清除、和新链并行推进 —— 表现为倒数数字一直乱跳。
  // 现在用代次令牌：每次调用令牌 +1，只有持有最新令牌的链能继续。
  function timedAction(fn, delay, max, reverse) {
    clearTimeout(interval);

    var token = ++actionToken,
        dynamic = (typeof delay === 'function'),
        n = reverse ? max : 1;

    function wait() {
      return dynamic ? delay(n) : delay;
    }

    function finished() {
      return (!reverse && max && n === max) || (reverse && n === 0);
    }

    function advance() {
      if (token !== actionToken) return;    // 已被新链取代

      n = reverse ? n - 1 : n + 1;
      currentAction = n;
      fn(n);

      // fn 里可能启动了新链，此时本链必须就此打住
      if (token !== actionToken || finished()) return;

      interval = setTimeout(advance, wait());
    }

    currentAction = n;
    fn(n);

    if (token !== actionToken || finished()) return;

    interval = setTimeout(advance, wait());
  }

  function reset(destroy) {
    clearTimeout(interval);
    actionToken++;              // 作废所有在跑的链
    sequence = [];
    time = null;
    destroy && S.Shape.switchShape(S.ShapeBuilder.letter(''));
  }

  // 每帧该停留多久。让节奏有起伏，而不是所有帧一个速度。
  //   头像帧      停最久，是整段的高潮，时长由 SITE.show.portraitHold 指定
  //   感叹句结尾  稍停，留出情绪
  //   短句        快一点，形成推进感
  function frameDelay(text) {
    if (text == null) return delay2;

    var s = String(text),
        show = (typeof SITE !== 'undefined' && SITE.show) || {};

    // 头像与昵称用绝对时长，方便直接调；其余按 delay2 的倍率
    if (s.indexOf('#portrait') === 0) {
      return show.portraitHold == null ? 7000 : show.portraitHold;
    }

    if (s.indexOf('#accent') === 0) {
      return show.accentHold == null ? 2600 : show.accentHold;
    }

    if (s.indexOf('#icon') === 0) return delay2 * 0.72;
    if (s === '') return delay2 * 0.6;

    // 带感叹/省略号的句子多停一会儿
    if (/[！!…]$/.test(s)) return delay2 * 1.35;

    // 短句推进得快些，长句给足阅读时间
    var len = s.replace(/\s/g, '').length;
    if (len <= 2) return delay2 * 0.78;
    if (len >= 5) return delay2 * 1.15;

    return delay2;
  }

  function performAction(value, start) {
    var action,
        value,
        current;

    // 每帧停留时长。小屏原本设 5s，但十几帧累积下来整段要一分半，
    // 观众多半中途就退出了，所以收敛到 2.6s；大屏保持 2s。
    if (window.innerWidth > 500 && window.innerHeight > 500) {
      delay1 = 1000;
      delay2 = 2000;
    } else {
      delay1 = 1200;
      delay2 = 2600;
    }

    sequence = typeof(value) === 'object' ? value : sequence.concat(value.split('|'));

    // 下一帧要等多久，取决于「刚显示出来的那一帧」是什么
    var lastShown = null;

    timedAction(function (index) {
      current = sequence.shift();
      action = getAction(current);
      value = getValue(current);
      lastShown = current;

      // 这是最后一帧：等它播完后通知外部，用于开启结束后的自由切换
      if (sequence.length === 0 && action !== 'countdown') {
        var endToken = actionToken;

        setTimeout(function () {
          // 期间若又启动了新序列，这次通知作废
          if (endToken !== actionToken) return;
          if (typeof window.onSequenceEnd === 'function') window.onSequenceEnd();
        }, frameDelay(current));
      }

      switch (action) {
        case 'countdown':
          value = parseInt(value) || 10;
          value = value > 0 ? value : 10;

          timedAction(function (index) {
            if (index === 0) {
              if (sequence.length === 0) {
                S.Shape.switchShape(S.ShapeBuilder.letter(''));
              } else {
                performAction(sequence);
              }
            } else {
              S.Shape.switchShape(S.ShapeBuilder.letter(index), true);
            }
          }, delay1, value, true);
          break;

        case 'rectangle':
          value = value && value.split('x');
          value = (value && value.length === 2) ? value : [maxShapeSize, maxShapeSize / 2];

          S.Shape.switchShape(S.ShapeBuilder.rectangle(Math.min(maxShapeSize, parseInt(value[0])), Math.min(maxShapeSize, parseInt(value[1]))));
          break;

        case 'circle':
          value = parseInt(value) || maxShapeSize;
          value = Math.min(value, maxShapeSize);
          S.Shape.switchShape(S.ShapeBuilder.circle(value));
          break;

        case 'time':
          var t = formatTime(new Date());

          if (sequence.length > 0) {
            S.Shape.switchShape(S.ShapeBuilder.letter(t));
          } else {
            timedAction(function () {
              t = formatTime(new Date());
              if (t !== time) {
                time = t;
                S.Shape.switchShape(S.ShapeBuilder.letter(time));
              }
            }, delay1);
          }
          break;

        case 'icon':
          S.ShapeBuilder.imageFile('font-awesome/' + value + '.png', function (obj) {
            S.Shape.switchShape(obj);
          });
          break;

        // 粒子聚成头像。value 可省略，默认取 SITE.avatar
        case 'portrait':
          S.ShapeBuilder.portrait(value || SITE.avatar, function (obj) {
            S.Shape.switchShape(obj, false,
                                { gradient: true, converge: true, breathe: true });

            // 通知页面播放入场特效（白光 + 烟花齐放）
            if (typeof window.onPortraitReveal === 'function') {
              window.onPortraitReveal();
            }
          });
          break;

        // 用头像那套渐变配色显示文字，但保持正常的切换速度。
        // 夹在两个头像帧之间的昵称用它，避免高潮段中途变回杂色。
        case 'accent':
          S.Shape.switchShape(S.ShapeBuilder.letter(value || ''), false,
                              { gradient: true, breathe: true });
          break;

        default:
          S.Shape.switchShape(S.ShapeBuilder.letter(current[0] === cmd ? 'What?' : current));
      }
    }, function () {
      // 依刚显示的那帧决定停留多久，形成节奏起伏
      return frameDelay(lastShown);
    }, sequence.length);
  }

  function bindEvents() {
    // 原版这里有一个输入框驱动的调试 UI，本项目已移除；
    // 保留空实现以免改动 init 的调用结构。
  }

  function init() {
    bindEvents();
    isTouch && document.body.classList.add('touch');
  }

  // Init
  init();

  return {
    simulate: function (action) {
      performAction(action, 1);
    },

    // 供 S.init 切换到正式序列前清空待机序列，
    // 否则用户在待机动画播完前点击，两段序列会被 concat 叠在一起
    reset: function () {
      reset();
    },

    // ---- 演出结束后的自由切换 ----
    // 这两个方法会作废在跑的定时链，由用户点击直接驱动画面。

    showPortrait: function () {
      actionToken++;
      clearTimeout(interval);
      sequence = [];

      S.ShapeBuilder.portrait(SITE.avatar, function (obj) {
        S.Shape.switchShape(obj, false,
                            { gradient: true, converge: true, breathe: true });

        if (typeof window.onPortraitReveal === 'function') {
          window.onPortraitReveal();
        }
      });
    },

    showIcon: function (name) {
      actionToken++;
      clearTimeout(interval);
      sequence = [];

      S.ShapeBuilder.imageFile('font-awesome/' + name + '.png', function (obj) {
        S.Shape.switchShape(obj);
      });
    }
  }
}());


S.Point = function (args) {
  this.x = args.x;
  this.y = args.y;
  this.z = args.z;
  this.a = args.a;
  this.h = args.h;
};


S.Color = function (r, g, b, a) {
  this.r = r;
  this.g = g;
  this.b = b;
  this.a = a;
};

S.Color.prototype = {
  render: function () {
    return 'rgba(' + this.r + ',' +  + this.g + ',' + this.b + ',' + this.a + ')';
  }
};


// 粒子取色。支持两种模式：
//   随机取色    —— 祝福语用，从 palette 里随机挑，形成杂色感
//   位置渐变    —— 头像用，按粒子的 y 坐标在渐变色带上插值，
//                  让头像整体呈现从上到下的色彩过渡
S.Palette = (function () {
  var fallback = [[255, 192, 203]],
      mode = 'random',
      gradient = null;

  function palette() {
    var p = (typeof SITE !== 'undefined' && SITE.theme && SITE.theme.palette);
    return (p && p.length) ? p : fallback;
  }

  function portraitGradient() {
    var g = (typeof SITE !== 'undefined' && SITE.theme && SITE.theme.portraitGradient);
    return (g && g.length >= 2) ? g : [[255, 214, 130], [255, 150, 200]];
  }

  // 在色带上按 t (0~1) 线性插值
  function lerp(stops, t) {
    t = Math.max(0, Math.min(1, t));

    var span = 1 / (stops.length - 1),
        i = Math.min(stops.length - 2, Math.floor(t / span)),
        local = (t - i * span) / span,
        a = stops[i],
        b = stops[i + 1];

    return [
      Math.round(a[0] + (b[0] - a[0]) * local),
      Math.round(a[1] + (b[1] - a[1]) * local),
      Math.round(a[2] + (b[2] - a[2]) * local)
    ];
  }

  return {
    // 切换取色模式。'portrait' 时按位置渐变，其余按随机。
    setMode: function (m) {
      mode = m;
      gradient = (m === 'portrait') ? portraitGradient() : null;
    },

    getMode: function () {
      return mode;
    },

    // y / height 用于渐变模式下定位；随机模式忽略
    pick: function (alpha, y, height) {
      var c;

      if (mode === 'portrait' && gradient && height) {
        c = lerp(gradient, y / height);
      } else {
        var list = palette();
        c = list[Math.floor(Math.random() * list.length)];
      }

      return new S.Color(c[0], c[1], c[2], alpha);
    }
  };
}());


S.Dot = function (x, y) {
  // 让每颗星大小不同：大屏 2~6px，小屏 1.5~4.5px。
  // 差异比统一大小重要得多 —— 统一大小看起来像马赛克，大小不一才像星群。
  var small = window.innerWidth <= 500 || window.innerHeight <= 500,
      baseZ = small ? (1.5 + Math.random() * 3) : (2 + Math.random() * 4);

  this.p = new S.Point({
    x: x,
    y: y,
    z: baseZ,
    a: 1,
    h: 0
  });

  this.e = 0.07;
  this.s = true;

  this.c = S.Palette.pick(this.p.a);

  // 呼吸浮动：不改目标点，只在绘制时叠加一个正弦偏移，
  // 这样不会与移动队列冲突。
  this.br = null;

  this.t = this.clone();
  this.q = [];
};

S.Dot.prototype = {
  clone: function () {
    return new S.Point({
      x: this.x,
      y: this.y,
      z: this.z,
      a: this.a,
      h: this.h
    });
  },

  // 依据目标位置重新取色。切换形状时调用，
  // 这样同一批粒子在不同帧里能呈现不同配色。
  recolor: function (targetY, height) {
    this.c = S.Palette.pick(this.p.a, targetY, height);
  },

  // 开启呼吸：记录锚点与随机相位，让每个粒子的节奏略有差异
  breathe: function (ax, ay) {
    this.br = {
      ax: ax,
      ay: ay,
      phase: Math.random() * Math.PI * 2,
      // 幅度小一点，太大就不像「呼吸」而像抖动
      amp: 1.4 + Math.random() * 2.2,
      speed: 0.02 + Math.random() * 0.015
    };
  },

  stopBreathe: function () {
    this.br = null;
  },

  _draw: function () {
    this.c.a = this.p.a;

    if (this.br) {
      // 只在已经聚到锚点附近时才呼吸，避免入场途中就开始抖
      var dx = this.p.x - this.br.ax,
          dy = this.p.y - this.br.ay;

      if (dx * dx + dy * dy < 400) {
        this.br.phase += this.br.speed;

        S.Drawing.drawCircle({
          x: this.p.x + Math.sin(this.br.phase) * this.br.amp,
          y: this.p.y + Math.cos(this.br.phase * 0.85) * this.br.amp,
          z: this.p.z
        }, this.c);
        return;
      }
    }

    S.Drawing.drawCircle(this.p, this.c);
  },

  _moveTowards: function (n) {
    var details = this.distanceTo(n, true),
        dx = details[0],
        dy = details[1],
        d = details[2],
        e = this.e * d;

    if (this.p.h === -1) {
      this.p.x = n.x;
      this.p.y = n.y;
      return true;
    }

    if (d > 1) {
      this.p.x -= ((dx / d) * e);
      this.p.y -= ((dy / d) * e);
    } else {
      if (this.p.h > 0) {
        this.p.h--;
      } else {
        return true;
      }
    }

    return false;
  },

  _update: function () {
    if (this._moveTowards(this.t)) {
      var p = this.q.shift();

      if (p) {
        this.t.x = p.x || this.p.x;
        this.t.y = p.y || this.p.y;
        this.t.z = p.z || this.p.z;
        this.t.a = p.a || this.p.a;
        this.p.h = p.h || 0;
      } else {
        if (this.s) {
          this.p.x -= Math.sin(Math.random() * 3.142);
          this.p.y -= Math.sin(Math.random() * 3.142);
        } else {
          this.move(new S.Point({
            x: this.p.x + (Math.random() * 50) - 25,
            y: this.p.y + (Math.random() * 50) - 25,
          }));
        }
      }
    }

    d = this.p.a - this.t.a;
    this.p.a = Math.max(0.1, this.p.a - (d * 0.05));
    d = this.p.z - this.t.z;
    this.p.z = Math.max(1, this.p.z - (d * 0.05));
  },

  distanceTo: function (n, details) {
    var dx = this.p.x - n.x,
        dy = this.p.y - n.y,
        d = Math.sqrt(dx * dx + dy * dy);

    return details ? [dx, dy, d] : d;
  },

  move: function (p, avoidStatic) {
    if (!avoidStatic || (avoidStatic && this.distanceTo(p) > 1)) {
      this.q.push(p);
    }
  },

  render: function () {
    this._update();
    this._draw();
  }
}


S.ShapeBuilder = (function () {
  // 粒子采样间距。间距越大粒子越稀、每颗越大，英文单词看起来更有「点阵」感。
  //
  // 中文不行 —— 这个引擎原版是给英文用的，字母笔画少；
  // 换成一个四字祝福，笔画细密，13 的间距一整个字只剩两百来颗粒子，
  // 笔画立不住，只能靠光晕糊成一条。9 是桌面大屏上还能认出字的密度。
  //
  // 手机屏宽只有 390，五个字挤在一起每字才 60 多像素，
  // 按 9 采样每个字横向只剩六七颗 —— 笔画直接粘成一条。小屏收到 6。
  var gap = GRID_GAP;

  var shapeCanvas = document.createElement('canvas'),
      shapeContext = shapeCanvas.getContext('2d'),
      fontSize = 500,
      // 原字体栈不含中文字体，中文字形全靠系统兜底导致各机器渲染不一致
      fontFamily = '"PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", "Source Han Sans SC", Avenir, "Helvetica Neue", Helvetica, Arial, sans-serif';

  function fit() {
    shapeCanvas.width = Math.floor(window.innerWidth / gap) * gap;
    shapeCanvas.height = Math.floor(window.innerHeight / gap) * gap;
    shapeContext.fillStyle = 'red';
    shapeContext.textBaseline = 'middle';
    shapeContext.textAlign = 'center';
  }

  // sampler 决定某个像素是否生成粒子。
  // 默认看透明通道（原版行为）；传入自定义函数可改为按亮度等方式判断。
  function processCanvas(sampler) {
    var pixels = shapeContext.getImageData(0, 0, shapeCanvas.width, shapeCanvas.height).data,
        dots = [],
        x = 0,
        y = 0,
        fx = shapeCanvas.width,
        fy = shapeCanvas.height,
        w = 0,
        h = 0;

    sampler = sampler || function (px, i) { return px[i + 3] > 0; };

    for (var p = 0; p < pixels.length; p += (4 * gap)) {
      if (sampler(pixels, p)) {
        dots.push(new S.Point({
          x: x,
          y: y
        }));

        w = x > w ? x : w;
        h = y > h ? y : h;
        fx = x < fx ? x : fx;
        fy = y < fy ? y : fy;
      }

      x += gap;

      if (x >= shapeCanvas.width) {
        x = 0;
        y += gap;
        p += gap * 4 * shapeCanvas.width;
      }
    }

    return { dots: dots, w: w + fx, h: h + fy };
  }

  function setFontSize(s) {
    shapeContext.font = 'bold ' + s + 'px ' + fontFamily;
  }

  function isNumber(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
  }

  function init() {
    fit();
    window.addEventListener('resize', fit);
  }

  // Init
  init();

  return {
    imageFile: function (url, callback) {
      var image = new Image(),
          a = S.Drawing.getArea();

      image.onload = function () {
        shapeContext.clearRect(0, 0, shapeCanvas.width, shapeCanvas.height);
        shapeContext.drawImage(this, 0, 0, a.h * 0.6, a.h * 0.6);
        callback(processCanvas());
      };

      image.onerror = function () {
        callback(S.ShapeBuilder.letter('What?'));
      }

      image.src = url;
    },

    // 把一张图变成粒子人像。
    //
    // 与 imageFile 的区别：
    //   - 按配置选择采样方式（透明通道 / 亮度）
    //   - 图片等比缩放并居中，不像 imageFile 那样强制拉成正方形
    //   - 亮度模式下取「暗部」为粒子，适合浅背景的头像
    portrait: function (url, callback) {
      var image = new Image(),
          a = S.Drawing.getArea();

      image.onload = function () {
        // 目标尺寸：占屏幕短边的 62%，并对齐到 gap 网格
        var target = Math.min(a.w, a.h) * 0.62,
            ratio = Math.min(target / this.width, target / this.height),
            dw = Math.max(gap, Math.round(this.width * ratio)),
            dh = Math.max(gap, Math.round(this.height * ratio)),
            dx = Math.round((shapeCanvas.width - dw) / 2),
            dy = Math.round((shapeCanvas.height - dh) / 2);

        shapeContext.clearRect(0, 0, shapeCanvas.width, shapeCanvas.height);
        shapeContext.drawImage(this, dx, dy, dw, dh);

        var mode = (typeof SITE !== 'undefined' && SITE.avatarSampling) || 'alpha',
            sampler;

        if (mode === 'dark' || mode === 'light') {
          // 按亮度取样。阈值默认取中间值，可在配置里微调。
          //   'dark'  取暗部 —— 适合浅背景 + 深色线条
          //   'light' 取亮部 —— 适合深背景 + 浅色线条
          var threshold = (SITE.avatarThreshold == null ? 128 : SITE.avatarThreshold),
              wantLight = (mode === 'light');

          sampler = function (px, i) {
            if (px[i + 3] < 128) return false;   // 透明区域跳过
            // 感知亮度（ITU-R BT.601）
            var lum = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
            return wantLight ? lum > threshold : lum < threshold;
          };
        } else if (mode === 'edge') {
          // 取轮廓。
          //
          // 当前这张头像是深蓝底 + 奶油色猫脸的平涂图。
          // 按亮部取样只能拿到「猫脸」那一整块 —— 眼睛、鼻子、嘴全在暗部，
          // 被阈值筛掉，聚出来就是一个没有五官的圆团，认不出是谁。
          //
          // 改成取亮度突变：只有落在明暗交界上的格子才放粒子。
          // 于是外轮廓、耳朵、眼睛、嘴都留了下来，整体像一幅星座线稿。
          var edgeTh = 22,
              W = shapeCanvas.width,
              H = shapeCanvas.height;

          sampler = function (px, i) {
            // i 是这一格左上角像素的字节下标，反推出网格坐标
            var px0 = i / 4,
                x0 = px0 % W,
                y0 = Math.floor(px0 / W);

            for (var dy = 0; dy < gap; dy++) {
              var y = y0 + dy;
              if (y >= H) break;

              for (var dx = 0; dx < gap; dx++) {
                var x = x0 + dx;
                if (x >= W) break;

                var q = (y * W + x) * 4,
                    // 透明像素当作纯黑，这样剪影的外沿也是一条边
                    lum = px[q + 3] < 128 ? 0 : px[q] * 0.299 + px[q + 1] * 0.587 + px[q + 2] * 0.114,
                    // 只和「下一格」比，避免同一道边被左右两格各记一次
                    ex = q + (x + gap < W ? gap * 4 : 0),
                    ey = q + (y + gap < H ? gap * W * 4 : 0),
                    lumX = px[ex + 3] < 128 ? 0 : px[ex] * 0.299 + px[ex + 1] * 0.587 + px[ex + 2] * 0.114,
                    lumY = px[ey + 3] < 128 ? 0 : px[ey] * 0.299 + px[ey + 1] * 0.587 + px[ey + 2] * 0.114;

                if (Math.abs(lum - lumX) > edgeTh || Math.abs(lum - lumY) > edgeTh) return true;
              }
            }

            return false;
          };
        }

        var shape = processCanvas(sampler);

        // 亮度阈值不合适时可能一个点都取不到，退回文字避免白屏
        if (!shape.dots.length) {
          console.warn('[HB] 头像未采样到任何粒子，请调整 SITE.avatarThreshold');
          callback(S.ShapeBuilder.letter('♥'));
          return;
        }

        callback(shape);
      };

      image.onerror = function () {
        console.warn('[HB] 头像加载失败：', url);
        callback(S.ShapeBuilder.letter('♥'));
      };

      image.src = url;
    },

    circle: function (d) {
      var r = Math.max(0, d) / 2;
      shapeContext.clearRect(0, 0, shapeCanvas.width, shapeCanvas.height);
      shapeContext.beginPath();
      shapeContext.arc(r * gap, r * gap, r * gap, 0, 2 * Math.PI, false);
      shapeContext.fill();
      shapeContext.closePath();

      return processCanvas();
    },

    letter: function (l) {
      var s = 0;

      // 两侧留白。桌面留 20%（0.8）视觉上更松弛；
      // 手机上 390 宽要塞五个字，留 20% 之后每字只有 62px，
      // 笔画还没采样间距宽，怎么调都是一条光带 —— 小屏放宽到 0.92。
      var fitW = (window.innerWidth > 500 && window.innerHeight > 500) ? 0.8 : 0.92;

      setFontSize(fontSize);
      s = Math.min(fontSize,
                  (shapeCanvas.width / shapeContext.measureText(l).width) * fitW * fontSize,
                  (shapeCanvas.height / fontSize) * (isNumber(l) ? 1 : 0.45) * fontSize);
      setFontSize(s);

      shapeContext.clearRect(0, 0, shapeCanvas.width, shapeCanvas.height);
      shapeContext.fillText(l, shapeCanvas.width / 2, shapeCanvas.height / 2);

      return processCanvas();
    },

    rectangle: function (w, h) {
      var dots = [],
          width = gap * w,
          height = gap * h;

      for (var y = 0; y < height; y += gap) {
        for (var x = 0; x < width; x += gap) {
          dots.push(new S.Point({
            x: x,
            y: y,
          }));
        }
      }

      return { dots: dots, w: width, h: height };
    }
  };
}());


S.Shape = (function () {
  var dots = [],
      width = 0,
      height = 0,
      cx = 0,
      cy = 0;

  function compensate() {
    var a = S.Drawing.getArea();

    cx = a.w / 2 - width / 2;
    cy = a.h / 2 - height / 2;
  }

  return {
    shuffleIdle: function () {
      var a = S.Drawing.getArea();

      for (var d = 0; d < dots.length; d++) {
        if (!dots[d].s) {
          dots[d].move({
            x: Math.random() * a.w,
            y: Math.random() * a.h
          });
        }
      }
    },

    // opts.gradient  用头像那套渐变配色（按 y 坐标插值）
    // opts.converge  粒子从画面外围向中心汇聚，慢速缓动
    // opts.breathe   聚好后轻微呼吸浮动
    switchShape: function (n, fast, opts) {
      var size,
          a = S.Drawing.getArea();

      opts = opts || {};

      width = n.w;
      height = n.h;

      compensate();

      // 切换配色模式，后面 recolor 会据此取色
      S.Palette.setMode(opts.gradient ? 'portrait' : 'random');

      if (n.dots.length > dots.length) {
        size = n.dots.length - dots.length;
        for (var d = 1; d <= size; d++) {
          // 新粒子不能在画面正中「出生」。
          // 它们全叠在同一个点上、透明度又是满的，加法混合下会先在字中间
          // 烧成一个白球，再慢慢飞散 —— 每一帧都这样，观感像字被打了洞。
          // 出生点撒在画面任意处、透明度从 0 起，让它们从暗处飘进来。
          var born = new S.Dot(Math.random() * a.w, Math.random() * a.h);
          born.p.a = 0;
          born.c.a = 0;
          dots.push(born);
        }
      }

      var d = 0,
          i = 0;

      while (n.dots.length > 0) {
        i = Math.floor(Math.random() * n.dots.length);
        dots[d].e = fast ? 0.25 : (dots[d].s ? 0.14 : 0.11);

        // 汇聚帧慢一点聚拢，让「成形」的过程看得清
        if (opts.converge) dots[d].e = 0.055 + Math.random() * 0.03;

        if (opts.converge) {
          // 先把粒子甩到画面外围，再向中心汇聚
          var ang = Math.random() * Math.PI * 2,
              rad = Math.max(a.w, a.h) * (0.55 + Math.random() * 0.3);

          dots[d].move(new S.Point({
            x: a.w / 2 + Math.cos(ang) * rad,
            y: a.h / 2 + Math.sin(ang) * rad,
            z: Math.random() * 12 + 6,
            a: 0.15 + Math.random() * 0.3,
            h: 0
          }));
        } else if (dots[d].s) {
          dots[d].move(new S.Point({
            z: Math.random() * 20 + 10,
            a: Math.random(),
            h: 18
          }));
        } else {
          dots[d].move(new S.Point({
            z: Math.random() * 5 + 5,
            h: fast ? 18 : 30
          }));
        }

        dots[d].s = true;

        // 依目标位置取色：渐变模式会按 y 坐标在色带上插值
        dots[d].recolor(n.dots[i].y, n.h || 1);

        dots[d].move(new S.Point({
          x: n.dots[i].x + cx,
          y: n.dots[i].y + cy,
          a: 1,
          // 目标大小也带随机，但头像阶段整体稍大、更醒目
          z: opts.converge ? (3.5 + Math.random() * 3) : (2.5 + Math.random() * 3.5),
          h: 0
        }));

        // 聚好之后轻微呼吸：在目标点附近来回小幅漂移
        if (opts.breathe) {
          dots[d].breathe(n.dots[i].x + cx, n.dots[i].y + cy);
        } else {
          dots[d].stopBreathe();
        }

        n.dots = n.dots.slice(0, i).concat(n.dots.slice(i + 1));
        d++;
      }

      for (var i = d; i < dots.length; i++) {
        if (dots[i].s) {
          dots[i].stopBreathe();
          dots[i].move(new S.Point({
            z: Math.random() * 20 + 10,
            a: Math.random(),
            h: 20
          }));

          dots[i].s = false;
          dots[i].e = 0.04;
          dots[i].move(new S.Point({
            x: Math.random() * a.w,
            y: Math.random() * a.h,
            a: 0.3, //.4
            z: Math.random() * 4,
            h: 0
          }));
        }
      }
    },

    render: function () {
      // 整批粒子用 lighter 叠加，重叠处更亮，形成星光聚拢的辉光感。
      // 在循环外只设置一次混合模式，避免每颗粒子重复设置的开销。
      S.Drawing.setBlendMode('lighter');
      for (var d = 0; d < dots.length; d++) {
        dots[d].render();
      }
      S.Drawing.resetBlendMode();
    }
  }
}());

function init(start){
  S.init(start);

}
