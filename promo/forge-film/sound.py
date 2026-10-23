"""The film's sound, all synthesized (numpy, scipy, pedalboard): no samples. Reads every event from
build/timeline.json and lands each hit on its video frame. Writes build/sound.wav (48 kHz stereo).

Music: a cute lo-fi beat at 120 BPM. Before the pop only a soft pad and ticking hats; the beat drops
on the pop (kick, snare, hats, a rubbery bass on F G Am C, glassy FM keys on the off-beats, the bed
pumping with the kick). It filters down as the screens power off, a riser lifts into the logo, a C
major brass stab lands on the splash and the chord rings out to a 0.5 s fade.
"""
import json
import os

import numpy as np
import soundfile as sf
from pedalboard import Compressor, Limiter, Pedalboard, Reverb, LowpassFilter
from scipy.signal import butter, sosfilt

HERE = os.path.dirname(os.path.abspath(__file__))
TL = json.load(open(os.path.join(HERE, 'build', 'timeline.json')))
SR = TL['sr']
FPS = TL['fps']
DUR = TL['duration']
N = int(round(DUR * SR))
BEAT = 60 / TL['bpm']
rng = np.random.default_rng(2026)

POP = TL['sticker']['pop']
SPLASH = TL['finale']['splash']
FALL = TL['finale']['panels_fall']

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


def knock():
    thump = sine(sweep(170, 110, 0.12), 0.12) * env_exp(0.12, 0.03)
    tick = filt(noise(0.05), 'band', (1800, 4200)) * env_exp(0.05, 0.008) * 0.6
    ring = sine(2600, 0.25) * env_exp(0.25, 0.05) * 0.12
    return _mix(thump, tick, ring)


def _mix(*xs):
    n = max(len(x) for x in xs)
    out = np.zeros(n)
    for x in xs:
        out[: len(x)] += x
    return out


def peel():
    d = 0.55
    x = filt(noise(d), 'band', (900, 2500)) * 0.6
    x += filt(noise(d), 'band', (2500, 7000)) * 0.4 * np.linspace(0.2, 1, int(d * SR))
    crackle = (rng.random(int(d * SR)) < 0.004) * rng.standard_normal(int(d * SR)) * 3
    x = (x + filt(crackle, 'high', 2000)) * np.sin(np.linspace(0, np.pi, int(d * SR))) ** 0.7
    return x * 0.5


def pop():
    bubble = sine(sweep(320, 1500, 0.06), 0.06) * env_exp(0.06, 0.03)
    glass = np.zeros(int(0.9 * SR))
    for _ in range(26):
        f = rng.uniform(2800, 9500)
        start = int(rng.uniform(0, 0.25) * SR)
        g = sine(f, 0.4) * env_exp(0.4, rng.uniform(0.04, 0.16)) * rng.uniform(0.05, 0.16)
        glass[start : start + len(g)] += g[: len(glass) - start]
    glass += filt(noise(0.9), 'high', 3500) * env_exp(0.9, 0.12) * 0.35
    sub = sine(sweep(70, 38, 0.9), 0.9) * env_exp(0.9, 0.35, 0.004) * 0.9
    return _mix(bubble, glass, sub)


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


def zap():
    d = 0.42
    x = saw(sweep(1400, 55, d), d) * env_exp(d, 0.18)
    x = filt(x, 'low', 3000) * 0.3
    crack = filt(noise(d), 'high', 4000) * env_exp(d, 0.03) * 0.25
    return x + crack


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


