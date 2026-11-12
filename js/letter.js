/*

  打字机长信
  ==========
  逐字打出当年的信。支持跳过、滚动、点击加速。

  用法：
    Letter.show(['第一段', '第二段'], onDone)
    Letter.hide()

*/

var Letter = (function () {

  var root,
      body,
      lines = [],
      lineIdx = 0,
      charIdx = 0,
      timer = null,
      currentP = null,
      isOpen = false,
      onDone = null,
      onClose = null,
      speed = 58;          // 每字毫秒数。70 时一封 260 字的信要打 31 秒，
                           // 加上前面 26 秒的演出一共近一分钟，太拖。58 约 23 秒。

  function build() {
    root = document.createElement('div');
    root.id = 'letter';
    root.innerHTML =
      '<div class="letter-box">' +
        '<button class="letter-close" type="button" aria-label="关闭">&times;</button>' +
        '<div class="letter-body"></div>' +
        '<div class="letter-actions">' +
          '<button class="letter-skip" type="button">跳过</button>' +
          '<button class="letter-done" type="button">收下这封信</button>' +
        '</div>' +
      '</div>';

    body = root.querySelector('.letter-body');

    // 「跳过」：还在打字时把全文瞬间显示；已打完则直接关闭
    root.querySelector('.letter-skip').addEventListener('click', function (e) {
      e.stopPropagation();
      if (timer) finishAll();
      else hide();
    });

    // 「收下这封信」：读完后关闭信纸，回到烟花与相册
    root.querySelector('.letter-done').addEventListener('click', function (e) {
      e.stopPropagation();
      hide();
    });

    root.querySelector('.letter-close').addEventListener('click', function (e) {
      e.stopPropagation();
      hide();
    });

    // 点击信纸区域加速：把剩余的字瞬间打完当前段
    root.querySelector('.letter-box').addEventListener('click', function () {
      if (timer) finishLine();
    });

    // 点击信纸外的遮罩也能关闭（仅在已读完时，避免误触打断）
    root.addEventListener('click', function (e) {
      if (e.target === root && !timer) hide();
    });

    document.addEventListener('keydown', function (e) {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        timer ? finishAll() : hide();
      }
    });

    document.body.appendChild(root);
  }

  function typeNext() {
    if (lineIdx >= lines.length) {
      done();
      return;
    }

    var text = lines[lineIdx];

    if (charIdx === 0) {
      currentP = document.createElement('p');
      if (!text.trim()) currentP.className = 'letter-gap';
      body.appendChild(currentP);
    }

    if (!text.trim()) {
      // 空行是段落间隔，没有字要打，短停一下就过
      lineIdx++;
      charIdx = 0;
      timer = setTimeout(typeNext, speed * 4);
      scrollToBottom();
      return;
    }

    if (charIdx < text.length) {
      currentP.textContent = text.substring(0, charIdx + 1);
      charIdx++;
      // 标点后稍作停顿，读起来更像说话
      var ch = text.charAt(charIdx - 1),
          pause = /[。，、！？；：…]/.test(ch) ? speed * 4 : speed;

      timer = setTimeout(typeNext, pause);
    } else {
      // 一段打完，段间停顿
      lineIdx++;
      charIdx = 0;
      timer = setTimeout(typeNext, speed * 8);
    }

    scrollToBottom();
  }

  // 瞬间打完当前段
  function finishLine() {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;

    if (lineIdx < lines.length && currentP) {
      currentP.textContent = lines[lineIdx];
      lineIdx++;
      charIdx = 0;
    }

    scrollToBottom();
    timer = setTimeout(typeNext, speed * 4);
  }

  // 瞬间打完全部
  function finishAll() {
    clearTimeout(timer);
    timer = null;

    body.innerHTML = '';
    lines.forEach(function (line) {
      var p = document.createElement('p');
      if (!line.trim()) p.className = 'letter-gap';
      else p.textContent = line;
      body.appendChild(p);
    });

    lineIdx = lines.length;

    // 回顶部，不是到底部 —— 按「跳过」的人是为了把全文看一遍，
    // 停在最后一行等于让他自己往上翻。
    body.scrollTop = 0;

    done();
  }

  function done() {
    clearTimeout(timer);
    timer = null;

    root.classList.add('letter--done');

    if (typeof onDone === 'function') {
      var fn = onDone;
      onDone = null;
      fn();
    }
  }

  function hide() {
    clearTimeout(timer);
    timer = null;
    isOpen = false;

    // 中途关闭时回调还没跑过，这里补上，
    // 否则三连按钮永远不会出现
    if (typeof onDone === 'function') {
      var fn = onDone;
      onDone = null;
      fn();
    }

    if (root) root.classList.remove('letter--visible');

    // 信纸收起、画面重新露出来，这时才适合提示别的交互
    if (typeof onClose === 'function') {
      var c = onClose;
      onClose = null;
      setTimeout(c, 700);      // 等淡出动画走完
    }
  }

  function scrollToBottom() {
    body.scrollTop = body.scrollHeight;
  }

  // 把配置里的 letter 统一成字符串数组。
  //
  // 注意：中间的空行要留着 —— 它就是分段。上一版在这里做了 filter(s => s.trim())，
  // 把三封信里所有空行全吃了，段落粘成一整块。只切首尾。
  function toLines(letter, year) {
    var arr;

    if (!letter) arr = [];
    else if (typeof letter === 'string') arr = letter.split('\n');
    else arr = letter.slice();

    var out = arr.map(function (s) { return HB.fill(s, year); });

    while (out.length && !String(out[0]).trim()) out.shift();
    while (out.length && !String(out[out.length - 1]).trim()) out.pop();

    return out;
  }

  return {
    // cb        打字完成（或中途跳过）时触发
    // closeCb   信纸真正收起、画面重新露出时触发
    show: function (letter, year, cb, closeCb) {
      lines = toLines(letter, year);
      if (!lines.length) {
        if (typeof cb === 'function') cb();
        if (typeof closeCb === 'function') closeCb();
        return;
      }

      if (!root) build();

      // 把轻提示收掉。它是全屏唯一一层高亮白字，会从半透明信纸底下透出来，
      // 正好落在正文上像重影。
      var t = document.getElementById('toast');
      if (t) t.classList.remove('toast--visible');

      body.innerHTML = '';
      lineIdx = 0;
      charIdx = 0;
      currentP = null;
      onDone = cb;
      onClose = closeCb;
      isOpen = true;

      root.classList.remove('letter--done');
      root.classList.add('letter--visible');

      // 淡入结束后再开始打字，避免动画和文字同时出现显得仓促
      timer = setTimeout(typeNext, 700);
    },

    hide: hide,

    isOpen: function () {
      return isOpen;
    }
  };
}());


