"""The film's sound, all synthesized (numpy, scipy, pedalboard): no samples, nothing to license.
Reads every event from build/<clip>/timeline.json and lands each hit on its video frame. Writes
build/<clip>/sound.wav (48 kHz stereo, 24-bit) and build/<clip>/sound_onsets.json.

  python3 sound.py <clip>          the clip's mix: effects, plus music and voice when it has them
  python3 sound.py <clip> --stem   effects only, for a clip that goes into a narrated pitch

Music: a cute lo-fi score at the timeline's BPM. In the studio a warm pad; while the hero talks about
the problem, A minor with a hesitant pluck; when it says how the product fixes it, the chords
brighten and hats tick up to the jump. The beat drops as the hero lands in the app (kick, snare,
hats, a rubbery bass on MUSIC's chord loop, glassy FM keys on the off-beats, the bed pumping with
the kick). It filters down as the hero leaves the app, a riser lifts into the logo, a brass stab
on MUSIC's final chord lands on the splash and rings out to the fade. The voice sits on top: music
and effects duck under it, then a compressor and a limiter at -1 dBFS.
"""
import json
import os
import sys

import numpy as np
import soundfile as sf
from pedalboard import Compressor, Limiter, Pedalboard, Reverb, LowpassFilter
from scipy.signal import butter, sosfilt

HERE = os.path.dirname(os.path.abspath(__file__))
CLIP = next((a for a in sys.argv[1:] if not a.startswith('--')), 'film')
STEM = '--stem' in sys.argv
TL = json.load(open(os.path.join(HERE, 'build', CLIP, 'timeline.json')))
SR = TL['sr']
FPS = TL['fps']
DUR = TL['duration']
N = int(round(DUR * SR))
BEAT = 60 / TL['bpm']
rng = np.random.default_rng(2026)

MUSIC_ON = TL['music'].get('on', False) and not STEM
DROP = TL['music'].get('drop', 0.0)  # the groove starts (the character landing in the app)
SPLASH = TL['finale'].get('splash')
MORPH = TL['finale'].get('morph')
LINES = {ln['id']: ln for ln in TL['lines']}

# ---------- building blocks ----------


def t_(dur):
    return np.arange(int(dur * SR)) / SR


def env_exp(dur, decay, attack=0.002):
    t = t_(dur)
    a = np.clip(t / attack, 0, 1) if attack > 0 else 1
    return a * np.exp(-t / decay)


def sine(freq, dur, phase=0):
    """freq: a number or an array (a sweep), Hz."""
    f = np.broadcast_to(np.asarray(freq, dtype=float), (int(dur * SR),))
    return np.sin(2 * np.pi * np.cumsum(f) / SR + phase)


def saw(freq, dur):
    f = np.broadcast_to(np.asarray(freq, dtype=float), (int(dur * SR),))
    ph = np.cumsum(f) / SR
    return 2 * (ph - np.floor(ph + 0.5))


def noise(dur):
    return rng.standard_normal(int(dur * SR))


def filt(x, kind, f, order=2):
    nyq = SR / 2
    if kind == 'band':
        sos = butter(order, [max(20, f[0]) / nyq, min(f[1], nyq * 0.98) / nyq], btype='band', output='sos')
    else:
        sos = butter(order, min(f, nyq * 0.98) / nyq, btype=kind, output='sos')
    return sosfilt(sos, x)


def sweep(f0, f1, dur, curve='exp'):
    u = np.linspace(0, 1, int(dur * SR))
    return f0 * (f1 / f0) ** u if curve == 'exp' else f0 + (f1 - f0) * u


def note(n):
    """'C4' → Hz."""
    names = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}
    name, octave = n[:-1], int(n[-1])
    return 440 * 2 ** ((names[name] + 12 * (octave + 1) - 69) / 12)


def frame_sample(t):
    """The first sample of the video frame the event lands on."""
    return int(round(round(t * FPS) / FPS * SR))


def place(bus, x, t, gain=1.0, pan=0.0, exact=False):
    i = int(round(t * SR)) if exact else frame_sample(t)
    if i >= N or len(x) == 0:
        return
    x = x[: N - i] * gain
    l = np.cos((pan + 1) * np.pi / 4)
    r = np.sin((pan + 1) * np.pi / 4)
    bus[0, i : i + len(x)] += x * l * 1.414
    bus[1, i : i + len(x)] += x * r * 1.414


