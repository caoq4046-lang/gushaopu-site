#!/usr/bin/env python3
"""Vibe Video generator — reference implementation (vibe-video skill).

Renders a ~72s vertical knowledge video entirely from code:
Pillow frames -> ffmpeg, 1080x1920 output (720x1280 internal render,
Lanczos upscale + unsharp), 30fps, SILENT (no audio track; add music in post).
Transitions are 0.6s dip-to-dark with separately fading bilingual subtitles.

The built-in storyboard (SCENES + draw_content below) is a complete worked
example: "iPhone Jailbreak Principles" — educational and conceptual only:
how the layers of iOS security fit together and what a jailbreak
conceptually changes. No exploit steps or code.
To make a new video, replace SCENES and the draw_content branches
(see storyboard_template.py) and re-run.
Output: $VIBE_OUTPUT or ./output/vibe-video.mp4
Requires: numpy, Pillow, ffmpeg, a CJK font (Noto Sans CJK by default).
"""
import math, os, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H, FPS, DUR = 720, 1280, 30, 72
NFRAMES = FPS * DUR
TRANS = 0.6
FINAL = os.environ.get("VIBE_OUTPUT", os.path.join(os.getcwd(), "output", "vibe-video.mp4"))
os.makedirs(os.path.dirname(FINAL), exist_ok=True)

BG_TOP = np.array([5, 7, 16], float); BG_BOT = np.array([11, 18, 42], float)
GOLD = (232, 213, 163); GOLD_DIM = (165, 142, 98); CYAN = (127, 231, 220)
WHITE = (245, 247, 250); MUTE = (150, 165, 192); FAINT = (62, 88, 138)
CORAL = (255, 122, 122); VIOLET = (167, 148, 255); GREEN = (126, 230, 170)
CARD = (13, 20, 40)

def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def lerp(a, b, f): return a + (b - a) * f
def smoothstep(x): x = clamp(x); return x * x * (3 - 2 * x)
def ease_out(x): x = clamp(x); return 1 - (1 - x) ** 3
def ease_inout(x): x = clamp(x); return x * x * (3 - 2 * x) if x < 0.5 else 1 - ((-2 * x + 2) ** 3) / 2
def ease_back(x):
    x = clamp(x); c = 1.70158
    return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2

def font_path(bold=False):
    d = "/usr/share/fonts/opentype/noto"
    for n in (["NotoSansCJK-Bold.ttc"] if bold else ["NotoSansCJK-Regular.ttc", "NotoSansCJK-Bold.ttc"]):
        p = os.path.join(d, n)
        if os.path.exists(p): return p
    return os.path.join(d, "NotoSansCJK-Bold.ttc")
FB, FR = font_path(True), font_path(False)
def F(size, bold=False): return ImageFont.truetype(FB if bold else FR, size)
F_TITLE = F(66, True); F_SUB_CN = F(35, True); F_SUB_EN = F(21)
F_BRAND = F(25, True); F_MID = F(42, True); F_SMALL = F(24); F_TINY = F(19)
F_CARD = F(30, True); F_CARD_S = F(21); F_END = F(41, True)

def make_bg():
    grad = np.zeros((H, W, 3), float)
    for c in range(3):
        grad[:, :, c] = np.linspace(BG_TOP[c], BG_BOT[c], H)[:, None]
    img = Image.fromarray(grad.astype(np.uint8), "RGB").convert("RGBA")
    y, x = np.mgrid[0:H, 0:W]
    dist = np.sqrt(((x - W/2)/(W*0.75))**2 + ((y - H/2)/(H*0.75))**2)
    vig = np.clip(1 - 0.35*np.clip(dist - 0.55, 0, 1)**2, 0.72, 1.0)
    arr = np.array(img).astype(float); arr[:, :, :3] *= vig[:, :, None]
    return Image.fromarray(arr.astype(np.uint8), "RGBA")
BG = make_bg()
BLACK = Image.new("RGBA", (W, H), (2, 3, 8, 255))
rng = np.random.default_rng(11)
STARS = [(float(rng.uniform(0, W)), float(rng.uniform(0, H*0.92)), float(rng.uniform(0.6, 2.0)),
          float(rng.uniform(0, 6.28)), float(rng.uniform(0.4, 1.3))) for _ in range(90)]

def draw_stars(d, t):
    for sx, sy, r, ph, fr in STARS:
        yy = (sy + t*6*fr) % (H*0.95)
        a = int(24 + 30*(0.5 + 0.5*math.sin(t*fr + ph)))
        d.ellipse([sx-r, yy-r, sx+r, yy+r], fill=(200, 215, 255, a))

