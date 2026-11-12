/*

  三年的光
  ========
  生日演出的开场。不放字，放光。

  为什么要有这一段
  ----------------
  原来的演出一上来就是"生日快乐"四个字 —— 那是贺卡的语法：给你一句话，
  配一堆特效。看第一年是惊喜，看第二年是熟悉，第三年就是一张旧截图。

  但这一站手里有一件别的东西：**她真实的三年**。
  2024 年 4 月的一千个人，2025 年 1 月的十四万，2026 年 6 月的一百万，
  现在的一百三十八万。这些数字都在 data/history.js 里，一直没被用起来。

  所以开场不做字，做一件事：**让光按真实的增长曲线长出来。**
  一千个人是一千点光，一百三十八万个人是满屏的光 —— 量级本身就能被看见。

  每一年新增一次采样点，这场戏就自动长一点、亮一点。
  它不是"每年换一套特效"，它是"每年多走一段路"。

  视觉设计
  --------
  屏幕是一扇窗。

    0.0s  一片黑，只有一颗光点在呼吸         ← 一个人
    2.6s  光点散成几颗                       ← 有人来了
    4.0s  光点开始从城市底部升起、留在天上   ← 灯一盏盏亮
   22.0s  按真实粉丝曲线长到满屏
   26.0s  所有光一起向上涌
   29.5s  淡出，把画面交给粒子字

  光点全部从画面下沿升起（那是城市的位置），不是凭空出现在天上。
  "从地上长出来"和"天上本来就有"是两种完全不同的意思。

  实现约束
  --------
  - 独立 canvas，不要碰 js/index.js 那个粒子引擎。它一千多行、状态很重，
    为了加个开场去改它，风险远大于收益。这里自己画，坏了直接掐掉。
  - 光点用预渲染的 sprite + drawImage，不要每帧 arc + shadowBlur。
    一千多颗星每帧做一次径向渐变，帧率会掉到个位数。
  - 无论发生什么都必须回调 done()，否则整场演出卡死在黑屏上。

*/