SFX = {
    'knock': (knock, 0.9),
    'peel': (peel, 0.7),
    'pop': (pop, 1.0),
    'whoosh': (whoosh, 0.6),
    'pomf': (pomf, 0.7),
    'click': (click, 0.8),
    'blip': (blip, 0.7),
    'thwack': (thwack, 0.9),
    'yay': (yay, 0.8),
    'flip': (flip, 0.8),
    'pop_in': (pop_in, 0.8),
    'zap': (zap, 0.6),
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


CHORDS = {'F': ['F3', 'A3', 'C4'], 'G': ['G3', 'B3', 'D4'], 'Am': ['A3', 'C4', 'E4'], 'C': ['C3', 'E3', 'G3']}
ROOTS = {'F': 'F2', 'G': 'G2', 'Am': 'A2', 'C': 'C2'}
PROG = ['F', 'G', 'Am', 'C']


def music():
    drums = np.zeros((2, N))
    melodic = np.zeros((2, N))
    bed = np.zeros((2, N))
    kicks = []
    bar_len = 4 * BEAT
    end_beat = SPLASH  # the groove stops on the splash
    # Before the pop: a soft pad and ticking hats.
    place(bed, pad([note(n) for n in CHORDS['F']], POP + 0.3, 0.06), 0, exact=True)
    t = 0.0
    while t < POP - 0.01:
        place(drums, hat() * 0.6, t, pan=0.25, exact=True)
        t += BEAT / 2
    # The drop: bar by bar from the pop.
    bar = 0
    start = POP
    while start < end_beat - 0.01:
        chord = PROG[bar % 4]
        root = note(ROOTS[chord])
        bar_end = min(start + bar_len, end_beat)
        place(bed, pad([note(n) * 2 for n in CHORDS[chord]], bar_end - start + 0.3, 0.07), start, exact=True)
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
            for i, n in enumerate(CHORDS[chord]):
                place(melodic, fm_key(note(n) * 2, 0.45), tb + BEAT / 2, gain=0.8, pan=-0.3 + 0.3 * i, exact=True)
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
    # The screens power off: the music sinks under a closing filter, then the riser lifts it.
    lo_start, lo_end = FALL[0]['t'], TL['finale']['logo_rise'][0] + 0.4
    sos_bank = [butter(2, fc / (SR / 2), btype='low', output='sos') for fc in (8000, 2500, 900, 450)]
    seg0 = int(lo_start * SR)
    seg1 = min(int(SPLASH * SR), N)
    for ch in range(2):
        x = mix[ch, seg0:seg1]
        u = np.linspace(0, 1, len(x))
        filtered = sosfilt(sos_bank[2], x)
        w = np.clip((np.arange(len(x)) / SR) / (lo_end - lo_start), 0, 1)
        mix[ch, seg0:seg1] = x * (1 - w) + filtered * w * 0.8
        del u
    # The riser, then a C major brass stab on the splash that rings out.
    place(mix, riser(SPLASH - TL['finale']['logo_rise'][0]), TL['finale']['logo_rise'][0], gain=0.7, exact=True)
    brass_notes = ['C4', 'E4', 'G4', 'C5', 'E5']
    d = DUR - SPLASH
    tt = t_(d)
    stab = np.zeros(len(tt))
    for n in brass_notes:
        f = note(n)
        x = sum(saw(f * dt, d) for dt in (0.996, 1.0, 1.004))
        cutoff = 400 + 3800 * np.exp(-tt / 0.25)
        # A brassy "bwah": the filter opens, then closes slowly as the chord rings.
        x = filt(x, 'low', 2400) * (0.35 + 0.65 * np.exp(-tt / 0.6))
        stab += x * (cutoff / 4200)
    stab *= np.clip(tt / 0.012, 0, 1) * (0.45 + 0.55 * np.exp(-tt / 0.5)) * 0.07
    place(mix, stab, SPLASH, gain=1.0)
    place(mix, pad([note(n) for n in ['C3', 'G3', 'C4', 'E4']], d, 0.09), SPLASH, gain=1.0)
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
        else:
            fn, g = SFX[kind]
            x = fn()
        pan = float(np.clip(rng.normal(0, 0.25), -0.6, 0.6))
        place(sfx, x, e['t'], gain=g, pan=pan)
        onsets.append((e['t'], kind, frame_sample(e['t'])))
    mus = music()
    voice = voice_bus()
    # Duck the music and effects under the voice.
    env = np.abs(voice).max(axis=0)
    k = int(0.12 * SR)
    smooth = np.convolve(env, np.ones(k) / k, mode='same')
    duck = 1 - 0.5 * np.clip(smooth / (smooth.max() or 1) * 3, 0, 1)
    mus_b = mus * 0.62 * duck
    sfx_b = sfx * 0.75 * (0.75 + 0.25 * duck)
    mix = mus_b + sfx_b + voice * 1.0
    # Voice over the bed while Forge speaks (dB), so the words always read.
    talking = smooth > 0.02 * smooth.max()
    if talking.any():
        rms = lambda x: np.sqrt(np.mean(x[:, talking] ** 2)) + 1e-9  # noqa: E731
        print(f"voice vs music+effects while talking: {20 * np.log10(rms(voice) / rms(mus_b + sfx_b)):+.1f} dB")
    # The end: a 0.5 s fade.
    f0, f1 = TL['finale']['end_fade']
    fade = np.clip((f1 - np.arange(N) / SR) / (f1 - f0), 0, 1)
    mix *= fade
    master = Pedalboard([Compressor(threshold_db=-14, ratio=2.5, attack_ms=8, release_ms=120), Limiter(threshold_db=-1.0, release_ms=80)])
    out = master(mix.astype(np.float32), SR)
    peak = np.max(np.abs(out))
    ceiling = 10 ** (-1.0 / 20)
    if peak > ceiling:
        out *= ceiling / peak
    out = out[:, :N]
    assert out.shape == (2, N), out.shape
    path = os.path.join(HERE, 'build', 'sound.wav')
    sf.write(path, out.T, SR, subtype='PCM_24')
    peak_db = 20 * np.log10(np.max(np.abs(out)))
    print(f"→ {path}: {out.shape[1] / SR:.3f} s, {SR} Hz stereo, peak {peak_db:.2f} dBFS, {len(onsets)} effects on their frames")
    json.dump([{'t': t, 'kind': k, 'sample': s} for t, k, s in onsets], open(os.path.join(HERE, 'build', 'sound_onsets.json'), 'w'), indent=0)


if __name__ == '__main__':
    main()
