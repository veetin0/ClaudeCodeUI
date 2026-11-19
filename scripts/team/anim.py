#!/usr/bin/env python3
"""
The team: Harness's pixel characters (32x32, 4 frames an animation), drawn from layered parts.

    npm run team:sprites               # writes src/renderer/src/assets/team/
    npm run team:sprites -- --preview  # also GIFs and a contact sheet in a temp folder

Every frame is drawn once as a map of palette letters; each character's variants (outfit accent x
skin tone) are the same drawing rendered with a different palette. Output: one sheet per character
variant (128 px wide, one 32 px row per animation) and manifest.json, which the app reads.
Needs Python 3 and Pillow.
"""
from PIL import Image, ImageDraw
import json, math, os, sys, tempfile

# ---------------- palette ----------------
PAL = {'K':'#1a1a1a','S':'#f5c39a','s':'#d9956b','Y':'#ffd23f','y':'#e0a800',
'O':'#ff7a1a','o':'#d95a00','W':'#f2f2f2','T':'#7a7f87','B':'#3a6fc4','b':'#264d8f',
'G':'#9aa0a6','g':'#5f656b','H':'#5a3a1e','M':'#8b5a2b','D':'#2b3a55','d':'#1c2638',
'R':'#c0392b','C':'#f4f6f8','c':'#c9d1d9','Q':'#4fb3a9','P':'#555b66','p':'#3d424b',
'L':'#a8d8ff','l':'#8a96a3','N':'#2e2e2e','A':'#ffe066','E':'#fff1b8',
# added for the new characters and animations
'U':'#e6edf5','u':'#b9c6d6','V':'#e0b23a','v':'#b38a1f','k':'#c9b27c','j':'#9c8650',
'X':'#d6453d','x':'#a3302a','Z':'#2e9e5b','F':'#ff9ecb'}

# Skin tones (with the hair that goes with them) and each character's outfit accents.
SKINS = [
    {'S':'#f5c39a','s':'#d9956b','H':'#5a3a1e'},
    {'S':'#c98e5f','s':'#a26a3e','H':'#2a1c12'},
    {'S':'#8d5a3b','s':'#6a3f26','H':'#1b130d'},
]
OUTFITS = {
    'builder':   [{'O':'#ff7a1a','o':'#d95a00'}, {'O':'#9be22d','o':'#6fae12'}, {'O':'#3aa0ff','o':'#1f6fd1'}],
    'manager':   [{'R':'#c0392b'}, {'R':'#2f6fd6'}, {'R':'#2e9e5b'}],
    'scientist': [{'Q':'#4fb3a9'}, {'Q':'#8e6bd6'}, {'Q':'#ef7b64'}],
    'architect': [{'V':'#e0b23a','v':'#b38a1f'}, {'V':'#7fae7a','v':'#56854f'}, {'V':'#b0688a','v':'#874766'}],
    'explorer':  [{'X':'#d6453d','x':'#a3302a'}, {'X':'#3a7bd5','x':'#2a5aa0'}, {'X':'#2e9e5b','x':'#1f7343'}],
}

def rgba(h): return tuple(int(h[i:i+2],16) for i in (1,3,5))+(255,)

# ---------------- drawing helpers (from the original anim.py) ----------------
def poly(pts):
    out=[]
    for (x0,y0),(x1,y1) in zip(pts,pts[1:]):
        dx=abs(x1-x0); dy=-abs(y1-y0); sx=1 if x0<x1 else -1; sy=1 if y0<y1 else -1; err=dx+dy; x,y=x0,y0
        while True:
            if (x,y) not in out: out.append((x,y))
            if (x,y)==(x1,y1): break
            e2=2*err
            if e2>=dy: err+=dy; x+=sx
            if e2<=dx: err+=dx; y+=sy
    return out
def grid(rows,ox,oy,sub=None):
    d={}
    for y,row in enumerate(rows):
        for x,c in enumerate(row):
            if c not in '. ': d[(ox+x,oy+y)]=(sub or {}).get(c,c)
    return d
def mv(d,dx,dy): return {(x+dx,y+dy):c for (x,y),c in d.items()}
def pts(lst,c): return {p:c for p in lst}

