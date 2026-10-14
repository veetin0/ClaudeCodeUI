# Playbook: Audio

**When:** the product has sound (alerts, voice, music), sonification makes data understandable, narration for the demo video, ambience for an immersive demo, audio-analysis challenges.

## Generate
- **Procedural / synthesis**: numpy + `soundfile` (`pip install soundfile`) — oscillators, envelopes, filters (scipy.signal), noise layers. Fully original and licence-free.
- **Music from notes**: write MIDI with `pretty_midi` or `mido`, render with FluidSynth and a General MIDI SoundFont (`fluidsynth -ni font.sf2 song.mid -F song.wav -r 44100`). Check the SoundFont's licence.
- **Sonification**: map data to pitch/tempo/timbre in a script so it updates with the data.
- **Narration / TTS**: macOS `say -v Samantha -o narration.aiff -f script.txt` for drafts; a TTS API only if the rules allow external services. Record a human voice for the final if possible.
- **Editing**: `pydub` (cut, crossfade, overlay) or ffmpeg filters.

## Finish and check
- Loudness: `ffmpeg -i in.wav -af loudnorm=I=-16:TP=-1.5:LRA=11 out.wav` (web/video ≈ −16 LUFS, −1.5 dBTP).
- Analyse with `librosa` or `ffmpeg -i out.wav -af ebur128 -f null -`: duration, peak (no clipping), silence at the ends, loop points.
- Deliver WAV masters + compressed OGG/MP3/AAC for the web; note sources in `assets/CREDITS.md`. Never use copyrighted music without a licence.