# ---------- the effects ----------


def _mix(*xs):
    n = max(len(x) for x in xs)
    out = np.zeros(n)
    for x in xs:
        out[: len(x)] += x
    return out


def boing(big=False):
    d = 0.42 if big else 0.32
    f0, f1 = (150, 520) if big else (220, 660)
    t = t_(d)
    f = sweep(f0, f1, d) * (1 + 0.06 * np.sin(2 * np.pi * 22 * t))
    return sine(f, d) * np.exp(-t / (d * 0.55)) * np.clip(t / 0.006, 0, 1) * 0.55


def whoosh():
    d = 0.5
    t = t_(d)
    x = noise(d)
    lo = filt(x, 'band', (300, 1200))
    hi = filt(x, 'band', (1200, 5000))
    bell = np.sin(np.pi * t / d) ** 2
    return (lo * (1 - t / d) + hi * (t / d)) * bell * 0.45


def pomf():
    thud = filt(noise(0.18), 'low', 380) * env_exp(0.18, 0.04) * 1.2
    body = sine(sweep(110, 70, 0.15), 0.15) * env_exp(0.15, 0.05) * 0.6
    return _mix(thud, body)


def click():
    cap = filt(noise(0.03), 'band', (2000, 6000)) * env_exp(0.03, 0.004)
    res = sine(1250, 0.05) * env_exp(0.05, 0.012) * 0.5
    low = sine(240, 0.05) * env_exp(0.05, 0.01) * 0.4
    return _mix(cap, res, low) * 0.8


def blip():
    return sine(sweep(1200, 1900, 0.07), 0.07) * env_exp(0.07, 0.03) * 0.28


def thwack():
    hit = filt(noise(0.2), 'band', (200, 2200)) * env_exp(0.2, 0.035) * 1.1
    body = sine(sweep(220, 120, 0.2), 0.2) * env_exp(0.2, 0.06) * 0.8
    metal = sine(1760, 0.5) * env_exp(0.5, 0.1) * 0.12 + sine(2640, 0.5) * env_exp(0.5, 0.07) * 0.08
    return _mix(hit, body, metal)


def glock(freq, dur=1.4, gain=0.35):
    partials = [(1, 1.0, 0.6), (2.76, 0.35, 0.25), (5.4, 0.18, 0.12), (8.93, 0.08, 0.06)]
    return sum(sine(freq * r, dur) * env_exp(dur, d, 0.001) * a for r, a, d in partials) * gain


def ding(n):
    return glock(note(n))


def yay():
    out = np.zeros(int(0.5 * SR))
    for k, (f0, f1) in enumerate([(700, 1300), (900, 1700), (1000, 2100)]):
        c = sine(sweep(f0, f1, 0.09), 0.09) * np.sin(np.linspace(0, np.pi, int(0.09 * SR))) * 0.25
        s = int(k * 0.11 * SR)
        out[s : s + len(c)] += c
    return out


def flip():
    whoomp = filt(noise(0.35), 'band', (250, 1400)) * np.sin(np.linspace(0, np.pi, int(0.35 * SR))) ** 2 * 0.35
    glass = sine(sweep(900, 2600, 0.3), 0.3) * env_exp(0.3, 0.12) * 0.12
    return _mix(whoomp, glass)


def pop_in():
    return sine(sweep(560, 980, 0.08), 0.08) * env_exp(0.08, 0.035) * 0.35


def riser(d):
    t = t_(d)
    x = filt(noise(d), 'band', (600, 6000)) * (t / d) ** 2 * 0.25
    tone = sine(sweep(220, 880, d), d) * (t / d) ** 2.5 * 0.12
    return x + tone


def splash():
    hit = filt(noise(1.4), 'band', (300, 9000)) * env_exp(1.4, 0.25) * 0.55
    boom = sine(sweep(80, 40, 1.2), 1.2) * env_exp(1.2, 0.4, 0.003) * 0.8
    magic = np.zeros(int(1.6 * SR))
    for k, n in enumerate(['C6', 'E6', 'G6', 'C7', 'E7']):
        g = glock(note(n), 1.2, 0.16)
        s = int(k * 0.05 * SR)
        magic[s : s + len(g)] += g[: len(magic) - s]
    return _mix(hit, boom, magic)


