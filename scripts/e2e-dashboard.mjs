#!/usr/bin/env node
// @ts-nocheck
// 이용 현황 화면(/dashboard.html)을 헤드리스 Edge(Chromium)로 열어 보는 검사.
// 쓰는 법:  node scripts/e2e-dashboard.mjs [주소] [--shots <폴더>]
//   주소    기본 http://localhost:4180  (같은 주소의 /backend/ 가 통계 서버로 이어져 있어야 한다)
//   --shots 화면 캡처(PNG, 페이지 전체)를 그 폴더에 남긴다
// PC(1440x900)와 휴대폰(390x844, 360x740) 크기로 열고, 주소에 backend=down 을 붙여 "연결하지 못했어요" 화면도 본다.
// 통계 서버를 읽기만 한다(GET). 숫자를 더하거나 AI 를 부르지 않는다. 실패가 하나라도 있으면 종료 코드 1.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

const args = process.argv.slice(2)
const shotAt = args.indexOf('--shots')
const SHOTS = shotAt >= 0 ? args[shotAt + 1] : ''
// --shots 가 없을 때(shotAt = -1) 첫 인자(주소)를 건너뛰지 않게 한다
const BASE = (args.find((a, i) => !a.startsWith('--') && (shotAt < 0 || i !== shotAt + 1)) || 'http://localhost:4180').replace(/\/$/, '')
const EDGE = [process.env.EDGE_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', '/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => p && existsSync(p))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const J = JSON.stringify
// 시작 화면·튜토리얼을 끄는 약속(tutorial=0)은 이 화면에도 그대로 붙인다
const PAGE = BASE + '/dashboard.html?tutorial=0'
const LABELS = ['실제 집계', '샘플']
const DOWN = '서버에 연결하지 못했어요. 잠시 뒤에 다시 눌러 주세요.'
const rows = []
const errors = []
let step = '시작'
let wantFail = false // backend=down 을 볼 때는 "주소 없음" 한 줄이 콘솔에 남는 것이 정상이다

class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 1; this.p = new Map(); this.l = new Map()
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(String(e.data))
      if (typeof m.id === 'number') { const w = this.p.get(m.id); if (!w) return; this.p.delete(m.id); if (m.error) w.rej(new Error('CDP: ' + m.error.message)); else w.res(m.result) }
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
  const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05 }
  const rect = (sel) => { const el = typeof sel === 'string' ? document.querySelector(sel) : sel; if (!vis(el)) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } }
  const one = (sel) => document.querySelector(sel)
  const all = (sel) => [...document.querySelectorAll(sel)]
  window.__q = {
    txt, vis, rect,
    // 누를 자리(가운데 점)와 그 자리가 다른 것에 가려졌는지
    pt(el) {
      if (!el) return null
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
      const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2
      const top = document.elementFromPoint(x, y)
      return { x, y, hit: !!top && r.width > 0 && (top === el || el.contains(top)) }
    },
    done() { const v = one('#view'); return !!v && v.getAttribute('aria-busy') === 'false' },
    state() {
      const de = document.documentElement
      const csv = one('#view a[href$="/dashboard/export.csv"]')
      const logo = one('a.logo')
      return {
        h1: txt(one('h1')), headings: all('h1,h2').map((e) => e.tagName + ':' + txt(e)),
        src: vis(one('#src')) ? txt(one('#src')) : '', period: vis(one('#period')) ? txt(one('#period')) : '', note: vis(one('#note')) ? txt(one('#note')) : '', loaded: vis(one('#loaded')) ? txt(one('#loaded')) : '',
        logo: logo ? logo.getAttribute('href') : '', logoBox: rect('a.logo'),
        kpis: all('#view dl .kpi').filter(vis).map((k) => { const r = k.getBoundingClientRect(); return { label: txt(k.querySelector('dt')), value: txt(k.querySelector('.kpi-v')), x: Math.round(r.left), w: Math.round(r.width) } }),
        bar: one('#view .segbar') ? one('#view .segbar').getAttribute('aria-label') : '',
        parts: all('#view .parts li').map((li) => txt(li)),
        reasons: all('#view .reasons li').map((li) => txt(li)),
        tables: all('#view table').filter(vis).map((t) => ({ caption: txt(t.querySelector('caption')), rows: t.tBodies[0] ? t.tBodies[0].rows.length : 0, rowHeads: t.querySelectorAll('tbody th[scope=row]').length })),
        empties: all('#view .empty').map((e) => txt(e)),
        csv: csv && vis(csv) ? csv.getAttribute('href') : '',
        alert: vis(one('#alert')) ? txt(one('#alertMsg')) : '', retry: rect('#retry'), retryTxt: txt(one('#retry')), refresh: rect('#refresh'),
        skeleton: all('#view .sk').length,
        over: { iw: innerWidth, docW: de.scrollWidth, bodyW: document.body.scrollWidth },
      }
    },
  }
}

