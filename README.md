# 生日祝福页

粒子文字祝福 + 3D 透视烟花的单页网站，纯静态、无构建、无依赖。

## 快速定制

只需编辑 [js/config.js](js/config.js)：

```js
name: '小明',                    // 祝福对象的名字
messages: ['祝', '{name}', '生日快乐'],   // {name} 会自动替换
photos: [{ src: 'images/1.jpg', caption: '第一次见面' }],
```

祝福语建议每条不超过 6 个字，过长会被缩得很小。

## 本地预览

```bash
python -m http.server 8765
# 打开 http://127.0.0.1:8765/
```

必须通过 HTTP 服务器访问。直接双击打开 `index.html` 会因浏览器的
`file://` 协议限制导致 canvas 读取像素失败，粒子文字无法显示。

## 添加照片

把图片放进 `images/`，然后在 `config.js` 的 `photos` 里填写路径。
`src` 留空则显示渐变占位卡，方便先确认版式。

## 部署

纯静态站点，可直接部署到 Cloudflare Pages / GitHub Pages / Vercel。
构建命令留空，输出目录填仓库根目录。

如果照片涉及隐私，注意：**公开仓库的 git 历史会永久保留提交过的图片，
即使之后删除也能被找回。** 建议用私有仓库 + Cloudflare Pages，
并在 Pages 设置里开启 Access 访问密码。

## 项目结构

```
index.html          页面骨架、样式、烟花引擎
js/config.js        全部可配置项 ← 改这里
js/index.js         粒子文字引擎（Shape Shifter）
js/carousel.js      回忆相册轮播
NYE/                烟花素材（火花贴图 + 爆炸音效）
font-awesome/       粒子图标（heart / heart-empty / forward）
happy-birthday.mp3  背景音乐
```

## 致谢

- 粒子文字：[Shape Shifter](https://github.com/kennethcachia/Shape-Shifter) by Kenneth Cachia
- 烟花效果：cantelope.org NYE
