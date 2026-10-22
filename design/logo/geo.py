import math, sys, json
from shapely.geometry import Polygon, LineString, box
from shapely.ops import unary_union
from shapely import affinity

def mark(W=500, H=440, s=84, cw=70, gap=18, vxr=0.5, minfrac=0.02):
    L=(1024-W)/2; R=L+W; T=(1024-H)/2; B=T+H
    stemL=box(L,T,L+s,B); stemR=box(R-s,T,R,B)
    diag=Polygon([(L,T),(L+s,T),(R,B),(R-s,B)])
    N=unary_union([stemL,stemR,diag])
    # axe de la diagonale et décalage parallèle (écart constant entre diagonale et petit bras)
    dx,dy=(R-s/2)-(L+s/2),H; n=math.hypot(dx,dy); ux,uy=dx/n,dy/n; px,py=-uy,ux
    perp=s*H/math.hypot(W-s,H); off=perp/2+gap+cw/2
    # petit bras : parallèle à la diagonale ; sommet V sur l'axe vertical du logo
    Vx=L+vxr*W; t=(Vx-px*off-(L+s/2))/dx; Vy=T+t*dy+py*off
    # départ A : juste après la jambe gauche (+ écart)
    Ax=L+s+gap+cw*0.5*abs(uy) ; tA=(Ax-px*off-(L+s/2))/dx; Ay=T+tA*dy+py*off
    # grand bras : jusqu'au coin haut-droit, prolongé puis coupé par le cadre
    k=3; Bx,By=Vx+(R-Vx)*k,Vy+(T-Vy)*k
    line=LineString([(Ax,Ay),(Vx,Vy),(Bx,By)])
    check=line.buffer(cw/2,cap_style=2,join_style=2,mitre_limit=10)
    halo=line.buffer(cw/2+gap,cap_style=2,join_style=2,mitre_limit=10)
    # prolonger le halo au départ pour séparer la pointe de la diagonale
    frame=box(L,T,R,B)
    shape=unary_union([N.difference(halo),check]).intersection(frame)
    parts=[g for g in getattr(shape,'geoms',[shape]) if g.area>minfrac*shape.area]
    return parts,(L,T,R,B),dict(A=(Ax,Ay),V=(Vx,Vy))

def to_svg(parts,fg='#fff',bg='#000',rx=230):
    d=''
    for p in parts:
        for ring in [p.exterior,*p.interiors]:
            c=list(ring.coords); d+='M'+' L'.join(f'{x:.1f} {y:.1f}' for x,y in c[:-1])+'Z '
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"><rect width="1024" height="1024" rx="{rx}" fill="{bg}"/><path d="{d.strip()}" fill="{fg}" fill-rule="evenodd"/></svg>'

if __name__=='__main__':
    V={'x1':{}, 'x2':{'s':96,'cw':78,'gap':20}, 'x3':{'W':480,'H':460,'s':90,'cw':72,'gap':18,'vxr':0.48}}
    for k,kw in V.items():
        parts,box_,pts=mark(**kw); open(f'/tmp/claude-0/logo/{k}.svg','w').write(to_svg(parts)); print(k,len(parts),pts)
