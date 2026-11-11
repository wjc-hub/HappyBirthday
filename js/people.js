/*

  陪你的人
  ========
  两栏，两个视角：

    「我」   —— 你和她的关系线。只有你能写的那部分。
    「大家」 —— 别人为她做的：直播留档、切片、二创、纪念。

  数据来自 data/me.js 和 data/fandom.js。

  原则：页面上只放文字卡片 + 跳转链接，不搬运视频、不盗链封面。
  这些作品属于它们各自的主人。

*/

var People = (function () {

  var root,
      isOpen = false,
      built = false;

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  // 83764 → 8.4 万
  function play(n) {
    if (n == null) return '';
    if (n >= 1e8) return (n / 1e8).toFixed(1).replace(/\.0$/, '') + ' 亿播放';
    if (n >= 1e4) return (n / 1e4).toFixed(1).replace(/\.0$/, '') + ' 万播放';
    return n + ' 播放';
  }

  function videoUrl(bvid) {
    return 'https://www.bilibili.com/video/' + bvid;
  }

  // ---------- 我 ----------

  function buildMe(me) {
    var sec = el('section', 'pp-sec'),
        nodes = (me.nodes || []).filter(function (n) { return n && n.title; });

    if (!nodes.length) return null;

    sec.appendChild(el('h2', 'pp-h', '我'));
    sec.appendChild(el('p', 'pp-sub',
      me.name ? '从「' + HB.fill(me.name) + '」这个账号出发，只有这一条线是我自己的。' : '只有这一条线是我自己的。'));

    var line = el('div', 'pp-line');

    nodes.forEach(function (n) {
      var item = el('div', 'pp-node');

      item.appendChild(el('div', 'pp-node-date', String(n.date).replace(/-/g, '.')));

      if (n.bvid) {
        var a = el('a', 'pp-node-title', HB.fill(n.title));
        a.href = videoUrl(n.bvid);
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        item.appendChild(a);
      } else {
        item.appendChild(el('span', 'pp-node-title', HB.fill(n.title)));
      }

      if (n.note) item.appendChild(el('div', 'pp-node-note', HB.fill(n.note)));

      var meta = [];
      if (n.dur) meta.push(n.dur);
      if (n.play != null) meta.push(play(n.play));
      if (meta.length) item.appendChild(el('div', 'pp-node-meta', meta.join(' · ')));

      line.appendChild(item);
    });

    sec.appendChild(line);
    return sec;
  }

  // ---------- 大家 ----------

  function buildCard(item) {
    var a = el('a', 'pp-card');
    a.href = videoUrl(item.bvid);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';

    a.appendChild(el('span', 'pp-card-bv', item.bvid));
    a.appendChild(el('span', 'pp-card-title', HB.fill(item.title)));

    var meta = [item.author];
    if (item.dur) meta.push(item.dur);
    if (item.play != null) meta.push(play(item.play));
    a.appendChild(el('span', 'pp-card-meta', meta.join(' · ')));

    if (item.note) a.appendChild(el('span', 'pp-card-note', HB.fill(item.note)));

    return a;
  }

  function buildFandom(fd) {
    var groups = (fd && fd.groups) || [],
        sec = el('section', 'pp-sec'),
        any = false;

    groups.forEach(function (g) {
      var items = (g.items || []).filter(function (i) { return i && i.bvid && i.title; });
      if (!items.length) return;
      any = true;

      var block = el('div', 'pp-group');
      block.appendChild(el('h3', 'pp-h3', HB.fill(g.label || '')));
      if (g.note) block.appendChild(el('p', 'pp-sub', HB.fill(g.note)));

      var grid = el('div', 'pp-grid');
      items.forEach(function (i) { grid.appendChild(buildCard(i)); });
      block.appendChild(grid);

      sec.appendChild(block);
    });

    if (!any) return null;

    sec.appendChild(el('p', 'pp-tip',
      '这些视频都属于发布它们的人。这里只做了索引，没有搬运、没有转载。'));

    return sec;
  }

  // ---------- 组装 ----------

  function build() {
    built = true;

    root = el('div', 'pp-modal');
    root.innerHTML =
      '<button class="pp-close" type="button" aria-label="关闭">&times;</button>' +
      '<div class="pp-scroll"><div class="pp-inner"></div></div>';

    var inner = root.querySelector('.pp-inner');

    inner.appendChild(el('div', 'pp-head',
      '<div class="pp-title">陪你的人</div>' +
      '<div class="pp-desc">年鉴里记的是她做了什么。这一页是我和大家，各自留下的东西。</div>'));

    var me = buildMe(window.HB_ME || {});
    if (me) inner.appendChild(me);

    var fd = buildFandom(window.HB_FANDOM);
    if (fd) inner.appendChild(fd);

    if (!me && !fd) {
      inner.appendChild(el('div', 'pp-empty', '还没有内容'));
    }

    if (SITE.footer) {
      inner.appendChild(el('div', 'pp-footer', SITE.fill(SITE.footer)));
    }

    root.querySelector('.pp-close').addEventListener('click', close);

    // 点空白处关闭（点卡片不会，因为卡片在 inner 里）
    root.addEventListener('click', function (e) {
      if (e.target === root) close();
    });

    document.addEventListener('keydown', function (e) {
      if (isOpen && e.key === 'Escape') close();
    });

    document.body.appendChild(root);
  }

  function open() {
    if (!built) build();
    isOpen = true;
    root.classList.add('pp-modal--visible');
    root.querySelector('.pp-scroll').scrollTop = 0;
  }

  function close() {
    isOpen = false;
    if (root) root.classList.remove('pp-modal--visible');
  }

  return {
    open: open,
    close: close,
    toggle: function () { isOpen ? close() : open(); },

    available: function () {
      var me = (window.HB_ME && window.HB_ME.nodes) || [],
          gs = (window.HB_FANDOM && window.HB_FANDOM.groups) || [];
      return me.length > 0 || gs.some(function (g) { return (g.items || []).length; });
    }
  };
}());
