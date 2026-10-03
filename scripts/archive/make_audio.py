"""
Archive-tier audio: read each stored brief for a date and speak it with Piper,
the free open voice model, on our own machine (no per-character fee).

  python scripts/archive/make_audio.py [YYYY-MM-DD] [out_dir] [voices_dir]

Reads archive_editions (kind 'brief') through the Supabase REST API with the
service key from .env.local, writes <area_id>.wav (and .mp3 when ffmpeg is
installed) to out_dir. On the archive server the files go to object storage
and archive_editions.audio_url is set; this script is the same step, local.

Voices (download once from huggingface.co/rhasspy/piper-voices):
  de -> de_DE-thorsten-medium
"""
import json, os, re, shutil, subprocess, sys, time, urllib.request, wave
from datetime import date

VOICES = {'de': 'de_DE-thorsten-medium', 'en': 'en_GB-alan-medium', 'it': 'it_IT-paola-medium', 'fr': 'fr_FR-siwis-medium', 'es': 'es_ES-davefx-medium'}


def env():
    out = {}
    for line in open('.env.local', encoding='utf-8'):
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1)
            out[k.strip()] = v.strip().strip('"')
    return out


def spoken(body):
    """The brief as it should be read: headers become sentences, links lose their URLs."""
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', body)
    text = re.sub(r'\[\[([^\]]+)\]\]', lambda m: m.group(1).rstrip('.') + '.', text)
    return re.sub(r'\s+', ' ', text).strip()


def main():
    day = sys.argv[1] if len(sys.argv) > 1 else date.today().isoformat()
    out_dir = sys.argv[2] if len(sys.argv) > 2 else os.path.join('data', 'archive-audio', day)
    voices_dir = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.environ.get('TEMP', '/tmp'), 'areas', 'voices')
    os.makedirs(out_dir, exist_ok=True)
    e = env()
    url = f"{e['NEXT_PUBLIC_SUPABASE_URL']}/rest/v1/archive_editions?kind=eq.brief&local_date=eq.{day}&select=area_id,language,body"
    req = urllib.request.Request(url, headers={'apikey': e['SUPABASE_SERVICE_ROLE_KEY'], 'Authorization': f"Bearer {e['SUPABASE_SERVICE_ROLE_KEY']}"})
    rows = json.load(urllib.request.urlopen(req, timeout=60))
    from piper import PiperVoice
    loaded = {}
    ffmpeg = shutil.which('ffmpeg')
    total_audio = total_time = 0.0
    for r in rows:
        voice_name = VOICES.get(r['language'])
        if not voice_name or not r.get('body'):
            continue
        if voice_name not in loaded:
            loaded[voice_name] = PiperVoice.load(os.path.join(voices_dir, f'{voice_name}.onnx'))
        wav = os.path.join(out_dir, f"{r['area_id']}.wav")
        t = time.time()
        with wave.open(wav, 'wb') as w:
            loaded[voice_name].synthesize_wav(spoken(r['body']), w)
        took = time.time() - t
        with wave.open(wav) as w:
            secs = w.getnframes() / w.getframerate()
        total_audio += secs
        total_time += took
        if ffmpeg:
            subprocess.run([ffmpeg, '-y', '-loglevel', 'error', '-i', wav, '-b:a', '48k', '-ac', '1', wav[:-4] + '.mp3'], check=False)
        print(f"{r['area_id']:<44} {secs:6.1f}s audio in {took:5.1f}s")
    if total_audio:
        print(f'{len(rows)} briefs, {total_audio / 60:.1f} min of audio in {total_time:.0f}s (realtime factor {total_time / total_audio:.2f})')


if __name__ == '__main__':
    main()