async function run(cdp) {
  for (const d of ['Page', 'Runtime', 'Log', 'Network']) await cdp.send(d + '.enable')
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `(${helpers.toString()})()` })
  cdp.on('Runtime.exceptionThrown', (p) => { const d = p.exceptionDetails || {}; errors.push(`[${step}] 예외: ` + String((d.exception && d.exception.description) || d.text).split('\n')[0]) })
  cdp.on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error') errors.push(`[${step}] console.error: ` + (p.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200)) })
  cdp.on('Log.entryAdded', (p) => { const e = p.entry || {}; if (e.level === 'error' && !(wantFail && e.source === 'network')) errors.push(`[${step}] ${e.source}: ${String(e.text).slice(0, 160)} ${e.url || ''}`) })

  const ev = async (expr) => { const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('페이지 계산 오류: ' + String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text).split('\n')[0]); return r.result.value }
  const waitFor = async (expr, what, ms = 8000) => { const end = Date.now() + ms; for (;;) { try { const v = await ev(`(() => { try { return (${expr}) } catch { return null } })()`); if (v) return v } catch {} if (Date.now() > end) throw new Error(`${what}: ${ms / 1000}초 기다려도 안 됨`); await sleep(120) } }
  const loadThen = async (fn) => { let done; const p = new Promise((r) => { done = r }); const f = () => done(); cdp.on('Page.loadEventFired', f); await fn(); await Promise.race([p, sleep(20000)]); cdp.off('Page.loadEventFired', f) }
  let touch = false
  const size = async (w, h, mobile) => {
    touch = !!mobile
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile: !!mobile, screenWidth: w, screenHeight: h })
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: !!mobile, maxTouchPoints: mobile ? 5 : 1 })
  }
  // 열고, 자료를 다 받을(또는 실패할) 때까지와 글꼴까지 기다린다
  const open = async (url) => {
    await loadThen(() => cdp.send('Page.navigate', { url }))
    await waitFor('__q.done()', '자료 받기 끝남', 15000)
    await ev('document.fonts.ready.then(() => true)'); await sleep(250)
    return ev('__q.state()')
  }
  const shot = async (name) => {
    if (!SHOTS) return
    mkdirSync(SHOTS, { recursive: true })
    const m = await cdp.send('Page.getLayoutMetrics'), s = m.cssContentSize || m.contentSize
    const r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: Math.ceil(s.width), height: Math.ceil(s.height), scale: 1 } })
    writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(r.data, 'base64'))
  }
  // 진짜로 누른다(PC 는 마우스, 휴대폰은 터치). 가려져 있으면 실패로 본다
  const tap = async (sel, label) => {
    const p = await ev(`__q.pt(document.querySelector(${J(sel)}))`)
    if (!p) throw new Error(`${label}: 화면에서 찾지 못했어요`)
    if (!p.hit) throw new Error(`${label}: 누를 자리가 다른 것에 가려져 있어요`)
    if (touch) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] }); await sleep(40); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }) }
    else for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: type === 'mouseMoved' ? 0 : 1 })
    await sleep(200)
  }
  const check = async (what, fn) => { step = what; let row; try { const r = await fn(); row = { what, ok: !!r.ok, evidence: r.evidence } } catch (e) { row = { what, ok: false, evidence: '오류: ' + e.message } } rows.push(row); console.log(`${row.ok ? 'OK  ' : 'FAIL'} ${what} :: ${row.evidence}`) }
  const filled = (v) => typeof v === 'string' && v.length > 0 // 값이 있거나 "—" 이면 된다 (빈칸만 아니면)
  const noScroll = (s, w) => s.over.docW <= w && s.over.bodyW <= w
  const kpiLine = (s) => s.kpis.map((k) => `${k.label}=${k.value}`).join(' / ')

  for (const [w, h, mobile] of [[1440, 900, false], [390, 844, true], [360, 740, true]]) {
    const P = mobile ? `휴대폰 ${w}x${h}` : `PC ${w}x${h}`
    const tag = mobile ? `m${w}` : 'pc'
    // 크기를 바꾸면 열려 있던 화면이 자료를 다시 받는다. 앞 단계의 화면이 끼어들지 않게 먼저 비운다
    await loadThen(() => cdp.send('Page.navigate', { url: 'about:blank' }))
    await size(w, h, mobile)
    wantFail = false
    let s = null
    await check(`${P} 1. 열림: 제목, 방봄 이름표, 표시(실제 집계/샘플), 기간·안내·불러온 시각`, async () => {
      s = await open(PAGE); await shot(`${tag}-dashboard`)
      const order = s.headings[0] === 'H1:이용 현황' && s.headings.slice(1).every((x) => x.startsWith('H2:')) && s.headings.length >= 3
      const ok = !s.alert && LABELS.includes(s.src) && order && s.logo === '/' && !!s.note && !!s.loaded && s.skeleton === 0 && (!mobile || (s.logoBox.h >= 44 && s.refresh.h >= 44))
      return { ok, evidence: `표시="${s.src}", 기간="${s.period}", 안내="${s.note.slice(0, 40)}…", "${s.loaded}", 제목 순서=${J(s.headings)}, 이름표 링크=${s.logo}(높이 ${s.logoBox ? s.logoBox.h : 0}px), 새로 고침 ${s.refresh ? s.refresh.w + 'x' + s.refresh.h : '없음'}px${s.alert ? ', 알림="' + s.alert + '"' : ''}` }
    })
    await check(`${P} 2. 핵심 숫자마다 값(없으면 —)이 있다`, async () => {
      const cols = new Set(s.kpis.map((k) => k.x)).size
      const ok = s.kpis.length >= 3 && s.kpis.every((k) => filled(k.label) && filled(k.value)) && (mobile ? cols === 1 : cols === 3)
      return { ok, evidence: `${s.kpis.length}개 (${cols}열): ${kpiLine(s)}` }
    })
    if (!mobile) {
      await check(`${P} 3. 판정 분포: 막대 하나 + 이름과 숫자`, async () => {
        // 판정 기록이 아직 없으면 막대 대신 "아직 쌓인 기록이 없어요" 가 보여야 한다
        const drawn = /요건 충족 .*확인 필요 .*미충족 /.test(s.bar || '') && s.parts.length === 3 && ['요건 충족', '확인 필요', '미충족'].every((n, i) => s.parts[i].startsWith(n) && /(\d%|—)/.test(s.parts[i]) && /\d건/.test(s.parts[i]))
        const ok = drawn || (!s.bar && s.empties.includes('아직 쌓인 기록이 없어요'))
        return { ok, evidence: drawn ? `막대="${s.bar}", 아래 글=${J(s.parts)}` : `막대 없음, 빈 안내=${J(s.empties)}` }
      })
    }
    await check(`${P} ${mobile ? 3 : 4}. 미충족 사유 목록${mobile ? '(세 가지까지)' : ''}`, async () => {
      const ok = (s.reasons.length >= 1 && (!mobile || s.reasons.length <= 3) && s.reasons.every((t) => /(\d건|—) (\d[\d.,]*%|—)$/.test(t))) || (s.reasons.length === 0 && s.empties.length > 0)
      return { ok, evidence: s.reasons.length ? J(s.reasons) : `목록 없음, 빈 안내=${J(s.empties)}` }
    })
    await check(`${P} ${mobile ? 4 : 5}. 표마다 설명(caption)과 줄이 있다`, async () => {
      // 샘플에는 대출·지원별 기록이 없어서 PC 표가 둘, 실제 집계면 셋이다
      const want = mobile ? [1, 1] : s.src === '샘플' ? [2, 2] : [3, 3]
      const ok = s.tables.length >= want[0] && s.tables.length <= want[1] && s.tables.every((t) => filled(t.caption) && t.rows >= 1 && t.rowHeads === t.rows) && (!mobile || s.tables[0].rows <= 5)
      return { ok, evidence: `표 ${s.tables.length}개: ` + s.tables.map((t) => `"${t.caption.slice(0, 18)}…" ${t.rows}줄`).join(', ') + (s.empties.length ? `, 빈 안내=${J(s.empties)}` : '') }
    })
    await check(`${P} ${mobile ? 5 : 6}. 가로 스크롤 없음${mobile ? ', 휴대폰에는 PC 전용 항목 없음' : ', CSV 내려받기 링크'}`, async () => {
      const ok = noScroll(s, w) && (mobile ? !s.bar && !s.csv : s.csv === '/backend/dashboard/export.csv')
      return { ok, evidence: `가로 ${s.over.docW}/${w}, ${mobile ? `판정 막대 보임=${!!s.bar}, CSV 링크 보임=${!!s.csv}` : `CSV 링크=${s.csv || '없음'}`}` }
    })
    await check(`${P} ${mobile ? 6 : 7}. 새로 고침을 누르면 다시 불러온다`, async () => {
      await ev(`document.querySelector('#loadedAt').textContent = '검사'`)
      await tap('#refresh', '새로 고침'); await waitFor(`__q.done() && document.querySelector('#loadedAt').textContent !== '검사'`, '다시 불러옴', 12000)
      const b = await ev('__q.state()')
      return { ok: !b.alert && LABELS.includes(b.src) && b.kpis.length >= 3 && noScroll(b, w), evidence: `"${b.loaded}", 표시="${b.src}", 핵심 숫자 ${b.kpis.length}개` }
    })
    if (w === 360) continue
    // 통계 서버에 닿지 못할 때 (backend=down → 없는 주소를 부른다)
    wantFail = true
    await check(`${P} ${mobile ? 7 : 8}. backend=down: 연결하지 못했다는 안내와 다시 불러오기 단추`, async () => {
      const d = await open(PAGE + '&backend=down'); await shot(`${tag}-down`)
      await tap('#retry', '다시 불러오기'); await waitFor('__q.done()', '다시 시도 끝남', 12000); await sleep(150)
      const e = await ev('__q.state()')
      const ok = d.alert === DOWN && !!d.retry && d.retry.h >= 44 && d.retryTxt === '다시 불러오기' && d.kpis.length === 0 && d.tables.length === 0 && d.skeleton === 0 && !d.src && noScroll(d, w) && e.alert === DOWN && e.retryTxt === '다시 불러오기'
      return { ok, evidence: `알림="${d.alert}", 단추="${d.retryTxt}" ${d.retry ? d.retry.w + 'x' + d.retry.h : '없음'}px, 숫자 ${d.kpis.length}개·표 ${d.tables.length}개·뼈대 ${d.skeleton}개, 가로 ${d.over.docW}/${w}, 다시 눌러도 알림="${e.alert}"` }
    })
  }
  step = '끝'
}