def sparkle():
    out = np.zeros(int(0.9 * SR))
    for _ in range(18):
        f = rng.uniform(3000, 8000)
        g = sine(f, 0.25) * env_exp(0.25, 0.05) * rng.uniform(0.03, 0.09)
        s = int(rng.uniform(0, 0.6) * SR)
        out[s : s + len(g)] += g[: len(out) - s]
    return out


def shimmer():
    out = np.zeros(int(1.8 * SR))
    for k, n in enumerate(['G5', 'C6', 'E6', 'G6', 'C7']):
        g = glock(note(n), 1.4, 0.12)
        s = int(k * 0.07 * SR)
        out[s : s + len(g)] += g[: len(out) - s]
    return _mix(out, sparkle())


def clunk():
    """A big studio light switching on."""
    click_ = filt(noise(0.02), 'high', 2500) * env_exp(0.02, 0.003) * 0.8
    thunk = filt(noise(0.3), 'low', 500) * env_exp(0.3, 0.06) * 1.3
    hum = (sine(100, 1.2) * 0.12 + sine(200, 1.2) * 0.05) * env_exp(1.2, 0.5, 0.01)
    return _mix(click_, thunk, hum)


def wake():
    """A cute startled 'bwip!'."""
    return _mix(sine(sweep(480, 1400, 0.16), 0.16) * env_exp(0.16, 0.08) * 0.35, sine(sweep(900, 2100, 0.12), 0.12) * env_exp(0.12, 0.05) * 0.15)


def card(i=0):
    """A notification popping up, a semitone off: something's wrong."""
    a, b = [('E5', 'F5'), ('C#5', 'D5'), ('A#4', 'B4'), ('F#5', 'G5')][i % 4]
    out = np.zeros(int(0.7 * SR))
    g1, g2 = glock(note(a), 0.55, 0.16), glock(note(b), 0.55, 0.13)
    out[: len(g1)] += g1
    s0 = int(0.08 * SR)
    out[s0 : s0 + len(g2)] += g2[: len(out) - s0]
    return _mix(out, pop_in() * 0.6)


def swat():
    hit = filt(noise(0.15), 'band', (400, 3000)) * env_exp(0.15, 0.03) * 0.9
    body = sine(sweep(300, 140, 0.15), 0.15) * env_exp(0.15, 0.05) * 0.5
    return _mix(hit, body)


def power_on():
    """The big screen switching on: a click, a rising hum, a soft glassy whine."""
    d = 0.9
    tt = t_(d)
    click_ = filt(noise(0.02), 'high', 3000) * env_exp(0.02, 0.003)
    hum = filt(saw(sweep(45, 110, d), d), 'low', 600) * np.clip(tt / 0.2, 0, 1) * np.exp(-tt / 0.5) * 0.25
    whine = sine(sweep(1800, 6200, d), d) * np.clip(tt / 0.1, 0, 1) * np.exp(-tt / 0.35) * 0.05
    return _mix(click_, hum, whine)


def glass():
    """Through the screen's glass: a bubbly bloop with a shimmer."""
    bloop = sine(sweep(260, 900, 0.18), 0.18) * env_exp(0.18, 0.09) * 0.45
    return _mix(bloop, sparkle() * 0.7, filt(noise(0.4), 'band', (2000, 8000)) * env_exp(0.4, 0.1) * 0.12)


def step(k=0):
    """A tiny squeaky footstep."""
    f = 920 if k % 2 else 760
    return _mix(sine(sweep(f, f * 0.7, 0.05), 0.05) * env_exp(0.05, 0.015) * 0.22, filt(noise(0.03), 'band', (2000, 5000)) * env_exp(0.03, 0.006) * 0.12)


def type_(k=0):
    """A key going in: a keycap click and a little rising tick."""
    tick = sine(1500 + 70 * (k % 7), 0.04) * env_exp(0.04, 0.012) * 0.18
    return _mix(click() * 0.75, tick)


def morph():
    """The screen shrinking into the icon: a swirl up."""
    d = 1.0
    tt = t_(d)
    x = filt(noise(d), 'band', (900, 6000)) * np.sin(np.pi * tt / d) ** 2 * 0.25
    tone = sine(sweep(400, 1600, d), d) * np.sin(np.pi * tt / d) ** 2 * 0.06
    return _mix(x, tone)


