"""Forge's voiceover: every line in timeline.LINES spoken with Kokoro (offline, free), pitched up for
a cute character, one WAV per line. Writes build/voice/<id>.wav and build/voice.json with each
line's duration and a per-frame loudness envelope (Forge's mouth flaps with it).

  python3 voice.py            # only lines whose text or voice changed
  python3 voice.py --all      # everything again
"""
import hashlib
import json
import os
import sys

import numpy as np
import soundfile as sf
from pedalboard import Pedalboard, PitchShift, HighpassFilter, Compressor, Gain
from scipy.signal import resample_poly

import timeline as T

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'build', 'voice')
SR = T.SR


def kokoro():
    from kokoro_onnx import Kokoro
    return Kokoro(os.path.join(HERE, 'models', 'kokoro-v1.0.int8.onnx'), os.path.join(HERE, 'models', 'voices-v1.0.bin'))


def speak(k, text):
    v = T.VOICE
    samples, rate = k.create(text, voice=v['voice'], speed=v['speed'], lang=v.get('lang', 'en-us'))
    x = np.asarray(samples, dtype=np.float32)
    # The character: pitched up (formants move too, which reads as small and cute), a touch of
    # compression so it sits on top of the music.
    board = Pedalboard([PitchShift(semitones=v['semitones']), HighpassFilter(cutoff_frequency_hz=110), Compressor(threshold_db=-20, ratio=3, attack_ms=3, release_ms=80), Gain(gain_db=2)])
    x = board(x, rate)
    if rate != SR:
        from math import gcd
        g = gcd(SR, rate)
        x = resample_poly(x, SR // g, rate // g).astype(np.float32)
    # Trim silence at both ends (Kokoro pads a little), keep a short tail.
    env = np.abs(x)
    on = np.where(env > 0.01)[0]
    if len(on):
        x = x[max(0, on[0] - int(0.02 * SR)): min(len(x), on[-1] + int(0.08 * SR))]
    peak = np.max(np.abs(x)) or 1
    return (x / peak * 0.89).astype(np.float32)


def envelope(x):
    """Loudness per video frame, 0..1, for the mouth."""
    hop = SR // T.FPS
    n = int(np.ceil(len(x) / hop))
    rms = np.array([np.sqrt(np.mean(x[i * hop:(i + 1) * hop] ** 2)) if len(x[i * hop:(i + 1) * hop]) else 0 for i in range(n)])
    if rms.max() > 0:
        rms = rms / rms.max()
    return [round(float(v), 3) for v in np.clip(rms * 1.3, 0, 1)]


def main():
    os.makedirs(OUT, exist_ok=True)
    meta_path = os.path.join(HERE, 'build', 'voice.json')
    old = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
    out = {}
    k = None
    for line in T.LINES:
        key = hashlib.sha1(json.dumps([line['text'], T.VOICE]).encode()).hexdigest()[:12]
        wav = os.path.join(OUT, f"{line['id']}.wav")
        prev = old.get(line['id'])
        if prev and prev.get('key') == key and os.path.exists(wav) and '--all' not in sys.argv:
            out[line['id']] = prev
            continue
        k = k or kokoro()
        x = speak(k, line['text'])
        sf.write(wav, x, SR, subtype='PCM_16')
        out[line['id']] = {'key': key, 'text': line['text'], 'seconds': round(len(x) / SR, 3), 'envelope': envelope(x)}
        print(f"{line['id']:>8}  {len(x) / SR:5.2f} s  {line['text']}")
    json.dump(out, open(meta_path, 'w'))
    print(f"→ {meta_path}")


if __name__ == '__main__':
    main()