def compose(layers):
    """Layers of (pixels, outlined) → a frame as a map of palette letters."""
    cv={}
    for pix,ol in layers:
        if ol:
            for (x,y) in pix:
                for a,b in ((1,0),(-1,0),(0,1),(0,-1)):
                    if (x+a,y+b) not in pix: cv[(x+a,y+b)]='K'
        cv.update(pix)
    return {p:c for p,c in cv.items() if 0<=p[0]<32 and 0<=p[1]<32}

def render(frame, pal):
    im=Image.new('RGBA',(32,32),(0,0,0,0))
    for (x,y),c in frame.items(): im.putpixel((x,y),rgba(pal[c]))
    return im

CH={
 'builder':dict(pants=('B','b'),sleeve='T',ns=3,hat='hardhat',torso=[
  "OOOTTOOO","OOOTTOOO","WWWTTWWW","OOOTTOOO","OOOTTOOO","WWWTTWWW","OOOOOOOO"]),
 'manager':dict(pants=('D','d'),sleeve='D',ns=5,hat='hair',torso=[
  "DDDWWDDD","DDWRRWDD","DdWRRWdD","DDdRRdDD","DDDRRDDD","DDDdDDDD","DDDDDDDD"]),
 'scientist':dict(pants=('P','p'),sleeve='C',ns=5,hat='hair',torso=[
  "CCQQQQCC","CCcQQcCC","CCcQQcCC","CCCQQCCC","ClCQQCCC","CCCcCCCC","CCCcCCCC","CCCcCCCC","CCCcCCCC"]),
 'architect':dict(pants=('l','P'),sleeve='U',ns=5,hat='cap',torso=[
  "UUVVVVUU","UVVuuVVU","UVVVVVVU","UVVVVVVU","UVvVVvVU","UVVVVVVU","UVVVVVVU"]),
 'explorer':dict(pants=('M','H'),sleeve='k',ns=3,hat='bush',torso=[
  "kXXXXXXk","kkxXXxkk","kjjkkjjk","kjjkkjjk","kkkkkkkk","kkkjkkkk","jjjjjjjj"]),
}
LEGS={
 'stand':["..PPPPPPPP..","..PPPPPPPP..","..PPp..pPP..","..PPp..pPP..","..PPp..pPP..",".NNNN..NNNN."],
 'tap':  ["..PPPPPPPP..","..PPPPPPPP..","..PPp..pPP..","..PPp..pPP..","..PPp..NNNN.",".NNNN......."],
 'run':  ["..PPPPPPPP..","..PPPPPPPP..","..PPp..pPP..",".NNNN..pPP..",".......pPP..",".......NNNN."],
 'step': ["..PPPPPPPP..","..PPPPPPPP..","..PPp..pPP..","..PPp..pPP..",".NNNN..pPP..",".......NNNN."],
}
LEGS['runm']=[r[::-1] for r in LEGS['run']]
LEGS['stepm']=[r[::-1] for r in LEGS['step']]
EYES={'n':[(1,1),(6,1)],'l':[(0,1),(5,1)],'r':[(2,1),(7,1)],'up':[(1,0),(6,0)],
 'down':[(1,2),(6,2)],'dl':[(0,2),(5,2)],'dr':[(2,2),(7,2)],
 'x':[(0,0),(2,0),(1,1),(0,2),(2,2),(5,0),(7,0),(6,1),(5,2),(7,2)],
 'closed':[(0,1),(1,1),(6,1),(7,1)],'squint':[(0,1),(1,1),(6,1)],
 'happy':[(0,1),(1,0),(2,1),(5,1),(6,0),(7,1)],
 'widel':[(0,1),(0,2),(5,1),(5,2)],'wider':[(2,1),(2,2),(7,1),(7,2)]}
MOUTH={'n':[(3,3),(4,3)],'o':[(3,3),(4,3),(3,4),(4,4)],'wavy':[(2,4),(3,3),(4,4),(5,3)],
 'flat':[(2,3),(3,3),(4,3),(5,3)],'hmm':[(4,3),(5,3)],'smile':[(2,3),(3,4),(4,4),(5,3)]}

