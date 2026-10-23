"""Forge shows Harness: the film's single source of truth (made from HackForge's mascot template).

The story: the hero wakes up in a studio, says hello and talks about the problem while it pops up
around it as cards, swats it away, and jumps into the app on the big screen behind it. Inside, the
app fills the frame and the hero lives on it: it walks and hops from element to element, types into
fields and presses buttons, and every action changes the screen. At the end it hops back out, the
screen shrinks into the app's icon, and the hero dives in and becomes the logo.

Everything happens here, in seconds and in UI pixels of the captured window (1920×1080). voice.py
speaks the LINES (first: the intro is laid out around their real durations), capture_ui.mjs provides
the screens, the target rectangles and the typing steps, and the Three.js scene and sound.py both
read build/timeline.json, which `python3 timeline.py` writes after check() passes.

The rule of the film: every action changes something. A press or stamp without a screen change
fails the check; cut it or give it a `then=` screen.

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
# HERO: the character (scene/hero.js holds its shape and face). The body must read as `color`.
# `size` is its height on the app in world units (1 = 100 UI px).
HERO = {'name': 'Forge', 'color': '#EE8A4A', 'dark': '#1D1410', 'size': 1.0, 'prop': {'head': '#4A403B', 'handle': '#8A5A3C'}}
# APP: the product the hero explains (the screens come from ui_states.mjs).
APP = {'name': 'Harness'}
# LOGO: the app icon the screen shrinks into. `icon` is an optional image of the app's current mark
# (transparent PNG, e.g. 'assets/icon.png'), shown on the tile at `icon_scale` of its size until
# the hero dives in; then the hero's silhouette in `emblem` colour becomes the mark.
LOGO = {'tile': '#D97757', 'tile_top': '#EC9472', 'emblem': '#FFFFFF', 'icon': 'assets/harness-mark.png', 'icon_scale': 1.0, 'wordmark': 'Harness', 'tagline': 'Your whole team. One run.'}
# SET: the studio around the screen. `haze` is depth fog: a little reads as a studio.
SET = {'studio': '#120C0A', 'haze': 0.008}
# MUSIC: the chord loop once the hero is in the app, and the chord the logo lands on.
MUSIC = {'progression': ['F', 'G', 'Am', 'C'], 'final': ['C4', 'E4', 'G4', 'C5', 'E5']}

# ---------- the voice (voice.py) ----------
# engine: kokoro (offline, free), elevenlabs (ELEVENLABS_API_KEY and voice_id), own (recordings/
# <id>.wav) or silent (timing only). semitones pitches Kokoro up for a small, cute character.
VOICE = {'engine': 'kokoro', 'voice': 'af_heart', 'speed': 1.08, 'semitones': 3.5, 'lang': 'en-us', 'voice_id': None}
# mood: the face while the line is spoken (face.js MOODS). intro() places hi, problem and fix,
# build() places the rest with f.say(id, time), outro() places logo.
LINES = [
    {'id': 'hi', 'text': "Hi! I'm Forge!", 'mood': 'happy'},
    {'id': 'problem', 'text': "Hackathons are chaos. Five people, five Claudes, and nobody knows who's doing what.", 'mood': 'worried'},
    {'id': 'fix', 'text': 'Harness fixes that. Come on!', 'mood': 'excited'},
    {'id': 'team', 'text': 'Type your name, press Start, and your friends join with one command.', 'mood': 'happy'},
    {'id': 'setup', 'text': 'Type in the challenge and drop the files.', 'mood': 'happy'},
    {'id': 'plan', 'text': 'Claude makes the plan. You say go!', 'mood': 'excited'},
    {'id': 'run', 'text': "Everyone's Claude builds at once, and Harness keeps time.", 'mood': 'proud'},
    {'id': 'done', 'text': 'Done!', 'mood': 'joy'},
    {'id': 'logo', 'text': 'Harness. Your whole team, one run.', 'mood': 'proud', 'caption': False},
]
# PROBLEM: the cards that pop up around the hero while it talks about the problem.
PROBLEM = ["Who's on the API?", 'Merge conflict!', 'Out of usage', '36 h left']


def layout():
    path = os.path.join(HERE, 'build', 'ui_layout.json')
    if not os.path.exists(path):
        sys.exit('Run capture_ui.mjs first (it writes build/ui_layout.json).')
    return json.load(open(path))


def voices():
    path = os.path.join(HERE, 'build', 'voice.json')
    return json.load(open(path)) if os.path.exists(path) else {}


class Film:
    """Collects moves, actions, screen changes, lines, face keys and camera shots."""

    def __init__(self, U, V):
        self.L = U['states']
        self.typing = U.get('typing', {})
        self.V = V
        self.moves, self.actions, self.states, self.camera, self.face, self.cards = [], [], [], [], [], []
        self.lines = {}
        self.at = 'pedestal'  # where the hero stands
        self.extra = {}

    # ----- lines -----
    def say(self, line_id, at):
        ln = next(x for x in LINES if x['id'] == line_id)
        v = self.V.get(line_id, {})
        self.lines[line_id] = {**ln, 'at': round(at, 3), 'seconds': v.get('seconds'), 'rate': v.get('rate', 60), 'mouth': v.get('mouth'), 'wav': f'build/voice/{line_id}.wav'}
        self.mood(at - 0.1, ln.get('mood', 'happy'))
        return at + (v.get('seconds') or len(ln['text'].split()) / 2.7)

    def mood(self, t, mood):
        self.face.append({'t': round(t, 3), 'mood': mood})

    def shot(self, t, shot, blend=0.9, **kw):
        self.camera.append({'t': round(t, 3), 'shot': shot, 'blend': blend, **kw})

    def screen(self, t, name, how='fade'):
        self.states.append({'t': round(t, 3), 'screen': name, 'how': how})

    # ----- moving -----
    def spot(self, state, target, typing=False):
        """Where the hero stands on a target: the middle of its top edge, or for typing near the
        start of the text (top left), so the words appear right under it."""
        r = self.L[state][target]
        x = r['x'] + min(r['w'] * 0.3, 240) if typing else r['x'] + r['w'] / 2
        return {'ui': [round(x, 1), r['y']]}, r

    def move(self, t0, t1, to, kind='hop', h=1.0, glass=False):
        self.moves.append({'t0': round(t0, 3), 't1': round(t1, 3), 'from': self.at, 'to': to, 'kind': kind, 'h': h, 'glass': glass})
        self.at = to

    def travel(self, to):
        """How long the trip from where the hero stands to `to` takes, and whether it walks."""
        a, b = self.at, to
        if not (isinstance(a, dict) and isinstance(b, dict)):
            return 0.9, 'hop'
        dx, dy = b['ui'][0] - a['ui'][0], b['ui'][1] - a['ui'][1]
        dist = (dx * dx + dy * dy) ** 0.5
        if dist < 4:
            return 0, 'none'
        if abs(dy) < 14 and abs(dx) < 800:
            return max(0.4, abs(dx) / 520), 'walk'
        return 0.45 + min(0.25, dist / 4000), 'hop'

    def go(self, t, state, target, does='press', then=None, how=None, **kw):
        """Travel to `target` on `state`'s screen and land there at `t`, then act:
        press (stomp and hammer), stamp (a big hit with sparks), type (hammer taps while the text
        appears: the field's captured steps), cheer (a wave and confetti), or None (just go there).
        then='screen' changes the screen as the action lands (how: flip = a new step rippling out
        from the press, fade = the same screen updating). note='C6' adds a rising ding; chips=
        [(state, target), ...] flies chips into those zones."""
        to, rect = self.spot(state, target, typing=does == 'type')
        dur, kind = self.travel(to)
        if kind != 'none':
            self.move(t - dur, t, to, kind, h=kw.pop('h', 1.0 if kind == 'hop' else 0))
            if kind == 'hop':
                self.face.append({'t': round(t - dur - 0.25, 3), 'look': 'move'})
        if 'chips' in kw:
            kw['chips'] = [self.L[s][g] for s, g in kw['chips']]
        act = {'t': round(t, 3), 'does': does, 'state': state, 'target': target, 'rect': rect, **kw}
        end = t + {'press': 0.35, 'stamp': 0.5, 'cheer': 1.1}.get(does, 0.2)
        if does == 'type':
            ty = self.typing.get(state, {})
            act.update({'clip': ty.get('clip'), 'steps': ty.get('steps', []), 'tap': kw.get('tap', 0.2)})
            act['start'] = round(t + 0.2, 3)
            end = act['start'] + len(act['steps']) * act['tap']
            self.mood(t + 0.05, 'focused')
            # The camera frames the start of the field (and the hero on it) while the text goes in.
            c = act['clip'] or rect
            w = min(c['w'], 1000)
            self.shot(t - 0.1, 'focus', blend=0.7, rect=[c['x'] - 40, c['y'] - 150, w + 80, min(c['h'], 260) + 190])
            self.shot(end - 0.05, 'follow', blend=0.7, zoom=2.3)  # settled before the next landing
            self.face.append({'t': round(t + 0.05, 3), 'look': [0, -0.9]})
            self.face.append({'t': round(end + 0.05, 3), 'look': 'camera'})
            self.mood(end + 0.1, 'happy')
        if does in ('press', 'stamp'):
            self.face.append({'t': round(t - 0.02, 3), 'mood': 'excited', 'burst': 0.5})
        if does == 'cheer':
            self.mood(t, 'joy')
        act['end'] = round(end, 3)
        self.actions.append(act)
        if then:
            when = end + 0.05 if does == 'type' else t + 0.02
            self.screen(when, then, how or ('fade' if does == 'type' else 'flip'))
        return end

    # ----- the parts every film has -----
    def intro(self, light=0.5):
        """The studio: lights on, the hero wakes, says hello, talks about the problem (the cards
        pop up), swats it away, the screen powers on, the hero jumps in. Returns when it lands."""
        self.mood(0, 'sleep')
        self.extra['light'] = light
        wake = light + 0.75
        self.actions.append({'t': wake, 'does': 'wake', 'end': wake + 0.4})
        self.mood(wake, 'surprised')
        self.shot(0, 'studio_wide')
        self.shot(light + 0.1, 'studio_talk', blend=1.4)
        end = self.say('hi', wake + 0.55)
        self.actions.append({'t': round(wake + 0.65, 3), 'does': 'wave', 'end': round(wake + 1.5, 3)})
        p0 = end + 0.35
        end = self.say('problem', p0)
        self.shot(p0 + 0.15, 'studio_mid', blend=1.0)
        span = max(1.0, end - p0 - 0.4)
        for i, text in enumerate(PROBLEM):
            self.cards.append({'t': round(p0 + 0.3 + i * span / len(PROBLEM), 3), 'text': text, 'i': i})
        swat = end + 0.25
        for c in self.cards:
            c['out'] = round(swat + 0.04 * c['i'], 3)
        self.actions.append({'t': round(swat, 3), 'does': 'swat', 'end': round(swat + 0.5, 3)})
        self.mood(swat - 0.25, 'focused')
        self.shot(swat + 0.3, 'studio_talk', blend=0.8)
        end = self.say('fix', swat + 0.45)
        self.extra['power'] = round(swat + 0.9, 3)
        return end + 0.15

    def enter(self, t0, state, target, dur=1.0, typing=False):
        """The jump into the app: through the screen's glass onto `target` (lands at t0 + dur).
        typing=True when the first thing it does there is type."""
        to, _ = self.spot(state, target, typing)
        self.face.append({'t': round(t0 - 0.3, 3), 'look': 'move'})
        self.mood(t0 - 0.3, 'excited')
        self.move(t0, t0 + dur, to, 'hop', h=1.2, glass=True)
        self.shot(t0 - 0.1, 'screen', blend=0.9)
        self.shot(t0 + dur + 0.35, 'follow', blend=1.0, zoom=2.3)
        self.extra['drop'] = round(t0 + dur, 3)
        return t0 + dur

    def outro(self, at):
        """Back out of the screen onto the pedestal; the screen shrinks into the app icon; the hero
        dives in and becomes the mark; the wordmark; a fade."""
        self.mood(at - 0.3, 'happy')
        self.move(at, at + 0.8, 'pedestal', 'hop', h=1.8, glass=True)
        self.shot(at - 0.15, 'out', blend=1.1)
        morph = [at + 0.75, at + 1.85]
        self.move(at + 2.0, at + 2.65, 'logo', 'hop', h=1.0)
        self.face.append({'t': round(at + 1.7, 3), 'look': 'move'})
        self.mood(at + 1.75, 'excited')
        splash = round(at + 2.65, 3)
        self.shot(at + 1.25, 'logo', blend=1.2)
        duration = round(splash + 3.4, 2)
        self.say('logo', splash + 0.3)
        self.finale = {'morph': morph, 'splash': splash, 'emblem': [splash, splash + 0.6], 'wordmark': round(splash + 0.7, 3), 'end_fade': [duration - 0.5, duration]}
        self.duration = duration


def build():
    U = layout()
    f = Film(U, voices())

    # ---------- BEATS ----------
    start = f.intro()
    A = f.enter(start, 'team_start', 'name', typing=True)  # lands in the app
    f.screen(0, 'team_start', 'cut')
    # Team: type your name, Start, copy the join command, everyone's ready, Continue.
    f.say('team', A + 0.1)
    f.go(A + 0.05, 'team_start', 'name', 'type', then='team_named')
    f.go(A + 1.95, 'team_named', 'start', 'press', then='team_waiting')
    f.go(A + 3.0, 'team_waiting', 'copy', 'press', then='team_one', how='fade')
    f.screen(A + 3.6, 'team_ready', 'fade')
    f.go(A + 4.6, 'team_ready', 'continue', 'press', then='setup_empty')
    # Setup: type the challenge, stamp the files in, Continue.
    f.say('setup', A + 4.95)
    f.go(A + 5.65, 'setup_empty', 'challenge', 'type', then='setup_typed')
    f.go(A + 9.0, 'setup_typed', 'files', 'stamp', then='setup_ready', how='fade', chips=[('setup_typed', 'files')] * 3 + [('setup_typed', 'private')])
    f.go(A + 10.40, 'setup_ready', 'continue', 'press', then='plan')
    # Plan: go.
    f.say('plan', A + 10.70)
    f.go(A + 12.25, 'plan', 'accept', 'stamp', then='run_m1')
    # Run: the milestones fill one by one.
    f.say('run', A + 13.05)
    f.shot(A + 12.85, 'follow', blend=1.0, zoom=1.9)
    f.go(A + 13.60, 'run_m1', 'm1', 'press', then='run_m2', how='fade', note='C6')
    f.go(A + 14.65, 'run_m1', 'm2', 'press', then='run_m3', how='fade', note='E6')
    f.go(A + 15.70, 'run_m1', 'm3', 'press', then='run_finish', how='fade', note='G6')
    f.go(A + 16.75, 'run_m1', 'finish', 'press', then='done', note='C7')
    # Done.
    f.go(A + 17.85, 'done', 'trophy', 'cheer')
    f.say('done', A + 18.00)
    f.outro(A + 19.55)

    return assemble(f, U)


def assemble(f, U):
    lines = sorted(f.lines.values(), key=lambda x: x['at'])
    face = sorted(f.face, key=lambda x: x['t'])
    # Sound cues, all from the events (sound.py turns each kind into synthesis).
    sfx = []
    add = lambda t, kind, **kw: sfx.append({'t': round(t, 4), 'kind': kind, **kw})  # noqa: E731
    add(f.extra['light'], 'clunk')
    for c in f.cards:
        add(c['t'], 'card', i=c['i'])
    add(f.extra['power'], 'power_on')
    for m in f.moves:
        if m['kind'] == 'hop':
            add(m['t0'], 'boing', big=m['h'] >= 1.5)
            if m['h'] >= 1.5:
                add(m['t0'] + 0.05, 'whoosh')
            if m['to'] != 'logo':
                add(m['t1'], 'pomf')
        elif m['kind'] == 'walk':
            n = max(2, int((m['t1'] - m['t0']) / 0.16))
            for k in range(n):
                add(m['t0'] + k * (m['t1'] - m['t0']) / n, 'step', k=k)
        if m['glass']:
            # Through the screen's glass: near the end going in, near the start coming out.
            add(m['t0'] + (m['t1'] - m['t0']) * (0.88 if m['to'] != 'pedestal' else 0.12), 'glass')
    for a in f.actions:
        t = a['t']
        if a['does'] == 'press':
            add(t + 0.01, 'click')
            add(t + 0.04, 'blip')
        elif a['does'] == 'stamp':
            add(t + 0.01, 'thwack')
            add(t + 0.03, 'blip')
        elif a['does'] == 'type':
            for k in range(len(a['steps'])):
                add(a['start'] + k * a['tap'], 'type', k=k)
        elif a['does'] == 'cheer':
            add(t + 0.1, 'yay')
        elif a['does'] == 'wake':
            add(t, 'wake')
        elif a['does'] == 'swat':
            add(t, 'whoosh')
            add(t + 0.12, 'swat')
        if a.get('note'):
            add(t + 0.02, 'ding', note=a['note'])
    states = sorted(f.states, key=lambda s: s['t'])
    for s in states[1:]:
        add(s['t'] + 0.02, 'flip' if s['how'] == 'flip' else 'pop_in')
    fin = f.finale
    add(fin['morph'][0], 'morph')
    add(fin['splash'], 'splash')
    add(fin['emblem'][1] - 0.2, 'sparkle')
    add(fin['wordmark'], 'shimmer')

    return {
        'fps': FPS,
        'bpm': BPM,
        'sr': SR,
        'duration': f.duration,
        'frames': int(round(f.duration * FPS)),
        'hero': HERO,
        'app': APP,
        'logo': LOGO,
        'set': SET,
        'music': {**MUSIC, 'drop': f.extra['drop']},
        'ui': {'px': U['px'], 'screens': {s: f'build/ui/{s}.png' for s in U['states']}, 'layout': U['states']},
        'light': f.extra['light'],
        'power': f.extra['power'],
        'cards': f.cards,
        'moves': f.moves,
        'actions': sorted(f.actions, key=lambda a: a['t']),
        'states': states,
        'lines': lines,
        'face': face,
        'sfx': sorted(sfx, key=lambda s: s['t']),
        'camera': sorted(f.camera, key=lambda c: c['t']),
        'finale': fin,
    }


def check(tl):
    problems = []
    d = tl['duration']
    for a, b in zip(tl['moves'], tl['moves'][1:]):
        if b['t0'] < a['t1'] - 1e-6:
            problems.append(f"move to {b['to']} takes off at {b['t0']}, before the last one lands ({a['t1']})")
    busy = [(a['t'], a['end'], a) for a in tl['actions'] if a['does'] in ('press', 'stamp', 'type', 'cheer')]
    for m in tl['moves']:
        for t0, t1, a in busy:
            if t0 + 0.05 < m['t0'] < t1 - 0.05:
                problems.append(f"the hero leaves for {m['to']} at {m['t0']} while it's still busy with {a['does']} on {a.get('target')} (until {t1})")
    for m in tl['moves']:
        if not (0 <= m['t0'] < m['t1'] <= d):
            problems.append(f"move to {m['to']} ({m['t0']}–{m['t1']}) is outside the film")
    for a in tl['actions']:
        # Every action changes something.
        if a['does'] in ('press', 'stamp') and not any(0 <= s['t'] - a['t'] < 0.1 for s in tl['states']):
            problems.append(f"{a['does']} on {a['target']} at {a['t']} changes nothing (give it then='<screen>')")
        if a['does'] == 'type' and not a.get('steps'):
            problems.append(f"typing on {a['state']} has no captured steps (ui_states.mjs: type: {{ target, text }})")
    if not tl['states'] or tl['states'][0]['t'] != 0:
        problems.append('the first screen must start at 0')
    for s in tl['states']:
        if s['screen'] not in tl['ui']['screens']:
            problems.append(f"no captured screen {s['screen']} (ui_states.mjs)")
    for ln in tl['lines']:
        if ln['seconds'] is None:
            problems.append(f"line {ln['id']} has no voice yet: run voice.py")
    for a, b in zip(tl['lines'], tl['lines'][1:]):
        if a['seconds'] and a['at'] + a['seconds'] > b['at'] - 0.1:
            problems.append(f"line {a['id']} ({a['seconds']} s from {a['at']}) runs into {b['id']} at {b['at']}")
    last = tl['lines'][-1]
    if last['seconds'] and last['at'] + last['seconds'] > tl['finale']['end_fade'][0]:
        problems.append(f"the last line ends at {last['at'] + last['seconds']:.2f}, after the fade starts")
    for s in tl['sfx']:
        if not 0 <= s['t'] <= d:
            problems.append(f"sound {s['kind']} at {s['t']} is outside the film")
    return problems


if __name__ == '__main__':
    tl = build()
    problems = check(tl)
    for p in problems:
        print('✗', p)
    os.makedirs(os.path.join(HERE, 'build'), exist_ok=True)
    out = os.path.join(HERE, 'build', 'timeline.json')
    json.dump(tl, open(out, 'w'), indent=1)
    print(f"{'✓' if not problems else '!'} {len(tl['moves'])} moves, {len(tl['actions'])} actions, {len(tl['states'])} screens, {len(tl['lines'])} lines, {len(tl['sfx'])} sound cues, {tl['duration']} s = {tl['frames']} frames → {out}")
    sys.exit(1 if problems and '--force' not in sys.argv else 0)
