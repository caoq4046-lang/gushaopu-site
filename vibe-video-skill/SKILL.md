---
name: vibe-video
description: Produce a "Vibe Knowledge Awards" (Vibe知识大赏) style knowledge video — a 60–75 second vertical, code-animated explainer with a dark premium look, bilingual subtitles, silky transitions and no voiceover. Use when the user asks for a Vibe video, a code-generated knowledge video, or a short animated explainer in this format.
---

# Vibe Video — code-generated knowledge shorts

A Vibe video explains **one** knowledge point in about a minute, rendered
entirely from code (Python + Pillow + ffmpeg): animated diagrams, glowing
lines and numbers on a deep-navy background, Chinese + English subtitles,
**no voiceover**. It is not stitched AI clips.

## House style (defaults learned from production feedback)

- **Format:** 1080×1920 vertical, 30 fps, 68–75 s. Internal render at
  720×1280, Lanczos-upscaled with unsharp masking, H.264 CRF 13.
  720p output was rejected as blurry — never ship below 1080×1920.
- **Audio:** silent, **no audio track at all** by default. The user adds
  music in post. Only synthesize BGM if explicitly asked.
- **Look:** deep navy gradient + vignette + drifting stars; gold / cyan /
  off-white palette; thin glowing strokes; one idea per scene.
- **Transitions must be silky:** dip-to-dark crossfades (~0.6 s) between
  scenes, subtitles fade out/in separately around each boundary, elements
  slide/grow in with cubic easing. No hard cuts, no overlapping ghost text.
- **Density:** every scene needs a real animated diagram (not just text).
  Sparse or purely typographic scenes read as "not stunning".
- **Topics:** broadly appealing, curiosity-driven subjects (how everyday
  tech works, jailbreak principles, why the sky is blue at product level…)
  beat dry academic theory. If the suggested topic is too academic, say so
  and offer a punchier angle before rendering.
- **Branding:** a small "VIBE 知识大赏" header at the top is fine. Do **not**
  put a branding/hashtag line at the bottom or on the end card.

## Workflow

1. **Pick one knowledge point** and a hook question for the first 3 seconds.
2. **Storyboard 8 scenes** (~8–11 s each, total ≈72 s). Arc: hook →
   the problem → the core mechanism in 3–4 visual steps → a new perspective
   (e.g. frequency domain) → applications → one-line insight + honest
   caveat (risks/limits). Each scene gets one CN subtitle (≤16 chars) and
   one EN subtitle.
3. **Write the storyboard** into a copy of `scripts/vibe_video.py`:
   replace `SCENES` and the per-scene branches of `draw_content`.
   `scripts/storyboard_template.py` is a drop-in skeleton. Reuse the
   engine helpers (`draw_phone`, `draw_lock`, `glow_line`, `check_mark`,
   easing functions) and invent scene-specific diagrams in the same style.
4. **Test frames before rendering:** render stills at each scene midpoint,
   one transition midpoint, and any timed reveal (before/after). Inspect
   them visually: no clipped elements, no overlapping text, nothing
   appearing before its cue. Remember `ImageDraw` ignores per-draw alpha
   on an RGBA canvas — gate timed elements with explicit `if` checks
   instead of relying on alpha fades.
5. **Render** (`python3 scripts/vibe_video.py`), then **verify with
   ffprobe**: duration ≈ target, 1080×1920, 30 fps, exactly one video
   stream (no audio). Extract 2–3 frames from the final MP4 and look.
6. **Deliver** the MP4 itself (attachment), with runtime, resolution and
   the transition timestamps (useful for the user's music edits).

## Content rules

- Explain principles conceptually. For security topics (e.g. jailbreaks)
  describe the layers and what conceptually changes — no exploit steps,
  no code, no instructions for wrongdoing.
- Subtitles carry the narration: short, declarative, one claim per scene.
- End on an insight line, and include the honest trade-off (freedom vs.
  risk) when the topic has one.

## Files

- `scripts/vibe_video.py` — complete, proven generator. Engine + a full
  worked storyboard (iPhone jailbreak principles) you can copy and adapt.
- `scripts/storyboard_template.py` — SCENES + draw_content skeleton.