def legs(ch,kind): p=CH[ch]['pants']; return (grid(LEGS[kind],10,24,{'P':p[0],'p':p[1]}),True)
def torso(ch): return (grid(CH[ch]['torso'],12,17),True)
def head(ch,eyes='n',mouth='n',tilt=0,hat=(0,0)):
    f=[list("HSSSSSSH"),list("SSSSSSSS"),list("SSSSSSSS"),list("SSSSSSSS"),list(".sSSSSs.")]
    for c,r in EYES[eyes]: f[r][c]='K'
    for c,r in MOUTH[mouth]: f[r][c]='K'
    d={}
    for r,row in enumerate(f):
        sh=tilt if r<2 else 0
        for c,v in enumerate(row):
            if v!='.': d[(12+c+sh,11+r)]=v
    d[(15,16)]='s'; d[(16,16)]='s'
    style=CH[ch]['hat']; hx,hy=hat[0]+tilt,hat[1]
    if style=='hardhat':
        for c in range(1,7): d[(12+c+hx,8+hy)]='Y'
        for c in range(0,8): d[(12+c+hx,9+hy)]='W' if c==2 else 'Y'
        for c in range(-1,9): d[(12+c+hx,10+hy)]='y'
    elif style=='cap':   # a flat cap in the outfit's accent, peak to the right
        for c in range(1,7): d[(12+c+hx,9+hy)]='V'
        for c in range(0,8): d[(12+c+hx,10+hy)]='V'
        for c in (8,9): d[(12+c+hx,10+hy)]='v'
    elif style=='bush':  # a wide-brimmed bush hat with a band in the accent
        for c in range(1,7): d[(12+c+hx,7+hy)]='k'
        for c in range(1,7): d[(12+c+hx,8+hy)]='k'
        for c in range(1,7): d[(12+c+hx,9+hy)]='X'
        for c in range(-2,10): d[(12+c+hx,10+hy)]='j'
    else:
        for c in range(8): d[(12+c+tilt,10)]='H'
    return (d,True)
def arm(ch,p,ns=None,watch=False,extra=None):
    c=CH[ch]; ns=c['ns'] if ns is None else ns; path=poly(p)
    d={q:(c['sleeve'] if i<ns else 'S') for i,q in enumerate(path)}
    if watch: d[path[-2]]='A'
    if extra: d.update(extra)
    return (d,True)
AL=[(10,18),(10,23)]; AR=[(21,18),(21,23)]
def shift(layers,dx,dy): return [(mv(p,dx,dy),o) for p,o in layers]
def base(ch,lg='stand',eyes='n',mouth='n',tilt=0,hat=(0,0)):
    return [legs(ch,lg),torso(ch),head(ch,eyes,mouth,tilt,hat)]
def bob(layers,f):
    """Breathing: the upper body dips a pixel on frames 1 and 3 (legs stay put)."""
    return [layers[0]]+shift(layers[1:],0,1 if f%2 else 0)

A={}   # 'character_anim' -> [frame letter maps]
MS={}  # 'character_anim' -> ms per frame (default 220)

# ---------------- props ----------------
def hammer(handle,headpix): d=pts(handle,'M'); d.update(headpix); return (d,True)
def bird(x,y,flap): return (grid(["Y.Y",".Y."] if flap else [".Y.","Y.Y"],x,y),True)
def sparkle(cells): return ({p:'Y' for p in cells},False)
side_papers=(grid(["EEE","lll","EEE","lll","EEE"],6,20),True)
roll_under=(grid(["W","B","B","b","B","W"],8,19),True)  # a rolled blueprint, held upright
blueprint=["BBBBBBB","BWBBBWB","BWWWWWB","BWBWBWB","BWWWWWB","BBBBBBB"]
clipboard=["MMMMM","MEEEM","MElEM","MEEEM","MElEM","MMMMM"]

def knocked(ch,prop):
    fr=[]
    for f in range(4):
        u=[0,1,0,-1][f]
        L=[legs(ch,'stand')]
        L+=shift([torso(ch),head(ch,'x',['o','wavy','o','wavy'][f],tilt=u,hat=(1,1)),arm(ch,AL),arm(ch,AR)],u,0)
        L.append(prop)
        for k in range(3):
            t=f*math.pi/2+k*2*math.pi/3
            L.append(bird(round(14.5+8*math.cos(t)),round(2.5+2*math.sin(t)),(f+k)%2==0))
        fr.append(compose(L))
    return fr

