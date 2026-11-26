#!/usr/bin/env node
// @ts-nocheck
// 방봄 화면(/)을 헤드리스 Edge(Chromium)로 눌러 보는 검사.
// 쓰는 법:  node scripts/e2e-bangbom.mjs [주소] [--ai] [--shots <폴더>]
//   주소    기본 http://localhost:4180  (개발 서버는 http://localhost:5180)
//   --ai    상담에 실제 AI 질문을 한 번 보낸다 (주지 않으면 서랍만 열어 본다)
//   --shots 화면 캡처(PNG)를 그 폴더에 남긴다
// PC(1440x900)는 마우스로, 휴대폰(390x844, 360x740)은 크기 흉내 + 합성 터치로 누른다. 사파리가 아니라 Chromium 이다.
// 실패가 하나라도 있으면 종료 코드 1.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

const args = process.argv.slice(2)
const AI = args.includes('--ai')
const shotAt = args.indexOf('--shots')
const SHOTS = shotAt >= 0 ? args[shotAt + 1] : ''
// --shots 가 없을 때(shotAt = -1) 첫 인자(주소)를 건너뛰지 않게 한다
const BASE = (args.find((a, i) => !a.startsWith('--') && (shotAt < 0 || i !== shotAt + 1)) || 'http://localhost:4180').replace(/\/$/, '')
const EDGE = [process.env.EDGE_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', '/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => p && existsSync(p))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const J = JSON.stringify
const rows = []
const notes = []
const errors = []
let step = '시작'

class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 1; this.p = new Map(); this.l = new Map()
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(String(e.data))
      if (typeof m.id === 'number') { const w = this.p.get(m.id); if (!w) return; this.p.delete(m.id); m.error ? w.rej(new Error('CDP: ' + m.error.message)) : w.res(m.result) }
      else if (m.method) for (const f of [...(this.l.get(m.method) || [])]) f(m.params)
    })
  }
  send(method, params = {}) {
    const id = this.id++
    return new Promise((res, rej) => { this.p.set(id, { res, rej }); this.ws.send(J({ id, method, params })); setTimeout(() => { if (this.p.delete(id)) rej(new Error('CDP 응답 없음: ' + method)) }, 30000) })
  }
  on(ev, f) { if (!this.l.has(ev)) this.l.set(ev, []); this.l.get(ev).push(f) }
  off(ev, f) { const a = this.l.get(ev) || []; const i = a.indexOf(f); if (i >= 0) a.splice(i, 1) }
}

// 페이지 안에 심는 도우미 (글자로 바뀌어 페이지에서 실행된다)
function helpers() {
  const txt = (el) => (el ? (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim() : '')
  const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const s = el.ownerDocument.defaultView.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05 }
  const rect = (sel) => { const el = typeof sel === 'string' ? document.querySelector(sel) : sel; if (!vis(el)) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), b: Math.round(r.bottom), r: Math.round(r.right) } }
  const fur = (slot) => { try { const p = JSON.parse(localStorage.getItem('bangkkumi2.project' + (slot ? '.' + slot : '')) || 'null'); if (!p) return null; const room = (p.rooms || []).find((r) => r.id === p.activeRoomId) || (p.rooms || [])[0]; return room ? room.furniture.map((x) => x.name) : null } catch (e) { return 'ERR ' + e.message } }
  window.__q = {
    txt, vis, rect, fur,
    // 누를 자리(가운데 점)와 그 자리가 다른 것에 가려졌는지
    pt(el) {
      if (!el) return null
      let r = el.getBoundingClientRect()
      if (r.top < 0 || r.left < 0 || r.bottom > innerHeight || r.right > innerWidth) { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }); r = el.getBoundingClientRect() }
      const x = r.left + r.width / 2, y = r.top + r.height / 2
      const top = document.elementFromPoint(x, y), hit = !!top && r.width > 0 && (top === el || el.contains(top))
      const cls = top ? (top.className && top.className.baseVal !== undefined ? top.className.baseVal : String(top.className)) : ''
      return { x, y, hit, w: r.width, h: r.height, by: top ? '<' + top.tagName.toLowerCase() + (top.id ? '#' + top.id : '') + '.' + cls.slice(0, 40) + '>' : '없음' }
    },
    // 화면에 보이고 가려지지 않은 단지 이름표
    label(name) {
      const all = [...document.querySelectorAll('.clabel')]
      if (name) return all.find((b) => b.getAttribute('aria-label') === name) || null
      const free = (b) => { const r = b.getBoundingClientRect(); if (!r.width || r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) return false; const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!t && (t === b || b.contains(t)) }
      return all.find(free) || null
    },
    // 손가락이 닿는 높이: 가운데 세로줄에서 그 단추가 받는 구간(::after 로 넓힌 것까지)
    touchH(el) {
      const r = el.getBoundingClientRect(), x = r.left + r.width / 2; let top = r.top, bot = r.bottom
      for (let y = r.top; y > r.top - 12; y--) { const t = document.elementFromPoint(x, y); if (t && (t === el || el.contains(t))) top = y; else break }
      for (let y = r.bottom - 1; y < r.bottom + 12; y++) { const t = document.elementFromPoint(x, y); if (t && (t === el || el.contains(t))) bot = y + 1; else break }
      return Math.round(bot - top)
    },
    frame() {
      const f = document.querySelector('#kkumiFrame'); if (!f || !f.getAttribute('src')) return null
      const u = new URL(f.src, location.href), q = u.searchParams, d = f.contentDocument
      let live = ''; try { live = f.contentWindow.location.pathname + f.contentWindow.location.search } catch (e) { live = 'ERR ' + e.message }
      const slot = q.get('slot'), liveSlot = new URLSearchParams(live.split('?')[1] || '').get('slot'), r = f.getBoundingClientRect()
      return { path: u.pathname, embed: q.get('embed'), slot, w: q.get('w'), d: q.get('d'), kind: q.get('kind'), op: q.get('op'), view: q.get('view'), eye: q.get('eye'), liveSlot,
        ready: !!d && d.readyState === 'complete' && !!d.querySelector('#root') && d.querySelector('#root').children.length > 0,
        fur: fur(liveSlot), top: Math.round(r.top), bottom: Math.round(r.bottom), wpx: Math.round(r.width), pressed: txt(document.querySelector('#hvRooms button[aria-pressed="true"]')) }
    },
    over() { const de = document.documentElement; return { iw: innerWidth, ih: innerHeight, docW: de.scrollWidth, bodyW: document.body.scrollWidth } },
    // 서로 겹치는 쌍 (보이는 것만)
    clash(sels) {
      const rs = sels.map((s) => [s, rect(s)]).filter((x) => x[1]), out = []
      for (let i = 0; i < rs.length; i++) for (let k = i + 1; k < rs.length; k++) { const a = rs[i][1], b = rs[k][1]; if (Math.min(a.r, b.r) - Math.max(a.x, b.x) > 1 && Math.min(a.b, b.b) - Math.max(a.y, b.y) > 1) out.push(rs[i][0] + ' × ' + rs[k][0]) }
      return out
    },
    panes() { return [...document.querySelectorAll('#panelR [data-pane]')].filter(vis).map((e) => e.dataset.pane) },
    fields() { return [...document.querySelectorAll('#form .f')].filter(vis).map((f) => { const i = f.querySelector('input'); return i ? i.id : (f.querySelector('.seg') ? f.querySelector('.seg').dataset.k : 'prio') }) },
  }
}

