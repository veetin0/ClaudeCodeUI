"""The 3D kit's library: builds a clip's timeline from the beats in story.py. Don't edit this file
for a project; story.py is yours.

A clip is a list of beats in seconds: what's on the app's screen and what presses, types and walks
on it, what the camera does, what's said, and, derived from those, every sound cue. Each clip
writes build/<clip>/timeline.json, which the Three.js scene and sound.py read. check() enforces the
rules (above all: every press changes the screen).

The shot types (a clip can combine them):
  app       the real app filling the frame (f.app); a 3D cursor or the character navigates it
  device    the app on a laptop or a phone (f.device)
  product   a physical product turning, exploding into parts, with callouts (f.product)
  cards     cards popping up in 3D: the problem, stats (f.card_beat)
  logo      the screen shrinking into the app icon, or the tile rising; the mark (f.outro*, f.logo)
  film      the character film: intro, the app, outro (f.intro, f.enter, f.outro)
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
FPS = 30
BPM = 120
SR = 48000
S = 0.01  # world units per UI pixel on the monitor


def layout():
    path = os.path.join(HERE, 'build', 'ui_layout.json')
    if not os.path.exists(path):
        sys.exit('Run capture_ui.mjs first (it writes build/ui_layout.json).')
    return json.load(open(path))


def voices():
    path = os.path.join(HERE, 'build', 'voice.json')
    return json.load(open(path)) if os.path.exists(path) else {}


class Film:
    """Collects one clip's beats: moves, actions, screen changes, lines, face keys, camera shots."""

    def __init__(self, name, story):
        self.name = name
        self.story = story
        self.V = voices()
        self.uses = set()
        self.moves, self.actions, self.states, self.camera, self.face, self.cards = [], [], [], [], [], []
        self.lines = {}
        self.navigator = None
        self.at = 'pedestal'
        self.U = None
        self.L = {}
        self.typing = {}
        self.extra = {}
        self.cfg = {}
        self.finale = {}
        self.duration = None

    # ----- what the clip shows -----
    def app(self, navigator='cursor', mode='monitor', start=None):
        """The app's real screens. navigator: 'cursor' (a 3D pointer), 'hero' (the character) or
        None (the camera alone). mode: 'monitor' (the app fills the frame) or 'device' (call
        f.device too). start: the UI point the cursor starts at."""
        self.U = layout()
        self.L = self.U['states']
        self.typing = self.U.get('typing', {})
        self.uses |= {'screen', 'fx'}
        self.cfg['screen'] = {'mode': mode}
        if navigator:
            self.uses.add(navigator)
            self.navigator = navigator
        if navigator == 'cursor':
            px, py = self.U['px']
            self.at = {'ui': list(start or [px * 0.62, py * 0.72])}
        if mode == 'monitor':
            sh = self.U['px'][1] * S
            self.stage(pedestal=navigator == 'hero', floor_y=-sh / 2 - 0.25, at=[0, -sh / 2 - 0.25 + 0.55, 5.2])
        return self

    def stage(self, pedestal=False, light=None, floor_y=-1.2, at=None, spot=14):
        """The studio: a floor, a pedestal (at: where its top is), a spotlight (light: when it
        clunks on; None = lit from the start)."""
        self.uses.add('stage')
        old = self.cfg.get('stage', {})
        anchor = at or [0, floor_y + 0.55, 0]
        self.cfg['stage'] = {
            'floor_y': floor_y,
            'anchor': anchor,  # where the pedestal's top is (shots and cards use it even without one)
            'pedestal': pedestal,
            'light': light if light is not None else old.get('light'),
            'spot': spot,
            'dim': old.get('dim', []),
        }
        return self

    def device(self, kind='laptop', open=(0.3, 1.4), **kw):
        """The app on a device: kind 'laptop' (the lid opens over `open`) or 'phone' (rises in and
        floats; capture the app at a phone viewport). kw: width/height, color, angle, turn, at."""
        self.uses |= {'device'}
        if 'stage' not in self.cfg:
            self.stage(spot=0)  # a spotlight blows out the lid's edge
        self.cfg['device'] = {'kind': kind, 'open': list(open), **kw}
        return self

    def power(self, t):
        """The screen switches on at t (a bright line opening into the picture)."""
        self.extra['power'] = round(t, 3)

    def product(self, model=None, explode=None, collapse=None, callouts=(), **kw):
        """A physical product: `model` (a .glb path in the film folder; None = the demo sensor),
        explode=(t0, t1) spreads its parts, collapse=(t0, t1) brings them back, callouts=[(t,
        part name, text), ...]. kw: height, gap, spin (rad/s), parts (names, bottom to top)."""
        self.uses |= {'product'}
        if 'stage' not in self.cfg:
            self.stage(pedestal=True, spot=6)  # a soft spot: light tops blow out under a strong one
        self.cfg['product'] = {
            'model': model,
            'explode': list(explode) if explode else None,
            'collapse': list(collapse) if collapse else None,
            'callouts': [{'t': round(t, 3), 'part': p, 'text': x} for t, p, x in callouts],
            **kw,
        }
        return self

    def card_beat(self, texts, t0, every=0.55, out=None, at=None):
        """Cards that pop up one after another from t0 (and fly off at `out`)."""
        self.uses.add('cards')
        if 'stage' not in self.cfg:
            self.stage()
        base = len(self.cards)
        for i, text in enumerate(texts):
            self.cards.append({'t': round(t0 + i * every, 3), 'text': text, 'i': base + i, **({'out': round(out + 0.04 * i, 3)} if out else {})})
        if at:
            self.extra['cards_at'] = at

    # ----- lines, faces, camera, screens -----
    def say(self, line_id, at):
        ln = next(x for x in self.story.LINES if x['id'] == line_id)
        v = self.V.get(line_id, {})
        self.lines[line_id] = {**ln, 'at': round(at, 3), 'seconds': v.get('seconds'), 'rate': v.get('rate', 60), 'mouth': v.get('mouth'), 'wav': f'build/voice/{line_id}.wav'}
        if self.navigator == 'hero':
            self.mood(at - 0.1, ln.get('mood', 'happy'))
        return at + (v.get('seconds') or len(ln['text'].split()) / 2.7)

    def mood(self, t, mood):
        self.face.append({'t': round(t, 3), 'mood': mood})

    def shot(self, t, shot, blend=0.9, **kw):
        if 'from_' in kw:
            kw['from'] = kw.pop('from_')
        self.camera.append({'t': round(t, 3), 'shot': shot, 'blend': blend, **kw})

    def screen(self, t, name, how='fade'):
        self.states.append({'t': round(t, 3), 'screen': name, 'how': how})

    # ----- moving on the app -----
    def spot(self, state, target, typing=False):
        """Where the navigator goes on a target. The character stands on its top edge (for typing
        near the start of the text); the cursor points at its middle (for typing at the start)."""
        r = self.L[state][target]
        x = r['x'] + min(r['w'] * 0.3, 240) if typing else r['x'] + r['w'] / 2
        if self.navigator == 'cursor':
            x = r['x'] + min(r['w'] * 0.12, 60) if typing else x
            return {'ui': [round(x, 1), round(r['y'] + r['h'] / 2, 1)]}, r
        return {'ui': [round(x, 1), r['y']]}, r

    def move(self, t0, t1, to, kind='hop', h=1.0, glass=False):
        self.moves.append({'t0': round(t0, 3), 't1': round(t1, 3), 'from': self.at, 'to': to, 'kind': kind, 'h': h, 'glass': glass})
        self.at = to

    def travel(self, to):
        """How long the trip from where the navigator is to `to` takes, and how it goes there."""
        a, b = self.at, to
        if not (isinstance(a, dict) and isinstance(b, dict)):
            return 0.9, 'hop'
        dx, dy = b['ui'][0] - a['ui'][0], b['ui'][1] - a['ui'][1]
        dist = (dx * dx + dy * dy) ** 0.5
        if dist < 4:
            return 0, 'none'
        if self.navigator == 'cursor':
            return min(0.95, 0.35 + dist / 2400), 'glide'
        if abs(dy) < 14 and abs(dx) < 800:
            return max(0.4, abs(dx) / 520), 'walk'
        return 0.45 + min(0.25, dist / 4000), 'hop'

    def go(self, t, state, target, does='press', then=None, how=None, **kw):
        """Go to `target` on `state`'s screen, arrive at `t`, and act: press (a click, or the
        character's stomp and hammer), stamp (a big hit with sparks), type (the field's captured
        text going in), cheer (the character's wave and confetti), or None (just go there).
        then='screen' changes the screen as the action lands (how: flip = a new step rippling out
        from the press, fade = the same screen updating). note='C6' adds a rising ding; chips=
        [(state, target), ...] flies files into those zones."""
        hero = self.navigator == 'hero'
        to, rect = self.spot(state, target, typing=does == 'type')
        dur, kind = self.travel(to)
        if kind != 'none' and self.navigator:
            self.move(t - dur, t, to, kind, h=kw.pop('h', 1.0 if kind == 'hop' else 0))
            if kind == 'hop':
                self.face.append({'t': round(t - dur - 0.25, 3), 'look': 'move'})
        kw.pop('h', None)
        if 'chips' in kw:
            kw['chips'] = [self.L[s][g] for s, g in kw['chips']]
        act = {'t': round(t, 3), 'does': does, 'state': state, 'target': target, 'rect': rect, **kw}
        end = t + {'press': 0.35, 'stamp': 0.5, 'cheer': 1.1}.get(does, 0.2)
        if does == 'type':
            ty = self.typing.get(state, {})
            act.update({'clip': ty.get('clip'), 'steps': ty.get('steps', []), 'tap': kw.get('tap', 0.2 if hero else 0.16)})
            act['start'] = round(t + 0.2, 3)
            end = act['start'] + len(act['steps']) * act['tap']
            if self.cfg.get('screen', {}).get('mode') == 'monitor':
                # The camera frames the start of the field while the text goes in.
                c = act['clip'] or rect
                w = min(c['w'], 1000)
                self.shot(t - 0.1, 'focus', blend=0.7, rect=[c['x'] - 40, c['y'] - 150, w + 80, min(c['h'], 260) + 190])
                self.shot(end - 0.05, 'follow', blend=0.7, zoom=2.3 if hero else 2.0)
            if hero:
                self.mood(t + 0.05, 'focused')
                self.face.append({'t': round(t + 0.05, 3), 'look': [0, -0.9]})
                self.face.append({'t': round(end + 0.05, 3), 'look': 'camera'})
                self.mood(end + 0.1, 'happy')
        if hero and does in ('press', 'stamp'):
            self.face.append({'t': round(t - 0.02, 3), 'mood': 'excited', 'burst': 0.5})
        if hero and does == 'cheer':
            self.mood(t, 'joy')
        act['end'] = round(end, 3)
        self.actions.append(act)
        if then:
            when = end + 0.05 if does == 'type' else t + 0.02
            self.screen(when, then, how or ('fade' if does == 'type' else 'flip'))
        return end

    # ----- the character film -----
    def intro(self, light=0.5, problem=None):
        """The studio: lights on, the character wakes, says hello, talks about the problem (the
        cards pop up), swats it away, the screen powers on. Returns when the jump in can start."""
        problem = problem if problem is not None else self.story.PROBLEM
        self.mood(0, 'sleep')
        self.cfg['stage']['light'] = light
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
        swat = end + 0.25
        self.card_beat(problem, p0 + 0.3, every=span / max(1, len(problem)), out=swat)
        self.actions.append({'t': round(swat, 3), 'does': 'swat', 'end': round(swat + 0.5, 3)})
        self.mood(swat - 0.25, 'focused')
        self.shot(swat + 0.3, 'studio_talk', blend=0.8)
        end = self.say('fix', swat + 0.45)
        self.power(swat + 0.9)
        return end + 0.15

    def enter(self, t0, state, target, dur=1.0, typing=False):
        """The jump into the app: through the screen's glass onto `target` (lands at t0 + dur)."""
        to, _ = self.spot(state, target, typing)
        self.face.append({'t': round(t0 - 0.3, 3), 'look': 'move'})
        self.mood(t0 - 0.3, 'excited')
        self.move(t0, t0 + dur, to, 'hop', h=1.2, glass=True)
        self.shot(t0 - 0.1, 'screen', blend=0.9)
        self.shot(t0 + dur + 0.35, 'follow', blend=1.0, zoom=2.3)
        self.extra['drop'] = round(t0 + dur, 3)
        self.cfg['stage']['dim'].append([t0 + dur, 1e9])
        return t0 + dur

    def outro(self, at, line='logo'):
        """Back out of the screen onto the pedestal; the screen shrinks into the app icon; the
        character dives in and becomes the mark; the wordmark; a fade."""
        self.uses.add('logo')
        self.mood(at - 0.3, 'happy')
        self.move(at, at + 0.8, 'pedestal', 'hop', h=1.8, glass=True)
        self.shot(at - 0.15, 'out', blend=1.1)
        morph = [at + 0.75, at + 1.85]
        self.cfg['stage']['dim'][-1][1] = morph[0]
        self.move(at + 2.0, at + 2.65, 'logo', 'hop', h=1.0)
        self.face.append({'t': round(at + 1.7, 3), 'look': 'move'})
        self.mood(at + 1.75, 'excited')
        splash = round(at + 2.65, 3)
        self.shot(at + 1.25, 'logo', blend=1.2)
        duration = round(splash + 3.4, 2)
        if line:
            self.say(line, splash + 0.3)
        self.finale = {'morph': morph, 'splash': splash, 'emblem': [splash, splash + 0.6], 'wordmark': round(splash + 0.7, 3), 'end_fade': [duration - 0.5, duration]}
        self.duration = duration

    # ----- endings without a character -----
    def outro_screen(self, at, hold=2.6):
        """The monitor pulls back and shrinks into the app icon; the mark shines; the wordmark."""
        self.uses.add('logo')
        self.shot(at, 'out', blend=1.0)
        morph = [at + 0.5, at + 1.6]
        self.shot(at + 1.0, 'logo', blend=1.2)
        splash = round(morph[1] + 0.25, 3)
        duration = round(splash + hold, 2)
        self.finale = {'morph': morph, 'splash': splash, 'wordmark': round(splash + 0.45, 3), 'end_fade': [duration - 0.5, duration]}
        self.extra['logo_at'] = [0, -2.0, 3.2]
        self.duration = duration

    def logo(self, at=0.2, hold=2.6):
        """The tile rises into the shot, the mark shines, the wordmark: a logo sting."""
        self.uses.add('logo')
        if 'stage' not in self.cfg:
            self.stage()
        rise = [at, at + 0.8]
        splash = round(at + 1.05, 3)
        duration = round(splash + hold, 2)
        self.shot(0, 'logo')
        self.finale = {'rise': rise, 'splash': splash, 'wordmark': round(splash + 0.45, 3), 'end_fade': [duration - 0.5, duration]}
        self.extra['logo_at'] = [0, 0.4, 0]
        self.duration = duration

    def end(self, duration, fade=0.4):
        """The clip's length, with a short fade to black (fade=0: a hard cut, for a pitch edit)."""
        self.duration = round(duration, 2)
        if fade:
            self.finale.setdefault('end_fade', [self.duration - fade, self.duration])

    # ----- the timeline -----
    def assemble(self):
        st = self.story
        lines = sorted(self.lines.values(), key=lambda x: x['at'])
        moves = self.moves
        sfx = []
        add = lambda t, kind, **kw: sfx.append({'t': round(t, 4), 'kind': kind, **kw})  # noqa: E731
        stage = self.cfg.get('stage', {})
        if stage.get('light') is not None:
            add(stage['light'], 'clunk')
        for c in self.cards:
            add(c['t'], 'card', i=c['i'])
        if 'power' in self.extra:
            add(self.extra['power'], 'power_on')
        for m in moves:
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
            elif m['kind'] == 'glide':
                add(m['t0'] + 0.04, 'glide')
            if m['glass']:
                add(m['t0'] + (m['t1'] - m['t0']) * (0.88 if m['to'] != 'pedestal' else 0.12), 'glass')
        for a in self.actions:
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
        states = sorted(self.states, key=lambda s: s['t'])
        for s in states[1:]:
            add(s['t'] + 0.02, 'flip' if s['how'] == 'flip' else 'pop_in')
        dev = self.cfg.get('device')
        if dev:
            add(dev['open'][0], 'whoosh')
            if dev['kind'] == 'laptop':
                add(dev['open'][1] - 0.05, 'click')
        prod = self.cfg.get('product')
        if prod:
            if prod.get('explode'):
                add(prod['explode'][0], 'whoosh')
                add(prod['explode'][1] - 0.1, 'pop_in')
            if prod.get('collapse'):
                add(prod['collapse'][0], 'whoosh')
                add(prod['collapse'][1], 'pomf')
            for c in prod['callouts']:
                add(c['t'], 'blip')
        fin = self.finale
        if fin.get('morph'):
            add(fin['morph'][0], 'morph')
        if fin.get('rise'):
            add(fin['rise'][0], 'whoosh')
        if fin.get('splash'):
            add(fin['splash'], 'splash')
            add(fin['splash'] + 0.4, 'sparkle')
        if fin.get('wordmark'):
            add(fin['wordmark'], 'shimmer')
        music = {**st.MUSIC, **self.cfg.get('music', {})}
        music.setdefault('drop', self.extra.get('drop', 0.0))

        tl = {
            'clip': self.name,
            'uses': sorted(self.uses),
            'fps': FPS,
            'bpm': BPM,
            'sr': SR,
            'duration': self.duration,
            'frames': int(round(self.duration * FPS)),
            'hero': st.HERO,
            'app': st.APP,
            'logo': st.LOGO,
            'set': st.SET,
            'music': music,
            'stage': stage,
            'lines': lines,
            'face': sorted(self.face, key=lambda x: x['t']),
            'cards': self.cards,
            'moves': moves,
            'actions': sorted(self.actions, key=lambda a: a['t']),
            'states': states,
            'camera': sorted(self.camera, key=lambda c: c['t']),
            'finale': self.finale,
            'sfx': sorted(sfx, key=lambda s: s['t']),
        }
        if self.U:
            tl['ui'] = {'px': self.U['px'], 'screens': {s: f'build/ui/{s}.png' for s in self.U['states']}, 'layout': self.L}
            tl['screen'] = self.cfg['screen']
        for k in ('power', 'cards_at', 'logo_at'):
            if k in self.extra:
                tl[k] = self.extra[k]
        if dev:
            tl['device'] = dev
        if prod:
            tl['product'] = prod
        return tl