async function main() {
  if (!EDGE) { console.log('Edge(또는 Chrome)를 찾지 못했어요. EDGE_PATH 환경변수로 실행 파일 위치를 알려 주세요.'); process.exit(1) }
  const port = await new Promise((res, rej) => { const s = net.createServer(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)) }) })
  const profile = mkdtempSync(path.join(os.tmpdir(), 'bangbom-dash-e2e-'))
  const child = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--remote-allow-origins=*', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync', '--mute-audio', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' })
  let timer
  try {
    let target
    for (let i = 0; i < 100 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((e) => e.type === 'page') } catch {} if (!target) await sleep(150) }
    if (!target) throw new Error('브라우저가 뜨지 않았어요')
    const ws = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', () => rej(new Error('브라우저 연결 실패'))) })
    await Promise.race([run(new Cdp(ws)), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('시간 제한(3분)에 걸렸어요. 마지막 단계: ' + step)), 180000) })])
  } catch (e) { rows.push({ what: '실행', ok: false, evidence: '중단: ' + e.message }); console.log('FAIL 실행 :: ' + e.message) } finally {
    clearTimeout(timer)
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); else child.kill('SIGKILL')
    for (let i = 0; i < 8; i++) { try { rmSync(profile, { recursive: true, force: true }); break } catch { await sleep(300) } }
  }
  const clean = errors.length === 0
  rows.push({ what: '콘솔 오류·화면 예외 없음', ok: clean, evidence: clean ? '0건' : J(errors) })
  console.log(`${clean ? 'OK  ' : 'FAIL'} 콘솔 오류·화면 예외 없음 :: ${clean ? '0건 (backend=down 에서 없는 주소를 부른 한 줄은 세지 않음)' : J(errors, null, 1)}`)
  const bad = rows.filter((r) => !r.ok)
  console.log(`\n${BASE} · 검사 ${rows.length}개 중 통과 ${rows.length - bad.length}개, 실패 ${bad.length}개 (엔진: Chromium(Edge) 헤드리스, 휴대폰은 크기 흉내 + 합성 터치)`)
  process.exit(bad.length ? 1 : 0)
}
main()
