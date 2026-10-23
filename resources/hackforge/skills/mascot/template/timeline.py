"""The film's single source of truth.

Everything happens here, in seconds and in UI pixels of the captured window (1920×1080): the voice
lines, every hop, press and screen change, the finale, the camera and, derived from those, every
sound cue. voice.py speaks the LINES, capture_ui.mjs provides the screens and the target
rectangles, and the Three.js scene and sound.py both read build/timeline.json, which
`python3 timeline.py` writes after check() passes.

The rule of the film: every hop lands on something that changes the screen. A press or stamp
without a screen change within 0.1 s fails the check; cut the hop or add the change.

Order: python3 voice.py → node capture_ui.mjs → python3 timeline.py (it needs both).
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
FPS = 30
BPM = 120
SR = 48000

# ---------- BRAND: swap these for your product ----------
# HERO: the character (scene/hero.js holds its shape). The body must read as `color` on screen.
HERO = {'name': 'Forge', 'color': '#EE8A4A', 'dark': '#1D1410', 'prop': {'head': '#4A403B', 'handle': '#8A5A3C'}}
# APP: the product the hero explains (the screens come from ui_states.mjs).
APP = {'name': 'Tinker'}
# LOGO: the app icon the hero dives into. `icon` is an optional image shown on the tile before the
# dive (e.g. 'assets/icon.png'); the hero's flat silhouette in `emblem` colour becomes the mark.
LOGO = {'tile': '#D97757', 'tile_top': '#EC9472', 'emblem': '#FFFFFF', 'icon': None, 'wordmark': 'Tinker', 'tagline': 'Apps, one hop away.'}
# SET: the studio the screens float in. `haze` is depth fog: a little reads as a studio, more greys
# the whole frame.
SET = {'studio': '#120C0A', 'haze': 0.011}
# MUSIC: the chord loop under the hops and the chord the logo lands on (sound.py).
MUSIC = {'progression': ['F', 'G', 'Am', 'C'], 'final': ['C4', 'E4', 'G4', 'C5', 'E5']}

# ---------- the voice (voice.py) ----------
# engine: kokoro (offline, free), elevenlabs (needs ELEVENLABS_API_KEY and voice_id), own (your
# recordings in recordings/<id>.wav) or silent (timing only). semitones pitches Kokoro up for a
# small, cute character.
VOICE = {'engine': 'kokoro', 'voice': 'af_heart', 'speed': 1.08, 'semitones': 3.5, 'lang': 'en-us', 'voice_id': None}
LINES = [
    {'id': 'hi', 'at': 2.25, 'text': "Hi! I'm Forge!"},
    {'id': 'describe', 'at': 3.9, 'text': 'Tell Tinker what you want.'},
    {'id': 'build', 'at': 6.0, 'text': 'I hammer out every piece.'},
    {'id': 'preview', 'at': 9.15, 'text': 'Check it, then publish!'},
    {'id': 'done', 'at': 11.95, 'text': "It's live!"},
    # The last line is spoken over the logo; no caption (the wordmark says it).
    {'id': 'logo', 'at': None, 'text': 'Tinker. Apps, one hop away.', 'caption': False},
]


def layout():
    path = os.path.join(HERE, 'build', 'ui_layout.json')
    if not os.path.exists(path):
        sys.exit('Run capture_ui.mjs first (it writes build/ui_layout.json).')
    return json.load(open(path))


def centre(r):
    return [round(r['x'] + r['w'] / 2, 1), round(r['y'] + r['h'] / 2, 1)]


def outro(at, panels):
    """The finale from `at`: a hop off the screen onto the floor, the panels power down and fall,
    the logo rises, the hero dives in and becomes the mark, the wordmark, a fade."""
    splash = round(at + 2.85, 3)
    hops = [
        {'t0': at, 't1': at + 0.6, 'to': [960, 1180], 'h': 1.8, 'does': 'exit', 'floor': True},
        {'t0': at + 2.15, 't1': splash, 'to': 'logo', 'h': 1.5, 'does': 'dive'},
    ]
    duration = round(splash + 3.5, 2)
    finale = {
        'panels_fall': [{'panel': p, 't': round(at + 0.2 + 0.25 * i, 3)} for i, p in enumerate(panels)],
        'logo_rise': [at + 1.15, at + 1.95],
        'splash': splash,
        'emblem': [splash, splash + 0.6],
        'wordmark': splash + 0.7,
        'end_fade': [duration - 0.5, duration],
    }
    camera = [{'t': at - 0.25, 'shot': 'pullback'}, {'t': at + 1.05, 'shot': 'logo'}]
    return hops, finale, camera, duration


def build():
    U = layout()
    L = U['states']

    def hop(t0, t1, state, target, does='press', h=1.2, **kw):
        """A hop from wherever the hero stands to `target` on `state`'s screen. does: press (a tap
        with the prop), stamp (a big hit), cheer (a wave and confetti). note='C6' adds a
        glockenspiel ding; chips=[(state, target), ...] flies chips into those zones."""
        r = L[state][target]
        if 'chips' in kw:
            kw['chips'] = [L[s][t] for s, t in kw['chips']]
        return {'t0': t0, 't1': t1, 'to': centre(r), 'rect': r, 'h': h, 'does': does, 'target': target, **kw}

    # The intro: a flat sticker on the first screen (somewhere empty) knocks twice, peels off and
    # pops into 3D.
    sticker = {'at': [1500, 820], 'knocks': [0.5, 0.85], 'peel': [1.2, 1.85], 'pop': 2.0}

    # BEATS: every hop lands on something that changes the screen.
    hops = [
        hop(3.3, 3.85, 'describe_empty', 'prompt', 'stamp', 1.5, chips=[('describe_empty', 'prompt')] * 3),
        hop(5.0, 5.5, 'describe_filled', 'build', 'press', 1.3),
        hop(6.6, 7.0, 'build_1', 'step1', note='C6'),
        hop(7.6, 8.0, 'build_1', 'step2', note='E6'),
        hop(8.6, 9.0, 'build_1', 'step3', note='G6'),
        hop(10.3, 10.8, 'preview', 'publish', 'stamp', 1.5),
        hop(11.35, 11.8, 'live', 'badge', 'cheer'),
    ]
    # Screen changes: flip = a new step (ripples out from the press), fade = the same screen updating.
    states = [
        {'t': 0.0, 'screen': 'describe_empty', 'how': 'cut'},
        {'t': 3.87, 'screen': 'describe_filled', 'how': 'fade'},
        {'t': 5.52, 'screen': 'build_1', 'how': 'flip'},
        {'t': 7.02, 'screen': 'build_2', 'how': 'fade'},
        {'t': 8.02, 'screen': 'build_3', 'how': 'fade'},
        {'t': 9.02, 'screen': 'preview', 'how': 'flip'},
        {'t': 10.82, 'screen': 'live', 'how': 'flip'},
    ]
    end_hops, finale, end_camera, duration = outro(12.9, list(U['panels']))
    hops += end_hops
    camera = [{'t': 0.0, 'shot': 'wide'}, {'t': 2.3, 'shot': 'follow'}] + end_camera

    voice = {}
    vpath = os.path.join(HERE, 'build', 'voice.json')
    if os.path.exists(vpath):
        voice = json.load(open(vpath))
    lines = []
    for ln in LINES:
        v = voice.get(ln['id'], {})
        at = ln['at'] if ln['at'] is not None else round(finale['splash'] + 0.25, 3)
        lines.append({**ln, 'at': at, 'seconds': v.get('seconds'), 'envelope': v.get('envelope', []), 'wav': f"build/voice/{ln['id']}.wav"})

    # Sound cues, all from the events above (sound.py turns each kind into synthesis).
    sfx = []
    add = lambda t, kind, **kw: sfx.append({'t': round(t, 4), 'kind': kind, **kw})  # noqa: E731
    for k in sticker['knocks']:
        add(k, 'knock')
    add(sticker['peel'][0], 'peel')
    add(sticker['pop'], 'pop')
    for h in hops:
        big = h['h'] >= 1.5
        add(h['t0'], 'boing', big=big)
        if big:
            add(h['t0'] + 0.05, 'whoosh')
        if h['does'] in ('press', 'stamp', 'cheer', 'exit'):
            add(h['t1'], 'pomf')
        if h['does'] == 'press':
            add(h['t1'] + 0.01, 'click')
            add(h['t1'] + 0.04, 'blip')
        if h['does'] == 'stamp':
            add(h['t1'] + 0.01, 'thwack')
            add(h['t1'] + 0.03, 'blip')
        if h.get('note'):
            add(h['t1'] + 0.02, 'ding', note=h['note'])
        if h['does'] == 'cheer':
            add(h['t1'] + 0.1, 'yay')
    for s in states[1:]:
        add(s['t'] + 0.02, 'flip' if s['how'] == 'flip' else 'pop_in')
    for p in finale['panels_fall']:
        add(p['t'], 'zap')
        add(p['t'] + 0.12, 'whoosh')
    add(finale['splash'], 'splash')
    add(finale['emblem'][1] - 0.2, 'sparkle')
    add(finale['wordmark'], 'shimmer')

    return {
        'fps': FPS,
        'bpm': BPM,
        'sr': SR,
        'duration': duration,
        'frames': int(round(duration * FPS)),
        'hero': HERO,
        'app': APP,
        'logo': LOGO,
        'set': SET,
        'music': MUSIC,
        'ui': {'px': U['px'], 'screens': {s: f'build/ui/{s}.png' for s in L}, 'layout': L},
        'panels': U['panels'],
        'sticker': sticker,
        'hops': hops,
        'states': states,
        'lines': lines,
        'sfx': sorted(sfx, key=lambda s: s['t']),
        'camera': camera,
        'finale': finale,
    }


def check(tl):
    problems = []
    d = tl['duration']
    prev_t1 = tl['sticker']['pop']
    for h in tl['hops']:
        name = h.get('target', h['does'])
        if not (0 <= h['t0'] < h['t1'] <= d):
            problems.append(f'hop to {name} ({h["t0"]}–{h["t1"]}) is outside the film')
        if h['t0'] < prev_t1:
            problems.append(f'hop to {name} takes off at {h["t0"]}, before the last one lands ({prev_t1})')
        prev_t1 = h['t1']
        # Every hop changes something: a screen change, or the finale.
        if h['does'] in ('press', 'stamp') and not any(abs(s['t'] - h['t1']) < 0.1 for s in tl['states']):
            problems.append(f'hop to {name} at {h["t1"]} lands on nothing that changes (no screen change within 0.1 s)')
    for a, b in zip(tl['states'], tl['states'][1:]):
        if b['t'] <= a['t']:
            problems.append(f'screen {b["screen"]} at {b["t"]} is not after {a["screen"]} at {a["t"]}')
    if tl['states'][0]['t'] != 0:
        problems.append('the first screen must start at 0')
    for s in tl['states']:
        if s['screen'] not in tl['ui']['screens']:
            problems.append(f'no captured screen {s["screen"]} (ui_states.mjs)')
    for name, r in tl['panels'].items():
        if not r:
            problems.append(f'panel {name} was not found on the first screen (ui_states.mjs panels)')
    for ln in tl['lines']:
        if ln['seconds'] is None:
            problems.append(f'line {ln["id"]} has no voice yet: run voice.py')
    for a, b in zip(tl['lines'], tl['lines'][1:]):
        if a['seconds'] and a['at'] + a['seconds'] > b['at'] - 0.1:
            problems.append(f'line {a["id"]} ({a["seconds"]} s from {a["at"]}) runs into {b["id"]} at {b["at"]}')
    last = tl['lines'][-1]
    if last['seconds'] and last['at'] + last['seconds'] > tl['finale']['end_fade'][0]:
        problems.append(f'the last line ends at {last["at"] + last["seconds"]:.2f}, after the fade starts')
    for s in tl['sfx']:
        if not 0 <= s['t'] <= d:
            problems.append(f'sound {s["kind"]} at {s["t"]} is outside the film')
    shots = [c['t'] for c in tl['camera']]
    if shots != sorted(shots):
        problems.append('camera shots are out of order')
    return problems


if __name__ == '__main__':
    tl = build()
    problems = check(tl)
    for p in problems:
        print('✗', p)
    os.makedirs(os.path.join(HERE, 'build'), exist_ok=True)
    out = os.path.join(HERE, 'build', 'timeline.json')
    json.dump(tl, open(out, 'w'), indent=1)
    print(f"{'✓' if not problems else '!'} {len(tl['hops'])} hops, {len(tl['states'])} screens, {len(tl['lines'])} lines, {len(tl['sfx'])} sound cues, {tl['duration']} s = {tl['frames']} frames → {out}")
    sys.exit(1 if problems and '--force' not in sys.argv else 0)
