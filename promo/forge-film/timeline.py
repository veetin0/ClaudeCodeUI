"""Forge shows Harness: the single source of truth for the film.

Everything happens here, in seconds and in UI pixels of the real Harness window (1920×1080): the
voice lines, every hop, press and screen change, each sound cue and the camera. voice.py speaks the
LINES, capture_ui.mjs provides the screens and the button rectangles, the Three.js scene and
sound.py both read build/timeline.json, which `python3 timeline.py` writes after checking it.

Rule of the film: every hop lands on something that changes the screen. A hop that changes nothing
is cut (check() fails on it).
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
FPS = 30
BPM = 120
SR = 48000
DURATION = 24.5
BEAT = 60 / BPM

# ---------- BRAND (swap these for another product) ----------
HERO = {
    'name': 'Forge',
    'color': '#EE8A4A',  # warm orange: the body must read as this
    'dark': '#1D1410',  # eye slits, mouth
    'hammer_head': '#4A403B',
    'hammer_handle': '#8A5A3C',
}
APP = {'name': 'Harness', 'window': [1920, 1080]}
LOGO = {'tile': '#D97757', 'tile_top': '#EC9472', 'emblem': '#FFFFFF', 'wordmark': 'Harness', 'tagline': 'Your whole team. One run.'}
SET = {'studio': '#120C0A', 'glow': '#2A1A14'}

# ---------- the voice ----------
VOICE = {'voice': 'af_heart', 'speed': 1.08, 'semitones': 3.5, 'lang': 'en-us'}
LINES = [
    {'id': 'hi', 'at': 2.25, 'text': "Hi! I'm Forge!"},
    {'id': 'team', 'at': 4.0, 'text': 'Press Start, and your friends join with one command.'},
    {'id': 'setup', 'at': 7.35, 'text': 'Drop in the challenge.'},
    {'id': 'plan', 'at': 9.85, 'text': 'Claude makes the plan. You say go!'},
    {'id': 'run', 'at': 12.45, 'text': "Everyone's Claude builds at once, and Harness keeps time."},
    {'id': 'done', 'at': 16.85, 'text': 'Done!'},
    {'id': 'logo', 'at': 21.25, 'text': 'Harness. Your whole team, one run.', 'caption': False},
]

# ---------- the screens (captured from the real app) ----------
SCREENS = ['team_start', 'team_waiting', 'team_one', 'team_ready', 'setup_empty', 'setup_ready', 'plan', 'run_m1', 'run_m2', 'run_m3', 'run_finish', 'done']


def layout():
    path = os.path.join(HERE, 'build', 'ui_layout.json')
    if not os.path.exists(path):
        sys.exit('Run capture_ui.mjs first (it writes build/ui_layout.json).')
    return json.load(open(path))['states']


def centre(rect, dy=0.0):
    return [round(rect['x'] + rect['w'] / 2, 1), round(rect['y'] + rect['h'] / 2 + dy, 1)]


def build():
    L = layout()
    T = lambda state, el: centre(L[state][el])  # noqa: E731
    R = lambda state, el: L[state][el]  # noqa: E731

    sticker = {'at': [640, 300], 'knocks': [0.5, 0.85], 'peel': [1.2, 1.85], 'pop': 2.0}

    # Hops: take-off, landing, where (UI px), how high (world units), and what the landing does.
    hops = [
        {'t0': 3.3, 't1': 3.8, 'to': T('team_start', 'start'), 'rect': R('team_start', 'start'), 'h': 1.4, 'does': 'press', 'target': 'Start'},
        {'t0': 4.55, 't1': 5.0, 'to': T('team_waiting', 'copy'), 'rect': R('team_waiting', 'copy'), 'h': 1.2, 'does': 'press', 'target': 'Copy'},
        {'t0': 6.45, 't1': 7.0, 'to': T('team_ready', 'continue'), 'rect': R('team_ready', 'continue'), 'h': 1.6, 'does': 'press', 'target': 'Continue'},
        {'t0': 7.85, 't1': 8.4, 'to': T('setup_empty', 'challenge'), 'rect': R('setup_empty', 'challenge'), 'h': 1.5, 'does': 'stamp', 'target': 'Challenge'},
        {'t0': 8.95, 't1': 9.5, 'to': T('setup_ready', 'continue'), 'rect': R('setup_ready', 'continue'), 'h': 1.6, 'does': 'press', 'target': 'Continue'},
        {'t0': 11.35, 't1': 11.9, 'to': T('plan', 'accept'), 'rect': R('plan', 'accept'), 'h': 1.5, 'does': 'stamp', 'target': 'Accept and run'},
        {'t0': 13.0, 't1': 13.4, 'to': T('run_m1', 'm1'), 'rect': R('run_m1', 'm1'), 'h': 1.1, 'does': 'press', 'target': 'M1'},
        {'t0': 14.0, 't1': 14.4, 'to': T('run_m1', 'm2'), 'rect': R('run_m1', 'm2'), 'h': 1.1, 'does': 'press', 'target': 'M2'},
        {'t0': 15.0, 't1': 15.4, 'to': T('run_m1', 'm3'), 'rect': R('run_m1', 'm3'), 'h': 1.1, 'does': 'press', 'target': 'M3'},
        {'t0': 16.0, 't1': 16.4, 'to': T('run_m1', 'finish'), 'rect': R('run_m1', 'finish'), 'h': 1.1, 'does': 'press', 'target': 'Finish'},
        {'t0': 16.95, 't1': 17.4, 'to': T('done', 'trophy'), 'rect': R('done', 'trophy'), 'h': 1.2, 'does': 'cheer', 'target': 'Trophy'},
        # Off the screen onto the studio floor, then into the logo (the finale).
        {'t0': 18.15, 't1': 18.75, 'to': [960, 1180], 'h': 1.8, 'does': 'exit', 'floor': True},
        {'t0': 20.3, 't1': 21.0, 'to': 'logo', 'h': 1.5, 'does': 'dive'},
    ]

    # Screen changes: when, which screen, how (flip = new step, fade = the same screen updating).
    states = [
        {'t': 0.0, 'screen': 'team_start', 'how': 'cut'},
        {'t': 3.82, 'screen': 'team_waiting', 'how': 'flip'},
        {'t': 5.03, 'screen': 'team_one', 'how': 'fade'},
        {'t': 5.6, 'screen': 'team_ready', 'how': 'fade'},
        {'t': 7.02, 'screen': 'setup_empty', 'how': 'flip'},
        {'t': 8.42, 'screen': 'setup_ready', 'how': 'fade'},
        {'t': 9.52, 'screen': 'plan', 'how': 'flip'},
        {'t': 11.92, 'screen': 'run_m1', 'how': 'flip'},
        {'t': 13.42, 'screen': 'run_m2', 'how': 'fade'},
        {'t': 14.42, 'screen': 'run_m3', 'how': 'fade'},
        {'t': 15.42, 'screen': 'run_finish', 'how': 'fade'},
        {'t': 16.42, 'screen': 'done', 'how': 'flip'},
    ]

    finale = {
        'panels_fall': [{'panel': 'sidebar', 't': 18.35}, {'panel': 'header', 't': 18.6}, {'panel': 'content', 't': 18.85}],
        'logo_rise': [19.3, 20.1],
        'splash': 21.0,
        'emblem': [21.0, 21.6],
        'wordmark': 21.7,
        'end_fade': [DURATION - 0.5, DURATION],
    }

    camera = [
        {'t': 0.0, 'shot': 'wide'},
        {'t': 2.3, 'shot': 'follow'},
        {'t': 17.9, 'shot': 'pullback'},
        {'t': 19.2, 'shot': 'logo'},
    ]

    voice = {}
    vpath = os.path.join(HERE, 'build', 'voice.json')
    if os.path.exists(vpath):
        voice = json.load(open(vpath))
    lines = []
    for ln in LINES:
        v = voice.get(ln['id'], {})
        lines.append({**ln, 'seconds': v.get('seconds'), 'envelope': v.get('envelope', []), 'wav': f"build/voice/{ln['id']}.wav"})

    # Sound cues, all from the events above (sound.py turns each kind into synthesis).
    sfx = []
    add = lambda t, kind, **kw: sfx.append({'t': round(t, 4), 'kind': kind, **kw})  # noqa: E731
    for k in sticker['knocks']:
        add(k, 'knock')
    add(sticker['peel'][0], 'peel')
    add(sticker['pop'], 'pop')
    milestone_notes = iter(['C6', 'E6', 'G6', 'C7'])
    for h in hops:
        big = h['h'] >= 1.5
        add(h['t0'], 'boing', big=big)
        if big:
            add(h['t0'] + 0.05, 'whoosh')
        if h['does'] in ('press', 'stamp', 'cheer'):
            add(h['t1'], 'pomf')
        if h['does'] == 'press':
            add(h['t1'] + 0.01, 'click')
            add(h['t1'] + 0.04, 'blip')
        if h['does'] == 'stamp':
            add(h['t1'] + 0.01, 'thwack')
            add(h['t1'] + 0.03, 'blip')
        if h.get('target', '').startswith(('M', 'Finish')) and h['target'] != 'M':
            add(h['t1'] + 0.02, 'ding', note=next(milestone_notes))
        if h['does'] == 'cheer':
            add(h['t1'] + 0.1, 'yay')
        if h['does'] == 'exit':
            add(h['t1'], 'pomf')
    for s in states[1:]:
        add(s['t'] + 0.02, 'flip' if s['how'] == 'flip' else 'pop_in')
    for p in finale['panels_fall']:
        add(p['t'], 'zap')
        add(p['t'] + 0.12, 'whoosh')
    add(finale['logo_rise'][0], 'riser')
    add(finale['splash'], 'splash')
    add(finale['splash'], 'brass')
    add(finale['emblem'][1] - 0.2, 'sparkle')
    add(finale['wordmark'], 'shimmer')

    return {
        'fps': FPS,
        'bpm': BPM,
        'sr': SR,
        'duration': DURATION,
        'frames': int(round(DURATION * FPS)),
        'hero': HERO,
        'app': APP,
        'logo': LOGO,
        'set': SET,
        'ui': {'px': APP['window'], 'screens': {s: f'build/ui/{s}.png' for s in SCREENS}, 'layout': L},
        'panels': {
            'sidebar': L['team_start']['sidebar'],
            'header': {'x': L['team_start']['main']['x'], 'y': 0, 'w': L['team_start']['main']['w'], 'h': L['run_m1']['stepper']['y'] + L['run_m1']['stepper']['h']},
            'content': {
                'x': L['team_start']['main']['x'],
                'y': L['run_m1']['stepper']['y'] + L['run_m1']['stepper']['h'],
                'w': L['team_start']['main']['w'],
                'h': 1080 - (L['run_m1']['stepper']['y'] + L['run_m1']['stepper']['h']),
            },
        },
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
    for h in tl['hops']:
        if not (0 <= h['t0'] < h['t1'] <= d):
            problems.append(f"hop {h} is outside the film")
        # Every hop changes something: a screen change, a press effect or the finale.
        if h['does'] in ('press', 'stamp'):
            if not any(abs(s['t'] - h['t1']) < 0.1 for s in tl['states']):
                problems.append(f"hop to {h.get('target')} at {h['t1']} lands on nothing that changes (no screen change within 0.1 s)")
    for a, b in zip(tl['lines'], tl['lines'][1:]):
        if a['seconds'] is None:
            problems.append(f"line {a['id']} has no voice yet: run voice.py")
            continue
        if a['at'] + a['seconds'] > b['at'] - 0.1:
            problems.append(f"line {a['id']} ({a['seconds']} s from {a['at']}) runs into {b['id']} at {b['at']}")
    last = tl['lines'][-1]
    if last['seconds'] and last['at'] + last['seconds'] > d - 0.3:
        problems.append(f"the last line ends at {last['at'] + last['seconds']:.2f}, after the fade")
    for s in tl['sfx']:
        if not 0 <= s['t'] <= d:
            problems.append(f"sound {s} is outside the film")
    for s in tl['states']:
        if s['screen'] not in tl['ui']['screens']:
            problems.append(f"no screen {s['screen']}")
    return problems


if __name__ == '__main__':
    tl = build()
    problems = check(tl)
    for p in problems:
        print('✗', p)
    out = os.path.join(HERE, 'build', 'timeline.json')
    json.dump(tl, open(out, 'w'), indent=1)
    print(f"{'✓' if not problems else '!'} {len(tl['hops'])} hops, {len(tl['states'])} screens, {len(tl['lines'])} lines, {len(tl['sfx'])} sound cues, {tl['frames']} frames → {out}")
    sys.exit(1 if problems and '--force' not in sys.argv else 0)
