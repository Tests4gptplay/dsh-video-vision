from pathlib import Path
import gzip, hashlib, json, subprocess, os, re
root=Path(os.environ['GITHUB_WORKSPACE'])
control=root/'controller/.github/vv-host-acceptance'
out=root/'out'; out.mkdir(exist_ok=True)
a=(control/'runtime.patch.gz.part1').read_bytes()
b=bytearray((control/'runtime.patch.gz.part2').read_bytes())
b[2874:2876]=bytes([106,110])
patch=gzip.decompress(a+bytes(b))
assert hashlib.sha256(patch).hexdigest()=='77d3ab213c9abcc69b6d7a94daa0b41178dcc65cfe26e41ee6c298601edd1259'
(out/'runtime.patch').write_bytes(patch)
candidate=root/'candidate'
# The local reconstruction tracked empty placeholders for these new files.
# Materialize only those empty-base hunks before applying the exact checked diff.
for section in patch.decode().split('diff --git ')[1:]:
 if '\nindex e69de29..' in section:
  name=section.split('\n',1)[0].split(' b/',1)[1]
  p=candidate/name
  if not p.exists():p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b'')
subprocess.run(['git','apply','--unidiff-zero',str(out/'runtime.patch')],cwd=candidate,check=True)
version='0.10.2-review.6'
for name in ['package.json','package-lock.json']:
 p=candidate/name; j=json.loads(p.read_text()); j['version']=version
 if name=='package-lock.json': j['packages']['']['version']=version
 p.write_text(json.dumps(j,ensure_ascii=False,indent=2)+'\n')
p=candidate/'client.js'; p.write_text(p.read_text().replace('0.10.1',version))
p=candidate/'docs/TECHNICAL-REFERENCE.md'
s=p.read_text().replace('frameWidth: 1280','frameWidth: 0').replace('maxFrames: 12','maxFrames: 0').replace('maxAudioSeconds: 60','maxAudioSeconds: 0')
p.write_text(s)
(candidate/'docs/HOST-CONTRACT-20261110.md').write_text('''# VV host-contract candidate\n\nSource videos are admitted according to the source, decoder and user-selected budgets. No resolution tier or fixed total-duration rule is added. The default six-frame/30-second overview remains an overview, not a capability ceiling.\n\nFrame delivery reads the mounted attachment service imageLimits. A separate compatible copy is produced only when its current per-image byte, pixel, side-length or media-type limits require it; the source frame is retained. Upload-batch counts are not treated as tool-result counts. DSH owns model-route request budgeting and logged offload. Real attachment errors remain errors and do not consume the viewing cursor.\n\nExplicit audio intervals remain complete. DSH mono PCM16 input and the existing recognition windows are retained; only the two identified DSH capacity errors split a rejected window. A stale preparation snapshot does not veto a request the provider may accept. Other errors and cancellation propagate.\n\nUser-selected budgets, source access restrictions, browser authorization and encrypted credential scoping remain. yt-dlp and custom resolvers remain anonymous. Cache ownership/mutation locks remain; there is no new handshake, heartbeat or watchdog. Known unedited generated guidance is migrated without deleting appended user notes.\n\nAndroid issue #2 belongs to DSH attachment-local storage. The accompanying DSH patch/package changes only that owning module. Issue #3 requires the sharp-matched WASM backend to resolve in the same installation as DSH sharp; it is supplied by the accompanying attachment package, not by an unrelated VV dependency.\n''')
print('SOURCE_TRANSFER_VERIFIED',version)
