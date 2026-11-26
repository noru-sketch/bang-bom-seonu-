"""미분양 단지 8곳을 가운데 둔 참고 지도(OpenStreetMap)를 만든다. 실행: python trace\\make_refs.py
- OpenStreetMap 타일(© OpenStreetMap contributors, ODbL)을 받아 900x900으로 이어 붙인다. 한 장 약 4.4km 범위.
- 결과: trace\\refs\\c01_sangin.jpg ...  (이 폴더는 커밋하지 않는다)
"""
import io, math, os, time, urllib.request
from PIL import Image  # 없으면: pip install pillow

UA = {"User-Agent": "BangbomHackathonDemo/1.0 (student project, low volume)"}
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "refs")
SITES = [  # id, 위도, 경도  (c06은 산 위였던 좌표를 주거지로 옮김)
    ("c01_sangin", 35.8099, 128.5378), ("c02_wolseong", 35.826, 128.530),
    ("c03_chimsan", 35.900, 128.590), ("c04_sinam", 35.885, 128.625),
    ("c05_beomeo", 35.858, 128.625), ("c06_daegok", 35.802, 128.555),
    ("c07_pyeongni", 35.877, 128.555), ("c08_siji", 35.835, 128.700),
]

def px(lat, lng, z):
    n = 2 ** z; r = math.radians(lat)
    return (lng + 180) / 360 * n * 256, (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * n * 256

def tile(z, x, y):
    req = urllib.request.Request(f"https://tile.openstreetmap.org/{z}/{x}/{y}.png", headers=UA)
    return Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=20).read())).convert("RGB")

def make(name, lat, lng, z=15, size=900):
    cx, cy = px(lat, lng, z)
    x0, y0 = int((cx - size / 2) // 256), int((cy - size / 2) // 256)
    x1, y1 = int((cx + size / 2) // 256), int((cy + size / 2) // 256)
    canvas = Image.new("RGB", ((x1 - x0 + 1) * 256, (y1 - y0 + 1) * 256))
    for tx in range(x0, x1 + 1):
        for ty in range(y0, y1 + 1):
            canvas.paste(tile(z, tx, ty), ((tx - x0) * 256, (ty - y0) * 256)); time.sleep(0.1)
    l, t = int(cx - size / 2 - x0 * 256), int(cy - size / 2 - y0 * 256)
    canvas.crop((l, t, l + size, t + size)).save(os.path.join(OUT, name + ".jpg"), quality=90)
    print("ok", name)

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for s in SITES:
        make(*s)
