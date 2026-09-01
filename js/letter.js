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
      speed = 70;          // 每字毫秒数

  function build() {
    root = document.createElement('div');
    root.id = 'letter';
    root.innerHTML =
      '<div class="letter-box">' +
        '<div class="letter-body"></div>' +
        '<div class="letter-actions">' +
          '<button class="letter-skip" type="button">跳过</button>' +
        '</div>' +
      '</div>';

    body = root.querySelector('.letter-body');

    root.querySelector('.letter-skip').addEventListener('click', function (e) {
      e.stopPropagation();
      finishAll();
    });

    // 点击信纸区域加速：把剩余的字瞬间打完当前段
    root.querySelector('.letter-box').addEventListener('click', function () {
      if (timer) finishLine();
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
      body.appendChild(currentP);
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
      p.textContent = line;
      body.appendChild(p);
    });

    lineIdx = lines.length;
    scrollToBottom();
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

  function scrollToBottom() {
    body.scrollTop = body.scrollHeight;
  }

  // 把配置里的 letter 统一成字符串数组
  function toLines(letter, year) {
    var arr;

    if (!letter) arr = [];
    else if (typeof letter === 'string') arr = letter.split('\n');
    else arr = letter.slice();

    return arr
      .map(function (s) { return HB.fill(s, year); })
      .filter(function (s) { return s && s.trim(); });
  }

  return {
    show: function (letter, year, cb) {
      lines = toLines(letter, year);
      if (!lines.length) {
        if (typeof cb === 'function') cb();
        return;
      }

      if (!root) build();

      body.innerHTML = '';
      lineIdx = 0;
      charIdx = 0;
      currentP = null;
      onDone = cb;
      isOpen = true;

      root.classList.remove('letter--done');
      root.classList.add('letter--visible');

      // 淡入结束后再开始打字，避免动画和文字同时出现显得仓促
      timer = setTimeout(typeNext, 700);
    },

    hide: function () {
      clearTimeout(timer);
      timer = null;
      isOpen = false;
      if (root) root.classList.remove('letter--visible');
    },

    isOpen: function () {
      return isOpen;
    }
  };
}());


/*

  三连彩蛋
  ========
  点赞 / 投币 / 收藏，三个都点亮后触发一段特效。

*/

var Triple = (function () {

  var root,
      states = { like: false, coin: false, fav: false },
      fired = false,
      onComplete = null;

  var ITEMS = [
    { key: 'like', icon: '👍', label: '点赞' },
    { key: 'coin', icon: '🪙', label: '投币' },
    { key: 'fav',  icon: '⭐', label: '收藏' },
  ];

  function build() {
    root = document.createElement('div');
    root.id = 'triple';

    ITEMS.forEach(function (item) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'triple-btn';
      btn.dataset.key = item.key;
      btn.innerHTML =
        '<span class="triple-icon">' + item.icon + '</span>' +
        '<span class="triple-label">' + item.label + '</span>';

      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        toggle(item.key, btn);
      });

      root.appendChild(btn);
    });

    document.body.appendChild(root);
  }

  function toggle(key, btn) {
    if (states[key]) return;      // 已点亮的不再取消，避免反复触发

    states[key] = true;
    btn.classList.add('triple-btn--on');

    // 单个图标的弹跳反馈
    btn.classList.remove('triple-btn--pop');
    void btn.offsetWidth;         // 强制重排，让动画能重新播放
    btn.classList.add('triple-btn--pop');

    if (!fired && states.like && states.coin && states.fav) {
      fired = true;
      root.classList.add('triple--complete');
      celebrate();
    }
  }

  // 三连达成：飘一片图标 + 提示
  function celebrate() {
    var layer = document.createElement('div');
    layer.className = 'triple-burst';

    var icons = ['👍', '🪙', '⭐', '🎉', '💖'];

    for (var i = 0; i < 24; i++) {
      var s = document.createElement('span');
      s.textContent = icons[i % icons.length];
      s.style.left = (Math.random() * 100) + '%';
      s.style.animationDelay = (Math.random() * 0.6) + 's';
      s.style.fontSize = (18 + Math.random() * 22) + 'px';
      layer.appendChild(s);
    }

    document.body.appendChild(layer);
    setTimeout(function () { layer.remove(); }, 3200);

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