def idle(ch,props=(),arms=None):
    arms=arms or [arm(ch,AL),arm(ch,AR)]
    out=[]
    for f,e in enumerate(['n','n','closed','n']):
        out.append(compose(bob(base(ch,eyes=e),f)+list(arms)+list(props)))
    return out

def walk(ch,props,arms_fn):
    out=[]
    for f,lg in enumerate(['stand','step','stand','stepm']):
        L=base(ch,lg)+arms_fn(f)+list(props)
        out.append(compose(shift(L,0,-1) if lg!='stand' else L))
    return out

def ponder(ch,hang):
    chin=arm(ch,[(21,18),(21,20),(18,16)])
    b1=(pts([(21,7)],'W'),True); b2=(pts([(22,4),(23,4),(22,5),(23,5)],'W'),True)
    q=(grid([".WW.","W..W","...W","..W.","....","..W."],25,1),True)
    return [compose(base(ch,eyes='up',mouth='hmm')+[arm(ch,AL),hang,chin,b1]),
            compose(base(ch,eyes='up',mouth='hmm')+[arm(ch,AL),hang,chin,b1,b2]),
            compose(base(ch,eyes='up',mouth='hmm')+[arm(ch,AL),hang,chin,b1,b2,q]),
            compose(base(ch,eyes='up',mouth='hmm',tilt=1)+[arm(ch,AL),hang,chin,b1,b2,q])]

# ---------------- BUILDER ----------------
fr=[]
for i in range(4):
    if i in (1,3):
        fr.append(compose(base('builder')+[arm('builder',AL),arm('builder',AR)])); continue
    m = i==2
    L=base('builder','runm' if m else 'run',mouth='o')
    if not m: L+=[arm('builder',[(10,18),(10,20),(9,22)]),arm('builder',[(21,18),(21,19),(20,20)],ns=2)]
    else:     L+=[arm('builder',[(21,18),(21,20),(22,22)]),arm('builder',[(10,18),(10,19),(11,20)],ns=2)]
    L=shift(L,0,-1)
    puff=[(22,29),(23,28),(24,29)] if not m else [(9,29),(8,28),(7,29)]
    L.append((pts(puff,'c'),False))
    fr.append(compose(L))
A['builder_run']=fr; MS['builder_run']=140
plank=(pts([(x,29) for x in range(22,31)],'M'),True)
up = [arm('builder',[(21,18),(22,17),(23,16),(23,15)],ns=2),
      hammer([(23,y) for y in range(11,15)], {**pts([(x,9) for x in range(22,26)],'G'),**pts([(x,10) for x in range(22,26)],'g')})]
mid= [arm('builder',[(21,18),(24,18)],ns=2),
      hammer([(25,18),(26,18),(27,18)], {**pts([(28,y) for y in range(17,20)],'G'),**pts([(29,y) for y in range(17,20)],'g')})]
dn = [arm('builder',[(21,18),(22,20),(23,22)],ns=2),
      hammer([(24,23),(25,24),(26,25)], {**pts([(x,26) for x in range(25,29)],'G'),**pts([(x,27) for x in range(25,29)],'g')})]
nail=(pts([(27,28)],'G'),False)
spark=({(30,27):'Y',(31,26):'Y',(23,27):'Y',(22,26):'Y',(29,25):'W',(24,25):'W'},False)
A['builder_build']=[
 compose(base('builder',eyes='dr')+[plank,nail,arm('builder',AL)]+up),
 compose(base('builder',eyes='dr')+[plank,nail,arm('builder',AL)]+mid),
 compose(base('builder',eyes='dr',mouth='o')+[plank,arm('builder',AL)]+dn+[spark]),
 compose(base('builder',eyes='dr')+[plank,arm('builder',AL)]+mid)]