def text_center(d, cx, y, s, fnt, fill, alpha=255):
    box = d.textbbox((0, 0), s, font=fnt); tw = box[2]-box[0]
    d.text((cx - tw/2 - box[0], y), s, font=fnt, fill=fill + (int(alpha),))

def glow_line(d, pts, color, width=3, glow_alpha=44):
    if len(pts) < 2: return
    d.line(pts, fill=color + (glow_alpha,), width=width+7, joint="curve")
    d.line(pts, fill=color + (235,), width=width, joint="curve")

def check_mark(d, cx, cy, s, color, alpha=255, width=5):
    d.line([cx-0.55*s, cy+0.02*s, cx-0.16*s, cy+0.42*s], fill=color + (int(alpha),), width=width)
    d.line([cx-0.16*s, cy+0.42*s, cx+0.62*s, cy-0.45*s], fill=color + (int(alpha),), width=width)

def x_mark(d, cx, cy, s, color, alpha=255, width=5):
    d.line([cx-0.4*s, cy-0.4*s, cx+0.4*s, cy+0.4*s], fill=color + (int(alpha),), width=width)
    d.line([cx-0.4*s, cy+0.4*s, cx+0.4*s, cy-0.4*s], fill=color + (int(alpha),), width=width)

def draw_phone(d, cx, cy, pw, ph, alpha=255, dy=0.0):
    x0, y0, x1, y1 = cx-pw/2, cy-ph/2+dy, cx+pw/2, cy+ph/2+dy
    d.rounded_rectangle([x0, y0, x1, y1], radius=pw*0.16, fill=(8, 12, 26, int(alpha)),
                        outline=GOLD_DIM + (int(alpha*0.9),), width=3)
    d.rounded_rectangle([x0+13, y0+13, x1-13, y1-13], radius=pw*0.12,
                        outline=FAINT + (int(alpha*0.8),), width=2)
    iw = pw*0.30
    d.rounded_rectangle([cx-iw/2, y0+30, cx+iw/2, y0+56], radius=13, fill=(30, 40, 66, int(alpha)))
    d.rounded_rectangle([cx-44, y1-34, cx+44, y1-26], radius=4, fill=MUTE + (int(alpha*0.7),))
    return x0, y0, x1, y1

def draw_lock(d, cx, cy, s, open_frac, color=GOLD, alpha=255):
    # body
    d.rounded_rectangle([cx-s*0.72, cy-s*0.1, cx+s*0.72, cy+s*0.95], radius=s*0.18,
                        outline=color + (int(alpha),), width=max(3, int(s*0.09)),
                        fill=(10, 15, 32, int(alpha*0.85)))
    # shackle: arc that lifts/rotates open on the right side
    lift = open_frac*s*0.28; gap = open_frac*58
    box = [cx-s*0.48, cy-s*0.95+ -lift*0.4, cx+s*0.48, cy+s*0.35]
    d.arc(box, start=180, end=360-gap, fill=color + (int(alpha),), width=max(3, int(s*0.10)))
    if open_frac > 0.03:
        ex = cx + s*0.48*math.cos(math.radians(-gap)); ey = (box[1]+box[3])/2 + s*0.65*math.sin(math.radians(-gap)) - lift*0.4
        d.line([ex, ey, ex+open_frac*s*0.1, ey-open_frac*s*0.34], fill=color + (int(alpha),), width=max(3, int(s*0.10)))
    # keyhole
    d.ellipse([cx-s*0.11, cy+s*0.28, cx+s*0.11, cy+s*0.50], fill=color + (int(alpha),))
    d.polygon([(cx-s*0.07, cy+s*0.42), (cx+s*0.07, cy+s*0.42), (cx+s*0.12, cy+s*0.68), (cx-s*0.12, cy+s*0.68)],
              fill=color + (int(alpha),))

