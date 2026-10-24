"""Your clips. Edit this file: the brand, the voice and lines, and the beats of each clip.

  python3 story.py <clip>     → build/<clip>/timeline.json (checked)   (or `all`)
  ./make.sh <clip>            → out/<clip>.mp4                          (./make.sh smoke: all, quickly)

The example films a stand-in app (demo/index.html) with Forge, a soft anvil with a tiny hammer.
Order: python3 voice.py (only clips that talk) → node capture_ui.mjs (clips that show the app) →
python3 story.py <clip>. film.py documents every builder (f.app, f.go, f.device, f.product, …).
"""
from film import BPM, FPS, SR, run  # noqa: F401  (voice.py and sound.py read FPS and SR from here)

# ---------- BRAND ----------
# HERO: the character, if the product has one (scene/character.js holds its shape, face and prop).
# `size` is its height on the app in world units (1 = 100 UI px). The body must read as `color`.
HERO = {'name': 'Forge', 'color': '#EE8A4A', 'dark': '#1D1410', 'size': 0.85, 'prop': {'head': '#4A403B', 'handle': '#8A5A3C'}}
APP = {'name': 'Tinker'}
# LOGO: the app's icon as a tile. `icon`: the app's current mark (transparent PNG, e.g.
# 'assets/icon.png') at `icon_scale` of the tile. mark='hero': the character's silhouette becomes
# the mark (after it dives in, or popping in when the clip has no character).
LOGO = {'tile': '#D97757', 'tile_top': '#EC9472', 'emblem': '#FFFFFF', 'icon': None, 'mark': 'hero', 'wordmark': 'Tinker', 'tagline': 'Apps, one hop away.'}
# SET: the studio. `haze` is depth fog: a little reads as a studio, more greys the frame.
SET = {'studio': '#120C0A', 'haze': 0.008}
# MUSIC: only clips that set f.cfg['music'] = {'on': True} (the film) get music; a clip used inside a
# narrated pitch takes its effects only, and the pitch brings the music.
MUSIC = {'progression': ['F', 'G', 'Am', 'C'], 'final': ['C4', 'E4', 'G4', 'C5', 'E5'], 'on': False}

# ---------- the voice (voice.py) ----------
# engine: kokoro (offline, free), elevenlabs (ELEVENLABS_API_KEY and voice_id), own (recordings/
# <id>.wav) or silent. `character` turns Kokoro into a lively cartoon voice with Praat: the pitch
# moved to `median` Hz, formants shifted (above 1 = smaller, cuter), the melody widened by `range`
# (above 1 = bouncier). `python3 voice.py --audition` plays a few to pick from.
VOICE = {'engine': 'kokoro', 'voice': 'af_heart', 'speed': 1.08, 'semitones': 0, 'lang': 'en-us', 'voice_id': None, 'character': {'median': 265, 'formants': 1.12, 'range': 1.5}}
# mood: the character's face while the line is spoken (scene/lib/face.js MOODS).
LINES = [
    {'id': 'hi', 'text': "Hi! I'm Forge!", 'mood': 'happy'},
    {'id': 'problem', 'text': 'Building an app takes weeks. Screens, data, reminders, and no time.', 'mood': 'worried'},
    {'id': 'fix', 'text': 'Tinker builds it with you. Come on!', 'mood': 'excited'},
    {'id': 'describe', 'text': 'Tell it what you want.', 'mood': 'happy'},
    {'id': 'build', 'text': 'Press build, and I hammer out every piece.', 'mood': 'happy'},
    {'id': 'preview', 'text': 'Check it, then publish!', 'mood': 'excited'},
    {'id': 'done', 'text': "It's live!", 'mood': 'joy'},
    {'id': 'logo', 'text': 'Tinker. Apps, one hop away.', 'mood': 'proud', 'caption': False},
]
# PROBLEM: the cards that pop up while the problem is told.
PROBLEM = ['Design 12 screens', 'Set up the database', 'Bug #42', "Weekend's gone"]


