# Renders the app icon (pocong under a full moon) to public/: python3 scripts/generate-icons.py public  (needs Pillow)
import math, sys
from PIL import Image, ImageDraw, ImageFilter
K=4; N=512*K
def S(*v): return [x*K for x in v]
def layer(): return Image.new("RGBA",(N,N),(0,0,0,0))
def leaf(d, base, angle, length, width, fill):
    # banana leaf: long blade with ragged edges
    bx,by=base; pts_l=[]; pts_r=[]
    for i in range(0,21):
        t=i/20; w=width*math.sin(math.pi*min(1,t*1.1))*(0.75 if i%3==0 else 1)
        cx=bx+math.cos(angle)*length*t; cy=by+math.sin(angle)*length*t
        nx,ny=-math.sin(angle),math.cos(angle)
        pts_l.append((cx+nx*w,cy+ny*w)); pts_r.append((cx-nx*w,cy-ny*w))
    d.polygon([(x*K,y*K) for x,y in pts_l+pts_r[::-1]],fill=fill)
def render():
    im=Image.new("RGBA",(N,N))
    top=(40,22,70); bot=(8,10,20)
    g=ImageDraw.Draw(im)
    for y in range(N):
        t=y/N; g.line([(0,y),(N,y)],fill=tuple(int(top[i]+(bot[i]-top[i])*t) for i in range(3))+(255,))
    glow=layer(); ImageDraw.Draw(glow).ellipse(S(60,0,452,392),fill=(255,190,60,150))
    im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(40*K)))
    moon=layer(); md=ImageDraw.Draw(moon); md.ellipse(S(116,40,396,320),fill="#ffd24a")
    md.ellipse(S(170,90,220,130),fill=(230,170,40,255)); md.ellipse(S(300,200,340,230),fill=(230,170,40,255)); md.ellipse(S(320,90,345,110),fill=(230,170,40,255))
    im.alpha_composite(moon)
    lv=layer(); ld=ImageDraw.Draw(lv); dark=(10,32,18,255); dark2=(16,48,26,255)
    leaf(ld,(-10,500),-1.05,330,44,dark2); leaf(ld,(-20,470),-0.55,260,38,dark)
    leaf(ld,(522,500),math.pi+1.05,330,44,dark2); leaf(ld,(532,470),math.pi+0.55,260,38,dark)
    ld.rectangle(S(0,440,512,512),fill=dark)
    im.alpha_composite(lv)
    sh=layer(); ImageDraw.Draw(sh).rounded_rectangle(S(168,160,352,490),radius=92*K,fill=(0,0,0,170))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(14*K)))
    b=layer(); bd=ImageDraw.Draw(b)
    bd.rounded_rectangle(S(170,150,342,480),radius=86*K,fill="#f4f1e6")
    bd.ellipse(S(222,96,290,160),fill="#f4f1e6"); bd.polygon(S(228,104,256,64,284,104),fill="#e2ddcc")
    m=layer(); ImageDraw.Draw(m).rounded_rectangle(S(170,150,342,480),radius=86*K,fill=(255,255,255,255))
    shade=layer(); ImageDraw.Draw(shade).ellipse(S(290,120,420,520),fill=(170,160,140,120))
    shade=shade.filter(ImageFilter.GaussianBlur(10*K)); shade.putalpha(Image.composite(shade.getchannel("A"),Image.new("L",(N,N),0),m.getchannel("A")))
    b.alpha_composite(shade); bd=ImageDraw.Draw(b)
    for y in (300,380): bd.rectangle(S(170,y,342,y+12),fill=(190,182,160,255))
    bd.ellipse(S(196,178,316,276),fill="#1a1414")  # face hollow
    im.alpha_composite(b)
    eg=layer(); ed=ImageDraw.Draw(eg)
    for cx in (230,282): ed.ellipse(S(cx-22,206,cx+22,250),fill=(255,40,30,200))
    im.alpha_composite(eg.filter(ImageFilter.GaussianBlur(10*K)))
    e=ImageDraw.Draw(im)
    for cx in (230,282): e.ellipse(S(cx-11,216,cx+11,240),fill="#ff4a32"); e.ellipse(S(cx-4,222,cx+4,232),fill="#ffe0a0")
    fog=layer(); fd=ImageDraw.Draw(fog); fd.ellipse(S(-60,430,572,560),fill=(180,200,255,90))
    im.alpha_composite(fog.filter(ImageFilter.GaussianBlur(18*K)))
    return im
out=sys.argv[1]; big=render()
for n,name in [(180,"apple-touch-icon.png"),(192,"icon-192.png"),(512,"icon-512.png")]:
    big.resize((n,n),Image.LANCZOS).convert("RGB").save(f"{out}/{name}")
