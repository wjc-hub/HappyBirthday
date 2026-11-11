# 辣椒素素素 · 生日纪念站

给一位喜欢的 UP 主做的生日站。三个目的：**给她过生日、记下这一天、把成长留成可以回看的东西。**

纯静态单页，无构建、无依赖，`python -m http.server` 就能跑。

- 生日：每年 10-20
- 直播二周年：2026-07-17
- 收录：2024 / 2025 / 2026 三年，每年一份节点文件

## 页面在讲什么

| 幕 | 画面 |
|---|---|
| 一 · 开播 | 粒子聚成祝福语（祝 / 昵称 / 生日快乐 / 当年的一句话），配 3D 透视烟花 |
| 二 · 她 | 粒子聚成头像 → 昵称 → 头像，辣椒红渐变，来回一次 |
| 三 · 陪你的人 | 我的关系线（什么时候开始看、发过什么）+ 大家的录播、切片、二创 |
| 四 · 年鉴 | 横向年份频道，每年：里程碑时间轴 + 照片 + 她说过的话 |
| 常驻 | 非生日期间显示倒数页，往年年鉴照样可翻 |

## 本地预览

```bash
python -m http.server 8765
```

打开 <http://127.0.0.1:8765/>。**必须走 HTTP** —— 双击 `index.html` 会因 `file://` 限制导致 canvas 读不到像素，画面一片空白。

想看完整演出（平时只显示倒数页）：

```
http://127.0.0.1:8765/?celebrate
```

调试用 `?auto` 跳过引导层直接开演。

## 每年怎么更新

只动三处：`data/YYYY.js`（内容）、`data/years.js`（加一年）、`images/YYYY/`（照片）。

完整步骤、字段说明、常见问题都在 **[HOW-TO-UPDATE.md](HOW-TO-UPDATE.md)**，照着填空即可。

推之前跑一遍校验：

```bash
node tools/check-data.mjs
```

## 项目结构

```
index.html            页面骨架、样式、烟花引擎
js/config.js          昵称、生日、主题色、演出节奏
js/hb.js              今天该显示倒数页还是演出
js/index.js           粒子文字引擎（Shape Shifter 改）
js/people.js          陪你的人
js/timeline.js        往年时光轴
js/danmaku.js         弹幕
data/years.js         年份清单 ← 加年份改这里
data/_template.js     年份模板 ← 每年复制它
data/history.js       粉丝曲线采样点
data/me.js            我的关系线
data/fandom.js        大家的留档与二创
data/bili.json        抓取快照（接口无 CORS，只能构建时落盘）
docs/DESIGN.md        设计文档（含视觉参数为什么是这些数）
docs/milestones-DRAFT.md  节点核对稿
tools/check-data.mjs  内容校验
tools/timing.mjs      算演出时长
tools/shot.mjs        无头截图，逐帧核对视觉
images/               照片与头像
NYE/                  烟花素材
font-awesome/         粒子图标
```

## 部署

纯静态，Cloudflare Pages 直接连仓库即可：构建命令留空，输出目录填根目录。`_headers` 已配好缓存策略，改完推上去约 1 分钟生效。

**照片与信涉及隐私**：公开仓库的 git 历史会永久保留提交过的图片，删掉也能找回。建议私有仓库 + Pages 访问密码。

## 致谢

- 粒子文字：[Shape Shifter](https://github.com/kennethcachia/Shape-Shifter) by Kenneth Cachia
- 烟花效果：cantelope.org NYE