SFX = {
    'clunk': (clunk, 0.9),
    'wake': (wake, 0.8),
    'swat': (swat, 0.8),
    'power_on': (power_on, 0.8),
    'glass': (glass, 0.8),
    'morph': (morph, 0.7),
    'glide': (lambda: filt(noise(0.22), 'band', (1500, 5000)) * np.sin(np.linspace(0, np.pi, int(0.22 * SR))) ** 2 * 0.12, 0.6),
    'whoosh': (whoosh, 0.6),
    'pomf': (pomf, 0.7),
    'click': (click, 0.8),
    'blip': (blip, 0.7),
    'thwack': (thwack, 0.9),
    'yay': (yay, 0.8),
    'flip': (flip, 0.8),
    'pop_in': (pop_in, 0.8),
    'splash': (splash, 1.0),
    'sparkle': (sparkle, 0.8),
    'shimmer': (shimmer, 0.7),
}

# ---------- the music ----------


def kick():
    return _mix(sine(sweep(130, 45, 0.4), 0.4) * env_exp(0.4, 0.13, 0.001), filt(noise(0.01), 'high', 3000) * 0.3 * env_exp(0.01, 0.002))


def snare():
    body = sine(sweep(220, 180, 0.15), 0.15) * env_exp(0.15, 0.05) * 0.5
    sn = filt(noise(0.25), 'band', (1500, 7500)) * env_exp(0.25, 0.07) * 0.7
    return _mix(body, sn)


def hat(open_=False):
    d = 0.18 if open_ else 0.05
    return filt(noise(d), 'high', 7500) * env_exp(d, 0.05 if open_ else 0.012) * 0.35


def bass(freq, dur):
    t = t_(dur)
    # Rubbery: a quick pitch dip into the note and a filter that closes.
    f = freq * (1 - 0.18 * np.exp(-t / 0.03))
    x = saw(f, dur) * 0.5 + sine(f, dur) * 0.8
    x = filt(x, 'low', 900) * np.clip(t / 0.005, 0, 1) * np.exp(-t / (dur * 0.9))
    return np.tanh(x * 1.6) * 0.5


def fm_key(freq, dur):
    t = t_(dur)
    index = 2.2 * np.exp(-t / 0.15)
    mod = np.sin(2 * np.pi * freq * 3.5 * t) * index
    return np.sin(2 * np.pi * freq * t + mod) * env_exp(dur, 0.35, 0.002) * 0.16


def pad(freqs, dur, gain=0.08):
    t = t_(dur)
    x = sum(saw(f * d, dur) for f in freqs for d in (0.997, 1.003))
    x = filt(x, 'low', 1200)
    a = np.clip(t / 0.4, 0, 1) * np.clip((dur - t) / 0.4, 0, 1)
    return x * a * gain / len(freqs)


MUSIC = TL.get('music', {})
PROG = MUSIC.get('progression', ['F', 'G', 'Am', 'C'])
FINAL = MUSIC.get('final', ['C4', 'E4', 'G4', 'C5', 'E5'])
FLATS = {'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#'}


def triad(name):
    """'Am' → the chord's root (octave 2, for the bass) and its three notes from octave 3, in Hz."""
    minor = name.endswith('m')
    root = name[:-1] if minor else name
    root = FLATS.get(root, root)
    r = note(f'{root}3')
    return r / 2, [r, r * 2 ** ((3 if minor else 4) / 12), r * 2 ** (7 / 12)]


def intro(bed, melodic, drums, light):
    """The studio part of a character film: a warm pad once the light is on; A minor and a
    hesitant pluck under the problem; brighter chords and ticking hats up to the jump."""
    p0, f0 = LINES['problem']['at'], LINES['fix']['at']
    place(bed, pad(triad('F')[1], p0 - light + 0.4, 0.05), light, exact=True)
    place(bed, pad(triad('Am')[1], f0 - p0 + 0.4, 0.055), p0, exact=True)
    plucks = ['A4', 'C5', 'E5', 'B4', 'A4', 'E5', 'D5', 'C5']
    t, k = p0 + BEAT / 2, 0
    while t < f0 - 0.2:
        place(melodic, fm_key(note(plucks[k % len(plucks)]), 0.7) * 1.4, t, pan=0.2 * ((k % 3) - 1), exact=True)
        t += BEAT * (1.5 if k % 3 == 2 else 1)
        k += 1
    half = (DROP - f0) / 2
    place(bed, pad(triad('F')[1], half + 0.3, 0.06), f0, exact=True)
    place(bed, pad(triad('G')[1], half + 0.3, 0.065), f0 + half, exact=True)
    power = TL.get('power', DROP - 1)
    t = power
    while t < DROP - 0.01:
        place(drums, hat() * 0.5, t, pan=0.25, exact=True)
        t += BEAT / 2
    place(bed, riser(max(0.4, DROP - power)) * 0.5, power, exact=True)


