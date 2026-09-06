from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from skimage import data

ROOT=Path(__file__).resolve().parents[1]
A=ROOT/'assets'
for name,fn in [('hubble',data.hubble_deep_field),('coffee',data.coffee),('cat',data.chelsea),('rocket',data.rocket)]:
 im=Image.fromarray(fn()).convert('RGB')
 im.save(A/f'{name}.webp',quality=88,method=6)

# Orthographic rendering of a true Mobius parametrization, not a photograph.
nu,nv=420,42
u=np.linspace(0,2*np.pi,nu+1)
v=np.linspace(-.78,.78,nv+1)
U,V=np.meshgrid(u,v,indexing='ij')
P=np.stack([(2+V*np.cos(U/2))*np.cos(U),(2+V*np.cos(U/2))*np.sin(U),V*np.sin(U/2)],axis=-1)
def rot(axis,angle):
 a=np.radians(angle); c,s=np.cos(a),np.sin(a)
 if axis=='x':return np.array([[1,0,0],[0,c,-s],[0,s,c]])
 if axis=='y':return np.array([[c,0,s],[0,1,0],[-s,0,c]])
 return np.array([[c,-s,0],[s,c,0],[0,0,1]])
R=rot('z',-23)@rot('x',55)@rot('z',38)
P=P@R.T
faces=np.stack([P[:-1,:-1],P[1:,:-1],P[1:,1:],P[:-1,1:]],axis=2).reshape(-1,4,3)
norm=np.cross(faces[:,1]-faces[:,0],faces[:,3]-faces[:,0]); norm/=np.linalg.norm(norm,axis=1)[:,None]
norm[norm[:,2]<0]*=-1
light=np.array([-.4,-.65,1.1]); light/=np.linalg.norm(light)
L=np.maximum(0,norm@light)
half=light+np.array([0,0,1]); half/=np.linalg.norm(half)
S=np.maximum(0,norm@half)**28
# Satin finish, shaded forest green.
base=np.array([81,134,83]); dark=np.array([9,43,28]); white=np.array([194,213,132])
colors=dark+(base-dark)*(.22+.78*L[:,None])+white*S[:,None]*.42
colors=np.clip(colors,0,255).astype('uint8')
size=1800
im=Image.new('RGBA',(size,size),(0,0,0,0)); d=ImageDraw.Draw(im)
scale=275
for i in np.argsort(faces[:,:,2].mean(axis=1)):
 f=faces[i]; pts=[(int(size/2+x*scale),int(size/2-y*scale)) for x,y,z in f]
 col=tuple(colors[i])+(255,)
 d.polygon(pts,fill=col)
# Supersampling removes polygon seams without changing the geometry.
im=im.resize((1200,1200),Image.Resampling.LANCZOS)
im.save(A/'mobius.png',optimize=True)
print([(x.name,x.stat().st_size) for x in A.iterdir()])
