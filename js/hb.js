/*

  纪念站核心运行时
  ================
  负责三件事：
    1. 收集各年份数据（data/YYYY.js 调用 HB.year() 注册进来）
    2. 判断今天该显示什么（倒数页 / 生日演出）
    3. 把年份数据整理成时光轴需要的顺序

  这个文件是逻辑，不放内容。改内容请去 js/config.js 和 data/ 目录。

*/

var HB = (function () {

  var years = {};        // { 2026: {...}, 2027: {...} }

  // ---------- 日期工具 ----------

  // config 里的生日写作 'MM-DD'，这里拆成数字
  function birthdayParts() {
    var raw = (SITE.birthday || '01-01').split('-');
    return {
      month: parseInt(raw[0], 10) || 1,
      day:   parseInt(raw[1], 10) || 1
    };
  }

  // 生日当天 00:00 的本地时间
  function birthdayOf(year) {
    var b = birthdayParts();
    return new Date(year, b.month - 1, b.day, 0, 0, 0, 0);
  }

  function startOfToday() {
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 0, 0, 0, 0);
  }

  // 距下一个生日还有几天；今天就是生日则返回 0
  function daysUntilBirthday() {
    var today = startOfToday(),
        y = today.getFullYear(),
        next = birthdayOf(y);

    // 今年的生日已经过了，就看明年的
    if (next < today) next = birthdayOf(y + 1);

    return Math.round((next - today) / 86400000);
  }

  // 生日当天，以及之后的 celebrateDays 天内，都算“庆祝期”。
  // 留出缓冲是因为她未必当天就点开链接。
  function isCelebrating() {
    var today = startOfToday(),
        y = today.getFullYear(),
        bd = birthdayOf(y),
        span = (SITE.celebrateDays == null ? 3 : SITE.celebrateDays);

    if (today < bd) return false;
    return Math.round((today - bd) / 86400000) <= span;
  }

  // 「本届生日」的年份。
  //
  // 语义是“最近一次或即将到来的这次生日属于哪一年”：
  // 生日还没到时也算今年，因为倒数页倒的就是今年这一次。
  // 这样 9 月 1 日打开，倒数指向 2026-09-15，主角年份也是 2026，二者一致。
  function currentYear() {
    return startOfToday().getFullYear();
  }

  // ---------- 年份数据 ----------

  function register(year, data) {
    year = parseInt(year, 10);

    if (!year) {
      console.warn('[HB] 年份无效，已跳过：', year);
      return;
    }

    data = data || {};
    data.year = year;
    years[year] = data;
  }

  // 已注册的年份，从新到旧
  function sortedYears() {
    return Object.keys(years)
      .map(function (y) { return parseInt(y, 10); })
      .sort(function (a, b) { return b - a; });
  }

  // 取某年数据；不存在返回 null，调用方据此跳过，不报错
  function yearData(year) {
    return years[parseInt(year, 10)] || null;
  }

  // 主角年份的数据。若该年没有数据，就退到最近的一个有数据的年份，
  // 这样即便忘了建当年的 data 文件，页面也不会空白。
  function featured() {
    var wanted = currentYear(),
        list = sortedYears();

    if (years[wanted]) return years[wanted];

    for (var i = 0; i < list.length; i++) {
      if (list[i] <= wanted) return years[list[i]];
    }

    return list.length ? years[list[0]] : null;
  }

  // 时光轴用：主角年份之前的年份，从新到旧。
  //
  // 只列出「已经发生过的」年份 —— 比主角年份更晚的会被排除，
  // 否则提前建好或年份填错的文件会让还没发生的年份出现在时光轴上。
  function archive() {
    var f = featured(),
        fy = f ? f.year : currentYear();

    return sortedYears()
      .filter(function (y) { return y < fy; })
      .map(function (y) { return years[y]; });
  }

  // ---------- 文案占位符 ----------

  // 把 {name} 换成她的昵称，{year} 换成指定年份
  function fill(str, year) {
    return String(str == null ? '' : str)
      .replace(/\{name\}/g, SITE.name)
      .replace(/\{year\}/g, year == null ? currentYear() : year);
  }

  return {
    year: register,          // data/YYYY.js 调用它注册数据
    yearData: yearData,
    sortedYears: sortedYears,
    featured: featured,
    archive: archive,

    currentYear: currentYear,
    daysUntilBirthday: daysUntilBirthday,
    isCelebrating: isCelebrating,
    birthdayOf: birthdayOf,

    fill: fill,

    // 有没有任何一年的数据
    hasData: function () {
      return sortedYears().length > 0;
    }
  };
}());