hang=hammer([(10,24),(10,25),(10,26)],{**pts([(x,27) for x in range(8,12)],'G'),**pts([(x,28) for x in range(8,12)],'g')})
A['builder_ponder']=ponder('builder',hang)
ground_hammer=hammer([(x,29) for x in range(4,9)],{**pts([(2,y) for y in range(27,30)],'G'),**pts([(3,y) for y in range(27,30)],'g')})
A['builder_knocked']=knocked('builder',ground_hammer)
hang_r=hammer([(21,24),(21,25),(21,26)],{**pts([(x,27) for x in range(20,24)],'G'),**pts([(x,28) for x in range(20,24)],'g')})
A['builder_idle']=idle('builder',[hang_r],[arm('builder',AL),arm('builder',AR)])
thumb=lambda: arm('builder',[(21,18),(23,16),(23,14)],ns=2,extra={(23,13):'S',(24,14):'S'})
A['builder_done']=[compose(base('builder',eyes='happy',mouth='smile')+[arm('builder',AL),hang,thumb()]),
                   compose(base('builder',eyes='happy',mouth='smile')+[arm('builder',AL),hang,thumb(),sparkle([(26,11),(27,12),(26,13)])]),
                   compose(base('builder',eyes='n',mouth='smile')+[arm('builder',AL),hang,thumb()]),
                   compose(base('builder',eyes='happy',mouth='smile')+[arm('builder',AL),hang,thumb(),sparkle([(25,10),(27,10),(26,9),(26,11)])])]

# ---------------- MANAGER ----------------
crossed=(grid(["D..........D","D..........D","DDDDDDDDDSSD",".SSddddddddd"],10,18),True)
A['manager_crossed']=[compose(base('manager','stand','n','flat')+[crossed]),compose(base('manager','tap','n','flat')+[crossed]),
                      compose(base('manager','stand','up','flat')+[crossed]),compose(base('manager','tap','n','flat')+[crossed])]
wmid=arm('manager',[(10,18),(10,20),(12,21)],ns=4,watch=True)
wup=arm('manager',[(10,18),(10,20),(13,17)],ns=4,watch=True)
A['manager_watch']=[compose(base('manager','stand','n','n')+[wmid,arm('manager',AR)]),
                    compose(base('manager','stand','dl','flat')+[wup,arm('manager',AR)]),
                    compose(base('manager','tap','dl','flat')+[wup,arm('manager',AR)]),
                    compose(base('manager','stand','n','flat')+[wup,arm('manager',AR)])]
pl=[compose(base('manager','stand','l','n')+[arm('manager',AR),arm('manager',[(10,18),(4,18)])]),
    compose(base('manager','stand','l','o')+[arm('manager',AR),arm('manager',[(10,18),(7,17),(4,17)])])]
pr=[compose(base('manager','stand','r','n')+[arm('manager',AL),arm('manager',[(21,18),(27,18)])]),
    compose(base('manager','stand','r','o')+[arm('manager',AL),arm('manager',[(21,18),(24,17),(27,17)])])]
A['manager_point_l']=[pl[0],pl[1],pl[0],pl[1]]
A['manager_point_r']=[pr[0],pr[1],pr[0],pr[1]]
A['manager_idle']=idle('manager')
board=(grid(clipboard,11,18),True)
tips=[(14,20),(15,22),(13,22),(15,20)]
fr=[]
for f,t in enumerate(tips):
    pencil={t:'Y',(t[0]+1,t[1]-1):'y'}
    L=base('manager',eyes='down',mouth='hmm' if f%2 else 'n')+[arm('manager',[(10,18),(10,21),(11,22)]),board,
       arm('manager',[(21,18),(20,21),(t[0]+2,t[1]+1)]),(pencil,False)]
    fr.append(compose(L))
A['manager_plan']=fr
fr=[]
for f in range(4):
    up=f%2==1
    L=base('manager',eyes='happy',mouth='o' if up else 'smile')+[arm('manager',[(10,18),(9,15),(8,12)]),arm('manager',[(21,18),(22,15),(23,12)])]
    L=shift(L,0,-1 if up else 0)
    L.append(sparkle([(5,9),(26,9)] if up else [(4,12),(27,12)]))
    fr.append(compose(L))