SCENES = [
    (0,  8,  "一部被层层锁住的手机，如何被打开？", "How is a phone locked in layers ever opened?"),
    (8,  17, "iOS 的安全，是一条环环相扣的信任链", "iOS security is a chain of trust, link by link"),
    (17, 25, "每个程序，都必须带着苹果的签名", "Every program must carry Apple's signature"),
    (25, 34, "越狱的第一步，是找到一个漏洞", "The first step of a jailbreak is finding a flaw"),
    (34, 43, "从普通应用，一路爬到系统内核", "Climbing from an ordinary app to the kernel"),
    (43, 52, "拿到内核权限，就能改掉那些限制", "With kernel access, restrictions can be patched"),
    (52, 61, "最后，装上第三方商店和插件", "Finally, third-party stores and tweaks arrive"),
    (61, 72, "越狱的本质，是夺回设备的控制权", "Jailbreaking is about reclaiming control"),
]
def scene_index(t):
    for i, (a, b, *_ ) in enumerate(SCENES):
        if a <= t < b: return i
    return len(SCENES)-1

def draw_content(d, idx, t, lt):
    lt = max(0.0, lt)
    if idx == 0:
        e = ease_out(lt/1.1)
        for ri, rr in enumerate([150, 215, 280]):
            r2 = rr + 12*math.sin(t*1.1 - ri*0.9)
            d.ellipse([360-r2, 640-r2*0.78, 360+r2, 640+r2*0.78], outline=GOLD + (int(66-ri*16),), width=2)
        text_center(d, W/2, 128, "VIBE 知识大赏", F_BRAND, GOLD, 235*e)
        text_center(d, W/2, 196, "苹果手机越狱原理", F_TITLE, WHITE, 255*e)
        text_center(d, W/2, 292, "HOW IPHONE JAILBREAKING WORKS", F_TINY, MUTE, 220*e)
        draw_phone(d, 360, 660, 296, 600, alpha=int(255*e), dy=(1-e)*46)
        pulse = 0.5 + 0.5*math.sin(t*2.0)
        draw_lock(d, 360, 622, 86, 0.0, GOLD, int(255*e))
        d.ellipse([360-118, 640-150-8*pulse, 360+118, 640-150+8*pulse], outline=CYAN + (int(40+40*pulse),), width=2)
    elif idx == 1:
        text_center(d, W/2, 150, "信任链", F_MID, GOLD); text_center(d, W/2, 214, "THE CHAIN OF TRUST", F_TINY, MUTE)
        labels = [("Boot ROM", "芯片里的启动代码"), ("iBoot", "第二阶段引导程序"),
                  ("Kernel", "系统内核"), ("Apps", "你装的每个应用")]
        ys = [330, 505, 680, 855]
        prog = clamp((lt-0.4)/6.4)
        d.line([360, ys[0]+55, 360, ys[0]+55+(ys[-1]-ys[0])*prog], fill=FAINT + (220,), width=4)
        glow_line(d, [(360, ys[0]+55), (360, ys[0]+55+(ys[-1]-ys[0])*prog)], GOLD, 2, 30)
        for i, ((en, cn), yy) in enumerate(zip(labels, ys)):
            on = ease_out((lt - 0.5 - i*1.55)/0.7)
            ent = clamp(ease_out((lt - i*0.22)/0.75))
            xoff = (1-ent)*34*(1 if i % 2 == 0 else -1)
            col = GOLD if on > 0.6 else MUTE
            d.rounded_rectangle([150+xoff, yy-58, 570+xoff, yy+58], radius=22,
                                fill=CARD + (int(245*ent*(0.4+0.6*on)),), outline=(col) + (int((50+180*on)*ent),), width=2)
            d.text((182+xoff, yy-34), en, font=F_CARD, fill=WHITE + (int(255*ent),))
            d.text((182+xoff, yy+8), cn, font=F_CARD_S, fill=MUTE + (int(255*ent),))
            if on > 0.55:
                d.ellipse([492+xoff, yy-24, 540+xoff, yy+24], outline=GREEN + (int(255*on),), width=3)
                check_mark(d, 516+xoff, yy, 30, GREEN, 255*on, 4)
    elif idx == 2:
        text_center(d, W/2, 150, "代码签名", F_MID, GOLD); text_center(d, W/2, 214, "CODE SIGNING", F_TINY, MUTE)
        # signature squiggle draws itself
        xs = np.linspace(150, 570, 220); ph = np.linspace(0, 5.6*np.pi, 220)
        ys2 = 330 + 34*np.sin(ph)*np.exp(-((xs-360)/300)**2*0.4) + 12*np.sin(ph*2.3)
        cut = int(len(xs)*clamp(lt/2.2))
        if cut > 2: glow_line(d, list(zip(xs[:cut].tolist(), ys2[:cut].tolist())), VIOLET, 3)
        # signed card
        e1 = ease_out(lt/0.8)
        d.rounded_rectangle([90, 440, 630, 620], radius=24, fill=CARD + (255,), outline=GREEN + (200,), width=2)
        d.rounded_rectangle([122, 486, 206, 570], radius=18, fill=(38, 84, 64, 255))
        text_center(d, 164, 506, "App", F_CARD_S, WHITE)
        d.text((232, 478), "通过 App Store 安装的应用", font=F_CARD_S, fill=WHITE + (255,))
        d.text((232, 516), "带有苹果签名 · 验证通过", font=F_CARD_S, fill=GREEN + (255,))
        seal = ease_back((lt-1.1)/0.7)
        if seal > 0:
            r = 40*seal
            d.ellipse([520-r, 585-r, 520+r, 585+r], outline=GOLD + (255,), width=3)
            d.ellipse([520-r*0.78, 585-r*0.78, 520+r*0.78, 585+r*0.78], outline=GOLD + (200,), width=2)
            check_mark(d, 520, 585, 40*seal, GOLD, 255, 4)
        # unsigned card rejected
        if lt > 2.2:
            e2 = ease_out((lt-2.4)/0.8); shake = math.sin(lt*36)*5*clamp((3.6-lt)/0.6) if 2.8 < lt < 3.6 else 0
            fade = 150 if lt > 3.4 else 235
            d.rounded_rectangle([90+shake, 680, 630+shake, 860], radius=24, fill=CARD + (fade,), outline=CORAL + (200,), width=2)
            d.rounded_rectangle([122+shake, 726, 206+shake, 810], radius=18, fill=(86, 44, 48, fade))
            text_center(d, 164+shake, 746, "App", F_CARD_S, WHITE, fade)
            d.text((232+shake, 718), "来路不明的程序", font=F_CARD_S, fill=WHITE + (fade,))
            d.text((232+shake, 756), "没有签名 · 系统直接拒绝", font=F_CARD_S, fill=CORAL + (fade,))
            if e2 > 0.4:
                d.ellipse([492+shake, 722, 540+shake, 770], outline=CORAL + (255,), width=3)
                x_mark(d, 516+shake, 746, 26, CORAL, 255, 4)
        text_center(d, W/2, 940, "没有签名，就进不了这道门", F_SMALL, MUTE, 235)
    elif idx == 3:
        text_center(d, W/2, 150, "寻找漏洞", F_MID, CORAL); text_center(d, W/2, 214, "FINDING A FLAW", F_TINY, MUTE)
        cx, cy = 360, 600
        shield = [(cx-195, cy-215), (cx+195, cy-215), (cx+195, cy+20), (cx+150, cy+115),
                  (cx+75, cy+190), (cx, cy+245), (cx-75, cy+190), (cx-150, cy+115), (cx-195, cy+20)]
        d.polygon(shield, outline=FAINT + (255,), width=3)
        for gx in range(-130, 131, 65):
            d.line([cx+gx, cy-190, cx+gx, cy+55], fill=FAINT + (70,), width=1)
        for gy, hw in ((-110, 175), (-20, 175), (70, 148)):
            d.line([cx-hw, cy+gy, cx+hw, cy+gy], fill=FAINT + (70,), width=1)
        scan_y = cy-215 + ((t*90) % 460)
        halfw = 195 if scan_y <= cy+20 else 195*(1-(scan_y-(cy+20))/225*0.85)
        d.line([cx-halfw, scan_y, cx+halfw, scan_y], fill=CYAN + (90,), width=3)
        # crack grows from top center
        crack = [(cx+18, cy-215), (cx-8, cy-140), (cx+22, cy-70), (cx-14, cy+6), (cx+16, cy+86), (cx-6, cy+150)]
        total = len(crack)-1; grow = clamp((lt-1.2)/4.6)*total
        pts = []
        for i in range(int(grow)+1):
            pts.append(crack[i])
            if i < int(grow) and i+1 < len(crack):
                pass
        if grow > int(grow) and int(grow)+1 < len(crack):
            f = grow-int(grow); a = crack[int(grow)]; b = crack[int(grow)+1]
            pts.append((lerp(a[0], b[0], f), lerp(a[1], b[1], f)))
        if len(pts) > 1: glow_line(d, pts, CORAL, 3, 60)
        pulse = 0.5+0.5*math.sin(t*3.2)
        d.ellipse([cx+18-9-pulse*4, cy-215-9-pulse*4, cx+18+9+pulse*4, cy-215+9+pulse*4], outline=CORAL + (int(140+100*pulse),), width=2)
        text_center(d, W/2, 940, "再坚固的墙，也怕一处裂缝", F_SMALL, MUTE, 235)

    elif idx == 4:
        text_center(d, W/2, 150, "提权之路", F_MID, GOLD); text_center(d, W/2, 214, "PRIVILEGE ESCALATION", F_TINY, MUTE)
        steps = [("沙盒里的应用", "SANDBOX", 120, 905), ("普通用户", "USER", 235, 745),
                 ("管理员", "ROOT", 350, 585), ("系统内核", "KERNEL", 465, 425)]
        # connecting path
        path = [(sx+52, sy) for _, _, sx, sy in steps]
        glow_line(d, path, FAINT, 3, 20)
        climb = ease_inout((lt-0.6)/6.6) * (len(steps)-1)
        for i, (cn, en, sx, sy) in enumerate(steps):
            lit = clamp(climb - i + 1.2)
            col = GOLD if i == 3 and lit > 0.7 else (CYAN if lit > 0.5 else MUTE)
            d.rounded_rectangle([sx-95, sy-52, sx+150, sy+52], radius=20, fill=CARD + (255,),
                                outline=col + (int(90+160*clamp(lit)),), width=2)
            d.text((sx-72, sy-32), cn, font=F_CARD_S, fill=WHITE + (255,))
            d.text((sx-72, sy+4), en, font=F_TINY, fill=col + (255,))
        # climbing orb
        fi = int(climb); fr = climb-fi
        if fi >= len(steps)-1: ox, oy = path[-1]
        else: ox, oy = lerp(path[fi][0], path[fi+1][0], fr), lerp(path[fi][1], path[fi+1][1], fr)
        for r, a in [(26, 40), (17, 90)]:
            d.ellipse([ox-r, oy-r, ox+r, oy+r], outline=GOLD + (a,), width=2)
        d.ellipse([ox-9, oy-9, ox+9, oy+9], fill=GOLD + (255,))
        text_center(d, W/2, 985, "权限每高一级，能改的东西就多一层", F_SMALL, MUTE, 235)
    elif idx == 5:
        draw_phone(d, 360, 650, 470, 740, alpha=52)
        text_center(d, W/2, 150, "解除限制", F_MID, GOLD); text_center(d, W/2, 214, "PATCHING PROTECTIONS", F_TINY, MUTE)
        rows = [("代码签名检查", 400), ("沙盒限制", 560), ("系统分区只读", 720)]
        for i, (label, yy) in enumerate(rows):
            e = ease_out((lt-i*0.35)/0.7)
            if e <= 0.02: continue
            d.rounded_rectangle([80, yy-62, 640, yy+62], radius=22, fill=CARD + (int(245*e),),
                                outline=FAINT + (160,), width=2)
            d.text((112, yy-17), label, font=F_CARD, fill=WHITE + (255,))
            off = ease_inout((lt-1.6-i*1.7)/0.85)  # 0=still on(locked), 1=patched off
            tx0, tx1 = 520, 596
            pill_col = CYAN if off < 0.5 else GOLD
            d.rounded_rectangle([tx0, yy-21, tx1, yy+21], radius=21, fill=pill_col + (70,),
                                outline=pill_col + (230,), width=2)
            kx = lerp(tx0+21, tx1-21, off)
            d.ellipse([kx-15, yy-15, kx+15, yy+15], fill=pill_col + (255,))
            st = "限制中" if off < 0.5 else "已解除"
            scol = CYAN if off < 0.5 else GOLD
            text_center(d, 558, yy+34, st, F_TINY, scol, 235)
        text_center(d, W/2, 930, "改的不是硬件，是内核里的规则", F_SMALL, MUTE, 235)
    elif idx == 6:
        text_center(d, W/2, 150, "自由之后", F_MID, GOLD); text_center(d, W/2, 214, "STORES & TWEAKS", F_TINY, MUTE)
        draw_lock(d, 360, 330, 44, 1.0, GOLD, 255)
        cols = [(64, 110, 170), (120, 84, 170), (38, 130, 120), (170, 120, 60), (90, 140, 190),
                (150, 80, 120), (70, 160, 140), (180, 150, 80), (100, 100, 180)]
        labels = ["商店", "插件", "主题", "文件", "美化", "手势", "多开", "备份", "工具"]
        for i in range(9):
            gx, gy = 148 + (i % 3)*212, 520 + (i//3)*168
            pop = ease_back((lt-0.5-i*0.42)/0.65)
            if pop <= 0: continue
            s = 56*pop
            c = cols[i]
            d.rounded_rectangle([gx-s, gy-s, gx+s, gy+s], radius=26*pop, fill=c + (int(235*clamp(pop)),))
            # simple glyphs
            if i % 3 == 0:
                d.ellipse([gx-20*pop, gy-20*pop, gx+20*pop, gy+20*pop], outline=WHITE + (230,), width=3)
            elif i % 3 == 1:
                d.polygon([(gx, gy-24*pop), (gx+22*pop, gy+16*pop), (gx-22*pop, gy+16*pop)], outline=WHITE + (230,))
            else:
                d.rectangle([gx-18*pop, gy-18*pop, gx+18*pop, gy+18*pop], outline=WHITE + (230,), width=3)
            text_center(d, gx, gy+s+10, labels[i], F_TINY, MUTE, 235*clamp(pop))
        text_center(d, W/2, 985, "想装什么，自己说了算", F_SMALL, MUTE, 235)
    elif idx == 7:
        p = ease_out(lt/1.3)
        for ri, rr in enumerate([80, 140, 200]):
            r2 = rr + 10*math.sin(t*1.1 - ri*0.8)
            d.ellipse([360-r2, 400-r2*0.7, 360+r2, 400+r2*0.7], outline=GOLD + (int((80-ri*18)*p),), width=2)
        draw_lock(d, 360, 372, 58, 1.0, GOLD, int(255*p))
        text_center(d, W/2, 580, "越狱的本质", F_MID, WHITE, 255*p)
        text_center(d, W/2, 646, "是夺回自己设备的控制权", F_END, GOLD, 255*p)
        text_center(d, W/2, 770, "代价同样真实：失去保修 · 安全风险 · 系统不稳定", F_TINY, CORAL, 220*p)
        text_center(d, W/2, 838, "自由与风险，永远是一体两面", F_SMALL, MUTE, 235*p)

def render_layer(idx, t):
    img = BG.copy()
    d = ImageDraw.Draw(img, "RGBA")
    draw_stars(d, t)
    if idx != 0:
        text_center(d, W/2, 60, "V I B E  知 识 大 赏", F_BRAND, GOLD_DIM, 190)
    a, b, cn, en = SCENES[idx]
    draw_content(d, idx, t, t-a)
    sa = min(clamp((t-a)/0.45), clamp((b-t)/0.45))
    if sa > 0.02:
        d.rounded_rectangle([36, 1052, W-36, 1180], radius=18, fill=(2, 4, 10, int(125*sa)))
        text_center(d, W/2, 1072, cn, F_SUB_CN, WHITE, 255*sa)
        text_center(d, W/2, 1128, en, F_SUB_EN, MUTE, 235*sa)
    return img

def frame_image(t):
    idx = scene_index(t)
    img = render_layer(idx, t)
    if idx < len(SCENES)-1:
        boundary = SCENES[idx+1][0]
        if t >= boundary - TRANS:
            f = (t-(boundary-TRANS))/TRANS
            if f < 0.5:
                img = Image.blend(img, BLACK, smoothstep(f*2)*0.94)
            else:
                img = Image.blend(BLACK, render_layer(idx+1, t), smoothstep((f-0.5)*2))
    if t < 0.7:
        img = Image.blend(BLACK, img, ease_out(t/0.7))
    if t > DUR-0.8:
        img = Image.blend(img, BLACK, smoothstep((t-(DUR-0.8))/0.8)*0.92)
    img = img.convert("RGB")
    d = ImageDraw.Draw(img)
    d.rectangle([0, H-6, W, H], fill=(16, 22, 44))
    d.rectangle([0, H-6, W*(t/DUR), H], fill=GOLD)
    return img

OUT_W, OUT_H = 1080, 1920
def main():
    cmd = ["ffmpeg", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{OUT_W}x{OUT_H}",
           "-r", str(FPS), "-i", "-", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p",
           "-crf", "13", "-preset", "medium", FINAL]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for i in range(NFRAMES):
        img = frame_image(i/FPS).resize((OUT_W, OUT_H), Image.LANCZOS)
        img = img.filter(ImageFilter.UnsharpMask(radius=2.2, percent=72, threshold=2))
        proc.stdin.write(img.tobytes())
        if i % 300 == 0: print(f"frame {i}/{NFRAMES}", flush=True)
    proc.stdin.close(); proc.wait()
    print("DONE", FINAL)

if __name__ == "__main__":
    main()