def check(tl):
    """The rules. Returns the problems found (empty = good)."""
    problems = []
    d = tl['duration']
    if not d:
        problems.append('the clip has no length: end it with f.end(seconds), f.outro(...) or f.logo(...)')
        return problems
    for a, b in zip(tl['moves'], tl['moves'][1:]):
        if b['t0'] < a['t1'] - 1e-6:
            problems.append(f"move to {b['to']} starts at {b['t0']}, before the last one ends ({a['t1']})")
    busy = [(a['t'], a['end'], a) for a in tl['actions'] if a['does'] in ('press', 'stamp', 'type', 'cheer')]
    for m in tl['moves']:
        for t0, t1, a in busy:
            if t0 + 0.05 < m['t0'] < t1 - 0.05:
                problems.append(f"it leaves for {m['to']} at {m['t0']} while still busy with {a['does']} on {a.get('target')} (until {t1})")
        if not (0 <= m['t0'] < m['t1'] <= d):
            problems.append(f"move to {m['to']} ({m['t0']}–{m['t1']}) is outside the clip")
    for a in tl['actions']:
        if a['does'] in ('press', 'stamp') and not any(0 <= s['t'] - a['t'] < 0.1 for s in tl['states']):
            problems.append(f"{a['does']} on {a['target']} at {a['t']} changes nothing (give it then='<screen>')")
        if a['does'] == 'type' and not a.get('steps'):
            problems.append(f"typing on {a['state']} has no captured steps (ui_states.mjs: type: {{ target, text }})")
    if 'screen' in tl['uses']:
        if not tl['states'] or tl['states'][0]['t'] != 0:
            problems.append('the first screen must start at 0 (f.screen(0, name, "cut"))')
        for s in tl['states']:
            if s['screen'] not in tl['ui']['screens']:
                problems.append(f"no captured screen {s['screen']} (ui_states.mjs)")
    if not tl['camera'] or tl['camera'][0]['t'] > 0:
        problems.append('the camera needs a shot at 0 (f.shot(0, ...))')
    for ln in tl['lines']:
        if ln['seconds'] is None:
            problems.append(f"line {ln['id']} has no voice yet: run voice.py")
    for a, b in zip(tl['lines'], tl['lines'][1:]):
        if a['seconds'] and a['at'] + a['seconds'] > b['at'] - 0.1:
            problems.append(f"line {a['id']} ({a['seconds']} s from {a['at']}) runs into {b['id']} at {b['at']}")
    fade = tl['finale'].get('end_fade')
    if tl['lines'] and fade:
        last = tl['lines'][-1]
        if last['seconds'] and last['at'] + last['seconds'] > fade[0]:
            problems.append(f"the last line ends at {last['at'] + last['seconds']:.2f}, after the fade starts")
    for s in tl['sfx']:
        if not 0 <= s['t'] <= d:
            problems.append(f"sound {s['kind']} at {s['t']} is outside the clip")
    return problems


def run(story, clips):
    """`python3 story.py <clip>` (or `all`): build, check and write build/<clip>/timeline.json."""
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    names = list(clips) if not args or args[0] == 'all' else args
    bad = 0
    for name in names:
        if name not in clips:
            sys.exit(f"no clip '{name}' (clips: {', '.join(clips)})")
        f = Film(name, story)
        clips[name](f)
        tl = f.assemble()
        problems = check(tl)
        for p in problems:
            print(f'✗ {name}: {p}')
        bad += len(problems)
        os.makedirs(os.path.join(HERE, 'build', name), exist_ok=True)
        out = os.path.join(HERE, 'build', name, 'timeline.json')
        json.dump(tl, open(out, 'w'), indent=1)
        print(f"{'✓' if not problems else '!'} {name}: {', '.join(tl['uses'])}; {len(tl['actions'])} actions, {len(tl['lines'])} lines, {len(tl['sfx'])} sound cues, {tl['duration']} s = {tl['frames']} frames → build/{name}/timeline.json")
    sys.exit(1 if bad and '--force' not in sys.argv else 0)
