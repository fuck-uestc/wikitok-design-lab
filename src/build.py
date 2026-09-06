from pathlib import Path
import re,base64,mimetypes
ROOT=Path(__file__).resolve().parents[1]
def inline(name):
 html=(ROOT/f'{name}.html').read_text()
 def css(m):return '<style>\n'+(ROOT/m.group(1)).read_text()+'\n</style>'
 def js(m):
  source=(ROOT/m.group(1)).read_text()
  if m.group(1).endswith('data.js'):
   for asset in (ROOT/'assets').iterdir():
    if asset.is_file():
     mime=mimetypes.guess_type(asset.name)[0] or 'application/octet-stream'
     uri='data:'+mime+';base64,'+base64.b64encode(asset.read_bytes()).decode()
     source=source.replace('assets/'+asset.name,uri)
  return '<script>\n'+source.replace('</script','<\\/script')+'\n</script>'
 html=re.sub(r'<link rel="stylesheet" href="([^"]+)">',css,html)
 # Move inlined scripts after the body exists; defer is ignored on inline scripts.
 sources=re.findall(r'<script src="([^"]+)" defer></script>',html)
 html=re.sub(r'<script src="[^"]+" defer></script>','',html)
 scripts='\n'.join(js(type('Match',(),{'group':lambda self,n,x=x:x})()) for x in sources)
 html=html.replace('</body>',scripts+'\n</body>')
 out=ROOT/f'demo-{name}.html';out.write_text(html)
 return out
if __name__=='__main__':
 for name in ['a-margin','b-drift']:
  path=inline(name);print(path,path.stat().st_size)
