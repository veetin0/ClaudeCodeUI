#!/usr/bin/env python3
"""
The world: the team's pixel workshop (the Agents › World room) and the corridor strip along the
bottom of every screen, drawn in code like the characters.

    npm run world:sprites               # writes src/renderer/src/assets/world/
    npm run world:sprites -- --preview  # also scaled-up copies in a temp folder

Output:
- room-{day,dusk,night}.png  the 400x224 room; the windows show the sky, lamps glow at night
- strip-{day,dusk,night}.png a 96x34 corridor tile that repeats along the strip
- props.png                  4-frame loops drawn over the room (screens, server lights, steam, bubbles)
- manifest.json              sizes, where the props go, and every station's spots, which the app reads

Characters stand with their feet on a station's spot (x is the middle of the 32 px frame).
Needs Python 3 and Pillow.
"""
from PIL import Image, ImageDraw
import json, os, random, sys, tempfile

W, H = 400, 224
WALL = 112          # the wall is y 0..111, the floor below
BACK, FRONT = 152, 208  # feet lines: in front of the wall, and the front of the floor

P = {
    'ol': '#2a1f2e',
    'wall': '#eadcc0', 'wall2': '#e2d2b2', 'trim': '#7a5232', 'trim2': '#5e3b20',
    'wain': '#a7744a', 'wain2': '#bd8858', 'wain3': '#8c5f3a',
    'floor': '#c08a52', 'floor2': '#a7743f', 'floor3': '#cf9a60', 'floorsh': '#9c6a3c',
    'wood': '#8a5a34', 'woodtop': '#a8703f', 'wooddk': '#5e3b20', 'woodhi': '#c48a52',
    'metal': '#7d8794', 'metalhi': '#b9c2cc', 'metaldk': '#4b525c', 'metalbk': '#2c3038',
    'screen': '#1d2b3a', 'bezel': '#2a2f38',
    'white': '#f7f6ef', 'paper': '#fbf7ea', 'grey': '#9aa3ad',
    'red': '#d24b4b', 'blue': '#4b74c9', 'green': '#4bab6a', 'yellow': '#e8b93a', 'purple': '#8a5cc9', 'pink': '#e87ba4', 'orange': '#e8833a', 'teal': '#3fb3a6',
    'leaf': '#3f9e4f', 'leaf2': '#2f7a3c', 'pot': '#c4663a', 'pot2': '#97492a',
    'couch': '#6a4fb3', 'couch2': '#4e3889', 'couch3': '#8268cc',
    'rug': '#b8434e', 'rug2': '#d9a441', 'rug3': '#8f2f3a',
    'bp': '#2f5fae', 'bp2': '#8fb8f0',
    'frame': '#f2efe6', 'frame2': '#c9c3b2',
    'shade': '#e8b93a', 'shade2': '#b88a1f',
    'black': '#14121a',
}

def rgba(h, a=255):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) + (a,)


class Canvas:
    def __init__(self, w, h):
        self.im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)

    def r(self, x, y, w, h, c):
        if w > 0 and h > 0:
            self.d.rectangle([x, y, x + w - 1, y + h - 1], fill=rgba(P.get(c, c)))

    def p(self, x, y, c):
        if 0 <= x < self.im.width and 0 <= y < self.im.height:
            self.im.putpixel((x, y), rgba(P.get(c, c)))

    def box(self, x, y, w, h, fill, ol='ol'):
        self.r(x, y, w, h, ol)
        self.r(x + 1, y + 1, w - 2, h - 2, fill)

    def line(self, pts, c):
        self.d.line(pts, fill=rgba(P.get(c, c)), width=1)


