// 마크다운 보고서를 A4 PDF로 만든다(심사 준비 자료용).
// 쓰는 법:  npm run report -- reports/<이름>.md [다른.md ...]
// 결과:     reports/pdf/<이름>.pdf  (중간 결과인 <이름>.html 도 같은 폴더에 남는다)
// 이 PC에 깔린 Edge나 Chrome을 화면 없이 띄워서 인쇄한다. 인터넷이 없어도 된다.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { Marked } from 'marked'

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..')
const OUT_DIR = path.join(PROJECT_ROOT, 'reports', 'pdf')

/** 브라우저를 찾아볼 자리. 위에서부터 차례로 본다. */
const BROWSER_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
  '/snap/bin/chromium',
]

const MIME_BY_EXT = /** @type {Record<string, string>} */ ({
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
})

const STYLE = `
@page { size: A4; margin: 18mm 16mm 18mm 16mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  margin: 0;
  font-family: "Noto Sans KR", "Malgun Gothic", sans-serif;
  font-size: 10.5pt;
  line-height: 1.7;
  color: #1f2933;
  background: #ffffff;
  word-break: keep-all;
  overflow-wrap: anywhere;
}
.title-block {
  border-top: 3px solid #456a8c;
  border-bottom: 1px solid #d9dee4;
  padding: 14pt 0 12pt;
  margin: 0 0 18pt;
}
.title-block .title { font-size: 22pt; font-weight: 700; line-height: 1.3; color: #1f2933; margin: 0; }
.title-block .subtitle { font-size: 12pt; color: #456a8c; margin: 6pt 0 0; }
.title-block .date { font-size: 9.5pt; color: #6b7785; margin: 8pt 0 0; }
h1, h2, h3, h4 { line-height: 1.35; color: #1f2933; break-after: avoid; page-break-after: avoid; }
h1 { font-size: 19pt; margin: 0 0 12pt; padding-bottom: 6pt; border-bottom: 2px solid #456a8c; }
h2 { font-size: 14pt; margin: 22pt 0 8pt; padding-left: 8pt; border-left: 4px solid #456a8c; }
h3 { font-size: 11.5pt; margin: 16pt 0 6pt; color: #456a8c; }
h4 { font-size: 10.5pt; margin: 12pt 0 4pt; }
p { margin: 0 0 8pt; orphans: 2; widows: 2; }
a { color: #456a8c; text-decoration: none; border-bottom: 1px solid #b9c7d6; }
strong { font-weight: 700; }
ul, ol { margin: 0 0 8pt; padding-left: 18pt; }
li { margin: 2pt 0; }
li > ul, li > ol { margin-bottom: 0; }
hr { border: 0; border-top: 1px solid #d9dee4; margin: 16pt 0; }
table {
  width: 100%;
  border-collapse: collapse;
  margin: 8pt 0 12pt;
  font-size: 9.5pt;
  line-height: 1.5;
}
th, td {
  border: 0.5pt solid #c9d1da;
  padding: 5pt 7pt;
  text-align: left;
  vertical-align: top;
}
th { background: #eef2f6; color: #2f4b66; font-weight: 700; }
tr { break-inside: avoid; page-break-inside: avoid; }
thead { display: table-header-group; }
code {
  font-family: Consolas, "D2Coding", "Malgun Gothic", monospace;
  font-size: 9pt;
  background: #f1f3f5;
  border-radius: 3px;
  padding: 1pt 3pt;
}
pre {
  background: #f6f7f9;
  border: 0.5pt solid #d9dee4;
  border-radius: 4px;
  padding: 8pt 10pt;
  margin: 8pt 0 12pt;
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.5;
  break-inside: avoid;
  page-break-inside: avoid;
}
pre code { background: none; padding: 0; font-size: 8.8pt; }
blockquote {
  margin: 10pt 0 12pt;
  padding: 8pt 12pt;
  background: #eef2f6;
  border: 0.5pt solid #c5d2de;
  border-radius: 4px;
  color: #2f3d4a;
  break-inside: avoid;
  page-break-inside: avoid;
}
blockquote > :last-child { margin-bottom: 0; }
img { max-width: 100%; height: auto; display: block; margin: 8pt auto; break-inside: avoid; }
input[type="checkbox"] { margin-right: 4pt; }
`