A['manager_cheer']=fr
fr=[]
for f in range(4):
    t=[0,1,1,0][f]
    L=base('manager',eyes='closed',mouth='flat',tilt=t)+[arm('manager',AL),arm('manager',[(21,18),(21,15),(18+t,13)],ns=4)]
    fr.append(compose(L))
A['manager_facepalm']=fr

# ---------------- SCIENTIST (the reviewer in a lab coat) ----------------
def lens(x,y,pupil):
    mid={'c':"KLKLK",'l':"KKLLK",'r':"KLLKK"}[pupil]
    return (grid([".KKK.","KLLWK",mid,"KLLLK",".KKK."],x,y),False)
fr=[]
for f,(o,pu) in enumerate([(0,'c'),(1,'c'),(1,'l'),(1,'r')]):
    L=base('scientist','stand','squint','hmm',o)+[side_papers,arm('scientist',AL,extra={(9,22):'S'})]
    L+=[arm('scientist',[(21,18),(22,20),(21+o,16)],ns=4),(pts([(20+o,15)],'M'),True),lens(16+o,10,pu)]
    fr.append(compose(L))
A['scientist_inspect']=fr
front_papers=["EEEEEE","EllllE","EEEEEE","ElllEE","EEEEEE"]
fr=[]
for f,e in enumerate(['dl','down','dr','down']):
    pp=[r[:] for r in front_papers]
    if f==3: pp[0]="EEEEEc"
    L=base('scientist',eyes=e,mouth='hmm')+[(grid(pp,13,18),True),
       arm('scientist',[(10,18),(10,21),(12,21)]),arm('scientist',[(21,18),(21,21),(19,21)])]
    fr.append(compose(L))
A['scientist_read']=fr
fr=[]
crumpled=["EEyEEE","EllyEE","yEEEEy","ElyllE","EEEyEE"]
for f in range(4):
    j=[0,1,0,-1][f]
    L=base('scientist',eyes=['widel','wider','widel','wider'][f],mouth='wavy')+[(grid(crumpled,13,18),True),
       arm('scientist',[(10,18),(10,20),(12,20)]),arm('scientist',[(21,18),(21,20),(19,20)])]
    dy=[10,11,13,15][f]
    L.append((grid([".L","LL","LL"],21,dy),True))
    if f%2: L.append((pts([(7,13),(7,14),(24,13),(24,14)],'g'),False))
    fr.append(compose(shift(L,j,0)))
A['scientist_nervous']=fr
A['scientist_idle']=idle('scientist',[side_papers],[arm('scientist',AL,extra={(9,22):'S'}),arm('scientist',AR)])
A['scientist_walk']=walk('scientist',[side_papers],lambda f:[arm('scientist',AL,extra={(9,22):'S'}),
    arm('scientist',[(21,18),(22,20),(22,22)] if f==1 else [(21,18),(20,20),(20,22)] if f==3 else AR)])
MS['scientist_walk']=180
paper=(grid(["EEEEE","ElllE","EEEEE","ElllE","EEEEE"],5,19),True)
check={(6,23):'Z',(7,24):'Z',(8,23):'Z',(9,22):'Z'}
stamp_up=[arm('scientist',[(21,18),(22,15),(20,12)],ns=4),(grid(["MM","GG"],18,9),True)]
stamp_dn=[arm('scientist',[(21,18),(14,19),(11,20)],ns=4),(grid(["MM","GG"],8,19),True)]
A['scientist_approve']=[
 compose(base('scientist',eyes='dl',mouth='hmm')+[paper,arm('scientist',[(10,18),(10,21)])]+stamp_up),
 compose(base('scientist',eyes='dl',mouth='o')+[paper,arm('scientist',[(10,18),(10,21)])]+stamp_dn),
 compose(base('scientist',eyes='dl',mouth='smile')+[paper,(check,False),arm('scientist',[(10,18),(10,21)])]+stamp_up),
 compose(base('scientist',eyes='happy',mouth='smile')+[paper,(check,False),arm('scientist',[(10,18),(10,21)]),arm('scientist',AR),sparkle([(4,16),(11,17)])])]

