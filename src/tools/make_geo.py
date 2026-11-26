import json
from shapely.geometry import shape, LineString, Point, Polygon, MultiPolygon
from shapely.ops import unary_union, transform
d=json.load(open('/tmp/geo/daegu_dong.geojson'))
P=lambda lng,lat:((lng-128.48)*160,(35.93-lat)*200)
proj=lambda g: transform(lambda x,y,z=None:P(x,y),g)
by={}
for f in d['features']: by.setdefault(f['properties']['sggnm'],[]).append(shape(f['geometry']).buffer(0))
gu={k:proj(unary_union(v)) for k,v in by.items()}
allg=unary_union(list(gu.values())).buffer(0.05).buffer(-0.05).simplify(0.12)
def polys(g):
    gs=[g] if isinstance(g,Polygon) else list(g.geoms)
    out=[]
    for p in gs:
        if p.area<0.5: continue
        out.append([[[round(x,2),round(y,2)] for x,y in list(p.exterior.coords)[:-1]]]+[[[round(x,2),round(y,2)] for x,y in list(h.coords)[:-1]] for h in p.interiors if Polygon(h).area>0.5])
    return out
G={'outline':polys(allg),'gu':{},'label':{}}
for k,g in gu.items():
    s=g.buffer(-0.14).simplify(0.12)
    G['gu'][k]=polys(s)
    rp=g.representative_point() if k not in('중구',) else g.centroid
    G['label'][k]=[round(rp.x,2),round(rp.y,2)]
# 라벨 위치 보정(넓은 군은 중심 쪽으로)
LL=lambda pts:[P(lng,lat) for lat,lng in pts]
clipA=allg.buffer(-0.2)
def lines(pts,w):
    ls=LineString(LL(pts)).intersection(clipA)
    gs=[ls] if ls.geom_type=='LineString' else [g for g in getattr(ls,'geoms',[]) if g.geom_type=='LineString']
    return [{'pts':[[round(x,2),round(y,2)] for x,y in g.coords],'w':w} for g in gs if g.length>1]
RIV=[]
RIV+=lines([(35.915,128.79),(35.890,128.74),(35.880,128.70),(35.884,128.655),(35.890,128.632),(35.900,128.606),(35.896,128.588),(35.903,128.560),(35.889,128.535),(35.868,128.500),(35.866,128.478),(35.852,128.463)],1.0)
RIV+=lines([(35.765,128.625),(35.795,128.615),(35.825,128.609),(35.850,128.606),(35.870,128.603),(35.897,128.597)],.6)
RIV+=lines([(35.96,128.40),(35.935,128.425),(35.900,128.442),(35.865,128.455),(35.835,128.458),(35.80,128.442),(35.76,128.432),(35.72,128.425),(35.69,128.435),(35.66,128.42),(35.62,128.395)],1.4)
RD=[]
RD+=lines([(35.854,128.465),(35.857,128.53),(35.858,128.58),(35.858,128.63),(35.845,128.68),(35.835,128.72)],.8)
RD+=lines([(35.870,128.55),(35.871,128.62),(35.876,128.645),(35.88,128.70)],.6)
RD+=lines([(35.885,128.628),(35.855,128.627),(35.83,128.64),(35.81,128.66)],.6)
RD+=lines([(35.80,128.593),(35.835,128.592),(35.866,128.593),(35.882,128.596),(35.92,128.60)],.6)
RD+=lines([(35.78,128.53),(35.83,128.531),(35.865,128.532),(35.90,128.545),(35.94,128.56)],.5)
RD+=lines([(35.82,128.48),(35.84,128.50),(35.845,128.56),(35.835,128.60),(35.845,128.65)],.5)
G['rivers']=RIV; G['roads']=RD
M=[(36.016,128.695,9),(35.818,128.585,3),(35.69,128.52,8),(35.935,128.57,3),(35.865,128.515,1.8),(35.80,128.665,4),(35.90,128.75,3.5),(35.74,128.60,6),(35.76,128.70,5),(35.66,128.47,5),(36.15,128.65,11),(36.25,128.55,10),(36.10,128.80,8),(36.22,128.78,9),(36.06,128.55,8),(35.97,128.50,5),(35.98,128.78,6)]
G['mounts']=[[round(P(lng,lat)[0],2),round(P(lng,lat)[1],2),r] for lat,lng,r in M]
G['lakes']=[[*map(lambda v:round(v,2),P(128.6175,35.8285)),.9,.55]]
# 도심 영역
urb=[gu[k] for k in ['중구','서구','남구','달서구']]
urb.append(gu['수성구'].intersection(Polygon([(-50,-50),(P(128.68,0)[0],-50),(P(128.68,0)[0],100),(-50,100)])))
urb.append(gu['북구'].intersection(Polygon([(-50,P(0,35.935)[1]),(200,P(0,35.935)[1]),(200,200),(-50,200)])))
urb.append(gu['동구'].intersection(Polygon([(-50,P(0,35.915)[1]),(P(128.735,0)[0],P(0,35.915)[1]),(P(128.735,0)[0],200),(-50,200)])))
for lat,lng,r in [(35.80,128.50,3.2),(35.865,128.462,2.6),(35.69,128.45,3),(35.72,128.44,2)]: urb.append(Point(P(lng,lat)).buffer(r))
U=unary_union(urb).intersection(allg).simplify(0.2)
G['urban']=polys(U)
print('bounds',allg.bounds, 'pts', sum(len(r) for p in G['outline'] for r in p), sum(len(r) for v in G['gu'].values() for p in v for r in p))
open('/home/claude/mh/geo.js','w',encoding='utf-8').write('/* 대구 행정경계: 통계청·행정안전부 행정동 경계(2023.7 기준, vuski/admdongkor 정리본)를 구·군 단위로 합쳐 단순화. 강·도로·산은 지도 연출용 근사(예시) */\nconst GEO = '+json.dumps(G,ensure_ascii=False,separators=(',',':'))+';\n')
import os;print(os.path.getsize('/home/claude/mh/geo.js'))
