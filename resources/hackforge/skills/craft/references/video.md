# Playbook: Video & motion

**When:** a required demo video, a backup recording of the live demo, a trailer to open the pitch, an animated explainer of how it works.

- **Web app capture, scripted**: Playwright with `record_video_dir` drives the exact demo path at a fixed viewport (1920×1080) — reproducible and no mouse wobble.
- **Screen capture** (native apps): macOS `ffmpeg -f avfoundation -framerate 30 -i "<screen index>" -t 60 cap.mp4` (list devices with `-list_devices true -i ""`).
- **Motion graphics**: Remotion (React → video, `npx create-video@latest`, `npx remotion render`) for titles, charts and UI animations; Manim (`manim -qh scene.py Scene`) for technical/mathematical explainers; Blender turntables/animations for 3D.
- **Assembly with ffmpeg**: concat list (`-f concat -safe 0 -i list.txt`), crossfades (`xfade`), title cards, music bed with ducking (`sidechaincompress`), burned captions (`-vf subtitles=subs.srt`), final `-c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart`.
- Structure: 5 s hook → problem → demo moment → proof (numbers) → impact → call to action. Captions always — judges often watch muted.
- Check: exact duration vs the limit (`ffprobe -show_entries format=duration`), resolution, audio levels, file size limit, plays in a browser. Watch sampled frames (extract with `ffmpeg -vf fps=1/5`) and look at them.
