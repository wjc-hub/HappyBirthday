#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成两张背景图：城市剪影 + 窗户光点。

为什么分成两张：楼是死的，灯是活的。分成两层之后可以给"灯"单独做很慢的
明灭（CSS 动画），楼本身一点开销都没有；如果画在一张里，整张图会连楼一起
呼吸，看起来像屏幕亮度在变。

坐标系统：1600x300，底部对齐（background-position: bottom center）。
楼的高度分布是可复现的（固定 seed），改风格时改这个脚本重新跑。

用法：python tools/gen-city.py
"""

import random
import pathlib

random.seed(20261020)          # 生日。固定住，重跑结果一样

W, H = 1600, 300
BASE = H                        # 楼底
SKY = "#0E0A09"                 # 只比基底 #110C0B 暗一点：纯黑会让楼变成一个个洞
WARM = ["#FFC078", "#FFAD6A", "#FF8A5C", "#FFE0B8"]

buildings = []

x = -40
while x < W + 40:
    bw = random.randint(46, 104)
    # 高低错落。之前按"中间压低"算高度，出来是一排等高的方块，像栅栏。
    # 现在常态 38~130，另有约一成是地标楼 —— 天际线的趣味全在那几根高的上面。
    bh = random.uniform(38, 130)
    if random.random() < 0.12:
        bh = random.uniform(170, 250)
    bh = int(bh)
    buildings.append((x, bw, bh))
    x += bw + random.randint(6, 26)

# ---------- 剪影 ----------
sil = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">']
sil.append(f'<g fill="{SKY}">')
for bx, bw, bh in buildings:
    sil.append(f'<rect x="{bx}" y="{BASE - bh}" width="{bw}" height="{bh}"/>')
    # 楼顶的小件：水箱 / 楼梯间 / 天线，天际线才有"城市"的味道而不是条形图
    if bh > 110 and random.random() < 0.55:
        w = random.randint(8, 20)
        h = random.randint(6, 18)
        sil.append(f'<rect x="{bx + random.randint(4, max(5, bw - w - 4))}" '
                   f'y="{BASE - bh - h}" width="{w}" height="{h}"/>')
    if random.random() < 0.22:
        ax = bx + random.randint(6, max(7, bw - 6))
        top = BASE - bh - random.randint(16, 46)
        sil.append(f'<rect x="{ax}" y="{top}" width="1.5" height="{BASE - bh - top}"/>')
sil.append('</g></svg>')

# ---------- 窗户光点 ----------
lit = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">']
lit.append('<g>')
for bx, bw, bh in buildings:
    n = random.randint(9, 24)
    for _ in range(n):
        px = bx + random.randint(5, max(6, bw - 7))
        py = BASE - random.randint(10, max(11, bh - 14))
        s = random.choice([4.0, 4.6, 5.2, 6.0, 7.0])
        c = random.choice(WARM)
        lit.append(f'<rect x="{px}" y="{py}" width="{s}" height="{s * 1.4}" '
                   f'fill="{c}" opacity="{random.uniform(0.5, 1.0):.2f}"/>')
lit.append('</g></svg>')

root = pathlib.Path(__file__).resolve().parent.parent
(root / "images" / "skyline.svg").write_text("\n".join(sil), encoding="utf-8")
(root / "images" / "citylights.svg").write_text("\n".join(lit), encoding="utf-8")

print(f"{len(buildings)} 栋楼")
print("images/skyline.svg")
print("images/citylights.svg")
