/*

  时光轴
  ======
  垂直滚动的往年归档，一年一屏：那年的照片 + 她说过的话 + 你写的信。
  数据来自 HB.archive()，缺失的年份自动跳过。

*/

var Timeline = (function () {

  var root,
      isOpen = false,
      built = false;

  // 占位卡渐变配色，与 carousel.js 保持一致
  var placeholderColors = [
    ['#ff9a9e', '#fecfef'],
    ['#a1c4fd', '#c2e9fb'],
    ['#ffecd2', '#fcb69f'],
    ['#d4fc79', '#96e6a1'],
    ['#e0c3fc', '#8ec5fc'],
  ];

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  // 把 letter 字段统一成字符串数组（配置里允许写字符串或数组）
  function toLines(letter) {
    if (!letter) return [];
    if (typeof letter === 'string') {
      return letter.split('\n').filter(function (s) { return s.trim(); });
    }
    return letter.filter(function (s) { return s && String(s).trim(); });
  }

  function buildPhoto(photo, i) {
    var wrap = el('div', 'tl-photo');

    if (photo.src) {
      var img = document.createElement('img');
      img.src = photo.src;
      img.alt = photo.caption || '';
      img.loading = 'lazy';       // 时光轴可能有很多图，滚到了再加载
      // 加载失败退化为占位卡，不出碎图
      img.onerror = function () {
        wrap.replaceChild(buildPlaceholder(i), img);
      };
      wrap.appendChild(img);
    } else {
      wrap.appendChild(buildPlaceholder(i));
    }

    if (photo.caption) {
      wrap.appendChild(el('div', 'tl-photo-cap', HB.fill(photo.caption)));
    }

    return wrap;
  }

  function buildPlaceholder(i) {
    var c = placeholderColors[i % placeholderColors.length],
        ph = el('div', 'tl-photo-ph', '<span>' + (i + 1) + '</span>');

    ph.style.background = 'linear-gradient(135deg,' + c[0] + ',' + c[1] + ')';
    return ph;
  }

  function buildYear(data) {
    var sec = el('section', 'tl-year');

    // 年份标头
    var head = el('div', 'tl-head');
    head.appendChild(el('div', 'tl-year-num', data.year));
    if (data.headline) {
      head.appendChild(el('div', 'tl-headline', HB.fill(data.headline, data.year)));
    }
    sec.appendChild(head);

    // 照片
    var photos = (data.photos || []);
    if (photos.length) {
      var grid = el('div', 'tl-photos');
      photos.forEach(function (p, i) { grid.appendChild(buildPhoto(p, i)); });
      sec.appendChild(grid);
    }

    // 她说过的话
    var quotes = (data.quotes || []).filter(function (q) { return q && q.text; });
    if (quotes.length) {
      var qWrap = el('div', 'tl-quotes');

      quotes.forEach(function (q) {
        var box = el('blockquote', 'tl-quote');
        box.appendChild(el('p', 'tl-quote-text', HB.fill(q.text, data.year)));

        // 出处：「场合 · 日期」，两者都可缺
        var meta = [q.from, q.date].filter(Boolean).join(' · ');
        if (meta) box.appendChild(el('cite', 'tl-quote-from', meta));

        qWrap.appendChild(box);
      });

      sec.appendChild(qWrap);
    }

    // 你写的信
    var lines = toLines(data.letter);
    if (lines.length) {
      var letter = el('div', 'tl-letter');
      lines.forEach(function (line) {
        letter.appendChild(el('p', null, HB.fill(line, data.year)));
      });
      sec.appendChild(letter);
    }

    return sec;
  }

  function build() {
    built = true;

    root = el('div', 'tl-modal');
    root.innerHTML =
      '<button class="tl-close" type="button" aria-label="关闭">&times;</button>' +
      '<div class="tl-scroll"><div class="tl-inner"></div></div>';

    var inner = root.querySelector('.tl-inner'),
        list = HB.archive();

    if (!list.length) {
      inner.appendChild(el('div', 'tl-empty',
        '往年的回忆还没有添加<br><span>以后每年都会往这里增加内容</span>'));
    } else {
      list.forEach(function (data) { inner.appendChild(buildYear(data)); });
    }

    // 页脚署名
    if (SITE.footer) {
      inner.appendChild(el('div', 'tl-footer', SITE.fill(SITE.footer)));
    }

    root.querySelector('.tl-close').addEventListener('click', close);

    document.addEventListener('keydown', function (e) {
      if (isOpen && e.key === 'Escape') close();
    });

    document.body.appendChild(root);
  }

  function open() {
    if (!built) build();
    isOpen = true;
    root.classList.add('tl-modal--visible');
    // 每次打开都从顶部开始
    root.querySelector('.tl-scroll').scrollTop = 0;
  }

  function close() {
    isOpen = false;
    if (root) root.classList.remove('tl-modal--visible');
  }

  return {
    open: open,
    close: close,
    toggle: function () { isOpen ? close() : open(); },

    // 有没有往年内容可看（只有一年数据时也返回 true，
    // 因为空状态本身也是有意义的展示）
    available: function () {
      return HB.hasData();
    }
  };
}());