def music():
    drums = np.zeros((2, N))
    melodic = np.zeros((2, N))
    bed = np.zeros((2, N))
    kicks = []
    bar_len = 4 * BEAT
    end_beat = SPLASH or DUR  # the groove stops on the splash
    light = TL['stage'].get('light')
    if light is not None and 'problem' in LINES and 'fix' in LINES:
        intro(bed, melodic, drums, light)
    # The drop: bar by bar from the character landing in the app (or the start).
    bar = 0
    start = DROP
    while start < end_beat - 0.01:
        root, chord = triad(PROG[bar % len(PROG)])
        bar_end = min(start + bar_len, end_beat)
        place(bed, pad([f * 2 for f in chord], bar_end - start + 0.3, 0.07), start, exact=True)
        for b in range(4):
            tb = start + b * BEAT
            if tb >= end_beat - 0.01:
                break
            if b in (0, 2) or (b == 3 and bar % 2):
                place(drums, kick(), tb, gain=0.95, exact=True)
                kicks.append(tb)
            if b in (1, 3):
                place(drums, snare(), tb, gain=0.6, pan=-0.05, exact=True)
            for h in range(2):
                th = tb + h * BEAT / 2
                if th < end_beat:
                    place(drums, hat(open_=(h == 1 and b == 3)), th, gain=0.55 if h else 0.4, pan=0.3, exact=True)
            # Bass: root on 1, a bounce on the "and" of 2, the fifth on 4.
            pattern = {0: (root, 0.45), 1: None, 2: (root * 2, 0.22), 3: (root * 1.5, 0.4)}
            if pattern[b]:
                f, d = pattern[b]
                place(melodic, bass(f, d), tb, gain=0.8, exact=True)
            if b == 1:
                place(melodic, bass(root, 0.2), tb + BEAT / 2, gain=0.6, exact=True)
            # Glassy keys on the off-beats.
            for i, f in enumerate(chord):
                place(melodic, fm_key(f * 2, 0.45), tb + BEAT / 2, gain=0.8, pan=-0.3 + 0.3 * i, exact=True)
        bar += 1
        start += bar_len
    # Pump the bed and keys with the kick.
    pump = np.ones(N)
    for k in kicks:
        i = int(k * SR)
        n = min(int(0.35 * SR), N - i)
        pump[i : i + n] = np.minimum(pump[i : i + n], 1 - 0.55 * np.exp(-np.arange(n) / (0.09 * SR)))
    bed *= pump
    melodic[:, :] = melodic * (0.6 + 0.4 * pump)
    mix = drums + melodic + bed
    if MORPH:
        # Leaving the app: the music sinks under a closing filter, then the riser lifts it.
        lo_start, lo_end = MORPH[0] - 0.7, MORPH[1]
        sos = butter(2, 900 / (SR / 2), btype='low', output='sos')
        seg0 = int(lo_start * SR)
        seg1 = min(int(SPLASH * SR), N)
        for ch in range(2):
            x = mix[ch, seg0:seg1]
            w = np.clip((np.arange(len(x)) / SR) / (lo_end - lo_start), 0, 1)
            mix[ch, seg0:seg1] = x * (1 - w) + sosfilt(sos, x) * w * 0.8
        place(mix, riser(SPLASH - MORPH[0]), MORPH[0], gain=0.7, exact=True)
    if not SPLASH:
        return mix + filt((rng.random(N) < 0.0007) * rng.standard_normal(N) * 0.08, 'band', (1500, 6000))
    # A brass stab on the final chord at the splash that rings out.
    d = DUR - SPLASH
    tt = t_(d)
    stab = np.zeros(len(tt))
    for n in FINAL:
        f = note(n)
        x = sum(saw(f * dt, d) for dt in (0.996, 1.0, 1.004))
        cutoff = 400 + 3800 * np.exp(-tt / 0.25)
        # A brassy "bwah": the filter opens, then closes slowly as the chord rings.
        x = filt(x, 'low', 2400) * (0.35 + 0.65 * np.exp(-tt / 0.6))
        stab += x * (cutoff / 4200)
    stab *= np.clip(tt / 0.012, 0, 1) * (0.45 + 0.55 * np.exp(-tt / 0.5)) * 0.07
    place(mix, stab, SPLASH, gain=1.0)
    place(mix, pad([note(n) / 2 for n in FINAL[:4]], d, 0.09), SPLASH, gain=1.0)
    # Lo-fi: a little vinyl crackle all the way.
    crackle = (rng.random(N) < 0.0007) * rng.standard_normal(N) * 0.08
    mix += filt(crackle, 'band', (1500, 6000))
    return mix