async function run(cdp) {
  for (const d of ['Page', 'Runtime', 'Log', 'Network']) await cdp.send(d + '.enable')
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `(${helpers.toString()})()` })
  cdp.on('Runtime.exceptionThrown', (p) => { const d = p.exceptionDetails || {}; errors.push({ step, text: String((d.exception && d.exception.description) || d.text).split('\n')[0] + ' ' + (d.url || '') }) })
  cdp.on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error') notes.push(`[${step}] console.error: ` + (p.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200)) })

  const ev = async (expr) => { const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('페이지 계산 오류: ' + String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text).split('\n')[0]); return r.result.value }
  const waitFor = async (expr, what, ms = 8000) => { const end = Date.now() + ms; for (;;) { try { const v = await ev(`(() => { try { return (${expr}) } catch { return null } })()`); if (v) return v } catch {} if (Date.now() > end) throw new Error(`${what}: ${ms / 1000}초 기다려도 안 됨`); await sleep(120) } }
  const loadThen = async (fn) => { let done; const p = new Promise((r) => { done = r }); const f = () => done(); cdp.on('Page.loadEventFired', f); await fn(); await Promise.race([p, sleep(20000)]); cdp.off('Page.loadEventFired', f); await sleep(600) }
  const nav = (url) => loadThen(() => cdp.send('Page.navigate', { url }))
  let touch = false
  const size = async (w, h, mobile) => {
    touch = !!mobile
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile: !!mobile, screenWidth: w, screenHeight: h })
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: !!mobile, maxTouchPoints: mobile ? 5 : 1 })
  }
  const shot = async (name) => { if (!SHOTS) return; mkdirSync(SHOTS, { recursive: true }); const r = await cdp.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(r.data, 'base64')) }
  // 진짜로 누른다(PC 는 마우스, 휴대폰은 터치). 가려져 있으면 실패로 본다
  const tap = async (expr, label) => {
    const p = await ev(`__q.pt(${expr})`)
    if (!p) throw new Error(`${label}: 화면에서 찾지 못했어요`)
    if (!p.hit) throw new Error(`${label}: 누를 자리(${Math.round(p.x)},${Math.round(p.y)})가 ${p.by} 에 가려져 있어요`)
    if (touch) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] }); await sleep(40); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }) }
    else for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: type === 'mouseMoved' ? 0 : 1 })
    await sleep(260)
    return p
  }
  const swipe = async (x0, y0, x1, y1) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] })
    for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / 8, y: y0 + (y1 - y0) * i / 8 }] }); await sleep(24) }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(450)
  }
  const check = async (what, fn) => { step = what; let row; try { const r = await fn(); row = { what, ok: !!r.ok, evidence: r.evidence } } catch (e) { row = { what, ok: false, evidence: '오류: ' + e.message } } rows.push(row); console.log(`${row.ok ? 'OK  ' : 'FAIL'} ${what} :: ${row.evidence}`) }
  const q = (sel) => `document.querySelector(${J(sel)})`
  const roomBtn = (name) => `[...document.querySelectorAll('#hvRooms button')].find(b => __q.txt(b) === ${J(name)})`
  const openCard = async () => {
    const open = `document.querySelector('#panelR').classList.contains('is-open')`
    const find = `(() => { const b = __q.label(''); return b ? b.getAttribute('aria-label') : null })()`
    let name = await waitFor(find, '보이는 단지 이름표', 2500).catch(() => null)
    // 지도를 옮겨서 보이는 이름표가 없으면 구 바로가기 칩으로 단지가 있는 곳으로 간다
    if (!name) { await tap(q('#dnav button'), '구 바로가기 칩'); await sleep(1500); name = await waitFor(find, '보이는 단지 이름표', 6000) }
    await tap(`__q.label(${J(name)})`, '단지 이름표')
    await waitFor(open, '단지 카드', 4000); await sleep(900)
    return name
  }
  const waitFrame = async (wantSlotNot) => { await waitFor(`(() => { const f = __q.frame(); return !!f && f.slot !== ${J(wantSlotNot || '')} && f.liveSlot === f.slot && f.ready })()`, 'iframe 안 방 배치 도구', 20000); await sleep(900); return ev('__q.frame()') }
  // 집 보기는 먼저 집 전체 구조(평면도 + 방 목록)를 보여 준다. 전체 구조가 보이고 방 iframe 은 아직 없는지 확인한 뒤
  // 목록의 방 단추(name, 없으면 첫 방)를 진짜 눌러서 그 방의 방꾸미 화면(iframe)이 뜰 때까지 기다린다
  const pickRoom = async (name) => {
    const over = await waitFor(`(() => { const o = ${q('#hvOver')}; if (!o || o.hidden || !__q.vis(o)) return null; const b = [...o.querySelectorAll('.hvo-room')]; if (!b.length) return null; return { hash: location.hash, rooms: b.map(x => __q.txt(x.querySelector('b'))), plan: !!o.querySelector('.hvo-plan svg'), frame: !!__q.frame() && !${q('#kkumiFrame')}.hidden } })()`, '집 전체 구조', 6000)
    const target = name || over.rooms[0]
    await tap(`[...document.querySelectorAll('#hvOver .hvo-room')].find(b => __q.txt(b.querySelector('b')) === ${J(target)})`, `전체 구조의 ${target}`)
    const f = await waitFrame('')
    return { over, f, target }
  }
  // 저장된 조건을 지우고 새로 연다 (주소의 # 만 바꾸면 화면을 다시 읽지 않으므로 새로 고침을 한다)
  const fresh = async (hash) => { await nav(BASE + '/'); await ev('localStorage.clear()'); await loadThen(() => cdp.send('Page.reload')); await ev('location.hash = ' + J(hash)); await sleep(900) }

  // ── 조건 입력(한 화면에 한 문항, 8문항) 도우미 ──
  // 칸에 값을 넣는다(키보드로 친 것처럼 input 이벤트까지). 단추는 tap 으로 진짜 누른다
  const typeIn = async (id, v) => ev(`(() => { const i = document.getElementById(${J(id)}); i.focus(); i.value = ${J(String(v))}; i.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  const enterKey = async () => { for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await sleep(300) }
  const qState = () => ev(`({ prog: __q.txt(document.querySelector('#qProg')), fields: __q.fields(), btns: [...document.querySelectorAll('.form-btns button')].filter(__q.vis).map(b => __q.txt(b)), wrap: (() => { const s = document.querySelector('#vInput .form-wrap'); return [s.scrollHeight, s.clientHeight] })(), over: __q.over() })`)
  const Q_WANT = [['f-age'], ['homeless'], ['lives_with_parents'], ['f-income'], ['f-assets'], ['f-budget'], ['f-gross'], ['prio']]
  // 1번부터 8번까지 모든 문항을 지나 "판정 결과 보기"까지 간다. 문항마다 보이는 칸·진행 표시·단추를 적어 둔다
  const walkQ = async (tag) => {
    const tr = [await qState()]
    await typeIn('f-age', 27); await tap(q('#fNext'), '다음(1)'); tr.push(await qState())
    await tap(`document.querySelector('#form .q.is-on .seg button[data-v="1"]')`, '무주택'); await sleep(450); tr.push(await qState())
    await tap(`document.querySelector('#form .q.is-on .seg button[data-v="0"]')`, '따로 살아요'); await sleep(450); tr.push(await qState())
    await typeIn('f-income', 250); const prev = await ev(`__q.txt(document.querySelector('#p-income'))`); await tap(q('#fNext'), '다음(4)'); tr.push(await qState())
    await typeIn('f-assets', 4500); await tap(q('#fNext'), '다음(5)'); tr.push(await qState())
    await typeIn('f-budget', 60); await enterKey(); tr.push(await qState())            // 6번은 Enter 로 다음
    if (tag) await shot(`${tag}-q7`)
    await tap(q('#fSkip'), '건너뛰기(7)'); tr.push(await qState())
    if (tag) await shot(`${tag}-q8`)
    await tap(`document.querySelector('#prioChips button')`, '시설 하나 고르기')
    await tap(q('#fSubmit'), '판정 결과 보기'); await waitFor(`location.hash === '#map'`, '#map', 6000)
    const okSteps = tr.length === 8 && tr.every((t, i) => t.prog === `${i + 1} / 8` && J(t.fields) === J(Q_WANT[i]))
    const last = tr[7], seven = tr[6]
    return { tr, prev, okSteps, okBtns: J(last.btns) === J(['← 이전', '건너뛰기', '판정 결과 보기 →']) && seven.btns.includes('건너뛰기') && J(tr[1].btns) === J(['← 이전', '다음 →']),
      text: tr.map(t => `${t.prog}:${t.fields.join('+')}`).join(' → ') + ` / 미리보기="${prev}"` }
  }

  // ═════════ PC 1440x900 (마우스) ═════════
  await size(1440, 900, false)
  await check('PC 1. 조건 입력: 한 화면에 한 문항 → 8문항을 모두 지나 → 판정 결과 보기 → 지도', async () => {
    await fresh('#input')
    const a = await ev(`({ fields: __q.fields(), prog: __q.txt(document.querySelector('#qProg')), steps: !!document.querySelector('#fSteps'), tabbar: __q.vis(${q('.tabbar')}) })`)
    await shot('pc-input')
    const w = await walkQ('pc'); await sleep(1800)
    const bar = await ev(`__q.txt(${q('#panelL .bar3-txt')})`), top = await ev(`__q.txt(${q('#topRight')})`), dg = await ev(`__q.txt(${q('#panelL .jp-daegu')})`)
    const ok = J(a.fields) === J(['f-age']) && a.prog === '1 / 8' && !a.steps && w.okSteps && w.okBtns && w.prev === '250만 원' && /요건 충족 \d+ · .*확인 필요 \d+ · .*미충족 \d+/.test(bar) && top.includes('조건 바꾸기')
    return { ok, evidence: `처음 보이는 칸 ${J(a.fields)} ${a.prog}, 걸음 칩 있음=${a.steps} / ${w.text} / 왼쪽 패널="${bar}", 대구 기준 줄="${dg}", 오른쪽 위="${top}"` }
  })
  let living = null
  await check('PC 2. 단지 카드(접는 목록) → 집 보기', async () => {
    const name = await openCard(); await shot('pc-card')
    const c = await ev(`({ chips: __q.vis(${q('#panelR .cc-chips')}), folds: [...document.querySelectorAll('#panelR details.fold')].map(d => __q.txt(d.querySelector('summary')) + (d.open ? '(열림)' : '')), plan: __q.vis(${q('#panelR .cc-plan')}), btns: __q.txt(${q('#panelR .cc-btns')}) })`)
    await tap(q('#ccHouse'), '집 보기 →'); await waitFor(`location.hash === '#house'`, '#house', 5000)
    const pk = await pickRoom('거실'); living = pk.f
    const roomHash = await ev('location.hash')
    return { ok: !c.chips && c.folds.length >= 5 && c.folds.every((t) => !t.includes('(열림)')) && c.plan && pk.over.hash === '#house' && pk.over.plan && pk.over.rooms.length >= 2 && !pk.over.frame && roomHash.startsWith('#house/') && living.path.endsWith('/room.html') && living.embed === '1' && +living.w > 0 && !!living.op && !living.eye && living.pressed === '거실', evidence: `단지="${name}", 칩 줄 보임=${c.chips}, 접는 목록=${J(c.folds)}, 단추="${c.btns}", 전체 구조(${pk.over.hash}) 평면도=${pk.over.plan} 방 목록=${J(pk.over.rooms)} iframe 미리 뜸=${pk.over.frame} → 거실 누름 → ${roomHash}, iframe=${J(living)}` }
  })
  await check('PC 3. 집 보기: 방 바꾸기 → 방마다 따로 저장 → 상담 단추', async () => {
    await shot('pc-house')
    const rooms = await ev(`[...document.querySelectorAll('#hvRooms button')].map(b => __q.txt(b))`)
    await tap(roomBtn('안방'), '안방'); const master = await waitFrame(living.slot)
    const keep = await ev(`__q.fur(${J(living.slot)})`)
    await tap(q('#hvConsult'), '상담'); await waitFor(`${q('#drawer')}.classList.contains('is-open')`, '상담 서랍', 3000); await sleep(400)
    const dr = await ev(`__q.rect('#drawer')`); await tap(q('#drClose'), '상담 닫기'); await sleep(400)
    const ok = rooms.length >= 2 && master.slot !== living.slot && Array.isArray(master.fur) && Array.isArray(keep) && J(keep) === J(living.fur) && !!dr && dr.w <= 420
    return { ok, evidence: `방 단추=${J(rooms)}, 안방 칸=${master.slot} 가구=${J(master.fur)}, 거실 칸(${living.slot}) 가구 그대로=${J(keep)}, 상담 서랍 폭 ${dr ? dr.w : '없음'}px` }
  })
  await check('PC 4. ← 지도로 → 브라우저 뒤로 가기', async () => {
    await tap(q('#hvBack'), '← 지도로'); await waitFor(`location.hash === '#map'`, '#map', 4000)
    await ev('history.back()'); await sleep(1500)
    const h = await ev('location.hash'), f = await ev('__q.frame()')
    // 집 보기 주소는 고른 방을 뒤에 붙인다(#house/<방>). 뒤로 가면 안방 주소로 돌아오고, 안방 칩이 눌려 있고, iframe 도 그 방 칸이어야 한다
    const rid = h.startsWith('#house/') ? h.slice(7) : ''
    return { ok: !!rid && !!f && f.pressed === '안방' && f.liveSlot === f.slot && f.slot.endsWith('-' + rid), evidence: `뒤로 한 번 → hash=${h}, 눌린 방="${f ? f.pressed : ''}", iframe 칸=${f ? f.liveSlot : ''}` }
  })

  // ═════════ 휴대폰 (크기 흉내 + 합성 터치) ═════════
  for (const [w, h] of [[390, 844], [360, 740]]) {
    const P = `휴대폰 ${w}x${h}`
    await size(w, h, true)
    await check(`${P} 1. 조건 입력 첫 문항이 한 화면에`, async () => {
      await fresh('#input')
      const a = await ev(`({ over: __q.over(), prog: __q.txt(document.querySelector('#qProg')), bar: __q.vis(document.querySelector('#form .qbar')), fields: __q.fields(), tabbar: __q.vis(${q('.tabbar')}), wrap: (() => { const s = ${q('#vInput .form-wrap')}; return [s.scrollHeight, s.clientHeight] })(), btns: [...document.querySelectorAll('.form-btns button')].filter(__q.vis).map(b => __q.txt(b)), btnTouch: __q.touchH(${q('#fNext')}), btnBottom: __q.rect('.form-btns').b, inFs: getComputedStyle(${q('#f-age')}).fontSize, persona: __q.rect('#fillPersona'), gridW: __q.rect('.fgrid').w, btnsW: __q.rect('.form-btns').w, cut: [...document.querySelectorAll('.form-btns button')].filter(__q.vis).some(b => b.scrollWidth > b.clientWidth + 1) })`)
      await shot(`m${w}-input-1`)
      const ok = a.over.docW <= w && a.over.bodyW <= w && a.prog === '1 / 8' && a.bar && J(a.fields) === J(['f-age']) && !a.tabbar && a.wrap[0] <= a.wrap[1] + 1 && J(a.btns) === J(['그냥 둘러보기', '다음 →']) && a.btnTouch >= 44 && a.btnBottom <= h && parseFloat(a.inFs) >= 16 && !!a.persona && a.gridW >= w - 40 && a.btnsW === w && !a.cut
      return { ok, evidence: `가로 ${a.over.docW}/${w}, 진행 ${a.prog}, 보이는 칸=${J(a.fields)}, 아래 탭 막대 보임=${a.tabbar}, 내용 높이/보이는 높이=${a.wrap[0]}/${a.wrap[1]}, 단추=${J(a.btns)}(닿는 높이 ${a.btnTouch}px, 막대 폭 ${a.btnsW}px, 글자 넘침=${a.cut}), 칸 폭 ${a.gridW}px, 입력 글자 ${a.inFs}` }
    })
    await check(`${P} 2. 빈 값으로 다음 → 그 문항에 알림, 채우면 8문항을 모두 지나 → 지도`, async () => {
      await tap(q('#fNext'), '다음'); const e1 = await ev(`({ prog: __q.txt(document.querySelector('#qProg')), err: __q.txt(${q('#e-age')}), focus: document.activeElement && document.activeElement.id })`)
      await ev('document.activeElement && document.activeElement.blur()')
      const wq = await walkQ(`m${w}-input`); await sleep(2200)
      const fit = wq.tr.every(t => t.wrap[0] <= t.wrap[1] + 1 && t.over.docW <= w)
      const ok = e1.prog === '1 / 8' && !!e1.err && e1.focus === 'f-age' && wq.okSteps && wq.okBtns && fit
      return { ok, evidence: `빈 값: ${e1.prog}, 알림="${e1.err}", 커서=${e1.focus} / ${wq.text} / 문항마다 한 화면=${fit} / hash=${await ev('location.hash')}` }
    })
    await check(`${P} 3. 지도: 한 줄 요약·펼치기, 겹침 없음, 가로 스크롤 없음`, async () => {
      const a = await ev(`({ over: __q.over(), line: __q.txt(${q('#jpLine span')}), panel: __q.rect('#panelL'), clash: __q.clash(['#dnav', '#panelL', '#fab', '#mapHint', '#mh .notice', '.tabbar', '.nav']), dnavTouch: __q.touchH(${q('#dnav button')}), topRight: __q.vis(${q('#topRight')}), canvas: __q.rect('#mapCanvas'), fab: __q.rect('#fab'), notice: __q.rect('#mh .notice'), hint: __q.rect('#mapHint') })`)
      await shot(`m${w}-map`)
      await tap(q('#jpLine'), '펼치기'); const open = await ev(`({ list: __q.vis(${q('#panelL .jp-list')}), rows: document.querySelectorAll('#panelL .jp-row').length, btns: [...document.querySelectorAll('#panelL .jp-btns button')].filter(__q.vis).map(b => __q.txt(b)), panel: __q.rect('#panelL') })`); await shot(`m${w}-map-open`)
      await tap(q('#jpLine'), '접기'); const shut = await ev(`__q.vis(${q('#panelL .jp-list')})`)
      const ok = a.over.docW <= w && a.over.bodyW <= w && /^요건 충족 \d+ · 확인 필요 \d+ · 미충족 \d+$/.test(a.line) && a.panel.h <= 56 && a.clash.length === 0 && a.dnavTouch >= 44 && !a.topRight && a.canvas.w === w && a.canvas.h === h && open.list && open.rows >= 3 && open.btns.includes('조건 바꾸기') && open.panel.b <= h - 64 && !shut
      return { ok, evidence: `가로 ${a.over.docW}/${w}, 요약="${a.line}" 높이 ${a.panel.h}px(위 ${a.panel.y}), 겹침=${J(a.clash)}, 구 칩 닿는 높이 ${a.dnavTouch}px, 지도 ${a.canvas.w}x${a.canvas.h}, 상담 단추 y=${a.fab.y}~${a.fab.b}, 안내 y=${a.notice.y}~${a.notice.b}, 펼침: 목록 ${open.rows}줄 단추=${J(open.btns)} 아래 끝 ${open.panel.b}px, 다시 접힘=${!shut}` }
    })
    let cardName = ''
    await check(`${P} 4. 단지 카드 아래 시트: 높이, 칩으로 한 항목씩, 위쪽 지도 끌기, 끌어서 닫기`, async () => {
      cardName = await openCard()
      const s = await ev(`({ sheet: __q.rect('#panelR'), chips: [...document.querySelectorAll('#panelR .cc-chips button')].map(b => b.dataset.tab), panes: __q.panes(), x: __q.rect('#ccX'), btns: [...document.querySelectorAll('#panelR .cc-btns .btn')].filter(__q.vis).map(b => __q.txt(b)), btnsB: __q.rect('#panelR .cc-btns').b, over: __q.over(), sel: __q.rect('.clabel.is-sel'), chipTouch: __q.touchH(${q('#panelR .cc-chips button')}), fab: __q.vis(${q('#fab')}), top: __q.vis(${q('#panelL')}), head: __q.rect('#panelR .cc-top').h })`)
      await shot(`m${w}-card`)
      const seen = []
      // 칩을 바꿔도 시트 머리(이름·칩 줄)는 제자리에 있고, 고른 항목은 칩 줄 아래에 보여야 한다
      const chipY = [], below = []
      for (const t of s.chips) {
        await tap(`${q('#panelR .cc-chips')}.querySelector('[data-tab="${t}"]')`, '칩 ' + t); seen.push(t + '→' + (await ev('__q.panes()')).join('+'))
        const g = await ev(`({ chips: __q.rect('#panelR .cc-chips'), pane: __q.rect([...document.querySelectorAll('#panelR [data-pane]')].find(__q.vis)) })`)
        chipY.push(g.chips.y); below.push(!!g.pane && g.pane.y >= g.chips.b - 1)
        if (t === 'calc' || t === 'plan') await shot(`m${w}-card-${t}`)
      }
      const steady = chipY.every((y) => y === chipY[0]) && below.every(Boolean)
      await tap(`${q('#panelR .cc-chips')}.querySelector('[data-tab="sum"]')`, '칩 요약')
      // 시트 위쪽 지도를 가로로 끈다 → 고른 단지 이름표가 따라 움직여야 한다
      const y = Math.round((72 + s.sheet.y) / 2), l0 = await ev(`__q.rect('.clabel.is-sel')`)
      await swipe(w / 2 + 60, y, w / 2 - 60, y); const l1 = await ev(`(() => { const e = document.querySelector('.clabel.is-sel'); const r = e.getBoundingClientRect(); return { x: Math.round(r.left) } })()`)
      // 시트 머리를 아래로 끌어 닫는다
      await swipe(w / 2 - 40, s.sheet.y + 14, w / 2 - 40, s.sheet.y + 190); const closed = !(await ev(`${q('#panelR')}.classList.contains('is-open')`))
      const one = seen.every((x) => { const [a, b] = x.split('→'); return a === b })
      const ok = s.sheet.h <= h * 0.67 && s.sheet.h >= h * 0.5 && s.sheet.y >= h * 0.3 && s.chips.length >= 3 && J(s.panes) === J(['sum']) && one && steady && s.x.w >= 44 && s.x.h >= 44 && s.btns[0].startsWith('집 보기') && s.btns.length === 2 && s.btnsB <= h - 64 + 1 && s.over.docW <= w && !!s.sel && s.sel.b <= s.sheet.y + 4 && s.chipTouch >= 44 && !s.fab && s.head <= 96 && Math.abs(l1.x - l0.x) > 40 && closed
      return { ok, evidence: `단지="${cardName}", 시트 y=${s.sheet.y} 높이 ${s.sheet.h}px(화면의 ${Math.round(s.sheet.h / h * 100)}%, 탭 막대 포함 ${Math.round((h - s.sheet.y) / h * 100)}%), 칩=${J(s.chips)} 닿는 높이 ${s.chipTouch}px, 칩→보이는 항목 ${J(seen)}, 칩 줄 y=${[...new Set(chipY)].join('/')}(항목마다 같아야 함)·항목이 칩 줄 아래=${below.every(Boolean)}, 시트 머리 높이 ${s.head}px, 닫기 ${s.x.w}x${s.x.h}, 단추=${J(s.btns)}, 고른 이름표 아래 끝 ${s.sel ? s.sel.b : '없음'}px(시트 위), 지도 끌기: 이름표 x ${l0.x}→${l1.x}, 머리 끌어 닫힘=${closed}` }
    })
    await check(`${P} 5. 집 보기: 아래 탭 막대 숨김, 위쪽 두 줄, 가로 스크롤 없음`, async () => {
      await openCard(); await tap(q('#ccHouse'), '집 보기 →'); await waitFor(`location.hash === '#house'`, '#house', 5000)
      const ov = await ev(`({ over: __q.over(), tabbar: __q.vis(${q('.tabbar')}), nav: __q.vis(${q('#nav')}) })`)
      await shot(`m${w}-house-over`)
      const pk = await pickRoom(''), f = pk.f
      const a = await ev(`({ over: __q.over(), tabbar: __q.vis(${q('.tabbar')}), nav: __q.vis(${q('#nav')}), plan: (() => { const d = ${q('#kkumiFrame')}.contentDocument, s = d && d.querySelector('svg[role="application"]'); return s ? Math.round(s.getBoundingClientRect().height) : 0 })(), top: __q.rect('#mh .hv-top'), back: __q.rect('#hvBack'), title: __q.rect('#hvTitle b'), name: __q.txt(${q('#hvTitle b')}), cut: (() => { const b = ${q('#hvTitle b')}; return b.scrollWidth > b.clientWidth + 1 })(), consult: __q.rect('#hvConsult'), rooms: __q.rect('#hvRooms'), roomTouch: __q.touchH(${q('#hvRooms button')}), backTouch: __q.touchH(${q('#hvBack')}), mode: document.body.classList.contains('house-mode'), fab: __q.vis(${q('#fab')}) })`)
      await shot(`m${w}-house`)
      const row1 = a.back && a.title && a.consult && Math.abs((a.back.y + a.back.h / 2) - (a.consult.y + a.consult.h / 2)) < 3 && a.rooms.y >= a.back.b - 2
      const ok = ov.over.docW <= w && !ov.tabbar && !ov.nav && pk.over.plan && pk.over.rooms.length >= 2 && !pk.over.frame && a.over.docW <= w && a.over.bodyW <= w && a.mode && !a.tabbar && !a.nav && a.top.y === 0 && a.top.h <= 112 && row1 && !a.cut && f.top <= 112 && f.bottom >= h - 1 && f.wpx === w && a.plan >= h * 0.38 && a.roomTouch >= 44 && a.backTouch >= 44 && !a.fab
      return { ok, evidence: `전체 구조: 가로 ${ov.over.docW}/${w} 방 목록=${J(pk.over.rooms)} 평면도=${pk.over.plan} → ${pk.target} 누름 / 방 화면: 가로 ${a.over.docW}/${w}, house-mode=${a.mode}, 탭 막대 보임=${a.tabbar}, 방봄 위 막대 보임=${a.nav}, 평면도 높이 ${a.plan}px(화면의 ${Math.round(a.plan / h * 100)}%), 위쪽 틀 y=${a.top.y} 높이 ${a.top.h}px, 이름="${a.name}" 잘림=${a.cut}, 방 칩 y=${a.rooms.y} 닿는 높이 ${a.roomTouch}px, iframe y=${f.top}~${f.bottom} (화면 ${h}) 폭 ${f.wpx}, 칸=${f.liveSlot}` }
    })
    await check(`${P} 6. 집 보기에서 상담 열기: 전체 높이, 빠른 질문 한 줄`, async () => {
      await tap(q('#hvConsult'), '상담'); await waitFor(`${q('#drawer')}.classList.contains('is-open')`, '상담 서랍', 3000); await sleep(500)
      const d = await ev(`({ dr: __q.rect('#drawer'), quick: (() => { const b = [...document.querySelectorAll('#drQuick button')]; const row = ${q('#drQuick')}; return { n: b.length, tops: [...new Set(b.map(x => Math.round(x.getBoundingClientRect().top)))].length, scroll: row.scrollWidth > row.clientWidth, touch: __q.touchH(b[0]) } })(), msgFs: getComputedStyle(${q('#drBody .msg')}).fontSize, qFs: getComputedStyle(${q('#drQuick button')}).fontSize, inFs: getComputedStyle(${q('#drIn')}).fontSize, form: __q.rect('#drForm'), x: __q.rect('#drClose'), over: __q.over() })`)
      await shot(`m${w}-drawer`)
      const x0 = await ev(`${q('#drQuick')}.scrollLeft`); await swipe(w - 40, d.form.y - 30, 60, d.form.y - 30); const x1 = await ev(`${q('#drQuick')}.scrollLeft`)
      await sleep(700) // 밀던 힘으로 줄이 아직 움직이는 동안 누르면 멈추기만 하고 눌리지 않는다
      let ai = '실제 AI 질문은 건너뜀(--ai 없음)'
      if (AI && w === 390) {
        const t0 = Date.now(); await ev(`${q('#drQuick')}.scrollLeft = 0`); await tap(q('#drQuick button'), '빠른 질문')
        const res = await waitFor(`(() => { const m = [...document.querySelectorAll('#drBody .msg')]; const last = m[m.length - 1]; if (!m.some(x => x.classList.contains('me')) || !last || !last.classList.contains('ai') || /^답을 쓰고/.test(last.textContent)) return null; return { note: __q.txt(last.querySelector('.msg-note')), text: __q.txt(last).slice(0, 80) } })()`, '상담 답', 22000)
        ai = `${((Date.now() - t0) / 1000).toFixed(1)}초, ${res.note ? 'AI 답' : '규칙 답'}: "${res.text}"`
      }
      await tap(q('#drClose'), '상담 닫기'); await waitFor(`!${q('#drawer')}.classList.contains('is-open')`, '상담 서랍 닫힘', 3000); await sleep(450)
      const ok = d.dr.y === 0 && d.dr.h === h && d.dr.w === w && d.quick.tops === 1 && d.quick.scroll && d.quick.touch >= 44 && parseFloat(d.msgFs) >= 15 && parseFloat(d.qFs) >= 15 && parseFloat(d.inFs) >= 16 && d.form.b <= h && d.x.w >= 44 && d.over.docW <= w && x1 > x0
      return { ok, evidence: `서랍 ${d.dr.w}x${d.dr.h} (화면 ${w}x${h}), 빠른 질문 ${d.quick.n}개가 ${d.quick.tops}줄·가로로 넘김=${d.quick.scroll}(밀어서 ${x0}→${x1}px), 닿는 높이 ${d.quick.touch}px, 글자 말풍선 ${d.msgFs}·질문 ${d.qFs}·입력 ${d.inFs}, 입력 칸 아래 끝 ${d.form.b}px, ${ai}` }
    })
    await check(`${P} 7. 눈높이(MH.setEye): 한 번만 3D 눈높이로 열기`, async () => {
      const before = await ev('__q.frame()')
      await ev(`MH.setEye('child')`); await sleep(500); const a = await ev('__q.frame()')
      const other = await ev(`[...document.querySelectorAll('#hvRooms button')].map(b => __q.txt(b)).find(t => t !== ${J(before.pressed)})`)
      await tap(roomBtn(other), other); await sleep(500); const b = await ev('__q.frame()')
      await ev(`location.hash = '#map'`); await sleep(600); await ev(`MH.setEye('adult'); location.hash = '#house'`); await sleep(700); const c = await ev('__q.frame()')
      const ok = !before.eye && a.slot === before.slot && a.view === '3d' && a.eye === 'child' && !b.eye && !b.view && c.eye === 'adult' && c.view === '3d' && c.slot === b.slot
      return { ok, evidence: `전: eye=${before.eye} / 집 보기에서 setEye('child') → 같은 방(${a.slot}) view=${a.view}&eye=${a.eye} / 방 바꾸면(${b.slot}) eye=${b.eye} / 지도에서 setEye('adult') 뒤 집 보기 → view=${c.view}&eye=${c.eye}` }
    })
    await check(`${P} 8. 홈 "아이 눈높이 90cm로 보기" → 집 보기 3D 아이 눈높이: 시트 접힘, 끌어서 둘러보기, 바닥 눌러 옮겨 가기`, async () => {
      await fresh('#home')
      // 홈: 링크는 해결 2의 두 번째 화면(#home-flow, 평면도 → 3D → 방)의 "평면도에서 3D로" 줄에 있다. 손가락으로 민 것처럼 링크가 화면 가운데 오도록 내린다
      await ev(`(() => { const a = ${q('#home-flow a[data-eye="child"]')}; scrollTo(0, a.getBoundingClientRect().top + scrollY - innerHeight / 2) })()`); await sleep(1000)
      const link = await ev(`__q.rect('a[data-eye="child"]')`)
      // 집 보기는 고른 방을 주소 뒤에 붙인다(#house/liv). 그래서 '#house' 로 시작하는지만 본다
      await tap(q('a[data-eye="child"]'), '아이 눈높이 90cm로 보기'); await waitFor(`location.hash.startsWith('#house')`, '#house', 6000)
      const f = await waitFrame('')
      // 방 배치 도구(iframe) 안의 눈높이 상태: 3D 화면 바깥 요소의 data-eye-* 와 캔버스·시트 크기
      const eye = `(() => { const d = ${q('#kkumiFrame')}.contentDocument, r = d && d.querySelector('[data-eye-mode]'), c = r && r.querySelector('canvas'); if (!c || !r.dataset.eyeX) return null; const b = c.getBoundingClientRect(), s = d.querySelector('section[aria-label="조작 패널"]'); return { mode: r.dataset.eyeMode, x: +r.dataset.eyeX, y: +r.dataset.eyeY, yaw: +r.dataset.eyeYaw, markers: +r.dataset.eyeMarkers, cx: b.left, cy: b.top, cw: b.width, ch: b.height, sheet: s ? Math.round(s.getBoundingClientRect().height) : -1, note: __q.txt(r).slice(0, 70) } })()`
      const a0 = await waitFor(eye, '3D 아이 눈높이', 40000); await sleep(1500)
      const fr = await ev(`__q.rect('#kkumiFrame')`), host = await ev(`({ tabbar: __q.vis(${q('.tabbar')}), nav: __q.vis(${q('#nav')}), over: __q.over() })`)
      await shot(`m${w}-house-eye`)
      const mx = fr.x + a0.cx + a0.cw / 2, my = fr.y + a0.cy + a0.ch * 0.55
      await swipe(mx - 60, my, mx + 60, my); const a1 = await ev(eye)
      const sy0 = await ev('scrollY'); await swipe(mx, my - 70, mx, my + 70); const sy1 = await ev('scrollY'), a2 = await ev(eye)
      // 바닥 누르기: 캔버스 아래쪽 몇 곳을 차례로 눌러 본다 (가구나 벽을 누르면 가장 가까운 설 수 있는 자리로 간다)
      let moved = ''
      for (const [fx, fy] of [[0.5, 0.86], [0.35, 0.8], [0.65, 0.8], [0.5, 0.72]]) {
        const b0 = await ev(eye), x = fr.x + a0.cx + a0.cw * fx, y = fr.y + a0.cy + a0.ch * fy
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(40); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
        await sleep(3000); const b1 = await ev(eye)
        if (b1.x !== b0.x || b1.y !== b0.y) { moved = `(${b0.x},${b0.y})→(${b1.x},${b1.y})`; break }
      }
      const ok = !!link && link.h >= 44 && f.view === '3d' && f.eye === 'child' && a0.mode === 'child' && /참고/.test(a0.note) && a0.sheet <= 60 && a0.ch >= h * 0.55 && a1.yaw !== a0.yaw && a1.x === a0.x && a1.y === a0.y && sy0 === sy1 && a2.x === a0.x && a2.y === a0.y && !!moved && !host.tabbar && !host.nav && host.over.docW <= w
      return { ok, evidence: `링크 ${link ? link.w + 'x' + link.h : '없음'}px → iframe view=${f.view}&eye=${f.eye}(${f.slot}), 눈높이 상태 mode=${a0.mode} 자리=(${a0.x},${a0.y}) yaw=${a0.yaw} 빨간 점 ${a0.markers}곳, 안내="${a0.note}", 시트 ${a0.sheet}px(접힘), 3D ${Math.round(a0.cw)}x${Math.round(a0.ch)}px(화면의 ${Math.round(a0.ch / h * 100)}%), 가로로 끌기 yaw ${a0.yaw}→${a1.yaw}(자리 그대로), 세로로 끌기 scrollY ${sy0}→${sy1}, 바닥 누름 ${moved || '자리 안 바뀜'}, 방봄 탭 막대 보임=${host.tabbar}·위 막대 보임=${host.nav}, 가로 ${host.over.docW}/${w}` }
    })
  }
  step = '끝'
}

async function main() {
  if (!EDGE) { console.log('Edge(또는 Chrome)를 찾지 못했어요. EDGE_PATH 환경변수로 실행 파일 위치를 알려 주세요.'); process.exit(1) }
  const port = await new Promise((res, rej) => { const s = net.createServer(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)) }) })
  const profile = mkdtempSync(path.join(os.tmpdir(), 'bangbom-e2e-'))
  const child = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--remote-allow-origins=*', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync', '--mute-audio', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' })
  let timer
  try {
    let target
    for (let i = 0; i < 100 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((e) => e.type === 'page') } catch {} if (!target) await sleep(150) }
    if (!target) throw new Error('브라우저가 뜨지 않았어요')
    const ws = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', () => rej(new Error('브라우저 연결 실패'))) })
    await Promise.race([run(new Cdp(ws)), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('시간 제한(8분)에 걸렸어요. 마지막 단계: ' + step)), 480000) })])
  } catch (e) { rows.push({ what: '실행', ok: false, evidence: '중단: ' + e.message }); console.log('FAIL 실행 :: ' + e.message) } finally {
    clearTimeout(timer)
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); else child.kill('SIGKILL')
    for (let i = 0; i < 8; i++) { try { rmSync(profile, { recursive: true, force: true }); break } catch { await sleep(300) } }
  }
  if (errors.length) { rows.push({ what: '화면 예외 없음', ok: false, evidence: J(errors) }); console.log('FAIL 화면 예외 :: ' + J(errors, null, 1)) }
  if (notes.length) console.log('\n메모\n' + notes.join('\n'))
  const bad = rows.filter((r) => !r.ok)
  console.log(`\n${BASE} · 검사 ${rows.length}개 중 통과 ${rows.length - bad.length}개, 실패 ${bad.length}개 (엔진: Chromium(Edge) 헤드리스, 휴대폰은 크기 흉내 + 합성 터치)`)
  process.exit(bad.length ? 1 : 0)
}
main()
