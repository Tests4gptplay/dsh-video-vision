import hashlib,json,sys,tarfile
archive,manifest=sys.argv[1:]
expected=json.load(open(manifest))
assert expected['version']=='0.10.1'
with open(archive,'rb') as f:
 assert hashlib.file_digest(f,'sha256').hexdigest()==expected['archiveSha256'], 'Frozen archive SHA256 mismatch'
with tarfile.open(archive,'r:gz') as tar:
 actual={}
 for item in tar.getmembers():
  if item.isdir():continue
  assert item.isfile() and item.name.startswith('package/'), 'Unexpected archive entry'
  name=item.name[len('package/'):]
  assert name not in actual and '..' not in name.split('/'), 'Unexpected path'
  actual[name]=hashlib.sha256(tar.extractfile(item).read()).hexdigest()
assert actual==expected['payload'], 'Frozen package payload mismatch'
print('Verified',len(actual),'frozen package files')
