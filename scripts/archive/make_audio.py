"""
Archive-tier audio: read each stored brief for a date and speak it with Piper,
the free open voice model, on our own machine (no per-character fee).

  python scripts/archive/make_audio.py [YYYY-MM-DD] [out_dir] [voices_dir]

Reads archive_editions (kind 'brief') through the Supabase REST API with the
service key (from ~/.env on the archive server, else .env.local), writes
<area_id>.wav and .mp3 to out_dir. When R2_* is set (the server), each MP3 is
uploaded to the private bucket at audio/<date>/<area_id>.mp3 and
archive_editions.audio_url records that key. Editions that already have audio
are skipped, so a rerun only does what is missing.

Voices (download once from huggingface.co/rhasspy/piper-voices):
  de -> de_DE-thorsten-medium; en-gb/ie/au/nz -> en_GB-jenny_dioco-medium; en-us -> en_US-lessac-medium

  An optional fourth argument limits the run to one archive country
  ("United Kingdom"), so each country's audio can run in its own morning.
"""
import json, os, re, shutil, subprocess, sys, time, urllib.parse, urllib.request, wave
from datetime import date

VOICES = {
    'de': 'de_DE-thorsten-medium',
    # English editions: one British voice for the UK, Ireland, Australia and New
    # Zealand, one American voice for the US (archive edition_language codes).
    'en-gb': 'en_GB-jenny_dioco-medium', 'en-ie': 'en_GB-jenny_dioco-medium',
    'en-au': 'en_GB-jenny_dioco-medium', 'en-nz': 'en_GB-jenny_dioco-medium',
    'en-us': 'en_US-lessac-medium',
    'it': 'it_IT-paola-medium', 'fr': 'fr_FR-siwis-medium', 'es': 'es_ES-davefx-medium',
}


def env():
    out = {}
    for path in (os.path.expanduser('~/.env'), '.env.local'):
        if not os.path.exists(path):
            continue
        for line in open(path, encoding='utf-8'):
            if '=' in line and not line.startswith('#'):
                k, v = line.split('=', 1)
                out.setdefault(k.strip(), v.strip().strip('"'))
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
    base = f"{e['NEXT_PUBLIC_SUPABASE_URL']}/rest/v1/archive_editions"
    auth = {'apikey': e['SUPABASE_SERVICE_ROLE_KEY'], 'Authorization': f"Bearer {e['SUPABASE_SERVICE_ROLE_KEY']}"}
    rows, offset = [], 0
    while True:
        country = f"&country=eq.{urllib.parse.quote(sys.argv[4])}" if len(sys.argv) > 4 else ''
        req = urllib.request.Request(f"{base}?kind=eq.brief&local_date=eq.{day}&audio_url=is.null{country}&select=id,area_id,language,body&order=id&limit=1000&offset={offset}", headers=auth)
        page = json.load(urllib.request.urlopen(req, timeout=60))
        rows += page
        if len(page) < 1000:
            break
        offset += 1000
    s3 = None
    if e.get('R2_ENDPOINT') and e.get('R2_ACCESS_KEY_ID'):
        import boto3
        s3 = boto3.client('s3', endpoint_url=e['R2_ENDPOINT'], aws_access_key_id=e['R2_ACCESS_KEY_ID'],
                          aws_secret_access_key=e['R2_SECRET_ACCESS_KEY'], region_name='auto')
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
        mp3 = wav[:-4] + '.mp3'
        if ffmpeg:
            subprocess.run([ffmpeg, '-y', '-loglevel', 'error', '-i', wav, '-b:a', '48k', '-ac', '1', mp3], check=False)
        if s3 and os.path.exists(mp3):
            key = f"audio/{day}/{r['area_id']}.mp3"
            s3.upload_file(mp3, e.get('R2_BUCKET', 'yous-archive'), key, ExtraArgs={'ContentType': 'audio/mpeg'})
            patch = urllib.request.Request(f"{base}?id=eq.{r['id']}", data=json.dumps({'audio_url': key}).encode(), method='PATCH',
                                           headers={**auth, 'Content-Type': 'application/json', 'Prefer': 'return=minimal'})
            urllib.request.urlopen(patch, timeout=30)
            os.remove(wav)
            os.remove(mp3)
        print(f"{r['area_id']:<44} {secs:6.1f}s audio in {took:5.1f}s")
    if total_audio:
        print(f'{len(rows)} briefs, {total_audio / 60:.1f} min of audio in {total_time:.0f}s (realtime factor {total_time / total_audio:.2f})')


if __name__ == '__main__':
    main()
