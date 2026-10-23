"""The hero's voiceover: every line in timeline.LINES, one WAV per line. Writes build/voice/<id>.wav
(48 kHz mono) and build/voice.json with each line's duration and a per-frame loudness envelope (the
hero's mouth flaps with it). The timeline is laid out around these real durations.

Engines (timeline.VOICE['engine']):
  kokoro      offline and free, natural English; the model (~110 MB) downloads from GitHub releases
              into models/ (or KOKORO_DIR). Pitched up `semitones` for a small, cute character.
  elevenlabs  ELEVENLABS_API_KEY in the environment and VOICE['voice_id']; check the rules allow it.
  own         your recordings, recordings/<id>.wav (any rate; trimmed and levelled here).
  silent      no audio, durations estimated from the words: for timing and previews only.

  python3 voice.py            # only lines whose text or voice changed
  python3 voice.py --all      # everything again
"""
import hashlib
import json
import os
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


def speak(engine, k, line):
    v = T.VOICE
    if engine == 'silent':
        return np.zeros(int((0.35 + len(line['text'].split()) / 2.7) * SR), dtype=np.float32)
    if engine == 'own':
        x, rate = sf.read(os.path.join(HERE, 'recordings', f"{line['id']}.wav"), dtype='float32')
        return trim_level(to_sr(x.mean(axis=1) if x.ndim > 1 else x, rate))
    if engine == 'elevenlabs':
        return trim_level(elevenlabs(line['text']))
    samples, rate = k.create(line['text'], voice=v['voice'], speed=v['speed'], lang=v.get('lang', 'en-us'))
    x = np.asarray(samples, dtype=np.float32)
    # The character: pitched up (formants move too, which reads as small and cute), a touch of
    # compression so it sits on top of the music.
    board = Pedalboard([PitchShift(semitones=v.get('semitones', 0)), HighpassFilter(cutoff_frequency_hz=110), Compressor(threshold_db=-20, ratio=3, attack_ms=3, release_ms=80), Gain(gain_db=2)])
    return trim_level(to_sr(board(x, rate), rate))


def envelope(x):
    """Loudness per video frame, 0..1, for the mouth (a made-up flap for silent lines)."""
    hop = SR // T.FPS
    n = int(np.ceil(len(x) / hop))
    if not np.any(x):
        return [round(0.5 + 0.5 * np.sin(i * 1.9), 3) if i < n - 3 else 0 for i in range(n)]
    rms = np.array([np.sqrt(np.mean(x[i * hop : (i + 1) * hop] ** 2)) for i in range(n)])
    rms = rms / (rms.max() or 1)
    return [round(float(v), 3) for v in np.clip(rms * 1.3, 0, 1)]


def main():
    engine = 'silent' if '--silent' in sys.argv else T.VOICE.get('engine', 'kokoro')
    os.makedirs(OUT, exist_ok=True)
    meta_path = os.path.join(HERE, 'build', 'voice.json')
    old = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
    out = {}
    k = None
    for line in T.LINES:
        key = hashlib.sha1(json.dumps([line['text'], T.VOICE, engine]).encode()).hexdigest()[:12]
        wav = os.path.join(OUT, f"{line['id']}.wav")
        prev = old.get(line['id'])
        if engine != 'own' and prev and prev.get('key') == key and os.path.exists(wav) and '--all' not in sys.argv:
            out[line['id']] = prev
            continue
        if engine == 'kokoro':
            k = k or kokoro()
        x = speak(engine, k, line)
        sf.write(wav, x, SR, subtype='PCM_16')
        out[line['id']] = {'key': key, 'text': line['text'], 'seconds': round(len(x) / SR, 3), 'envelope': envelope(x)}
        print(f"{line['id']:>10}  {len(x) / SR:5.2f} s  {line['text']}")
    json.dump(out, open(meta_path, 'w'))
    print(f'→ {meta_path} ({engine})')


if __name__ == '__main__':
    main()
