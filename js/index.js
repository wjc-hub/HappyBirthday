
/*

  Shape Shifter
  =============
  A canvas experiment by Kenneth Cachia
  http://www.kennethcachia.com

  Updated code
  ------------
  https://github.com/kennethcachia/Shape-Shifter

*/


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
      requestFrame = window.requestAnimationFrame       ||
                     window.webkitRequestAnimationFrame ||
                     window.mozRequestAnimationFrame    ||
                     window.oRequestAnimationFrame      ||
                     window.msRequestAnimationFrame     ||
                     function(callback) {
                       window.setTimeout(callback, 1000 / 60);
                     };

  return {
    init: function (el, s) {
      canvas = document.querySelector(el);
      context = canvas.getContext('2d');
      this.adjustCanvas();

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
      context.clearRect(0, 0, canvas.width, canvas.height);
    },

    getArea: function () {
      return { w: canvas.width, h: canvas.height };
    },

    drawCircle: function (p, c) {
      context.fillStyle = c.render();
      context.beginPath();
      context.arc(p.x, p.y, p.z, 0, 2 * Math.PI, true);
      context.closePath();
      context.fill();
    }
  }
}());


S.UI = (function () {
  var delay1 = 3000,
      delay2 = 5000,
      interval,
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

  // delay 可以是数字（固定间隔），也可以是函数 (index) => 毫秒，
  // 后者用于让每帧停留时间不同，避免整段演出节奏平铺直叙。
  function timedAction(fn, delay, max, reverse) {
    clearInterval(interval);
    clearTimeout(interval);

    currentAction = reverse ? max : 1;
    fn(currentAction);

    var dynamic = (typeof delay === 'function');

    if (!max || (!reverse && currentAction < max) || (reverse && currentAction > 0)) {
      if (!dynamic) {
        interval = setInterval(function () {
          currentAction = reverse ? currentAction - 1 : currentAction + 1;
          fn(currentAction);

          if ((!reverse && max && currentAction === max) || (reverse && currentAction === 0)) {
            clearInterval(interval);
          }
        }, delay);
        return;
      }

      // 动态间隔：用 setTimeout 链，每次单独计算下一帧的等待时间
      var step = function () {
        currentAction = reverse ? currentAction - 1 : currentAction + 1;
        fn(currentAction);

        if ((!reverse && max && currentAction === max) || (reverse && currentAction === 0)) {
          return;
        }

        interval = setTimeout(step, delay(currentAction));
      };

      interval = setTimeout(step, delay(currentAction));
    }
  }

  function reset(destroy) {
    clearInterval(interval);
    clearTimeout(interval);
    sequence = [];
    time = null;
    destroy && S.Shape.switchShape(S.ShapeBuilder.letter(''));
  }

  // 每帧该停留多久。让节奏有起伏，而不是所有帧一个速度。
  //   头像帧      停最久，是整段的高潮
  //   感叹句结尾  稍停，留出情绪
  //   短句        快一点，形成推进感
  function frameDelay(text) {
    if (text == null) return delay2;

    var s = String(text);

    if (s.indexOf('#portrait') === 0) return delay2 * 2.1;
    if (s.indexOf('#icon') === 0) return delay2 * 0.72;
    if (s === '') return delay2 * 0.6;

    // #accent 是带渐变配色的文字帧，按其文本内容判断
    if (s.indexOf('#accent') === 0) s = getValue(s) || '';

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
  this.p = new S.Point({
    x: x,
    y: y,
    z: 5,
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
  // 粒子采样间距：大屏用更大的间距，粒子更疏但每个更大，观感更好
  var gap = (window.innerWidth > 500 && window.innerHeight > 500) ? 13 : 8;

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

      setFontSize(fontSize);
      s = Math.min(fontSize,
                  (shapeCanvas.width / shapeContext.measureText(l).width) * 0.8 * fontSize,
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
          dots.push(new S.Dot(a.w / 2, a.h / 2));
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
          z: opts.converge ? (4 + Math.random() * 3) : 5,
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
      for (var d = 0; d < dots.length; d++) {
        dots[d].render();
      }
    }
  }
}());

function init(start){
  S.init(start);

}
