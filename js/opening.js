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

    0.0s  一片黑，一颗光点被点亮、开始呼吸   ← 一个人
    2.6s  光点散成几颗                       ← 有人来了
    4.0s  光点开始从城市底部升起、留在天上   ← 灯一盏盏亮
    21.0s  按真实粉丝曲线长到满屏，阶梯摞到最后一级
    26.0s  所有光一起向上涌
    31.8s  淡出，把画面交给粒子字

  光点全部从画面下沿升起（那是城市的位置），不是凭空出现在天上。
  "从地上长出来"和"天上本来就有"是两种完全不同的意思。

  节奏（2026-11-12 夜加）
  ----------------------
  光是匀速变多的话，观众读到的是"进度条在走"。所以每到一个采样点
  （1000 → 14 万 → 100 万 → 138.6 万），全屏一起亮一下、荡开两圈光环，
  像人群一起吸一口气。收拢完成后光核再跳两下，然后才熄灭 ——
  它得是活的，交棒那一下才像"睁眼"。

  画面上那列数字是这三十秒的刻度（见 文案 一节）：

    2024-04  ─────────────── 1,000 人
    2025-01  ────────────────── 14 万人
    ...                                   ← 一级一级往下、往右、变大
    2026-11  ────────────────────────── 138.7 万人
               一百三十八万人，今晚都在

  它是**楼梯**，不是表格：每一级有一块从导轨伸出来的踏板、一段连着
  下一级的竖面、一个逐级放大的数字。字号跟着人数长（13px → 33px），
  所以"涨"这件事在读到数字之前就被看见了。

  每一行落下来的时候，数字会从上一级的人数**滚**到这一级（tickRows）——
  这是这一段最值钱的效果：它让"涨"变成一件正在发生的事。
  导轨上那根会往下滑的针标着"此刻"。走过的级只退字、不退结构：
  楼梯是一个整体，结构一淡就散了。

  跳过
  ----
  双击，不是单击。这一层铺满全屏，而开场里最常被点的其实是右上角的
  音乐开关；一击即跳的话，那一下就把三年跳没了（见 onDocClick）。

  实现约束
  --------
  - 独立 canvas，不要碰 js/index.js 那个粒子引擎。它一千多行、状态很重，
    为了加个开场去改它，风险远大于收益。这里自己画，坏了直接掐掉。
  - 光点用预渲染的 sprite + drawImage，不要每帧 arc + shadowBlur。
    一千多颗星每帧做一次径向渐变，帧率会掉到个位数。
  - 无论发生什么都必须回调 done()，否则整场演出卡死在黑屏上。

*/

