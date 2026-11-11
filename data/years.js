/*  年份清单
    ========
    这里是**唯一**需要手改的地方。

    新增一年只做两件事：
      1. 复制 data/_template.js 为 data/2027.js，填内容
      2. 在下面这个数组里加一个 2027

    页面会按这个数组动态加载 data/YYYY.js，
    再也不用去 index.html 里加 <script> 标签了。

    （v1 的坑：忘了加 script，页面不报错、那年就是不出来。
      现在由 tools/check-data.mjs 兜底检查。） */

window.HB_YEARS = [2024, 2025, 2026];
