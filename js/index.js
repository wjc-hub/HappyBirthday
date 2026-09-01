
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

  function timedAction(fn, delay, max, reverse) {
    clearInterval(interval);
    currentAction = reverse ? max : 1;
    fn(currentAction);

    if (!max || (!reverse && currentAction < max) || (reverse && currentAction > 0)) {
      interval = setInterval(function () {
        currentAction = reverse ? currentAction - 1 : currentAction + 1;
        fn(currentAction);

        if ((!reverse && max && currentAction === max) || (reverse && currentAction === 0)) {
          clearInterval(interval);
        }
      }, delay);
    }
  }

  function reset(destroy) {
    clearInterval(interval);
    sequence = [];
    time = null;
    destroy && S.Shape.switchShape(S.ShapeBuilder.letter(''));
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

    timedAction(function (index) {
      current = sequence.shift();
      action = getAction(current);
      value = getValue(current);

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
            S.Shape.switchShape(obj);
          });
          break;

        default:
          S.Shape.switchShape(S.ShapeBuilder.letter(current[0] === cmd ? 'What?' : current));
      }
    }, delay2, sequence.length);
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


// 从 CONFIG.theme.palette 里取粒子颜色；配置缺失时退回原来的粉色
S.Palette = (function () {
  var fallback = [[255, 192, 203]];

  function colors() {
    var p = (typeof CONFIG !== 'undefined' && CONFIG.theme && CONFIG.theme.palette);
    return (p && p.length) ? p : fallback;
  }

  return {
    pick: function (a) {
      var list = colors(),
          c = list[Math.floor(Math.random() * list.length)];

      return new S.Color(c[0], c[1], c[2], a);
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

  _draw: function () {
    this.c.a = this.p.a;
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

    switchShape: function (n, fast) {
      var size,
          a = S.Drawing.getArea();

      width = n.w;
      height = n.h;

      compensate();

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

        if (dots[d].s) {
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
        dots[d].move(new S.Point({
          x: n.dots[i].x + cx,
          y: n.dots[i].y + cy,
          a: 1,
          z: 5,
          h: 0
        }));

        n.dots = n.dots.slice(0, i).concat(n.dots.slice(i + 1));
        d++;
      }

      for (var i = d; i < dots.length; i++) {
        if (dots[i].s) {
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
