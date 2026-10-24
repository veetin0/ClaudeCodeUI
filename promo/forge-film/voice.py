"""The hero's voiceover: every line in timeline.LINES, one WAV per line. Writes build/voice/<id>.wav
(48 kHz mono) and build/voice.json with each line's duration and its mouth shapes over time (open,
round, wide at 60 per second), which the hero's face speaks with. The timeline is laid out around
these real durations.

Engines (timeline.VOICE['engine']):
  kokoro      offline and free, natural English; the model (~110 MB) downloads from GitHub releases
              into models/ (or KOKORO_DIR). Pitched up `semitones` for a small, cute character.
  elevenlabs  ELEVENLABS_API_KEY in the environment and VOICE['voice_id']; check the rules allow it.
  own         your recordings, recordings/<id>.wav (any rate; trimmed and levelled here).
  silent      no audio, durations estimated from the words: for timing and previews only.

  python3 voice.py            # only lines whose text or voice changed
  python3 voice.py --all      # everything again
  python3 voice.py --audition # the first lines in a few voices → out/audition.mp4, to pick one
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.request
from math import gcd

import numpy as np
import soundfile as sf
from pedalboard import Compressor, Gain, HighpassFilter, Pedalboard, PitchShift
from scipy.signal import resample_poly

import timeline as T

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'build', 'voice')
SR = T.SR
MODELS = os.environ.get('KOKORO_DIR', os.path.join(HERE, 'models'))
KOKORO_FILES = {
    'kokoro-v1.0.int8.onnx': 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx',
    'voices-v1.0.bin': 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin',
}


def to_sr(x, rate):
    if rate == SR:
        return x.astype(np.float32)
    g = gcd(SR, rate)
    return resample_poly(x, SR // g, rate // g).astype(np.float32)


def kokoro():
    os.makedirs(MODELS, exist_ok=True)
    for name, url in KOKORO_FILES.items():
        path = os.path.join(MODELS, name)
        if not os.path.exists(path):
            print(f'downloading {name}…')
            try:
                subprocess.run(['curl', '-fsSL', '-o', path, url], check=True)
            except (OSError, subprocess.CalledProcessError):
                urllib.request.urlretrieve(url, path)
    from kokoro_onnx import Kokoro
    return Kokoro(*(os.path.join(MODELS, n) for n in KOKORO_FILES))


def elevenlabs(text):
    key = os.environ.get('ELEVENLABS_API_KEY')
    vid = T.VOICE.get('voice_id')
    if not key or not vid:
        sys.exit('elevenlabs needs ELEVENLABS_API_KEY and VOICE["voice_id"] in timeline.py')
    req = urllib.request.Request(
        f'https://api.elevenlabs.io/v1/text-to-speech/{vid}?output_format=pcm_44100',
        data=json.dumps({'text': text, 'model_id': T.VOICE.get('model', 'eleven_multilingual_v2')}).encode(),
        headers={'xi-api-key': key, 'content-type': 'application/json'},
    )
    pcm = urllib.request.urlopen(req).read()  # 16-bit little-endian mono
    return to_sr(np.frombuffer(pcm, dtype='<i2').astype(np.float32) / 32768, 44100)


def trim_level(x):
    """Trim the silence at both ends (keep a short tail) and level to a common peak."""
    on = np.where(np.abs(x) > 0.01)[0]
    if len(on):
        x = x[max(0, on[0] - int(0.02 * SR)) : min(len(x), on[-1] + int(0.08 * SR))]
    peak = np.max(np.abs(x)) if len(x) else 1
    return (x / (peak or 1) * 0.89).astype(np.float32)


def voice_style(k, voice):
    """A Kokoro voice by name, or a blend: 'af_sky+af_bella' (equal parts)."""
    if '+' not in voice:
        return voice
    parts = [k.get_voice_style(v) for v in voice.split('+')]
    return sum(parts) / len(parts)


def speak(engine, k, line):
    v = T.VOICE
    if engine == 'silent':
        return np.zeros(int((0.35 + len(line['text'].split()) / 2.7) * SR), dtype=np.float32)
    if engine == 'own':
        x, rate = sf.read(os.path.join(HERE, 'recordings', f"{line['id']}.wav"), dtype='float32')
        return trim_level(to_sr(x.mean(axis=1) if x.ndim > 1 else x, rate))
    if engine == 'elevenlabs':
        return trim_level(elevenlabs(line['text']))
    return kokoro_line(k, line['text'], v)


def character(x, rate, c, lift=0.0):
    """A cartoon voice with Praat's 'Change gender' (PSOLA, no phase-vocoder warble): the pitch
    moved to `median` Hz, the formants shifted by `formants` (above 1 = a smaller, cuter vocal
    tract), and the melody's range widened by `range` (above 1 = livelier, bouncier intonation,
    which is what keeps a synthetic voice from sounding flat and robotic). `lift` adds semitones."""
    import parselmouth
    from parselmouth.praat import call
    snd = parselmouth.Sound(x.astype(np.float64), sampling_frequency=rate)
    f0 = snd.to_pitch(time_step=0.01, pitch_floor=75, pitch_ceiling=600).selected_array['frequency']
    if not np.any(f0 > 0):
        return x
    m = c.get('median', float(np.median(f0[f0 > 0]))) * 2 ** (lift / 12)
    try:
        out = call(snd, 'Change gender', 75, 600, c.get('formants', 1.0), m, 1.0, 1.0)
        r = c.get('range', 1.0)
        if r != 1.0:
            # Widen the melody around its median in the log domain (Praat's own range factor goes
            # silent when it pushes the pitch out of bounds), clamped to a speaking range.
            man = call(out, 'To Manipulation', 0.01, 75, 700)
            tier = call(man, 'Extract pitch tier')
            call(tier, 'Formula', f'max(110, min(680, {m} * (self / {m}) ^ {r}))')
            call([tier, man], 'Replace pitch tier')
            out = call(man, 'Get resynthesis (overlap-add)')
        return np.asarray(out.values[0], dtype=np.float32)
    except parselmouth.PraatError:
        return x  # too short or unvoiced to analyse: leave it as spoken


def pitch_stats(x, rate=None):
    """Median pitch (Hz) and the range of the melody (10th to 90th percentile, in semitones)."""
    import parselmouth
    f0 = parselmouth.Sound(x.astype(np.float64), sampling_frequency=rate or SR).to_pitch(time_step=0.01, pitch_floor=60, pitch_ceiling=700).selected_array['frequency']
    f0 = f0[f0 > 0]
    if not len(f0):
        return 0, 0
    lo, hi = np.percentile(f0, [10, 90])
    return float(np.median(f0)), float(12 * np.log2(hi / lo))


def kokoro_line(k, text, v):
    c = v.get('character')
    if c and c.get('act', True):
        # A little acting: each sentence on its own, exclamations a touch faster and higher.
        parts = []
        for p in re.split(r'(?<=[.!?])\s+', text.strip()):
            # Very short sentences ("Hi!") go with the next one: too little voice to analyse alone.
            if parts and len(parts[-1].split()) < 3:
                parts[-1] += ' ' + p
            elif p:
                parts.append(p)
        if len(parts) > 1:
            gap = np.zeros(int(0.09 * SR), dtype=np.float32)
            out = []
            for p in parts:
                out += [kokoro_part(k, p, v), gap]
            return trim_level(np.concatenate(out[:-1]))
    return trim_level(kokoro_part(k, text, v))


def kokoro_part(k, text, v):
    c = v.get('character')
    loud = c and text.endswith('!')
    speed = v['speed'] * (1.06 if loud else 1.0)
    samples, rate = k.create(text, voice=voice_style(k, v['voice']), speed=speed, lang=v.get('lang', 'en-us'))
    x = np.asarray(samples, dtype=np.float32)
    fx = []
    if c:
        x = character(x, rate, c, lift=1.2 if loud else 0.0)
    elif v.get('semitones'):
        # The old way, a phase vocoder: more than a semitone or two warbles. Prefer `character`.
        fx = [PitchShift(semitones=v['semitones'])]
    # A touch of compression so it sits on top of the music.
    board = Pedalboard(fx + [HighpassFilter(cutoff_frequency_hz=90), Compressor(threshold_db=-20, ratio=3, attack_ms=3, release_ms=80), Gain(gain_db=2)])
    return to_sr(board(x, rate), rate)


AUDITION = [
    ('Now', {'voice': 'af_heart', 'speed': 1.08, 'semitones': 3.5, 'character': None}),
    ('1 · Heart, lively', {'voice': 'af_heart', 'speed': 1.08, 'semitones': 0, 'character': {'median': 265, 'formants': 1.12, 'range': 1.5}}),
    ('2 · Sky, lively', {'voice': 'af_sky', 'speed': 1.08, 'semitones': 0, 'character': {'median': 235, 'formants': 1.1, 'range': 1.55}}),
    ('3 · Puck, lively and boyish', {'voice': 'am_puck', 'speed': 1.08, 'semitones': 0, 'character': {'median': 205, 'formants': 1.18, 'range': 1.5}}),
    ('4 · Bella, extra bouncy', {'voice': 'af_bella', 'speed': 1.1, 'semitones': 0, 'character': {'median': 275, 'formants': 1.12, 'range': 1.8}}),
]


def audition():
    """The first two lines in each AUDITION voice, one after another, each with a numbered card:
    out/audition.mp4 (and build/audition/*.wav). Put the pick in VOICE."""
    k = kokoro()
    text = ' '.join(ln['text'] for ln in T.LINES[:2])
    d = os.path.join(HERE, 'build', 'audition')
    os.makedirs(d, exist_ok=True)
    os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
    parts = []
    for i, (label, v) in enumerate(AUDITION):
        x = kokoro_line(k, text, {**T.VOICE, **v})
        med, rng = pitch_stats(x)
        label_stats = f'{med:.0f} Hz, melody range {rng:.1f} semitones'
        gap = np.zeros(int(0.7 * SR), dtype=np.float32)
        wav = os.path.join(d, f'{i}.wav')
        sf.write(wav, np.concatenate([gap, x, gap]), SR, subtype='PCM_16')
        card = os.path.join(d, f'{i}.mp4')
        safe = label.replace(':', '\\:')
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x120C0A:s=1280x720:r=30', '-i', wav,
                        '-vf', f"drawtext=text='{safe}':fontcolor=white:fontsize=56:x=(w-text_w)/2:y=(h-text_h)/2-30,drawtext=text='{v['voice']}':fontcolor=0xE9B89C:fontsize=30:x=(w-text_w)/2:y=(h-text_h)/2+50",
                        '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', card], check=True)
        parts.append(card)
        print(f'{label:<36} {len(x) / SR:5.2f} s   {label_stats}')
    lst = os.path.join(d, 'list.txt')
    open(lst, 'w').write(''.join(f"file '{p}'\n" for p in parts))
    out = os.path.join(HERE, 'out', 'audition.mp4')
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', out], check=True)
    print(f'→ {out}')


MOUTH_RATE = 60  # mouth samples per second (the scene interpolates between them)


def mouth(x):
    """The mouth shapes over time, read from the audio itself (so any voice works): per 1/60 s,
    `open` from loudness, `round` (oo, oh, w) from energy below 900 Hz, `wide` (ee, s, t) from
    energy above 2.5 kHz. Smoothed like real lips: quick to open, a little slower to close, and
    shut between syllables. A silent line gets a made-up flap."""
    hop = SR // MOUTH_RATE
    n = int(np.ceil(len(x) / hop))
    if not np.any(x):
        flap = [round(0.45 + 0.4 * np.sin(i * 0.95), 3) if 2 < i < n - 4 else 0 for i in range(n)]
        return {'open': flap, 'round': [0] * n, 'wide': [0] * n}
    win = 2048
    pad = np.concatenate([np.zeros(win // 2), x, np.zeros(win)])
    freqs = np.fft.rfftfreq(win, 1 / SR)
    lo, mid, hi = (freqs >= 120) & (freqs < 900), (freqs >= 900) & (freqs < 2500), (freqs >= 2500) & (freqs < 7500)
    hann = np.hanning(win)
    rms, rnd, wd = np.zeros(n), np.zeros(n), np.zeros(n)
    for i in range(n):
        seg = pad[i * hop : i * hop + win]
        mag = np.abs(np.fft.rfft(seg * hann)) ** 2
        e_lo, e_mid, e_hi = mag[lo].sum(), mag[mid].sum(), mag[hi].sum()
        tot = e_lo + e_mid + e_hi + 1e-12
        rms[i] = np.sqrt(np.mean(x[i * hop : (i + 1) * hop] ** 2)) if i * hop < len(x) else 0
        rnd[i] = np.clip((e_lo / tot - 0.7) * 2.2, 0, 0.85)
        wd[i] = np.clip((e_hi / tot - 0.1) * 2.6, 0, 0.85)
    ref = np.percentile(rms[rms > 0], 92) if np.any(rms > 0) else 1
    target = np.clip(rms / (ref or 1), 0, 1.15)
    target[target < 0.12] = 0  # closed between syllables and words
    opened = np.zeros(n)
    for i in range(1, n):
        k = 0.55 if target[i] > opened[i - 1] else 0.32
        opened[i] = opened[i - 1] + (target[i] - opened[i - 1]) * k
    shape = lambda v: np.convolve(v, np.hanning(7) / np.hanning(7).sum(), mode='same') * np.clip(opened * 2.5, 0, 1)  # noqa: E731
    r3 = lambda v: [round(float(a), 3) for a in v]  # noqa: E731
    return {'open': r3(np.clip(opened, 0, 1)), 'round': r3(shape(rnd)), 'wide': r3(shape(wd))}


def main():
    engine = 'silent' if '--silent' in sys.argv else T.VOICE.get('engine', 'kokoro')
    os.makedirs(OUT, exist_ok=True)
    meta_path = os.path.join(HERE, 'build', 'voice.json')
    old = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
    out = {}
    k = None
    for line in T.LINES:
        key = hashlib.sha1(json.dumps([line['text'], T.VOICE, engine, MOUTH_RATE]).encode()).hexdigest()[:12]
        wav = os.path.join(OUT, f"{line['id']}.wav")
        prev = old.get(line['id'])
        if engine != 'own' and prev and prev.get('key') == key and os.path.exists(wav) and '--all' not in sys.argv:
            out[line['id']] = prev
            continue
        if engine == 'kokoro':
            k = k or kokoro()
        x = speak(engine, k, line)
        sf.write(wav, x, SR, subtype='PCM_16')
        out[line['id']] = {'key': key, 'text': line['text'], 'seconds': round(len(x) / SR, 3), 'rate': MOUTH_RATE, 'mouth': mouth(x)}
        print(f"{line['id']:>10}  {len(x) / SR:5.2f} s  {line['text']}")
    json.dump(out, open(meta_path, 'w'))
    print(f'→ {meta_path} ({engine})')


if __name__ == '__main__':
    audition() if '--audition' in sys.argv else main()