var Opening = (function () {

  var root, canvas, ctx, label, hint,
      W = 0, H = 0, dpr = 1,
      raf = null,
      running = false,
      t0 = 0,
      stars = [],          // 已经停在天上的光点
      risers = [],         // 正在从城市升起的光点
      spriteCache = {},
      doneFn = null,
      finished = false,
      lastFrame = 0,
      progress = 0,
      skipTimer = null,
      hintTimer = null,
      rows = [],           // 已经挂上去的每一级（+ 落款）
      marker = null,       // 导轨上那个亮点（"此刻"站在哪一级）
      shownMark = -1,      // 已经写到第几个采样点
      finalShown = false,  // 落款写过没有
      charLive = false,    // 落款还有字在落
      rowsLive = false,    // 还有数字在滚
      lastTap = 0,         // 上一次"想跳过"的点击时刻
      skipping = false,
      skipAt = 0,
      pulseAt = -1e9,      // 最近一次"到达采样点"的时刻
      pulseIdx = -1;

  // ---------- 时间轴（毫秒）----------
  // 改这里就能改变整段开场的节奏。总长 = T_END。

  // 2026-11-13：最后一级（现在的人数）原来只挂两秒就被收拢压住，
  // 而"看全这一列"正是这段戏要给人的东西 —— 所以生长段提前一秒收尾，
  // 收拢往后推两秒：整列完整地停 5 秒，再交给光。
  var T_SEED  = 2600,     // 一颗 → 一小簇
      T_GROW  = 21000,    // 生长段结束（此后不再新增星、不再加级）
      T_LIFT  = 26000,    // 收拢开始
      T_LIFT_END = 30200, // 收拢到最紧
      T_END   = 31800;    // 淡出结束、交棒

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

  // 演出进度 p(0~1) 落到的那个真实日期。
  //
  // ⚠️ 这一条是整段开场的节奏来源，不能均匀分给采样点。
  // 均匀分的话，2024 年那 9 个月（1000 → 14 万）和 2026 年那 5 个月
  // （83 万 → 100 万）各占一样长的时间 —— 但真实世界里，前者是"没人看"的
  // 九个月，后者是"每个月涨三万"。等得久，才看得见"她熬了多久"。
  function dateAt(p) {
    var s = series(),
        from = s[0].t,
        to = s[s.length - 1].t;

    return from + (to - from) * Math.max(0, Math.min(1, p));
  }

  // 那个日期上大致有多少人（采样点之间线性插值）。
  function followersAt(p) {
    var s = series(),
        t = dateAt(p),
        i = 0;

    while (i < s.length - 2 && s[i + 1].t < t) i++;

    var a = s[i], b = s[i + 1],
        span = b.t - a.t,
        k = span <= 0 ? 0 : (t - a.t) / span;

    return a.f + (b.f - a.f) * Math.max(0, Math.min(1, k));
  }

  // 已经走到第几个采样点（阶梯要添到第几级）。
  //
  // 用"走到"而不是"离谁近"：这是逐级往摞的前提下必须先改的一件事。
  // 最近邻是按"前后各一半"来算每一级的上台时间的 —— 2024-04 到 2025-01
  // 隔着九个月，那一级就只挂一秒多，字都没落齐就被顶上去。
  // 走到就是走到：光点满到一千人，才写"1000 人"。
  // 光点的呼吸/全屏亮一下也走这条（见 syncPulse），
  // 于是"数字出现"和"光满上来"是同一瞬间，不是两件事。
  function reachedIdx(p) {
    var s = series(),
        t = dateAt(p),
        i = 0;

    while (i < s.length - 1 && s[i + 1].t <= t) i++;

    return i;
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
      //
      // 0.75 次方 + 200 半径：让落点铺得比"往中间挤"更均匀一点。
      // 用 1.15 次方时大部分点挤在半径 100 以内，即使有光晕也烧成一团
      // 中心纯白的棉花；摊开之后中心亮、外圈疏，才像一团星云。
      oa: Math.random() * Math.PI * 2,
      or: Math.pow(Math.random(), 0.75) * 200
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

    // 跳过：画布内退场跑完 660ms 就收尾（见 requestSkip）
    if (skipping && t - skipAt >= 660) {
      finish();
      return;
    }

    // 生长进度：0 在 T_SEED，1 在 T_GROW
    var grow = Math.max(0, Math.min(1, (t - 300) / (T_GROW - 300)));
    progress = grow;

    drawFrame(t, grow, k);

    raf = requestAnimationFrame(frame);
  }

  // ---------- 节拍 ----------
  //
  // 这一节是整段开场"有没有感觉"的关键。
  //
  // 光点从一千长到满屏，如果只是数量在变，观众读到的是"进度条在走"——
  // 数字确实在长，但没有一个时刻是"到了"。真实的一年不是匀速的：
  // 破万、破十四万、破百万，每一次都是一个下午被人截图的那种瞬间。
  //
  // 所以每个采样点到达时，全屏要一起"吸一口气"：亮度齐涨、颗粒微胀，
  // 再从画面中心荡开两圈光环。成本只有一次三角运算和两次描边，
  // 但它把三十秒切成四段有重音的话。

  // 检测"刚跨进一个新的采样点"。返回 0~1 的强度，随时间衰减。
  function syncPulse(t, grow) {
    if (t < T_SEED) return;

    var idx = reachedIdx(grow);
    if (idx === pulseIdx) return;

    pulseIdx = idx;
    pulseAt = t;
  }

  function pulseNow(t) {
    var d = (t - pulseAt) / 900;
    if (d < 0 || d > 1) return 0;

    // 二次方衰减：起手要猛，"到了"才有重量；拖得久就变成呼吸了。
    return Math.pow(1 - d, 2);
  }

  // 收拢完成之后，光核再跳两下。
  //
  // 不加这个，结尾是"光慢慢挤成一团然后淡掉"——像被吸进了一个洞。
  // 加上之后同样的动作变成"它攒起来了，而且它是活的"，
  // 交棒给「祝」的那一下才像"睁眼"，不像"换页"。
  function coreBeat(t) {
    if (t < T_LIFT_END) return 1;

    // 720ms 一次：两次搏动刚好落在"收拢完成"到"开始淡出"之间。
    // 用 780 的话第二次峰值会被淡出吃掉一半，看起来只跳了一下。
    var ph = (t - T_LIFT_END) / 720;
    if (ph > 2.6) return 1;

    var amp = Math.exp(-ph * 0.5) * 0.22;

    return 1 + Math.sin(ph * Math.PI * 2) * amp;
  }

  // 两圈荡开的光环。用描边而不是实心圆 —— 实心圆在 lighter 下是一块糊掉的光斑，
  // 描边才看得出"一圈"正从中心走过整屏。
  function drawRipples(t, grow) {
    var d = (t - pulseAt) / 1500;
    if (d < 0 || d > 1) return;

    var cx = W * 0.5,
        cy = H * 0.44,
        far = Math.min(W, H) * 0.78,
        c = tintAt(grow),
        i, k, r;

    for (i = 0; i < 2; i++) {
      k = d - i * 0.13;
      if (k < 0 || k > 1) continue;

      r = 26 + k * far;

      // 衰减用 3 次方、上限 0.15：环荡到屏幕边缘时基本只剩一点痕迹。
      // 用二次方时，十几秒后还挂着一圈完整的圆 —— 那是雷达，不是光。
      ctx.globalAlpha = Math.pow(1 - k, 3) * 0.15;
      ctx.strokeStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',1)';
      ctx.lineWidth = 0.35 + 1.3 * (1 - k);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
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

    // 最后 0.9 秒才淡出。提前淡会让"收拢 + 心跳"这两件事都看不完：
    // 光刚攒成一团就散掉，观众读到的只是"没了"，不是"结束了"。
    var fade = t > T_END - 900
      ? Math.max(0, (T_END - t) / 900)
      : 1;

    // 跳过时的淡出。用 t 而不是另开一个计时器：
    // 光点在继续飞、城市在继续亮，只是整体在退场 —— 读起来是"这一段淡了"，
    // 不是"画面暂停然后消失"。
    if (skipping) {
      fade *= Math.max(0, 1 - (t - skipAt) / 640);
    }

    var beat, core;

    syncPulse(t, grow);            // 先判"是否刚到一个采样点"，本帧就能看到
    beat = pulseNow(t);
    core = coreBeat(t);

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
      a = Math.min(1, raised * 3) * 0.85 * fade * (1 + beat * 0.35);

      var c = tintAt(grow),
          d = r.r * 13 * (1 + beat * 0.18);

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
        //
        // 但它是"被点亮"的，不是一开始就亮着：前 0.9 秒从 12% 升到满。
        // 少了这一下，第一帧就是一个现成的亮点，读起来像屏保；
        // 有了这一下，画面才像"有人伸手把灯打开了"。
        var ign = Math.min(1, t / 900);
        ign = ign * ign * (3 - 2 * ign);

        alpha = (0.55 + 0.45 * Math.sin(s.phase * 0.7)) * (0.12 + 0.88 * ign);
        dd = 58 + 62 * ign;
      } else {
        // 收拢时略微变大，像"越靠越近"。
        // 只放大到 16→20，不是 16→27：几百颗挤在一起的时候，
        // 尺寸翻倍等于给中心再浇一勺油，会烧成一块白斑。
        dd = s.r * (16 + lift * 4);

        // 采样点的重音、光核的心跳，都只改"亮度和大小"，
        // 不改位置 —— 光点的走向是叙事（人从地上来），
        // 让它突然抖一下就成了纯特效。
        alpha *= (1 + beat * 0.55) * core;

        // 越密越要收着亮。980 颗叠在半径 200 的盘里，
        // 每颗的 base 都满着算，中心必然过曝成一片纯白 ——
        // 那不是"光攒起来了"，那是"画面被烧穿了"。
        alpha *= 1 - lift * 0.30;

        dd *= (1 + beat * 0.14) * core;
      }

      ctx.globalAlpha = alpha;
      var col = tintAt(grow);
      ctx.drawImage(sprite(col[0], col[1], col[2]), s.x - dd / 2, s.y - dd / 2, dd, dd);

      // 收拢：所有光点向画面中心靠过去。
      // pull 用 1.5 次方缓入 —— 前半段几乎不动，最后一秒才明显加速，
      // 匀速收拢看起来像"镜头推远"，加速收拢才像"攒起来"。
      // 落点不是同一个像素，是各自在中心附近的一个小盘上（见 or / oa）。
      if (lift > 0) {
        // 0.88 而不是 0.62：压到 0.62 时这团光是横向拉长的一朵云，
        // 读起来像"一片雾"；接近正圆才像"攒起来的一团"。
        // 留一点扁是为了让它落在屏幕上不那么像气泡。
        var tx = W * 0.5 + Math.cos(s.oa) * s.or,
            ty = H * 0.44 + Math.sin(s.oa) * s.or * 0.88;

        s.x += (tx - s.x) * pull * k;
        s.y += (ty - s.y) * pull * k;
      }
    }

    // 光环画在光点之后：光点是"人"，光环是"消息传开"。
    // 顺序反过来会让环从点缝里穿过去，看着像一张网格。
    drawRipples(t, grow);

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    updateLabel(t, grow);
    tickRows(performance.now());
    tickChars();
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
  //
  // 这一节是"这三年涨了多少人"被读出来的地方。
  //
  // 上一版是一列 11px 等宽小字，结构对（同时看见所有），但观感像一份
  // 调试日志：字小、没有层级、悬在星空中间跟画面没有任何关系。
  //
  // 这一版把「涨」这件事拆进排版里：
  //
  //   · 字号跟着人数一起长。第一级约 17px，最后一级约 27px —— 越往下越大，
  //     台阶的"高度"本身在变，一抬眼就知道后面这几步比前面重。
  //   · 日期小、人数大。日期是刻度（.7em，暗），人数是主角（1em，亮）。
  //   · 每一级底下压一条细线，从左侧导轨一直伸到文字右端。线越往下越长，
  //     十一根横线叠起来就是台阶的剪影 —— 整列因此是"一个东西"，
  //     不是十一行没有依托的字。
  //   · 左侧一根竖直导轨 + 一个跟着往下走的亮点：那是"此刻"站在哪一级。
  //
  // 效果（都是"到了"这一下的分量，不是为了动而动）：
  //
  //   · 落级：整行从下方浮起、由虚到实，同时那个数字从上一级的人数**滚**
  //     到这一级（tickRows 逐帧改写）。滚数字是这一段最值钱的效果 ——
  //     它让"涨"变成一件正在发生的事，而不是一条已经写好的记录。
  //   · 落级那一帧，全屏的光也一起亮一下（见 syncPulse）、光环荡开一圈。
  //   · 最新一级的暖光一直在慢慢呼吸，旧级退到五成亮、呼吸停掉 ——
  //     画面里只有一个地方是"活的"。
  //   · 落款：宋体、逐字落下（tickChars），前面压一条更亮的分隔线。

  // 行高倍数：台阶之间的缝。必须和 index.html 里 .ol-line 的 line-height
  // 一模一样 —— 列高是按它乘出来的，差 0.08 就是二十几像素的错位。
  var COL_LH = 1.5,
      COL_GROW = 1.55,     // 最后一级比第一级大多少（1.55 = 大两倍半）
      COL_INDENT = 18;     // 文字离导轨多远（第一级）

  // 一级往右挪多少像素（宽屏）。窄屏要收：11 级的错位加上一行字，
  // 在 390 宽的手机上就是一条从左边缘斜到右边缘的线，像排版溢出。
  function stairStep() {
    return Math.max(7, Math.min(17, W * 0.012));
  }

  // 整列的高度是字号的固定倍数（正比）：行高写死，字号按 i 线性升，
  // 落款是 2.3 倍字号的两行。所以"最多能多大"可以直接反算，不用试。
  //
  // 这个倍数 K 必须和 columnHeight 算的是同一件事，改那边记得改这里。
  function heightFactor(n) {
    return (n + COL_GROW * (n - 1) / 2) * COL_LH + 2.3 * (1.05 + COL_LH);
  }

  // 第一级的字号。
  //
  // 两个上限，取小的：
  //   · 屏幕高度：这一列是竖的，限制它的是高度不是宽度（H*0.0175）；
  //   · 可用空当：0.215H~0.790H 之间那段（避开光核、避开城市剪影），
  //     按高度反算出来的上限 —— 有它，大屏才不会被白留一片。
  // 最后一级是它的 2.55 倍（COL_GROW）：900 高的屏幕上 15.6 → 40px，
  // 1080 上 18.7 → 48px。差得越明显，"最后一步比第一步重得多"越成立。
  function baseFont() {
    var n = series().length,
        band = H * (0.765 - 0.215) * 0.955,
        fit = band / heightFactor(n),
        want = Math.min(H * 0.0175, W * 0.042);

    return Math.max(11, Math.min(fit, want, 22));
  }

  function fontAt(i, n) {
    var k = n > 1 ? i / (n - 1) : 1;
    return baseFont() * (1 + COL_GROW * k);
  }

  // 落款是一整句话，宽度是死的 —— 窄屏上它比数字更容易被裁掉。
  // 所以除了字号，还要按"这句话从这里开始写、写到哪里"再兜一次底。
  function finalFont(n) {
    var f = baseFont() * 2.30,
        start = COL_INDENT + finalIndent(n) + W * 0.07,
        room = W - start - 18,
        per = (finalLine().length || 12) * 1.075;   // 字宽 + 字距

    return Math.min(f, room / per);
  }

  // 落款从哪儿起排。宽屏挂在最后一级的数字下面（像"这一列写完了"），
  // 窄屏退回导轨旁边 —— 手机上跟着缩进的话，一句话只剩二百来像素，
  // 字得压到 20px 才放得下，比最后一级的数字还小，收不住。
  function finalIndent(n) {
    return W < 640 ? 0 : (n - 1) * stairStep();
  }

  function rowIndent(i, n) {
    return COL_INDENT + Math.min(i, n - 1) * stairStep();
  }

  // 整列的高度。**预**算，不是量出来的 —— 字号是 i 的函数，行高写死 1.5，
  // 所以还没落第一级就能知道这十一级一共多高。
  //
  // 知道它有什么用：整列可以一次摆到位（顶部锚定），后面每加一级只是往下
  // 填一格。不预算的话，只能靠"底部锚定 + 撑满 min-height"，那样一旦哪年
  // 采样点变多、或者字号在断点里变了，整列就会自己往上爬（上一版的坑）。
  function columnHeight(n) {
    var h = 0, i;

    for (i = 0; i < n; i++) h += fontAt(i, n) * COL_LH;

    // 落款：一段上边距 + 一行 1.4 的行高
    return h + finalFont(n) * (1.05 + 1.4);
  }

  // 整列摆在画面的哪一段。上界避开光核，下界避开城市剪影和左下角那排按钮。
  function layoutStairs() {
    var n = series().length,
        total = columnHeight(n),
        bandTop = H * 0.215,
        bandBot = H * 0.765,   // 城市剪影最高的楼大约在 0.78，落款要站在它上面
        top = bandTop + Math.max(0, (bandBot - bandTop - total) / 2),
        i, rec;

    if (label) label.style.top = Math.round(top) + 'px';

    for (i = 0; i < rows.length; i++) {
      rec = rows[i];

      rec.el.style.setProperty('--fs',
        (rec.isFinal ? finalFont(n) : fontAt(rec.idx, n)).toFixed(1) + 'px');
      rec.el.style.paddingLeft = COL_INDENT + 'px';

      // 日期一律钉在导轨旁边，**只有数字列**一级一级往右挪。
      //
      // 这一条是整列好不好看的关键。之前是整行一起挪：日期也跟着往右走，
      // 左边那根线就成了斜的，一列字没有任何一条竖线可以靠 —— 看着像
      // 一排被挤歪的表格。日期钉住之后，左边是一根笔直的刻度尺，
      // 右边是一串逐级下沉、逐级变大的数字，阶梯的剪影才立得住。
      if (!rec.isFinal) {
        rec.num.style.marginLeft = (rec.idx * stairStep()) + 'px';

        // 踏板（那道横杠）只铺到数字的起点，不铺到行尾。
        //
        // 铺满整行的时候，十一条等长的横线看着就是一张表格 —— 而且是
        // 一张没有表头的表格。铺到数字脚下之后：左边一根导轨、中间一道
        // 踏板、右端站着那一级的人数，横线长度 = 这一级踩出去多远，
        // 十一级叠起来才是台阶的侧面。
        rec.el.style.setProperty('--beam',
          Math.round(rec.num.offsetLeft) + 'px');

        // 落款挂在最后一级数字的起点下面：读起来是"这一列写完了，
        // 下面还有一句话"，不是又一级台阶。
      } else {
        rec.el.style.paddingLeft = (COL_INDENT + finalIndent(n)) + 'px';
      }
    }

    layoutRisers();
    placeMarker();
  }

  // 每一级的踏板高度（离行底多少）—— 竖边要从这个高度开始量。
  function beamY(rec, n) {
    return rec.el.offsetTop + rec.el.offsetHeight -
      (rec.isFinal ? finalFont(n) : fontAt(rec.idx, n)) * 0.22;
  }

  // 竖边：从这一级的踏板末端，垂到下一级的踏板。
  //
  // 长度要现量，不能写死 —— 每一级的字号不同，行高也就不同。
  // 没有下一级的时候（最后一级）先收起来，等下一级落下来再长下去：
  // 楼梯是一级一级被"砌"出来的，那条竖边是随新台阶一起长出来的。
  function layoutRisers() {
    var n = series().length,
        i, rec, next, len;

    for (i = 0; i < rows.length; i++) {
      rec = rows[i];
      if (rec.isFinal || !rec.riser) continue;

      next = rows[i + 1];
      len = next ? beamY(next, n) - beamY(rec, n) : 0;

      rec.riser.style.left = Math.round(rec.num.offsetLeft) + 'px';

      if (len > 0) {
        rec.riser.style.height = Math.round(len) + 'px';
        rec.riser.classList.add('ol-riser--on');
      } else {
        rec.riser.style.height = '0px';
        rec.riser.classList.remove('ol-riser--on');
      }
    }
  }

  // 导轨上那个亮点。它不是装饰：它标的是"此刻"站在第几级。
  //
  // 每落一级，它从上一格滑到下一格（CSS transition 管 top）。滑这一下
  // 比新行浮起来更能说明"时间在往前走" —— 静止的亮点只是装饰，
  // 会移动的亮点才是一个指针。
  function placeMarker() {
    if (!marker) return;

    var rec = rows[rows.length - 1];

    if (!rec || rec.isFinal) { marker.style.opacity = '0'; return; }

    marker.style.top = Math.round(rec.el.offsetTop + rec.el.offsetHeight / 2) + 'px';
    marker.style.opacity = '1';
  }

  function ensureMarker() {
    if (!label) return;

    if (!marker) {
      marker = document.createElement('div');
      marker.className = 'ol-marker';
    }

    if (marker.parentNode !== label) label.appendChild(marker);
  }

  // 一级 + 落款，共用一个入口。idx 传 n 就是落款。
  function addRow(idx, isFinal) {
    var n = series().length,
        s = series(),
        row = document.createElement('div'),
        body = document.createElement('div'),
        dateEl, numEl, unitEl, riserEl, seed, rec,
        i, ch, sp;

    row.className = 'ol-line' + (isFinal ? ' ol-line--final' : '');
    body.className = 'ol-body';

    row.style.setProperty('--fs',
      (isFinal ? finalFont(n) : fontAt(idx, n)).toFixed(1) + 'px');
    row.style.paddingLeft = COL_INDENT + 'px';   // 具体错位由 layoutStairs 写

    if (isFinal) {
      // 落款是"一句话"，不是一个数 —— 所以它回到逐字落位。
      // 数字行不做逐字：数字那边有滚动，两个动效叠在一起会互相打架。
      var text = finalLine();

      for (i = 0; i < text.length; i++) {
        ch = text.charAt(i);

        sp = document.createElement('span');
        sp.className = 'ol-ch';
        sp.textContent = (ch === ' ' || ch === '\u3000') ? '\u00a0' : ch;
        body.appendChild(sp);
      }

      row.appendChild(body);
      label.appendChild(row);

      rows.push({
        el: row,
        idx: n,
        isFinal: true,
        chars: body.children,
        start: performance.now(),
        stagger: 96,
        dur: 1050,
        live: true,
        counting: false
      });

      charLive = true;
      layoutStairs();
      return;
    }

    dateEl = document.createElement('span');
    dateEl.className = 'ol-date';
    dateEl.textContent = markDate(idx);
    // 日期列定宽（按最长的一条算）。不定宽的话，两条完整日期会把
    // 自己那一行的数字往右推三个字，整列看着像没对齐。
    dateEl.style.width = dateWidth();

    numEl = document.createElement('span');
    numEl.className = 'ol-num';

    unitEl = document.createElement('span');
    unitEl.className = 'ol-unit';

    // 起手先写上一级的人数，再往下滚 —— 从 0 开始滚就见不到"涨"，
    // 只见到"数"；从 14 万滚到 23 万，那九万才是这一级的意思。
    seed = numSplit(idx > 0 ? s[idx - 1].f : 0);
    numEl.textContent = seed.n;
    unitEl.textContent = seed.u;

    body.appendChild(dateEl);
    body.appendChild(numEl);
    body.appendChild(unitEl);
    row.appendChild(body);

    // 踏步的"竖面"：从这一级的踏板末端往下，连到下一级的踏板。
    // 少了它，十一条横线只是十一条横线；有了它，侧面连起来才是楼梯。
    riserEl = document.createElement('i');
    riserEl.className = 'ol-riser';
    row.appendChild(riserEl);

    label.appendChild(row);

    rec = {
      el: row,
      idx: idx,
      num: numEl,
      unit: unitEl,
      riser: riserEl,
      from: idx > 0 ? s[idx - 1].f : 0,
      to: s[idx].f,
      start: performance.now(),
      dur: 880,
      counting: true
    };

    rows.push(rec);
    rowsLive = true;

    // 旧的一级退场：呼吸停掉、亮度压下去。不是擦掉 —— 擦掉就没有台阶了。
    for (i = 0; i < rows.length - 1; i++) {
      rows[i].el.classList.remove('ol-line--now');
      rows[i].el.classList.add('ol-line--dim');
    }

    row.classList.add('ol-line--now');

    layoutStairs();
  }

  // 数字滚动。逐帧只是改写一个 textContent —— 整段开支等于一次文本布局，
  // 而同时只有一到两行在滚，滚完就把 counting 放下，不再碰 DOM。
  function tickRows(now) {
    if (!rowsLive) return;

    var live = 0, i, rec, p, e, v, sp;

    for (i = 0; i < rows.length; i++) {
      rec = rows[i];
      if (!rec.counting) continue;

      p = (now - rec.start) / rec.dur;

      if (p >= 1) {
        p = 1;
        rec.counting = false;
      } else {
        live++;
      }

      e = 1 - Math.pow(1 - p, 3);              // easeOutCubic：起手快、收尾稳

      v = rec.from + (rec.to - rec.from) * e;
      sp = numSplit(v);

      rec.num.textContent = sp.n;
      rec.unit.textContent = sp.u;
    }

    rowsLive = live > 0;
  }

  // 落款逐字落位。数字行不走这里（见 tickRows 的注释）。
  function tickChars() {
    if (!charLive || !label) return;

    var now = performance.now(),
        live = 0,
        r, rec, kids, n, i, p, e, settled;

    for (r = 0; r < rows.length; r++) {
      rec = rows[r];
      if (!rec.live || !rec.chars) continue;

      kids = rec.chars;
      n = kids.length;
      settled = 0;

      for (i = 0; i < n; i++) {
        p = (now - rec.start - i * rec.stagger) / rec.dur;

        if (p >= 1) { settled++; continue; }
        if (p <= 0) continue;          // 还没轮到，保持 CSS 的 opacity: 0

        e = 1 - Math.pow(1 - p, 3);    // easeOutCubic

        kids[i].style.opacity = p >= 0.6 ? '1' : e.toFixed(3);
        kids[i].style.transform = 'translateY(' + ((1 - e) * 12).toFixed(2) + 'px)';
      }

      if (settled === n) {
        // 落齐了：把终态写死，然后停手，不再每帧碰 DOM。
        for (i = 0; i < n; i++) {
          kids[i].style.opacity = '1';
          kids[i].style.transform = 'none';
        }
        rec.live = false;
      } else {
        live++;
      }
    }

    charLive = live > 0;
  }

  function updateLabel(t, grow) {
    if (!label) return;

    // 开场那两秒半什么都不写。一颗光点不需要解释。
    if (t < T_SEED) return;

    var n = series().length,
        // 落款在"开始收拢"时才出现，不是人数涨满就出现：
        // 按 grow 判断的话，最后一级只挂零点几秒就被落款压住 ——
        // 而它恰恰是"现在"。
        idx = (t >= T_LIFT + 300) ? n : reachedIdx(grow);

    // 一级一级补。idx 一次跳两级（掉帧、从后台切回来）就两级都补上：
    // 台阶中间缺一格比慢一格难看，而且缺的那格永远补不回来了。
    while (shownMark < Math.min(idx, n - 1)) {
      shownMark++;
      showMark(shownMark);
    }

    if (idx >= n) showFinal();
  }

  function showMark(i) {
    addRow(i, false);
  }

  // 一级上写什么日期。
  //
  // 平时只写「2025-12」—— 这一列读的是趋势，月份够用。
  // 但同一个月的两条（2025-12-11 的 60 万、2025-12-21 的 64 万）不能都写成
  // 「2025-12」：一列里出现两个一模一样的日期，看起来像数据出了错。
  // 撞月就退到完整日期 —— 多写五个字，换来的是"那十天涨了四万"这个事实。
  function markDate(i) {
    var s = series(),
        ym = s[i].date.slice(0, 7),
        k;

    for (k = 0; k < s.length; k++) {
      if (k !== i && s[k].date.slice(0, 7) === ym) return s[i].date.slice(0, 10);
    }

    return ym;
  }

  // 日期列要留多宽（字符数）。按最长的一条算，整个列表只算一次。
  var dateCol = 0;

  function dateColWidth() {
    var n = series().length, i;

    if (dateCol) return dateCol;

    for (i = 0; i < n; i++) {
      dateCol = Math.max(dateCol, markDate(i).length);
    }

    return dateCol;
  }

  // 日期那一格宽多少。日期字号是固定的（见 index.html 的 .ol-date），
  // 所以 ch 是常量，可以算出一个固定宽度 —— 一行一行加起来才是一条直线。
  // 末尾那个字距也要算进去，否则最后一格会挤着数字。
  function dateWidth() {
    var n = dateColWidth();

    return 'calc(' + n + 'ch + ' + (n * 0.13).toFixed(2) + 'em)';
  }

  // 人数拆成「数」和「单位」两段：数大、单位小。
  // 一起排的话 138.7 和 万人 一样重，读起来像一串字母。
  function comma(x) {
    return String(x).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function numSplit(f) {
    if (f >= 10000) return { n: String(Math.round(f / 1000) / 10), u: '万人' };
    return { n: comma(Math.round(f)), u: '人' };
  }

  function showFinal() {
    if (finalShown) return;
    finalShown = true;

    addRow(series().length, true);
  }

  // ---------- 生命周期 ----------

  function finish() {
    if (finished) return;
    finished = true;
    running = false;

    if (raf) cancelAnimationFrame(raf);
    raf = null;

    if (skipTimer) { clearTimeout(skipTimer); skipTimer = null; }
    if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
    document.removeEventListener('click', onDocClick);
    window.removeEventListener('resize', onResize);
    hideHint();

    // 交棒：先让这一层淡掉，同时叫醒粒子字 —— 两者重叠 0.8 秒。
    //
    // 原来的顺序是"等淡完（700ms）再 init"，中间留了一段纯黑，
    // 观众看到的是"光核没了 → 等一下 → 数字跳出来"。
    // 重叠之后，粒子字是从还没散尽的光里长出来的。
    //
    // 跳过的路径不加这个类：那条路已经由画布自己把亮度退到 0 了，
    // 再叠一次 CSS 淡出会变成"淡两次"，末尾有一小段是空的黑屏。
    if (!skipping) root.classList.add('opening--out');

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
    hint = document.getElementById('opening-hint');

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
    skipping = false;
    charLive = false;
    rowsLive = false;
    dateCol = 0;
    rows.length = 0;
    shownMark = -1;
    finalShown = false;
    if (label) {
      label.textContent = '';
      label.style.top = '';
      ensureMarker();
    }
    skipAt = 0;
    lastTap = 0;
    pulseIdx = -1;
    pulseAt = -1e9;

    window.addEventListener('resize', onResize);

    // 跳过：双击，不是单击。
    //
    // 原来是一次点击就跳过。问题是这一层铺满全屏（z-index 3），
    // 而开场三十秒里观众最常做的动作恰恰不是"跳过"，是"把音乐打开" ——
    // 手指落在右上角，那一下同时也算"跳过"，于是三年攒下来的开场
    // 在第二秒就没了，人还以为是自己点错了。
    //
    // 双击之后再没有这个问题：第一下什么都不破坏，只把"再点一下"这句话
    // 显示出来；第二下才真的走。想跳的人两秒内就跳了，
    // 不想跳的人点错一次也还在戏里。
    //
    // 延迟绑定是因为启动这次播放的那个 click 还在冒泡，
    // 立刻绑会被自己触发掉，等于开场一出现就跳过。
    skipTimer = setTimeout(function () {
      document.addEventListener('click', onDocClick);
    }, 400);

    raf = requestAnimationFrame(frame);
  }

  // 两次点击的间隔上限。太长的话"想点两次"会变成"点一下、过一会儿又点一下"，
  // 第二下就成了新的"一拍即跳"，防误触就白做了。
  var TAP_GAP = 480;

  // 这些是真正可点的控件：调音量、开弹幕、看时光轴。
  // 点在这些东西上，说明观众想操作界面，不是想跳过 —— 直接忽略这一下。
  // 用 closest 而不是判断 tagName：按钮里套着 <i> 图标，事件源是图标不是按钮。
  var NO_SKIP = 'button, a, input, select, textarea, .fab, .social, .triple';

  function onDocClick(e) {
    if (!running || skipping) return;

    var el = e.target;
    if (el && el.closest && el.closest(NO_SKIP)) return;

    var now = performance.now();

    if (now - lastTap < TAP_GAP) {
      lastTap = 0;
      requestSkip();
      return;
    }

    lastTap = now;
    showHint();
  }

  function showHint() {
    if (!hint) return;

    hint.classList.add('hint--in');

    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(function () {
      hint.classList.remove('hint--in');
      lastTap = 0;               // 提示没了，上一次点击也不再算数
      hintTimer = null;
    }, 2600);
  }

  function hideHint() {
    if (!hint) return;

    if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
    hint.classList.remove('hint--in');
  }

  // 跳过不是"啪"地切走。
  //
  // 原来直接 display:none，观众看到的是画面一黑、粒子字已经在半路 ——
  // 像播放器被按坏了。这里让画布自己继续跑，用 0.64 秒把整体亮度退干净，
  // 光点还在飞、城市还在亮，只是"这一段结束了"。
  function requestSkip() {
    if (!running || skipping) return;

    skipping = true;
    skipAt = t0 ? performance.now() - t0 : 0;

    hideHint();

    // 兜底：切到后台时 rAF 会被节流，只靠帧循环判断可能迟迟不结束。
    if (skipTimer) clearTimeout(skipTimer);
    skipTimer = setTimeout(finish, 1000);
  }

  function onResize() {
    if (!running) return;

    resize();

    // 宽度变了，"一级多宽"和"整列从哪儿起"都跟着变（见 stairStep）。
    layoutStairs();
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
        mark: shownMark,
        rows: rows.length
      };
    }
  };
}());