# ---------- mix ----------


def voice_bus():
    v = np.zeros((2, N))
    for ln in TL['lines']:
        x, sr = sf.read(os.path.join(HERE, ln['wav']), dtype='float32')
        if x.ndim > 1:
            x = x.mean(axis=1)
        assert sr == SR, f"{ln['id']} is {sr} Hz"
        place(v, x, ln['at'], gain=0.95, exact=True)
    v = Pedalboard([Reverb(room_size=0.18, wet_level=0.08, dry_level=1.0, width=0.6)])(v.astype(np.float32), SR)
    return v


def main():
    sfx = np.zeros((2, N))
    onsets = []
    for e in TL['sfx']:
        kind = e['kind']
        if kind in ('brass', 'riser'):
            continue  # part of the music
        if kind == 'boing':
            x, g = boing(e.get('big', False)), 0.8
        elif kind == 'ding':
            x, g = ding(e['note']), 0.9
        elif kind == 'card':
            x, g = card(e.get('i', 0)), 0.75
        elif kind == 'step':
            x, g = step(e.get('k', 0)), 0.6
        elif kind == 'type':
            x, g = type_(e.get('k', 0)), 0.7
        else:
            fn, g = SFX[kind]
            x = fn()
        pan = float(np.clip(rng.normal(0, 0.25), -0.6, 0.6))
        place(sfx, x, e['t'], gain=g, pan=pan)
        onsets.append((e['t'], kind, frame_sample(e['t'])))
    mus = music() if MUSIC_ON else np.zeros((2, N))
    voice = voice_bus() if not STEM else np.zeros((2, N))
    # Duck the music and effects under the voice.
    env = np.abs(voice).max(axis=0)
    k = int(0.12 * SR)
    smooth = np.convolve(env, np.ones(k) / k, mode='same')
    duck = 1 - 0.5 * np.clip(smooth / (smooth.max() or 1) * 3, 0, 1)
    mus_b = mus * 0.62 * duck
    sfx_b = sfx * 0.75 * (0.75 + 0.25 * duck)
    mix = mus_b + sfx_b + voice * 1.0
    # Voice over the bed while the hero speaks (dB), so the words always read.
    talking = smooth > 0.02 * smooth.max()
    if talking.any():
        rms = lambda x: np.sqrt(np.mean(x[:, talking] ** 2)) + 1e-9  # noqa: E731
        print(f"voice vs music+effects while talking: {20 * np.log10(rms(voice) / rms(mus_b + sfx_b)):+.1f} dB")
    # The end: the clip's fade, if it has one.
    if TL['finale'].get('end_fade'):
        f0, f1 = TL['finale']['end_fade']
        mix *= np.clip((f1 - np.arange(N) / SR) / (f1 - f0), 0, 1)
    master = Pedalboard([Compressor(threshold_db=-14, ratio=2.5, attack_ms=8, release_ms=120), Limiter(threshold_db=-1.0, release_ms=80)])
    out = master(mix.astype(np.float32), SR)
    peak = np.max(np.abs(out))
    ceiling = 10 ** (-1.0 / 20)
    if peak > ceiling:
        out *= ceiling / peak
    out = out[:, :N]
    assert out.shape == (2, N), out.shape
    path = os.path.join(HERE, 'build', CLIP, 'sfx.wav' if STEM else 'sound.wav')
    sf.write(path, out.T, SR, subtype='PCM_24')
    peak_db = 20 * np.log10(np.max(np.abs(out)))
    print(f"→ {path}: {out.shape[1] / SR:.3f} s, {SR} Hz stereo, peak {peak_db:.2f} dBFS, {len(onsets)} effects on their frames")
    json.dump([{'t': t, 'kind': k, 'sample': s} for t, k, s in onsets], open(os.path.join(HERE, 'build', CLIP, 'sound_onsets.json'), 'w'), indent=0)


if __name__ == '__main__':
    main()