# ---------------- ARCHITECT (new) ----------------
hold_roll=[arm('architect',[(10,18),(10,22)],extra={(9,22):'S'})]
A['architect_idle']=idle('architect',[roll_under],hold_roll+[arm('architect',AR)])
A['architect_walk']=walk('architect',[roll_under],lambda f:hold_roll+[
    arm('architect',[(21,18),(22,20),(22,22)] if f==1 else [(21,18),(20,20),(20,22)] if f==3 else AR)])
MS['architect_walk']=180
sheet=(grid(blueprint,12,19),True)
draw_tips=[(14,20),(16,21),(15,23),(17,22)]
fr=[]
for f,t in enumerate(draw_tips):
    L=base('architect',eyes='down',mouth='hmm' if f%2 else 'n')+[arm('architect',[(10,18),(10,21),(12,22)]),sheet,
       arm('architect',[(21,18),(21,21),(t[0]+3,t[1]+1)]),({t:'Y',(t[0]+1,t[1]-1):'y',(t[0]+2,t[1]-2):'y'},False)]
    fr.append(compose(L))
A['architect_draft']=fr
roll_hang=(grid(["W","B","B","B","W"],9,23),True)
A['architect_ponder']=ponder('architect',roll_hang)
held=(grid(blueprint,20,9),True)
fr=[]
for f in range(4):
    up=f%2==1
    L=base('architect',eyes='happy' if up else 'r',mouth='smile')+[arm('architect',AL),arm('architect',[(21,18),(22,16),(22,14)])]
    L=shift(L,0,-1 if up else 0)+[mv(held[0],0,-1 if up else 0) and (mv(held[0],0,-1 if up else 0),True)]
    if up: L.append(sparkle([(28,7),(19,7)]))
    fr.append(compose(L))
A['architect_present']=fr
A['architect_knocked']=knocked('architect',(grid(["WBBBBW","WbbbbW"],2,28),True))

# ---------------- EXPLORER (new) ----------------
torch=lambda x,y: {(x,y):'g',(x+1,y):'G',(x+2,y):'Y'}
A['explorer_idle']=idle('explorer',[({(21,24):'g',(21,25):'G',(21,26):'Y'},True)],[arm('explorer',AL),arm('explorer',AR)])
beams=[[(27,17),(28,16),(28,17),(28,18),(29,16),(29,17),(29,18),(30,15),(30,16),(30,17),(30,18),(30,19)],
       [(27,18),(28,18),(28,19),(29,18),(29,19),(29,20),(30,18),(30,19),(30,20),(30,21)],
       [(27,17),(28,16),(28,17),(28,18),(29,16),(29,17),(29,18),(30,15),(30,16),(30,17),(30,18),(30,19)],
       [(27,16),(28,15),(28,16),(29,14),(29,15),(29,16),(30,13),(30,14),(30,15),(30,16)]]
fr=[]
for f,lg in enumerate(['stand','step','stand','stepm']):
    L=base('explorer',lg,eyes='r')+[arm('explorer',[(10,18),(10,21),(9,22)] if f==1 else AL),
       arm('explorer',[(21,18),(23,18),(24,17)]),(torch(24,17),True),({p:('E' if i%3 else 'A') for i,p in enumerate(beams[f])},False)]
    fr.append(compose(shift(L,0,-1) if lg!='stand' else L))
A['explorer_scout']=fr; MS['explorer_scout']=160
fr=[]
for f,o in enumerate([0,1,0,-1]):
    binos=(grid(["NN.NN","NL.LN"],13+o+(1 if o>0 else 0),11),True)
    L=base('explorer',eyes='n',mouth='hmm',tilt=o)+[arm('explorer',[(10,18),(11,15),(13+o,13)]),arm('explorer',[(21,18),(20,15),(17+o,13)]),binos]
    fr.append(compose(L))
A['explorer_look']=fr
bang=(grid(["Y","Y","Y",".","Y"],16,0),True)
fr=[]
for f in range(4):
    up=f%2==1
    L=base('explorer',eyes='widel' if up else 'n',mouth='o')+[arm('explorer',AL),arm('explorer',[(21,18),(23,15),(24,12)])]
    L=shift(L,0,-1 if up else 0)
    if f!=2: L.append(mv(bang[0],0,0) and (mv(bang[0],0,1 if up else 2),True))
    fr.append(compose(L))
