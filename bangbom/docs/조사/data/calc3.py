import json
app=json.load(open('app_out.json'))
C={'c01':dict(name='상인푸르지오 센터파크',dep=22200,mgmt=22,sample=False),
   'c02':dict(name='월성 든든하우스(샘플)',dep=15000,mgmt=15,sample=True),
   'c04':dict(name='신암 센트럴(샘플)',dep=19500,mgmt=20,sample=True)}
P={'A':dict(age=27,net=250,gross=None,assets=1000,budget=60),
   'B':dict(age=33,net=320,gross=None,assets=4000,budget=80),
   'C':dict(age=38,net=280,gross=None,assets=2000,budget=70),
   'D':dict(age=36,net=480,gross=7000,assets=15000,budget=150)}
mi=lambda L,r: L*r/100/12
r1=lambda x: round(x+1e-9,1)
# ---------- 1) 앱 검증: 앱이 고른 조합을 공식으로 직접 재계산 ----------
rate_of={'청년전용 버팀목 전세자금대출':2.5,'시중 전세대출 + 대구 청년 이자지원':2.0,'시중 전세대출':4.5,'대출 없이':0}
rows1=[]
for p,pp in P.items():
  for c,cc in C.items():
    a=app[p][c]; L=max(0,cc['dep']-pp['assets']); rate=rate_of[a['fin']]
    hand=r1(cc['mgmt']+mi(L,rate)); worst=r1(cc['mgmt']+mi(L,4.5))
    shown=a['net'] if a['net'] is not None else a['best']
    rows1.append((p,cc['name'],cc['dep'],L,a['fin'],rate,r1(mi(L,rate)),cc['mgmt'],hand,shown,a['light'],worst,a['worst'],'일치' if abs(hand-shown)<0.05 and abs(worst-a['worst'])<0.05 else '불일치'))
# ---------- 2) 실제 대출 규칙 반영 ----------
def beotimok_ok(pp):
  if not(19<=pp['age']<=34): return False,'나이(만 19~34세) 밖'
  inc_hi = pp['gross'] if pp['gross'] else pp['net']*12*1.35
  inc_lo = pp['gross'] if pp['gross'] else pp['net']*12
  if inc_lo>5000: return False,'연소득 5천만 원 초과'
  if inc_hi>5000: return None,'월 실수령만으론 소득 판단 불가(확인 필요)'
  return True,'요건 충족'
def daegu_ok(pp,dep):
  if not(19<=pp['age']<=39): return False,'나이(만 19~39세) 밖'
  if dep>25000: return False,'보증금 2.5억 초과'
  inc = pp['gross'] if pp['gross'] else pp['net']*12*1.35
  if inc>6000: return None,'본인 연소득 6천만 원 기준 확인 필요'
  return True,'요건 충족(선정은 배점)'
def realistic(pp,cc,cap):
  dep=cc['dep']; L=max(0,dep-pp['assets']); opts=[]
  if L==0: return [('대출 없이',0,0,cc['mgmt'])],L,None
  ok,why=beotimok_ok(pp)
  bmax=min(cap,0.8*dep) if dep<=30000 else 0
  if ok is not False and L<=bmax: opts.append(('버팀목'+('' if ok else '(확인 필요)'),2.5,L,r1(cc['mgmt']+mi(L,2.5))))
  mmax=0.8*dep
  if L<=mmax:
    opts.append(('시중 전세대출(은행 심사)',4.5,L,r1(cc['mgmt']+mi(L,4.5))))
    d,dw=daegu_ok(pp,dep)
    if d is not False: opts.append(('시중+대구 이자지원(선정 필요)',2.0,L,r1(cc['mgmt']+mi(L,2.0))))
  short = None if opts else r1(L-max(bmax,mmax))
  return opts,L,short
rows2=[]
for cap in (20000,15000):
  for p,pp in P.items():
    for c,cc in C.items():
      opts,L,short=realistic(pp,cc,cap)
      if opts:
        best=min(opts,key=lambda o:o[3]); res=f"{best[0]} · 월 {best[3]}만" + (" (예산 초과)" if best[3]>pp['budget'] else "")
      else: res=f"들어갈 수 없음: 자기자금 {r1(short)}만 원 부족"
      rows2.append((cap,p,cc['name'],cc['dep'],pp['assets'],L,r1(0.8*cc['dep']),res))
# ---------- 3) 같은 단지(c01) 전세 · 반전세 · 매매 (가정치) ----------
conv=5.0  # 전월세 전환율 가정
def semi(dep):  # 반전세 월세
  return r1((22200-dep)*conv/100/12)
def annuity(L,rate,yrs=30):
  r=rate/100/12; n=yrs*12; return L*r/(1-(1+r)**-n)
price=48000*0.9  # 분양가 4.8억 가정, 10% 할인
rows3=[]
for p,pp in P.items():
  # 전세
  opts,L,short=realistic(pp,C['c01'],20000)
  js = f"월 {min(o[3] for o in opts)}만" if opts else f"불가(자기자금 {short}만 부족)"
  # 반전세 보증금 1억
  dep=10000; rent=semi(dep); L2=max(0,dep-pp['assets'])
  if L2<=0.8*dep: v=r1(rent+22+mi(L2,2.5 if beotimok_ok(pp)[0] else 4.5)); semi_s=f"월 {v}만 (월세 {rent}+관리비 22+이자)"
  else: semi_s=f"불가(자기자금 {r1(L2-0.8*dep)}만 부족)"
  # 매매
  L3=max(0,price-pp['assets']); ltv=0.7*price
  if L3<=ltv and L3<=30000:
    pay=annuity(L3,3.0); intr=mi(L3,3.0); tax=3
    buy_s=f"월 {r1(pay+22+tax)}만 (원리금 {r1(pay)}, 그중 이자 {r1(intr)}) · 사라지는 돈 월 {r1(intr+22+tax)}만"
  else: buy_s=f"불가(대출 필요 {r1(L3)}만 > 한도 {r1(min(ltv,30000))}만)"
  rows3.append((p,js,semi_s,buy_s))
json.dump(dict(rows1=rows1,rows2=rows2,rows3=rows3,price=price,semi=semi(10000)),open('res.json','w'),ensure_ascii=False)
for r in rows1: print(r)
print(); [print(r) for r in rows2]
print(); [print(r) for r in rows3]