var Opening = (function () {

  var root, canvas, ctx, label,
      W = 0, H = 0, dpr = 1,
      raf = null,
      running = false,
      t0 = 0,
      stars = [],          // 已经停在天上的光点
      risers = [],         // 正在从城市升起的光点
      spriteCache = {},
      markerIdx = -1,
      doneFn = null,
      finished = false,
      lastFrame = 0,
      progress = 0,
      skipTimer = null;

  // ---------- 时间轴（毫秒）----------
  // 改这里就能改变整段开场的节奏。总长 = T_END。

  var T_SEED  = 2600,     // 一颗 → 一小簇
      T_GROW  = 22000,    // 生长段结束（此后不再新增星）
      T_LIFT  = 24000,    // 收拢开始
      T_LIFT_END = 28200, // 收拢到最紧
      T_END   = 29800;    // 淡出结束、交棒

  // 生长曲线终点：满屏大约能放多少颗。再多就糊成一片噪声，看不出"点"——
  // 1300 颗时整屏像一场雪，人眼只会读成"花的"，读不出"多"。
  // 980 既满得住，又还看得出每一颗。
  var PEAK = 980;

  // ---------- 数据 ----------

  // 兜底：history.js 没加载时也要能演，不能因为一个数据文件缺席就黑屏。
  var FALLBACK = [
    { date: '2024-04-04', followers: 1000 },
    { date: '2025-01-28', followers: 140000 },
    { date: '2026-06-19', followers: 1000000 },
    { date: '2026-11-11', followers: 1386504 },
  ];

  function points() {
    var h = window.HB_HISTORY;
    return (h && h.points && h.points.length >= 2) ? h.points : FALLBACK;
  }

  // 把采样点换成"时间戳 + 人数"。只在第一次用到时算一遍 ——
  // 这里每帧都要查，现场 Date.parse 会白白吃掉几毫秒。
  var SERIES = null;

  function series() {
    if (SERIES) return SERIES;

    SERIES = points().map(function (pt) {
      return {
        t: Date.parse(pt.date + 'T00:00:00+08:00'),
        f: pt.followers,
        date: pt.date
      };
    }).sort(function (a, b) { return a.t - b.t; });

    return SERIES;
  }

  // 演出进度 p(0~1) 映射到真实日期，再取那个日期上的人数。
  //
  // ⚠️ 这一条是整段开场的节奏来源，不能均匀分给采样点。
  // 均匀分的话，2024 年那 9 个月（1000 → 14 万）和 2026 年那 5 个月
  // （83 万 → 100 万）各占一样长的时间 —— 但真实世界里，前者是"没人看"的
  // 九个月，后者是"每个月涨三万"。等得久，才看得见"她熬了多久"。
  function followersAt(p) {
    var s = series(),
        from = s[0].t,
        to = s[s.length - 1].t,
        t = from + (to - from) * Math.max(0, Math.min(1, p)),
        i = 0;

    while (i < s.length - 2 && s[i + 1].t < t) i++;

    var a = s[i], b = s[i + 1],
        span = b.t - a.t,
        k = span <= 0 ? 0 : (t - a.t) / span;

    return a.f + (b.f - a.f) * Math.max(0, Math.min(1, k));
  }

  // p 最接近哪个采样点（用来决定屏幕上显示哪一行的数字）
  function markAt(p) {
    var s = series(),
        from = s[0].t,
        to = s[s.length - 1].t,
        t = from + (to - from) * Math.max(0, Math.min(1, p)),
        best = 0,
        bestD = Infinity,
        i, d;

    for (i = 0; i < s.length; i++) {
      d = Math.abs(s[i].t - t);
      if (d < bestD) { bestD = d; best = i; }
    }

    return best;
  }

  // 粉丝数 → 光点数。
  //
  // 直接按比例是不行的：1000 比 1,386,504，一千三百多倍，
  // 线性映射下前两年全部挤在"看不见"的那一小段里。
  //
  // 指数用 0.42 而不是 0.5：开方（0.5）时 14 万人已经占掉三分之一的屏幕，
  // 后面两年全都挤在剩下的三分之二里 —— 那就不像"长"了。
  // 0.42 下 14 万人只占 341/980，后面还留着长大的余地。
  //
  // 上限按屏幕面积给：手机竖屏只有桌面的三成面积，
  // 同样塞 980 颗就是一团挤死的蚊子，不是星海。
  function peak() {
    return Math.max(240, Math.min(PEAK, (W * H) / 1160));
  }

  function countFor(followers) {
    var top = series()[series().length - 1].f / 1000,
        k = (peak() - 1) / (Math.pow(top, 0.42) - 1);

    return 1 + (Math.pow(Math.max(1, followers) / 1000, 0.42) - 1) * k;
  }

  // ---------- 文案 ----------

  // 别写"14万粉丝"这种报表话。这里要的是"那时有多少人"。
  //
  // 中文里没有"1.4 百万人"这种说法 —— 一律用"万"。
  // 14 万 / 100 万 / 138.7 万，都比换算到"百万"顺。
  function human(n) {
    if (n >= 10000) return (Math.round(n / 1000) / 10) + ' 万人';
    return n + ' 人';
  }

  // 最后那句里的"一百三十八万"不能写死。
  // 明年粉丝涨了、后年又涨了，这句话必须自己跟着变 ——
  // 这场戏的意义就是"数字在长"，一句话写死就露馅了。
  var CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

  function cnNum(n) {
    if (n < 10) return CN[n];
    if (n < 20) return '十' + (n % 10 ? CN[n % 10] : '');
    if (n < 100) return CN[Math.floor(n / 10)] + '十' + (n % 10 ? CN[n % 10] : '');
    if (n < 1000) {
      var rest = n % 100;
      return CN[Math.floor(n / 100)] + '百' +
        (rest ? (rest < 10 ? '零' + CN[rest] : cnNum(rest)) : '');
    }
    return String(n);
  }

  // 取"万"为单位的整数部分：1,386,504 → 一百三十八万
  function cnWan(followers) {
    return cnNum(Math.floor(followers / 10000)) + '万';
  }

  function finalLine() {
    var s = series();
    return cnWan(s[s.length - 1].f) + '人，今晚都在';
  }

  function markText(p) {
    var s = series(),
        pt = s[markAt(p)];

    return pt.date.slice(0, 7) + ' · ' + human(pt.f);
  }

  // ---------- 绘制资源 ----------

  // 一颗光点的贴图。64px 的画布缩到 6~14px 上屏，边缘足够软。
  function sprite(r, g, b) {
    var key = r + '_' + g + '_' + b;
    if (spriteCache[key]) return spriteCache[key];

    var S = 64,
        cv = document.createElement('canvas');

    // 先定尺寸再取 context。反过来的话，后面那句 cv.width = ...
    // 会把已经建好的渐变重置掉，画出来是一张透明的空图 —— 不报错。
    cv.width = cv.height = S;

    var c = cv.getContext('2d'),
        half = S / 2,
        grad = c.createRadialGradient(half, half, 0, half, half, half);

    // 核心不能是纯白：几千颗叠在一起（lighter）会烧成一团白，
    // 金字变成白斑，反而看不出"金"。
    var cr = Math.round(r + (255 - r) * 0.18),
        cg = Math.round(g + (255 - g) * 0.18),
        cb = Math.round(b + (255 - b) * 0.18);

    // 核心要实、外圈要散。前两档太软的话，缩到十几像素上屏只剩一团雾，
    // 看起来像屏幕上的脏点，而不是一颗星。
    grad.addColorStop(0.00, 'rgba(' + cr + ',' + cg + ',' + cb + ',1)');
    grad.addColorStop(0.12, 'rgba(' + r + ',' + g + ',' + b + ',0.86)');
    grad.addColorStop(0.32, 'rgba(' + r + ',' + g + ',' + b + ',0.30)');
    grad.addColorStop(0.62, 'rgba(' + r + ',' + g + ',' + b + ',0.07)');
    grad.addColorStop(1.00, 'rgba(' + r + ',' + g + ',' + b + ',0)');

    c.fillStyle = grad;
    c.fillRect(0, 0, S, S);

    spriteCache[key] = cv;
    return cv;
  }

  // 颜色随进度升温：开头是刚从窗里透出来的暗金，结尾是烛光。
  function tintAt(p) {
    var from = [214, 168, 128],
        to = [255, 234, 178],
        t = Math.max(0, Math.min(1, p));

    // 用 pow 让前半程保持偏暗 —— 亮度本身也是叙事，
    // 一亮到底的话，"长到满屏"这件事就不成立了。
    t = Math.pow(t, 0.72);

    return [
      Math.round(from[0] + (to[0] - from[0]) * t),
      Math.round(from[1] + (to[1] - from[1]) * t),
      Math.round(from[2] + (to[2] - from[2]) * t)
    ];
  }

  // ---------- 光点 ----------

  function addStar(x, y, r, phase) {
    stars.push({
      x: x, y: y,
      r: r,
      // 亮度跟大小走：近处的灯本来就比远处亮。
      // 全都一样亮的话，满屏是同一个灰度的点，读不出远近。
      base: 0.30 + Math.min(r, 3) * 0.15 + Math.random() * 0.12,
      phase: phase == null ? Math.random() * Math.PI * 2 : phase,
      spd: 0.006 + Math.random() * 0.012,
      // 收拢时各自的落点半径与角度。
      // 全部精确叠到同一个像素上，980 颗经 lighter 相加就是一块死白的圆片，
      // 边缘一刀切 —— 看起来像贴上去的贴纸。
      // 1.15 次方：落点摊得开一点，中心才不会被烧成一颗实心灯泡，
      // 而是一团有浓有淡的星云。
      oa: Math.random() * Math.PI * 2,
      or: Math.pow(Math.random(), 1.15) * 168
    });
  }

  function spawnRiser() {
    // 落点：下密上疏。
    // ⚠️ 这里用 1 - pow(rand)：rand 小时 pow 也小，1-pow 接近 1 → y 在下方。
    // 直接用 pow 会得到相反的分布 —— 光点全挤在屏幕顶上，
    // 底下空着，看起来不像"从城市升上来"，像天上本来就有星星。
    var y = H * (0.08 + 0.80 * (1 - Math.pow(Math.random(), 1.45))),
        x = Math.random() * W;

    // 尺寸用 2.4 次方分布：绝大多数是远处的小灯，少数是近处的大灯。
    // 均匀随机会得到一个"平均大小"，而平均大小的点阵看起来就是噪点。
    var size = 0.55 + Math.pow(Math.random(), 2.4) * 2.6;

    risers.push({
      x: x,
      y: H * 1.04,
      tx: x + (Math.random() - 0.5) * W * 0.10,
      ty: y,
      sp: 0.55 + Math.random() * 1.5,
      r: size,
      seed: Math.random() * Math.PI * 2
    });
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = root.clientWidth;
    H = root.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---------- 主循环 ----------

  function frame(now) {
    if (!running) return;

    if (!t0) t0 = now;

    var t = now - t0,
        dt = Math.min(64, now - (lastFrame || now)),
        k = dt / 16.67;           // 归一化到 60fps 的帧数，掉帧时不至于变慢动作

    lastFrame = now;

    if (t >= T_END) {
      finish();
      return;
    }

    // 生长进度：0 在 T_SEED，1 在 T_GROW
    var grow = Math.max(0, Math.min(1, (t - 300) / (T_GROW - 300)));
    progress = grow;

    drawFrame(t, grow, k);

    raf = requestAnimationFrame(frame);
  }

  function drawFrame(t, grow, k) {
    var i, s, r, a;

    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';

    // 上涌段：过了 T_LIFT 之后所有光点向中心收拢。
    //
    // 原来这里是"整体上浮"，结果最后四秒是一屏光点缓缓飘出画面 ——
    // 没有落点，整段演出等于没有结尾。
    // 收拢才有"攒起来"的意思：三年的光最后攒成一个点，
    // 交给下一幕（粒子字）从这个点里散开。
    var lift = Math.max(0, Math.min(1, (t - T_LIFT) / (T_LIFT_END - T_LIFT)));
    var pull = Math.pow(lift, 1.5) * 0.030;

    // 最后 1.1 秒才淡出。提前淡会让"收拢"这个动作看不完。
    var fade = t > T_END - 1100
      ? Math.max(0, (T_END - t) / 1100)
      : 1;

    // ---------- 目标星数 ----------
    var target;

    if (t < T_SEED) {
      // 一个人在呼吸。不要放零颗，也不要放很多 —— 这一颗就是"她"。
      target = 1;
    } else {
      target = countFor(followersAt(grow));
    }

    // 补星：每帧最多补几颗，让"长"是一个过程而不是一次跳变
    var deficit = target - (stars.length + risers.length),
        canSpawn = Math.min(Math.ceil(6 + grow * 26), Math.ceil(deficit));

    for (i = 0; i < canSpawn; i++) {
      if (t < T_SEED) {
        // 第一颗直接在画面中间偏下的位置亮起来
        addStar(W * 0.5, H * 0.56, 2.4, 0);
      } else {
        spawnRiser();
      }
    }

    // ---------- 上升中的光点 ----------
    for (i = risers.length - 1; i >= 0; i--) {
      r = risers[i];

      r.y -= r.sp * k;
      r.x += (r.tx - r.x) * 0.012 * k;

      // 收拢段：还没落位的光点也一起往中心靠，不然它们会落在画面外
      if (pull > 0) {
        r.x += (W * 0.5 - r.x) * pull * 0.5 * k;
        r.y += (H * 0.44 - r.y) * pull * 0.5 * k;
      }

      // 头部
      var raised = (H * 1.04 - r.y) / (H * 1.04 - r.ty);
      a = Math.min(1, raised * 3) * 0.85 * fade;

      var c = tintAt(grow),
          d = r.r * 13;

      ctx.globalAlpha = a * 0.62;
      ctx.drawImage(sprite(c[0], c[1], c[2]), r.x - d / 2, r.y - d / 2, d, d);

      // 拖尾：一条很短的下垂线，让"升起"这件事有方向。
      // 别拉长 —— 拉长之后整屏像下着雨夹雪，脏。
      if (raised > 0.06) {
        ctx.globalAlpha = a * 0.16;
        ctx.strokeStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',1)';
        ctx.lineWidth = Math.max(0.5, r.r * 0.38);
        ctx.beginPath();
        ctx.moveTo(r.x, r.y);
        ctx.lineTo(r.x, r.y + 2 + r.r * 2.4);
        ctx.stroke();
      }

      if (r.y <= r.ty) {
        addStar(r.x, r.ty, r.r, r.seed);
        risers.splice(i, 1);
      }
    }

    // ---------- 天上的光点 ----------
    for (i = 0; i < stars.length; i++) {
      s = stars[i];

      s.phase += s.spd * k;

      // 呼吸只在 0.72~1 之间摆，幅度太大会像接触不良
      var breath = 0.72 + 0.28 * Math.sin(s.phase),
          alpha = s.base * breath * fade,
          dd;

      if (t < T_SEED) {
        // 第一颗是"心跳"，周期更长、幅度更大。
        // 尺寸也要大得多：这一颗是整段开场唯一的焦点，
        // 太小的话人根本不知道要看哪里，只会觉得屏幕坏了。
        alpha = 0.55 + 0.45 * Math.sin(s.phase * 0.7);
        dd = 120;
      } else {
        // 收拢时略微变大，像"越靠越近"
        dd = s.r * (16 + lift * 11);
      }

      ctx.globalAlpha = alpha;
      var col = tintAt(grow);
      ctx.drawImage(sprite(col[0], col[1], col[2]), s.x - dd / 2, s.y - dd / 2, dd, dd);

      // 收拢：所有光点向画面中心靠过去。
      // pull 用 1.5 次方缓入 —— 前半段几乎不动，最后一秒才明显加速，
      // 匀速收拢看起来像"镜头推远"，加速收拢才像"攒起来"。
      // 落点不是同一个像素，是各自在中心附近的一个小盘上（见 or / oa）。
      if (lift > 0) {
        var tx = W * 0.5 + Math.cos(s.oa) * s.or,
            ty = H * 0.44 + Math.sin(s.oa) * s.or * 0.62;

        s.x += (tx - s.x) * pull * k;
        s.y += (ty - s.y) * pull * k;
      }
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    updateLabel(t, grow);
    syncCity(grow);
  }

  // 城市灯跟着人数一起亮。
  //
  // 这一句是整段开场和背景之间的唯一连接：光点升起的同一时刻，
  // 底下那些楼也在亮起来。两者不同步的话，光点会像是凭空贴上去的。
  // 曲线用 0.6 次方：真实增长是"前期慢、后期快"，但背景太晚亮
  // 会让人以为坏了，所以让城市比人数先走一步。
  //
  // ⚠️ 不要每帧都写这个变量。改 CSS 变量会让浏览器重新计算样式，
  // 而 body 的背景是 10 层渐变叠一张 SVG 天际线 —— 每帧重绘一次，
  // 帧率直接从 60 掉到 38。变化小于 0.8% 就不写，肉眼看不出，开销归零。
  var lastCity = -1;

  function syncCity(grow) {
    if (!running) return;

    var v = 0.06 + 0.86 * Math.pow(grow, 0.6);

    if (Math.abs(v - lastCity) < 0.008) return;

    lastCity = v;
    document.body.style.setProperty('--mood-city', v.toFixed(3));
  }

  // ---------- 文案 ----------

  function updateLabel(t, grow) {
    if (!label) return;

    var idx;

    if (t < T_SEED) {
      // 开场那两秒半什么都不写。一颗光点在呼吸，不需要解释。
      // 用 -1 而不是 0：等 T_SEED 过去、真的切到第一条时，
      // idx 变了才会重播一次淡入 —— 否则动画早在第一颗星亮起时就跑完了，
      // 观众看到的是一条从没出现过的文案。
      idx = -1;
    } else {
      idx = markAt(grow);

      // 最后一句话在"开始收拢"时才出现，不是人数涨满就出现。
      // 按 grow 判断的话，2026-11 那条采样点只显示零点几秒就被盖掉了 ——
      // 而它恰恰是"现在".
      if (t >= T_LIFT + 300) idx = series().length;
    }

    if (idx === markerIdx) return;

    markerIdx = idx;

    if (idx < 0) {
      label.textContent = '';
      label.classList.remove('opening-label--in', 'opening-label--hold');
      return;
    }

    var isFinal = idx >= series().length,
        text = isFinal ? finalLine() : markText(grow);

    label.textContent = text;
    label.classList.remove('opening-label--in', 'opening-label--hold');
    void label.offsetWidth;          // 强制重排，让动画能重播

    // 最后一句话不淡出。它要一直撑到光收拢完成，
    // 否则整段演出在最后四秒是"没有话可说"的。
    label.classList.add(isFinal ? 'opening-label--hold' : 'opening-label--in');
  }

  // ---------- 生命周期 ----------

  function finish() {
    if (finished) return;
    finished = true;
    running = false;

    if (raf) cancelAnimationFrame(raf);
    raf = null;

    if (skipTimer) { clearTimeout(skipTimer); skipTimer = null; }
    document.removeEventListener('click', onSkipClick);
    window.removeEventListener('resize', onResize);

    // 交棒：先让这一层淡掉，同时叫醒粒子字 —— 两者重叠 0.8 秒。
    //
    // 原来的顺序是"等淡完（700ms）再 init"，中间留了一段纯黑，
    // 观众看到的是"光核没了 → 等一下 → 数字跳出来"。
    // 重叠之后，粒子字是从还没散尽的光里长出来的。
    root.classList.add('opening--out');

    var cb = doneFn;
    doneFn = null;
    if (cb) cb();

    setTimeout(function () {
      root.style.display = 'none';
      document.body.style.removeProperty('--mood-city');
    }, 800);
  }

  function play(done) {
    doneFn = done || null;

    if (finished) { if (done) done(); return; }

    // 系统开了"减少动态效果"就直接跳过。这一段全是动效，
    // 硬播对前庭敏感的人不友好，不如直接给结果。
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { if (done) done(); return; }

    root = document.getElementById('opening');
    canvas = document.getElementById('opening-canvas');
    label = document.getElementById('opening-label');

    if (!root || !canvas) { if (done) done(); return; }

    ctx = canvas.getContext('2d');
    if (!ctx) { if (done) done(); return; }

    // 顺序很重要：必须先 display:block 再量尺寸。
    // display:none 的节点 clientWidth 是 0，先 resize 会把画布设成 0×0，
    // 之后所有 drawImage 都画在一张零面积的图上 —— 不报错，也什么都不显示。
    root.style.display = 'block';
    root.classList.remove('opening--out');

    resize();

    // 城市一开始几乎全黑。灯是随着人一起来到这个画面里的。
    document.body.style.setProperty('--mood-city', '0.06');

    running = true;
    t0 = 0;
    lastFrame = 0;
    stars.length = 0;
    risers.length = 0;
    markerIdx = -1;

    window.addEventListener('resize', onResize);

    // 点一下画面就跳过。
    //
    // 三十秒不能跳过，第二次打开的人会烦 —— 而这一站是会被反复打开看的
    // （信、往年、三连都在后面）。延迟绑定是因为启动这次播放的
    // 那个 click 还在冒泡，立刻绑会被自己触发掉。
    skipTimer = setTimeout(function () {
      document.addEventListener('click', onSkipClick);
    }, 400);

    raf = requestAnimationFrame(frame);
  }

  function onSkipClick() {
    document.removeEventListener('click', onSkipClick);

    // 跳过就是跳过：不要留一屏冻结的光点在后面当背景，
    // 那会让"跳过"看起来像"卡住了"。
    if (root) root.style.display = 'none';

    finish();
  }

  function onResize() {
    if (!running) return;
    resize();
  }

  return {
    play: play,
    stop: finish,
    isPlaying: function () { return running; },
    // 调试用：把当前状态打出来，不必靠肉眼猜
    debug: function () {
      return {
        t: t0 ? Math.round(performance.now() - t0) : 0,
        stars: stars.length,
        risers: risers.length,
        progress: Math.round(progress * 100) / 100,
        marker: markerIdx
      };
    }
  };
}());