# ---------- the clips ----------
def film(f):
    """The character film: hello and the problem in the studio, into the app, the logo (~28 s)."""
    f.app(navigator='hero')
    f.cfg['music'] = {'on': True}
    start = f.intro()
    A = f.enter(start, 'describe_empty', 'prompt', typing=True)
    f.screen(0, 'describe_empty', 'cut')
    f.say('describe', A + 0.1)
    f.go(A + 0.05, 'describe_empty', 'prompt', 'type', then='describe_filled')
    f.say('build', A + 1.6)
    f.go(A + 2.75, 'describe_filled', 'build', 'press', then='build_1')
    f.go(A + 3.85, 'build_1', 'step1', 'press', then='build_2', how='fade', note='C6')
    f.go(A + 5.25, 'build_1', 'step2', 'press', then='build_3', how='fade', note='E6')
    f.go(A + 6.65, 'build_1', 'step3', 'press', then='preview', note='G6')
    f.say('preview', A + 6.85)
    f.go(A + 7.75, 'preview', 'publish', 'stamp', then='live')
    f.go(A + 8.95, 'live', 'badge', 'cheer')
    f.say('done', A + 9.15)
    f.outro(A + 10.6)


def walkthrough(f):
    """The app with a 3D cursor, no character: it types the idea, builds, publishes (~9 s)."""
    f.app(navigator='cursor')
    f.screen(0, 'describe_empty', 'cut')
    f.shot(0, 'screen')
    f.go(0.9, 'describe_empty', 'prompt', 'type', then='describe_filled')
    f.go(3.25, 'describe_filled', 'build', 'press', then='build_1')
    f.shot(3.5, 'follow', blend=0.9, zoom=1.6)
    f.go(4.4, 'build_1', 'step1', 'press', then='build_2', how='fade', note='C6')
    f.go(5.3, 'build_1', 'step2', 'press', then='build_3', how='fade', note='E6')
    f.go(6.2, 'build_1', 'step3', 'press', then='preview', note='G6')
    f.go(7.3, 'preview', 'publish', 'press', then='live')
    f.shot(7.6, 'screen', blend=1.0)
    f.end(9.2)


def device(f):
    """The app on a laptop: the lid opens, the screen wakes, the cursor builds the app (~8 s)."""
    f.device('laptop', open=(0.2, 1.3))
    f.app(navigator='cursor', mode='device', start=[1300, 700])
    f.power(1.25)
    f.screen(0, 'describe_filled', 'cut')
    f.shot(0, 'device_hero', from_=-0.75, to=-0.35)
    f.shot(2.6, 'device_front', blend=1.4, from_=1.45, to=1.12)
    f.go(3.4, 'describe_filled', 'build', 'press', then='build_1')
    f.go(4.6, 'build_1', 'step1', 'press', then='build_2', how='fade', note='C6')
    f.go(5.5, 'build_1', 'step2', 'press', then='build_3', how='fade', note='E6')
    f.go(6.4, 'build_1', 'step3', 'press', then='preview', note='G6')
    f.end(8.0)


def product(f):
    """A physical product on a pedestal: it turns, explodes into its parts, callouts (~7 s)."""
    f.product(model=None, explode=(1.4, 2.8), callouts=[(3.0, 'ring', 'Glows when power is cheap'), (3.5, 'board', 'Reads your meter'), (4.0, 'battery', 'Two-year battery')])
    f.shot(0, 'product_orbit', from_=-0.9, to=0.5)
    f.end(7.0)


def problem(f):
    """The problem as cards popping up, then swept away: an opener (~4.5 s)."""
    f.card_beat(PROBLEM, 0.3, every=0.5, out=3.3)
    f.shot(0, 'studio_mid')
    f.end(4.4)


def logo(f):
    """A logo sting: the tile rises, the mark shines, the wordmark (~3.9 s)."""
    f.logo(at=0.2)


CLIPS = {'film': film, 'walkthrough': walkthrough, 'device': device, 'product': product, 'problem': problem, 'logo': logo}

if __name__ == '__main__':
    import sys

    run(sys.modules[__name__], CLIPS)