/** @param {string} text */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 오류를 알리고 끝낸다. @param {string} message @returns {never} */
function fail(message) {
  console.error(message)
  process.exit(1)
}

/**
 * 맨 위의 머리말(--- 사이의 "이름: 값" 줄)을 떼어 낸다. 없으면 본문 그대로.
 * @param {string} source
 * @returns {{ meta: Record<string, string>, body: string }}
 */
export function splitFrontMatter(source) {
  const text = source.replace(/^\uFEFF/, '')
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)
  if (!match) return { meta: {}, body: text }
  /** @type {Record<string, string>} */
  const meta = {}
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^\s*([A-Za-z가-힣_-]+)\s*:\s*(.*)$/.exec(line)
    if (!pair) continue
    meta[pair[1].toLowerCase()] = pair[2].trim().replace(/^(["'])(.*)\1$/, '$2')
  }
  return { meta, body: text.slice(match[0].length) }
}

/**
 * 마크다운 파일 옆에 있는 그림을 HTML 안에 넣는다(파일 하나로 끝나게).
 * @param {string} html
 * @param {string} baseDir
 * @returns {string}
 */
function embedImages(html, baseDir) {
  return html.replace(/(<img\b[^>]*?\ssrc=")([^"]+)(")/g, (whole, before, src, after) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(src)) return whole // http, data 등은 그대로
    let decoded = src
    try {
      decoded = decodeURIComponent(src)
    } catch {
      // 주소 모양이 아니면 적힌 그대로 쓴다.
    }
    const file = path.resolve(baseDir, decoded)
    const mime = MIME_BY_EXT[path.extname(file).toLowerCase()]
    if (!mime || !fs.existsSync(file)) {
      console.warn(`그림을 찾지 못해 그대로 뒀어요: ${src}`)
      return whole
    }
    const data = fs.readFileSync(file).toString('base64')
    return `${before}data:${mime};base64,${data}${after}`
  })
}

/**
 * 마크다운 글을 혼자서도 열리는 HTML 한 장으로 바꾼다.
 * @param {string} source 마크다운 글
 * @param {string} baseDir 그림 경로의 기준 폴더
 * @param {string} fallbackTitle 머리말에 제목이 없을 때 쓸 문서 제목
 * @returns {string}
 */
export function renderHtml(source, baseDir, fallbackTitle) {
  const { meta, body } = splitFrontMatter(source)
  const marked = new Marked({ gfm: true, breaks: false })
  const content = embedImages(marked.parse(body, { async: false }), baseDir)

  const title = meta.title ?? meta['제목'] ?? ''
  const subtitle = meta.subtitle ?? meta['부제'] ?? ''
  const date = meta.date ?? meta['날짜'] ?? ''
  const titleBlock =
    title || subtitle || date
      ? [
          '<header class="title-block">',
          title ? `<p class="title">${escapeHtml(title)}</p>` : '',
          subtitle ? `<p class="subtitle">${escapeHtml(subtitle)}</p>` : '',
          date ? `<p class="date">${escapeHtml(date)}</p>` : '',
          '</header>',
        ].join('\n')
      : ''

  return [
    '<!doctype html>',
    '<html lang="ko">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeHtml(title || fallbackTitle)}</title>`,
    `<style>${STYLE}</style>`,
    '</head>',
    '<body>',
    titleBlock,
    `<main>${content}</main>`,
    '</body>',
    '</html>',
    '',
  ].join('\n')
}