A['explorer_found']=fr
A['explorer_knocked']=knocked('explorer',(grid(["gGY"],3,29),True))

# ---------------- output ----------------
ORDER={
 'manager':  ['idle','plan','point_l','point_r','watch','crossed','cheer','facepalm'],
 'builder':  ['idle','run','build','ponder','knocked','done'],
 'scientist':['idle','walk','read','inspect','nervous','approve'],
 'architect':['idle','walk','draft','ponder','present','knocked'],
 'explorer': ['idle','scout','look','found','knocked'],
}

def main():
    root=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))
    out=os.path.join(root,'src','renderer','src','assets','team')
    os.makedirs(out,exist_ok=True)
    for f in os.listdir(out):
        if f.endswith('.png'): os.remove(os.path.join(out,f))
    manifest={'frame':32,'frames':4,'skins':len(SKINS),'outfits':3,'characters':{}}
    sheets={}
    for ch,anims in ORDER.items():
        for a in anims: assert len(A[f'{ch}_{a}'])==4, f'{ch}_{a} needs 4 frames'
        manifest['characters'][ch]={'anims':anims,'ms':{a:MS.get(f'{ch}_{a}',220) for a in anims}}
        for o,outfit in enumerate(OUTFITS[ch]):
            for s,skin in enumerate(SKINS):
                pal={**PAL,**outfit,**skin}
                im=Image.new('RGBA',(128,32*len(anims)),(0,0,0,0))
                for r,a in enumerate(anims):
                    for i,fr in enumerate(A[f'{ch}_{a}']): im.paste(render(fr,pal),(32*i,32*r))
                name=f'{ch}-{o}-{s}.png'
                im.save(os.path.join(out,name),optimize=True)
                sheets[(ch,o,s)]=im
    with open(os.path.join(out,'manifest.json'),'w') as fh: json.dump(manifest,fh,indent=2); fh.write('\n')
    print(f'{len(sheets)} sheets → {os.path.relpath(out,root)}')
    if '--preview' in sys.argv: preview(sheets)

def preview(sheets):
    """GIFs of every animation (default variant) and a contact sheet of all variants, for a look."""
    d=tempfile.mkdtemp(prefix='team-sprites-'); BG=(126,200,227,255); S=6
    for ch,anims in ORDER.items():
        im=sheets[(ch,0,0)]
        for r,a in enumerate(anims):
            frames=[]
            for i in range(4):
                bg=Image.new('RGBA',(32,32),BG); bg.alpha_composite(im.crop((32*i,32*r,32*i+32,32*r+32)))
                frames.append(bg.resize((192,192),Image.NEAREST).convert('P'))
            frames[0].save(os.path.join(d,f'{ch}_{a}.gif'),save_all=True,append_images=frames[1:],duration=MS.get(f'{ch}_{a}',220),loop=0)
    # contact: every animation's 4 frames for the first variant, then a row of variants per character
    rows=sum(len(a) for a in ORDER.values())
    sheet=Image.new('RGBA',(4*34*S+260,(rows+len(ORDER))*34*S),BG); dr=ImageDraw.Draw(sheet); y=0
    for ch,anims in ORDER.items():
        for r,a in enumerate(anims):
            dr.text((4,y+10),f'{ch} {a}',fill=(20,20,40))
            for i in range(4):
                sheet.alpha_composite(sheets[(ch,0,0)].crop((32*i,32*r,32*i+32,32*r+32)).resize((32*S,32*S),Image.NEAREST),(260+i*34*S,y))
            y+=34*S
        dr.text((4,y+10),f'{ch} variants',fill=(20,20,40))
        for k,(o,s) in enumerate([(o,s) for o in range(3) for s in range(3)]):
            small=sheets[(ch,o,s)].crop((0,0,32,32)).resize((32*3,32*3),Image.NEAREST)
            sheet.alpha_composite(small,(260+k*100,y+20))
        y+=34*S
    path=os.path.join(d,'contact.png'); sheet.save(path)
    print('preview →',d)

if __name__=='__main__': main()
