# -*- coding: utf-8 -*-
"""Storyboard template for the vibe-video skill.

HOW TO USE
----------
1. Copy scripts/vibe_video.py to a new file for your topic.
2. In that copy, replace the SCENES list and the body of draw_content()
   with the SCENES and draw_content() below, then design each scene.
3. Keep the arc: hook -> problem -> mechanism (3-4 visual steps) ->
   new perspective -> applications -> insight + honest caveat.
4. Rules of thumb:
   - One claim per scene; CN subtitle <= 16 chars, plus a short EN line.
   - Every scene needs an animated diagram, not just text.
   - Entrances use ease_out / ease_inout on local time `lt`.
   - ImageDraw ignores per-draw alpha on RGBA: gate timed reveals with
     explicit `if lt > X:` checks instead of alpha fades.
   - Test still frames (midpoints, transition midpoint, timed reveals)
     before the full render.
"""

# (t_start, t_end, subtitle_cn, subtitle_en) — 8 scenes, ~72s total
SCENES = [
    (0,  8,  "＜钩子：一句反常识的问题＞", "Hook: one counterintuitive question"),
    (8,  17, "＜问题：它为什么这么难/重要＞", "The problem, framed"),
    (17, 25, "＜机制第一步＞", "Mechanism, step one"),
    (25, 34, "＜机制第二步＞", "Mechanism, step two"),
    (34, 43, "＜机制第三步＞", "Mechanism, step three"),
    (43, 52, "＜机制第四步 / 转折＞", "Mechanism, step four / the turn"),
    (52, 61, "＜换个视角 + 应用＞", "A new perspective, and where it is used"),
    (61, 72, "＜收束：一句洞察＞", "Closing insight"),
]

def draw_content(d, idx, t, lt):
    """Draw scene `idx`. `t` = global seconds (continuous motion),
    `lt` = seconds since this scene started (entrances, reveals)."""
    lt = max(0.0, lt)
    if idx == 0:
        # Title scene: big title + hero diagram (phone, waveform, globe…)
        e = ease_out(lt / 1.1)
        text_center(d, W/2, 196, "＜中文标题＞", F_TITLE, WHITE, 255 * e)
        text_center(d, W/2, 292, "ENGLISH TITLE", F_TINY, MUTE, 220 * e)
        # TODO: hero visual, e.g. draw_phone(...) / draw_lock(...) / glow_line(...)
    elif idx == 1:
        text_center(d, W/2, 150, "＜小标题＞", F_MID, GOLD)
        text_center(d, W/2, 214, "SECTION TITLE", F_TINY, MUTE)
        # TODO: diagram that builds up step by step using clamp((lt - k) / d)
    elif idx in (2, 3, 4, 5):
        text_center(d, W/2, 150, "＜小标题＞", F_MID, GOLD)
        text_center(d, W/2, 214, "SECTION TITLE", F_TINY, MUTE)
        # TODO: one mechanism step per scene; animate with global `t` for
        # continuous motion (rotation, scanning, flowing) and `lt` for reveals.
    elif idx == 6:
        text_center(d, W/2, 150, "＜小标题＞", F_MID, GOLD)
        text_center(d, W/2, 214, "A NEW PERSPECTIVE", F_TINY, MUTE)
        # TODO: transform the same object into the new view (bars, map, layers…)
        # TODO: one line of applications at y≈985, F_SMALL.
    elif idx == 7:
        p = ease_out(lt / 1.3)
        # TODO: quiet end card — motif from scene 0, insight in two lines:
        text_center(d, W/2, 580, "＜洞察第一行＞", F_MID, WHITE, 255 * p)
        text_center(d, W/2, 646, "＜洞察第二行＞", F_END, GOLD, 255 * p)
        text_center(d, W/2, 770, "＜代价/边界：诚实的一句提醒＞", F_TINY, CORAL, 220 * p)
        # No branding or hashtag lines here.