# ---------------- the sky through a window ----------------
def sky(c, x, y, w, h, time, seed=1, moon=True):
    rnd = random.Random(seed)
    if time == 'day':
        bands = ['#7cc6f7', '#93d2fa', '#aadcfc', '#c4e8ff']
    elif time == 'dusk':
        bands = ['#4f3f8f', '#8a4f8f', '#e0705a', '#f6a35e', '#ffd27a']
    else:
        bands = ['#0c1029', '#121839', '#1a2249', '#222c5a']
    for i in range(h):
        c.r(x, y + i, w, 1, bands[min(len(bands) - 1, i * len(bands) // h)])
    if time == 'day':
        for cx, cy in ((x + 4 + rnd.randrange(max(1, w - 16)), y + 3 + rnd.randrange(max(1, h // 3))),):
            c.r(cx + 2, cy, 6, 1, 'white'); c.r(cx, cy + 1, 11, 2, 'white'); c.r(cx + 1, cy + 3, 8, 1, '#e3f2fb')
    elif time == 'dusk' and moon:
        sx, sy = x + w // 2 - 3, y + h - 5
        c.r(sx + 1, sy, 5, 1, '#fff1a8'); c.r(sx, sy + 1, 7, 4, '#ffe27a')
    else:
        for _ in range(max(3, w * h // 60)):
            c.p(x + rnd.randrange(w), y + rnd.randrange(h - 2), '#fff6c8' if rnd.random() < 0.7 else '#9fb0ff')
        if not moon:
            return
        mx, my = x + w - 9, y + 3
        c.r(mx + 1, my, 4, 1, '#fff3c4'); c.r(mx, my + 1, 6, 4, '#fff3c4'); c.r(mx + 1, my + 5, 4, 1, '#fff3c4')
        c.r(mx + 3, my + 1, 3, 3, '#121839')


def window(c, x, y, w, h, panes=2):
    """The frame; the glass is left clear for sky() (drawn after tinting)."""
    c.box(x, y, w, h, 'frame')
    c.r(x + 2, y + 2, w - 4, h - 4, 'black')
    glass = []
    pw = (w - 4 - (panes - 1) * 2) // panes
    for i in range(panes):
        gx = x + 2 + i * (pw + 2)
        glass.append((gx, y + 2, pw, h - 4))
        if i:
            c.r(gx - 2, y + 2, 2, h - 4, 'frame')
    c.r(x - 2, y + h - 1, w + 4, 3, 'frame2'); c.r(x - 2, y + h + 2, w + 4, 1, 'ol')
    return glass


# ---------------- the room ----------------
def base_room():
    c = Canvas(W, H)
    # wall: striped paper, picture rail, wainscot panels and a baseboard
    c.r(0, 0, W, WALL, 'wall')
    for x in range(0, W, 12):
        c.r(x, 6, 4, 76, 'wall2')
    c.r(0, 0, W, 4, 'trim'); c.r(0, 4, W, 2, 'trim2')
    c.r(0, 80, W, 3, 'trim'); c.r(0, 83, W, 1, 'trim2')
    c.r(0, 84, W, 24, 'wain')
    for x in range(4, W, 28):
        c.r(x, 87, 22, 18, 'wain3'); c.r(x + 1, 88, 20, 16, 'wain2'); c.r(x + 2, 89, 18, 14, 'wain')
    c.r(0, 108, W, 4, 'trim2')
    # floor: planks, a shadow along the wall
    c.r(0, WALL, W, H - WALL, 'floor')
    for i, y in enumerate(range(WALL, H, 8)):
        c.r(0, y, W, 1, 'floor2'); c.r(0, y + 1, W, 1, 'floor3')
        for x in range((i % 2) * 18, W, 36):
            c.r(x, y + 1, 1, 7, 'floor2')
    c.r(0, WALL, W, 2, 'floorsh')
    return c


def lamp_cords(c, xs):
    for x in xs:
        c.r(x, 6, 1, 6, 'ol')
        c.r(x - 4, 12, 9, 1, 'ol'); c.r(x - 5, 13, 11, 3, 'shade'); c.r(x - 6, 16, 13, 1, 'shade2'); c.r(x - 6, 17, 13, 1, 'ol')


def office(c):
    glass = window(c, 10, 18, 38, 34)
    # desk with a lamp, papers, a mug and a name plate
    c.box(4, 104, 56, 5, 'woodtop'); c.r(5, 105, 54, 1, 'woodhi')
    c.box(6, 108, 52, 20, 'wood')
    for dy in (111, 118):
        c.box(36, dy, 18, 6, 'wood'); c.r(43, dy + 2, 4, 1, 'yellow')
    c.r(8, 110, 2, 16, 'wooddk')
    c.box(8, 92, 3, 12, 'metaldk'); c.box(5, 88, 11, 5, 'green'); c.r(7, 103, 7, 2, 'metaldk')
    c.box(20, 100, 12, 4, 'paper'); c.r(22, 101, 7, 1, 'grey'); c.r(22, 102, 5, 1, 'grey')
    c.box(44, 97, 6, 7, 'red'); c.r(49, 99, 2, 3, 'ol')
    c.box(30, 101, 10, 3, 'yellow')
    # a plant
    c.box(0, 116, 8, 10, 'pot'); c.r(1, 117, 6, 1, 'pot2')
    for (lx, ly) in ((0, 108), (3, 104), (5, 109), (2, 111)):
        c.r(lx, ly, 3, 5, 'leaf'); c.r(lx + 1, ly + 1, 1, 3, 'leaf2')
    return glass


def whiteboard(c):
    c.box(68, 20, 50, 42, 'white', 'grey'); c.r(68, 20, 50, 1, 'ol'); c.r(68, 61, 50, 1, 'ol')
    c.r(67, 20, 1, 42, 'ol'); c.r(118, 20, 1, 42, 'ol')
    # a plan: boxes and arrows
    c.box(73, 26, 12, 8, 'white', 'blue'); c.box(96, 26, 14, 8, 'white', 'green'); c.box(84, 44, 14, 8, 'white', 'red')
    c.r(85, 30, 11, 1, 'blue'); c.p(95, 29, 'blue'); c.p(95, 31, 'blue')
    c.line([(80, 34), (88, 44)], 'blue'); c.line([(102, 34), (94, 44)], 'green')
    c.r(74, 55, 20, 1, 'grey'); c.r(74, 57, 14, 1, 'grey'); c.r(100, 55, 12, 1, 'purple')
    c.r(70, 62, 46, 2, 'metal'); c.r(80, 61, 4, 1, 'red'); c.r(86, 61, 4, 1, 'blue')


def bench(c, x):
    """A workbench with a PC; returns where its screen is (for the scrolling-code prop)."""
    c.box(x, 106, 40, 4, 'woodtop'); c.r(x + 1, 107, 38, 1, 'woodhi')
    c.r(x + 2, 110, 3, 18, 'wooddk'); c.r(x + 35, 110, 3, 18, 'wooddk'); c.r(x + 2, 118, 36, 2, 'wooddk')
    c.box(x + 7, 84, 26, 20, 'bezel'); c.r(x + 9, 86, 22, 16, 'screen')
    c.r(x + 17, 104, 6, 2, 'metaldk')
    c.box(x + 10, 103, 20, 3, 'metalhi')
    c.box(x + 32, 101, 5, 5, 'white')
    return (x + 9, 86)


def drafting(c):
    for i in range(14):
        c.r(212 + i // 2, 92 + i, 28, 1, 'bp' if 0 < i < 13 else 'ol')
    for (lx, ly, ln) in ((216, 96, 14), (218, 100, 9), (222, 104, 16)):
        c.r(lx, ly, ln, 1, 'bp2')
    c.r(226, 95, 1, 10, 'bp2')
    c.r(214, 106, 2, 22, 'wooddk'); c.r(236, 106, 2, 22, 'wooddk'); c.r(214, 118, 24, 2, 'wooddk')
    c.box(232, 88, 3, 8, 'yellow')


def shelf(c):
    c.box(246, 34, 32, 94, 'wood')
    c.r(248, 36, 28, 90, 'wooddk')
    colors = ['red', 'blue', 'green', 'yellow', 'purple', 'teal', 'orange', 'pink']
    rnd = random.Random(7)
    for sy in (36, 58, 80, 102):
        x = 249
        while x < 274:
            bw = rnd.choice((2, 3, 3, 4)); bh = rnd.randrange(14, 20)
            if x + bw > 275: break
            col = rnd.choice(colors)
            c.r(x, sy + 21 - bh, bw, bh, col); c.r(x, sy + 21 - bh, bw, 1, 'ol')
            if bw > 2: c.r(x + 1, sy + 21 - bh + 3, bw - 2, 1, 'paper')
            x += bw + (1 if rnd.random() < 0.3 else 0)
        c.r(247, sy + 21, 30, 1, 'woodtop')


def telescope(c):
    glass = window(c, 286, 16, 32, 46)
    c.line([(300, 128), (306, 104)], 'metaldk'); c.line([(314, 128), (307, 104)], 'metaldk'); c.line([(307, 128), (307, 104)], 'metaldk')
    for i in range(18):
        c.r(296 + i, 100 - i // 2, 1, 5, 'metalbk' if i in (0, 17) else 'blue')
    c.r(312, 89, 3, 6, 'metalhi'); c.r(304, 102, 4, 3, 'metal')
    return glass


def console(c):
    """A terminal desk and a server rack; returns the terminal screen and the rack's light panel."""
    c.box(322, 106, 20, 4, 'metal'); c.r(324, 110, 2, 18, 'metaldk'); c.r(338, 110, 2, 18, 'metaldk')
    c.box(324, 90, 16, 14, 'bezel'); c.r(326, 92, 12, 10, 'black')
    c.r(330, 104, 4, 2, 'metaldk')
    c.box(342, 38, 22, 90, 'metalbk', 'ol')
    for y in range(42, 124, 9):
        c.r(344, y, 18, 7, 'metaldk'); c.r(344, y, 18, 1, 'metal')
    return (326, 92), (346, 43)


def door(c):
    c.box(368, 50, 28, 62, 'wood', 'ol'); c.r(366, 48, 32, 3, 'trim'); c.r(366, 48, 2, 64, 'trim'); c.r(396, 48, 2, 64, 'trim')
    c.box(371, 54, 22, 22, 'woodtop'); c.box(371, 80, 22, 28, 'woodtop')
    c.box(389, 80, 4, 4, 'yellow')
    c.box(374, 34, 16, 9, 'green'); c.r(377, 37, 10, 1, 'white'); c.r(377, 39, 6, 1, 'white')


def wall_bits(c):
    # a clock above the benches and a rocket poster
    c.box(136, 26, 13, 13, 'white'); c.p(142, 32, 'ol'); c.r(142, 28, 1, 4, 'ol'); c.r(142, 32, 3, 1, 'ol')
    c.box(172, 22, 24, 32, 'bp')
    c.r(182, 28, 4, 14, 'white'); c.r(183, 26, 2, 2, 'white'); c.r(180, 38, 2, 5, 'red'); c.r(186, 38, 2, 5, 'red')
    c.r(183, 43, 2, 3, 'orange'); c.r(183, 46, 2, 2, 'yellow')
    for (sx, sy) in ((175, 25), (191, 30), (177, 48), (190, 46)):
        c.p(sx, sy, 'white')


def lab(c):
    c.box(14, 176, 84, 5, 'white', 'ol'); c.r(15, 177, 82, 1, '#ffffff')
    c.r(18, 181, 3, 18, 'metaldk'); c.r(91, 181, 3, 18, 'metaldk'); c.r(18, 190, 76, 2, 'metaldk')
    for (fx, col) in ((22, 'green'), (40, 'pink'), (58, 'blue'), (76, 'yellow')):
        c.box(fx + 3, 158, 4, 8, 'frame'); c.box(fx, 165, 10, 11, 'frame')
        c.r(fx + 1, 169, 8, 6, col); c.r(fx + 2, 170, 2, 2, 'white')
    c.box(86, 168, 8, 8, 'metalhi')


def lounge(c):
    # a rug, a couch and a coffee machine on a cabinet
    c.r(240, 198, 120, 20, 'rug3'); c.r(242, 199, 116, 18, 'rug')
    for x in range(246, 356, 8):
        c.r(x, 203, 4, 2, 'rug2'); c.r(x + 2, 211, 4, 2, 'rug2')
    c.box(248, 160, 76, 14, 'couch'); c.box(244, 170, 84, 20, 'couch2'); c.r(246, 172, 80, 6, 'couch3')
    c.box(244, 168, 8, 22, 'couch'); c.box(320, 168, 8, 22, 'couch')
    c.r(248, 190, 3, 4, 'wooddk'); c.r(321, 190, 3, 4, 'wooddk')
    c.box(334, 176, 26, 22, 'wood'); c.r(336, 186, 22, 1, 'wooddk')
    c.box(338, 150, 18, 26, 'metalbk'); c.r(340, 153, 14, 6, 'metaldk'); c.p(352, 155, 'red')
    c.box(344, 166, 6, 7, 'white'); c.r(345, 170, 4, 2, 'wooddk')
    # plants at the front corners
    for (px, py) in ((2, 196), (384, 196)):
        c.box(px, py + 10, 12, 12, 'pot'); c.r(px + 1, py + 11, 10, 1, 'pot2')
        for (lx, ly) in ((0, 0), (5, -4), (8, 1), (3, 4), (-1, 5)):
            c.r(px + 2 + lx, py + ly, 4, 7, 'leaf'); c.r(px + 3 + lx, py + ly + 1, 1, 5, 'leaf2')


def tint(im, rgb):
    r, g, b = rgb
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            pr, pg, pb, pa = px[x, y]
            if pa:
                px[x, y] = (int(pr * r), int(pg * g), int(pb * b), pa)


def glow(im, cx, cy, rx, ry, color, levels=((1.0, 40), (0.6, 70))):
    """Stepped light pools (two rings, no smooth gradient) for lamps at night."""
    px = im.load(); cr, cg, cb = rgba(color)[:3]
    for y in range(max(0, cy - ry), min(im.height, cy + ry + 1)):
        for x in range(max(0, cx - rx), min(im.width, cx + rx + 1)):
            d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
            for lim, a in levels:
                if d <= lim * lim:
                    pr, pg, pb, pa = px[x, y]
                    if pa:
                        px[x, y] = (pr + (cr - pr) * a // 255, pg + (cg - pg) * a // 255, pb + (cb - pb) * a // 255, pa)
                    break


def cone(im, x, top, bottom, color, inner=70, outer=38):
    """A lamp's light falling down the wall: a widening trapezoid in two stepped strengths."""
    px = im.load(); cr, cg, cb = rgba(color)[:3]
    for y in range(top, bottom):
        hw = 6 + (y - top) * 0.42
        for dx in range(-int(hw), int(hw) + 1):
            a = inner if abs(dx) < hw * 0.55 else outer
            xx = x + dx
            if 0 <= xx < im.width:
                pr, pg, pb, pa = px[xx, y]
                if pa:
                    px[xx, y] = (pr + (cr - pr) * a // 255, pg + (cg - pg) * a // 255, pb + (cb - pb) * a // 255, pa)


LAMPS = (96, 200, 304)
TINT = {'day': None, 'dusk': (1.0, 0.86, 0.78), 'night': (0.42, 0.47, 0.72)}


def room(time):
    c = base_room()
    lamp_cords(c, LAMPS)
    glass = office(c)
    whiteboard(c)
    screens = [bench(c, 124), bench(c, 166)]
    drafting(c)
    shelf(c)
    glass += telescope(c)
    term, leds = console(c)
    door(c)
    wall_bits(c)
    lab(c)
    lounge(c)
    if TINT[time]:
        tint(c.im, TINT[time])
    for i, (gx, gy, gw, gh) in enumerate(glass):
        sky(c, gx, gy, gw, gh, time, seed=i + 3, moon=i in (1, 3))
    if time == 'night':
        for x in LAMPS:
            cone(c.im, x, 18, 74, '#ffcf7a')
            c.r(x - 5, 13, 11, 3, '#ffe9a8')
        glow(c.im, 10, 104, 16, 10, '#c8f5c0')
        c.box(5, 88, 11, 5, '#9bf0a0')
    elif time == 'dusk':
        for x in LAMPS:
            cone(c.im, x, 18, 60, '#ffcf7a', inner=34, outer=18)
    return c.im, screens, term, leds


# ---------------- props: 4-frame loops over the room ----------------
CODE = ['green', 'blue', 'pink', 'yellow', 'white', 'teal']

def prop_screen(f):
    c = Canvas(22, 16); c.r(0, 0, 22, 16, 'screen')
    rnd = random.Random(11)
    lines = [(rnd.randrange(0, 6), rnd.randrange(5, 16), rnd.choice(CODE)) for _ in range(12)]
    for i in range(6):
        ind, ln, col = lines[(i + f * 2) % len(lines)]
        c.r(1 + ind, 1 + i * 2 + (i // 3), min(ln, 20 - ind), 1, col)
    if f % 2 == 0:
        c.r(2, 14, 3, 1, 'white')
    return c.im

def prop_term(f):
    c = Canvas(12, 10); c.r(0, 0, 12, 10, 'black')
    for i in range(4):
        n = (f + i) % 4
        c.r(1, 1 + i * 2, [9, 6, 10, 4][n], 1, '#5fd068')
    if f % 2: c.r(1 + [9, 6, 10, 4][(f + 3) % 4] + 1, 7, 2, 1, '#5fd068')
    return c.im

def prop_leds(f):
    c = Canvas(14, 80)
    rnd = random.Random(5 + f)
    for row in range(9):
        y = row * 9 + 2
        for k in range(4):
            on = rnd.random() < 0.6
            col = ['#5fd068', '#5fd068', '#ffd34d', '#5aa9ff'][k] if on else '#2b3a2e'
            c.r(1 + k * 3, y, 2, 2, col)
    return c.im

def prop_steam(f):
    c = Canvas(8, 12)
    for i in range(3):
        y = 10 - ((f * 3 + i * 4) % 12)
        x = 2 + ((i + f) % 3)
        if 0 <= y < 12:
            c.r(x, y, 2, 2, '#f2f2f2' if i % 2 else '#d8d8d8')
    return c.im

def prop_bubbles(f):
    c = Canvas(8, 10)
    for i in range(3):
        y = 9 - ((f * 2 + i * 3) % 10)
        c.r(1 + i * 2, y, 2, 2, '#c8f7cf')
    return c.im


# ---------------- the strip's corridor tile ----------------
def strip(time):
    c = Canvas(96, 34)
    c.r(0, 0, 96, 22, 'wall')
    for x in range(0, 96, 12):
        c.r(x, 2, 4, 14, 'wall2')
    c.r(0, 0, 96, 2, 'trim')
    c.r(0, 16, 96, 6, 'wain'); c.r(0, 15, 96, 1, 'trim'); c.r(0, 21, 96, 1, 'trim2')
    c.r(0, 22, 96, 12, 'floor')
    c.r(0, 22, 96, 1, 'floorsh'); c.r(0, 27, 96, 1, 'floor2'); c.r(0, 28, 96, 1, 'floor3')
    for x in (10, 46, 82):
        c.r(x, 23, 1, 4, 'floor2')
    for x in (28, 64):
        c.r(x, 29, 1, 5, 'floor2')
    c.box(36, 2, 24, 12, 'frame')
    glass = [(38, 4, 9, 8), (49, 4, 9, 8)]
    c.r(47, 4, 2, 8, 'frame')
    c.r(34, 13, 28, 2, 'frame2')
    if TINT[time]:
        tint(c.im, TINT[time])
    for i, (gx, gy, gw, gh) in enumerate(glass):
        sky(c, gx, gy, gw, gh, time, seed=i + 1, moon=i == 1)
    return c.im


# Where each kind of work happens. Spots are feet positions (x = middle of the 32 px frame).
STATIONS = {
    'office':     {'label': "Manager's desk", 'spots': [[32, BACK]]},
    'whiteboard': {'label': 'Whiteboard', 'spots': [[82, BACK], [102, BACK]]},
    'bench':      {'label': 'Workbenches', 'spots': [[136, BACK], [154, BACK], [178, BACK], [196, BACK]]},
    'drafting':   {'label': 'Drafting table', 'spots': [[226, BACK]]},
    'shelf':      {'label': 'Bookshelf', 'spots': [[254, BACK], [270, BACK]]},
    'window':     {'label': 'Telescope', 'spots': [[294, BACK]]},
    'console':    {'label': 'Terminal and servers', 'spots': [[332, BACK], [354, BACK]]},
    'lab':        {'label': 'Lab bench', 'spots': [[38, FRONT], [62, FRONT], [86, FRONT]]},
    'lounge':     {'label': 'Coffee corner', 'spots': [[262, FRONT], [284, FRONT], [306, FRONT], [346, FRONT]]},
    'floor':      {'label': 'Workshop floor', 'spots': [[x, FRONT] for x in range(118, 236, 18)]},
    'door':       {'label': 'Door', 'spots': [[382, BACK]]},
}


def main():
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    out = os.path.join(root, 'src', 'renderer', 'src', 'assets', 'world')
    os.makedirs(out, exist_ok=True)
    rooms, strips = {}, {}
    for time in ('day', 'dusk', 'night'):
        im, screens, term, leds = room(time)
        im.save(os.path.join(out, f'room-{time}.png'), optimize=True); rooms[time] = im
        s = strip(time); s.save(os.path.join(out, f'strip-{time}.png'), optimize=True); strips[time] = s
    makers = [
        ('screen', prop_screen, 260, [list(p) for p in screens]),
        ('term', prop_term, 300, [list(term)]),
        ('leds', prop_leds, 420, [list(leds)]),
        ('steam', prop_steam, 200, [[343, 154 - 12]]),
        ('bubbles', prop_bubbles, 240, [[23, 156 - 10], [59, 156 - 10]]),
    ]
    pw = max(m(0).width for _, m, _, _ in makers) * 4
    ph = sum(m(0).height for _, m, _, _ in makers)
    sheet = Image.new('RGBA', (pw, ph), (0, 0, 0, 0))
    props, y = [], 0
    for name, make, ms, at in makers:
        w, h = make(0).size
        for f in range(4):
            sheet.paste(make(f), (f * w, y))
        props.append({'name': name, 'x': 0, 'y': y, 'w': w, 'h': h, 'ms': ms, 'at': at})
        y += h
    sheet.save(os.path.join(out, 'props.png'), optimize=True)
    manifest = {
        'room': {'w': W, 'h': H, 'wall': WALL, 'back': BACK, 'front': FRONT},
        'strip': {'w': 96, 'h': 34, 'floor': 31},
        'props': props, 'propsSheet': {'w': pw, 'h': ph},
        'stations': STATIONS,
    }
    with open(os.path.join(out, 'manifest.json'), 'w') as fh:
        json.dump(manifest, fh, indent=2); fh.write('\n')
    print(f'room, strip and props → {os.path.relpath(out, root)}')
    if '--preview' in sys.argv:
        d = tempfile.mkdtemp(prefix='world-')
        for t, im in rooms.items():
            big = im.resize((W * 3, H * 3), Image.NEAREST)
            big.save(os.path.join(d, f'room-{t}.png'))
            strips[t].resize((96 * 4, 34 * 4), Image.NEAREST).save(os.path.join(d, f'strip-{t}.png'))
        sheet.resize((pw * 4, ph * 4), Image.NEAREST).save(os.path.join(d, 'props.png'))
        print('preview →', d)


if __name__ == '__main__':
    main()
