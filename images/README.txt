把照片放进这个目录，然后在 js/config.js 的 photos 里填写路径：

  photos: [
    { src: 'images/1.jpg', caption: '第一次见面' },
    { src: 'images/2.jpg', caption: '一起看过的风景' },
  ]

建议先用手机相册的「压缩后导出」或在线工具把每张压到 300KB 以内，
否则在移动流量下加载会明显卡顿。

src 留空时会显示渐变占位卡，方便先确认版式再补图。