/** 쓸 수 있는 브라우저 실행 파일을 찾는다. 없으면 null. @returns {string | null} */
function findBrowser() {
  const fromEnv = process.env.BROWSER_PATH
  const candidates = fromEnv ? [fromEnv, ...BROWSER_CANDIDATES] : BROWSER_CANDIDATES
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

/**
 * 브라우저를 화면 없이 띄워 PDF로 인쇄한다.
 * @param {string} browser
 * @param {string} htmlPath
 * @param {string} pdfPath
 * @param {string | null} profileDir 따로 쓸 임시 프로필 폴더(없으면 기본)
 */
function printToPdf(browser, htmlPath, pdfPath, profileDir) {
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    ...(profileDir ? [`--user-data-dir=${profileDir}`] : []),
    `--print-to-pdf=${pdfPath}`,
    pathToFileURL(htmlPath).href,
  ]
  return spawnSync(browser, args, { stdio: 'ignore', timeout: 90_000, windowsHide: true })
}

/** @param {string} pdfPath */
function pdfExists(pdfPath) {
  return fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 0
}

/**
 * 마크다운 파일 하나를 PDF로 만든다.
 * @param {string} markdownPath
 * @param {string} browser
 * @returns {string} 만들어진 PDF 경로
 */
function makeReport(markdownPath, browser) {
  const source = path.resolve(markdownPath)
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
    fail(`마크다운 파일을 찾지 못했어요: ${markdownPath}`)
  }
  const name = path.basename(source, path.extname(source))
  const htmlPath = path.join(OUT_DIR, `${name}.html`)
  const pdfPath = path.join(OUT_DIR, `${name}.pdf`)

  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(htmlPath, renderHtml(fs.readFileSync(source, 'utf8'), path.dirname(source), name))
  // 예전 PDF가 남아 있으면 새로 만들어졌는지 알 수 없으니 먼저 지운다.
  try {
    fs.rmSync(pdfPath, { force: true })
  } catch {
    fail(`예전 PDF를 지우지 못했어요. PDF 보기 창을 닫고 다시 실행해 주세요: reports/pdf/${name}.pdf`)
  }

  printToPdf(browser, htmlPath, pdfPath, null)
  if (!pdfExists(pdfPath)) {
    // 같은 브라우저가 이미 열려 있으면 인쇄가 조용히 넘어갈 때가 있다. 임시 프로필로 한 번 더 해 본다.
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'make-report-'))
    try {
      printToPdf(browser, htmlPath, pdfPath, profileDir)
    } finally {
      try {
        fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
      } catch {
        // 임시 폴더는 못 지워도 결과에는 영향이 없다.
      }
    }
  }
  if (!pdfExists(pdfPath)) {
    fail(
      `PDF가 만들어지지 않았어요: reports/pdf/${name}.pdf\n` +
        `브라우저(${path.basename(browser)})가 인쇄를 끝내지 못했어요. 열려 있는 브라우저 창을 모두 닫고 다시 실행해 주세요.`,
    )
  }
  return pdfPath
}

function main() {
  const inputs = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
  if (inputs.length === 0) {
    fail('쓰는 법: npm run report -- reports/<이름>.md [다른.md ...]')
  }
  const browser = findBrowser()
  if (!browser) {
    fail(
      'PDF를 만들 브라우저(Edge 또는 Chrome)를 찾지 못했어요.\n' +
        'Edge나 Chrome을 설치하거나, BROWSER_PATH 환경변수에 브라우저 실행 파일 경로를 넣고 다시 실행해 주세요.',
    )
  }
  for (const input of inputs) {
    const pdfPath = makeReport(input, browser)
    const sizeKb = Math.round(fs.statSync(pdfPath).size / 1024)
    const shown = path.relative(PROJECT_ROOT, pdfPath).split(path.sep).join('/')
    console.log(`PDF를 만들었어요: ${shown} (${sizeKb} kB)`)
  }
}

main()
