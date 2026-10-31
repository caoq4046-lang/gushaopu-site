# vibe-video-skill

An AI agent skill for producing **Vibe知识大赏 (Vibe Knowledge Awards)** style
knowledge videos: ~72-second vertical explainers rendered entirely from code —
animated diagrams on a dark premium background, bilingual subtitles, silky
dip-to-dark transitions, and no voiceover (silent by design, so music can be
added in post).

![spec](https://img.shields.io/badge/output-1080%C3%971920%20%C2%B7%2030fps%20%C2%B7%20~72s-0a1128)

## Why code, not AI clips?

The authentic Vibe format is programmatic: every line, number and diagram is
drawn by code and moves exactly on beat. This skill packages that production
method — storyboard pattern, rendering engine, transition system and the QA
checklist — so an AI agent can reproduce it for any topic.

## Quick start

```bash
pip install numpy pillow scipy   # scipy only needed for optional BGM
sudo apt install ffmpeg          # or your platform equivalent

# render the built-in worked example (iPhone jailbreak principles)
python3 scripts/vibe_video.py
# -> output/vibe-video.mp4  (1080x1920, 30fps, 72s, silent)
```

To make a new video, copy `scripts/vibe_video.py`, replace the `SCENES` list
and the scene branches in `draw_content()` with your storyboard (see
`scripts/storyboard_template.py`), test a few still frames, then render.

## House style

| Aspect | Standard |
|---|---|
| Format | 1080×1920, 30 fps, 68–75 s, H.264 CRF 13 |
| Audio | No audio track (music added in post) |
| Look | Deep-navy gradient, gold/cyan accents, glowing thin lines, drifting stars |
| Transitions | 0.6 s dip-to-dark between scenes; subtitles fade separately; cubic-eased entrances |
| Structure | 8 scenes: hook → problem → mechanism ×4 → new perspective → insight + caveat |
| Subtitles | Chinese line + smaller English line, one claim per scene |
| Branding | Small top header only; nothing at the bottom / end card |

## Repository layout

```
SKILL.md                        # the agent-facing playbook
scripts/
  vibe_video.py                 # complete generator + worked example storyboard
  storyboard_template.py        # drop-in SCENES/draw_content skeleton
```

## License

MIT