/*

  三连彩蛋
  ========
  跟 B 站一样：长按「点赞」就是一键三连，轻点只是点赞。
  投币、收藏照样能单独点，三个都亮了同样算连成。

  —— 为什么去掉「一键三连」按钮：
  那本来就不是 B 站的交互。多一个高饱和主按钮，"三连"这件事就从
  一个顺手的小动作，变成了画面里最抢眼的东西，反而更假。

*/

var Triple = (function () {

  var root,
      row,
      hint,
      states = { like: false, coin: false, fav: false },
      fired = false,
      locked = false,          // 三连依次点亮期间锁住，防止重复触发
      onComplete = null,

      HOLD_MS  = 900,          // 长按到这个时长算三连。700 容易误触，1200 像没反应
      TAP_MS   = 260,          // 短于这个算轻点：只点亮点赞
      STEP_MS  = 110;          // 三连时三个按钮依次点亮的间隔

  // 图标用内联 SVG 描边（feather 的路径），跟全站细线条一致。
  // 上一版是 emoji（👍🪙⭐）—— 彩色、圆润、自带立体感，进这套画面就是贴纸。
  var PATHS = {
    like: '<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3z"/>' +
          '<path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>',
    coin: '<circle cx="12" cy="12" r="8.6"/>' +
          '<path d="M9 9.4h6M12 9.4v6M9.4 12.6h5.2"/>',
    fav:  '<polygon points="12 2.6 15.1 8.7 21.9 9.7 17 14.5 18.2 21.3 12 18.1 5.8 21.3 7 14.5 2.1 9.7 8.9 8.7"/>'
  };

  var ITEMS = [
    { key: 'like', icon: 'like', label: '点赞' },
    { key: 'coin', icon: 'coin', label: '投币' },
    { key: 'fav',  icon: 'fav',  label: '收藏' }
  ];

  function svg(name) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + PATHS[name] + '</svg>';
  }

  function build() {
    root = document.createElement('div');
    root.id = 'triple';

    // 一行很淡的说明。没有它，「长按」这个动作没人会去试 ——
    // 藏起来的交互等于不存在。三连完成后自己退场。
    hint = document.createElement('p');
    hint.className = 'triple-hint';
    hint.textContent = '长按「点赞」一键三连';

    row = document.createElement('div');
    row.className = 'triple-row';

    ITEMS.forEach(function (item) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'triple-btn';
      btn.dataset.key = item.key;
      btn.setAttribute('aria-label', item.label);
      btn.innerHTML = svg(item.icon) + '<span>' + item.label + '</span>';

      if (item.key === 'like') {
        bindHold(btn);
      } else {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          if (fired || states[item.key]) return;
          light(item.key, btn);
          settle();
        });
      }

      row.appendChild(btn);
    });

    root.appendChild(hint);
    root.appendChild(row);
    document.body.appendChild(root);
  }

  // 长按点赞 = 一键三连。
  //
  // 进度直接从按钮本身的底色里涨出来（--hold 0 → 1，CSS 里算百分比），
  // 不用在按钮外面再套一圈环：这套按钮是药丸形，套上去的圆环和它不同形，
  // 一看就是贴上去的。
  function bindHold(btn) {

    var raf = null,
        t0 = 0,
        done = false;

    function tick() {
      var p = Math.min(1, (performance.now() - t0) / HOLD_MS);
      btn.style.setProperty('--hold', p.toFixed(3));

      if (p >= 1) {
        done = true;
        cancelAnimationFrame(raf);
        btn.style.setProperty('--hold', '1');

        // 满格先停一拍再交棒。立刻撤掉 holding，进度会瞬间退回去，
        // "填满"这个结果根本没被人看见，就只剩下三个按钮突然变红。
        setTimeout(function () {
          btn.classList.remove('triple-btn--holding');
          btn.style.setProperty('--hold', '0');
        }, 140);

        // 到点给一下手的反馈。手机上这一下比任何动画都直接
        if (navigator.vibrate) navigator.vibrate(14);

        tripleAll();
        return;
      }
      raf = requestAnimationFrame(tick);
    }

    function release() {
      if (done) { done = false; return; }   // 已经连成了，别再当成一次轻点

      cancelAnimationFrame(raf);
      var held = performance.now() - t0;

      btn.classList.remove('triple-btn--holding');
      btn.style.setProperty('--hold', '0');

      // 轻点 = 只点赞（B 站的行为）。要投币、收藏还是得自己点
      if (held < TAP_MS && !fired && !states.like) {
        light('like', btn);
        settle();
      }
    }

    btn.addEventListener('pointerdown', function (e) {
      if (fired) return;
      e.preventDefault();
      // 抓住指针：手指按住后滑出按钮也不丢，松手一定收得到。
      // 合成事件（测试、或某些浏览器）里没有活动指针会抛 NotFoundError，忽略即可
      try {
        if (btn.setPointerCapture) btn.setPointerCapture(e.pointerId);
      } catch (err) {}

      t0 = performance.now();
      done = false;
      btn.classList.add('triple-btn--holding');
      raf = requestAnimationFrame(tick);
    });

    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
  }

  // 一次点亮三个，按 STEP_MS 依次 —— 让"点了一下，得到三个"这件事被看见，
  // 而不是三个同时变红、像一次状态刷新。
  function tripleAll() {
    if (fired || locked) return;
    locked = true;

    ITEMS.forEach(function (item, i) {
      setTimeout(function () {
        light(item.key, row.querySelector('.triple-btn[data-key="' + item.key + '"]'));

        if (i === ITEMS.length - 1) {
          locked = false;
          settle();
        }
      }, i * STEP_MS);
    });
  }

  function light(key, btn) {
    states[key] = true;
    if (btn) btn.classList.add('triple-btn--on');
  }

  function settle() {
    if (fired) return;
    if (!(states.like && states.coin && states.fav)) return;

    fired = true;
    root.classList.add('triple--complete');

    // 文案不变，只靠整组变暗表示已连 —— 换字会让按钮宽度跳一下
    celebrate();
  }

  // 三连达成：一圈光环 + 从按钮位置往上飘的符号
  function celebrate() {
    // 之前是整组按钮 pop 到 1.28 倍 —— 那一弹让整个界面跟着抖。
    var ring = document.createElement('div');
    ring.className = 'triple-ring';
    document.body.appendChild(ring);
    setTimeout(function () { ring.remove(); }, 1300);

    // 符号从按钮的位置往上走，不是从屏幕顶端落下：
    // "天上下雨"和"我按了三下"之间没有因果关系，起点错了就很怪。
    var layer = document.createElement('div');
    layer.className = 'triple-burst';

    var glyphs = ['♥', '✦', '·', '✧'];
    var n = window.innerWidth < 500 ? 10 : 18;

    for (var i = 0; i < n; i++) {
      var s = document.createElement('span');
      s.textContent = glyphs[i % glyphs.length];
      s.style.left = (42 + Math.random() * 16) + '%';
      s.style.fontSize = (13 + Math.random() * 15) + 'px';
      s.style.animationDelay = (Math.random() * 0.5).toFixed(2) + 's';
      s.style.setProperty('--dx', Math.round((Math.random() - 0.5) * 170) + 'px');
      s.style.setProperty('--rot', Math.round((Math.random() - 0.5) * 90) + 'deg');
      layer.appendChild(s);
    }

    document.body.appendChild(layer);
    setTimeout(function () { layer.remove(); }, 2900);

    if (typeof onComplete === 'function') onComplete();
  }

  return {
    mount: function (cb) {
      if (!root) build();
      onComplete = cb;
      root.classList.add('triple--visible');
    },

    unmount: function () {
      if (root) root.classList.remove('triple--visible');
    },

    isComplete: function () {
      return fired;
    }
  };
}());
