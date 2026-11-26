// 비밀값(API 열쇠 등)이 올리면 안 되는 곳에 들어가 있는지 찾는 도구.
// 값 자체는 절대 화면에 찍지 않는다. "어느 파일 몇째 줄에 무엇 종류가 있는지"만 알려 준다.
//
// 쓰는 법
//   node scripts/check-secrets.mjs                   이 프로젝트 폴더 전체 (node_modules, .git 같은 폴더는 제외)
//   node scripts/check-secrets.mjs <폴더·파일> […]    고른 폴더나 파일
//   node scripts/check-secrets.mjs --staged [저장소]   git에 올리려고 담아 둔(staged) 내용만 (커밋 전 검사용)
//   node scripts/check-secrets.mjs --history [저장소]  git 기록 전체: 커밋된 내용과 커밋 설명 글 (올리기 전 검사용)
//   node scripts/check-secrets.mjs --stdin [폴더]      표준 입력으로 받은 파일 이름들만 (이름 사이는 빈 바이트. 묶어 보내기 전 검사용)
//   옵션: --known <파일>  이 파일(.env 등)에 적힌 실제 값과 똑같은 글자가 있는지도 찾는다 (여러 번 줄 수 있다)
// 문제를 찾으면 끝낼 때 1을 돌려준다(커밋·올리기·묶기 중단), 없으면 0.
// 잡지 못하는 것(PDF·오피스·한글 문서 속 글, 그림 속 글자, 일부러 모양을 바꾼 값)은 docs/SECURITY.md 에 적어 두었다.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 아무렇게나 만든 값처럼 보이는지: 소문자·대문자·숫자 가운데 두 가지 이상이 섞여 있다.
 * 설명 글(your_token_here)이나 다른 설정 이름(KV_REST_API_TOKEN)을 값으로 잘못 짚지 않으려고 본다
 * @param {string} value
 */
function looksRandom(value) {
  return [/[a-z]/, /[A-Z]/, /[0-9]/].filter((kind) => kind.test(value)).length >= 2
}

/**
 * 비밀값의 모양들. 값은 찍지 않고 종류 이름만 쓴다. 셋째 칸이 있으면 괄호로 잡은 값이 그 검사도 통과해야 한다
 * @type {[kind: string, pattern: RegExp, accept?: (value: string) => boolean][]}
 */
const PATTERNS = [
  ['Anthropic API 열쇠', /sk-ant-[A-Za-z0-9_-]{20,}/g],
  ['OpenAI 모양 열쇠', /sk-(?:proj-)?[A-Za-z0-9]{32,}/g],
  ['GitHub 토큰', /gh[pousr]_[A-Za-z0-9]{30,}/g],
  ['AWS 접근 열쇠', /AKIA[0-9A-Z]{16}/g],
  ['비공개 열쇠 파일', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  ['Upstash·Redis 접속 주소(비밀번호 포함)', /rediss?:\/\/[^\s:@/"']*:[^\s@/"']{12,}@/g],
  ['Vercel 토큰', /vercel_[A-Za-z0-9]{24,}/g],
  // 정해진 머리글자가 없는 값(Upstash 토큰 등)은 "이름 = 긴 값" 모양으로 찾는다. 값은 같은 줄에 있어야 한다(빈 설정 다음 줄의 이름을 값으로 보지 않게)
  [
    '이름이 TOKEN·SECRET·PASSWORD·KEY로 끝나는 설정에 긴 값이 적혀 있음',
    /(?:TOKEN|SECRET|PASSWORD|PASSWD|(?:API|PRIVATE|SECRET|ACCESS)_?KEY)["']?\]?[ \t]*[:=][ \t]*["']?([A-Za-z0-9+/_-]{24,})/g,
    looksRandom,
  ],
  ['Bearer 뒤에 긴 값이 적혀 있음', /Bearer[ \t]+([A-Za-z0-9+/_=-]{24,})/g, looksRandom],
]

/** 폴더를 훑을 때 들어가지 않는 폴더 */
const SKIP_DIRS = new Set(['node_modules', '.git', '.venv', 'venv', '__pycache__', '.pytest_cache'])
/** 열쇠를 두라고 만든 파일: 폴더를 훑을 때 여기서 찾은 것은 "제자리"로 본다 */
const ENV_FILE = /(^|[\\/])\.env(\.[A-Za-z0-9_.-]+)?$/
/** 웹으로 내보내는 폴더: 이 안에 놓인 열쇠 파일은 제자리가 아니라 그대로 공개되는 파일이다 */
const PUBLISHED_DIR = /(^|[\\/])(dist|public|build|out|output|static|www)[\\/]/i
/** 값 없이 이름만 적어 두는 보기 파일: 올리는 파일이라서, 여기에 진짜 값이 있으면 어디서든 문제로 본다 */
const ENV_EXAMPLE = /(^|[\\/])\.env\.(example|sample|template)$/
/** 이름만으로 올리기를 막는 파일: 열쇠 파일과 그 사본(.env.local, ".env - 복사본.local", "복사본.env") */
const ENV_NAME = /(^|[\\/])(\.env[^\\/]*|[^\\/]*\.env)$/i
/** 속을 들여다볼 수 없는 압축 파일 */
const ARCHIVE = /\.(zip|7z|rar|tar|gz|tgz|bz2|tbz2|xz|txz|zst)$/i
/** 압축 파일의 첫머리 글자(zip 두 가지, gzip, 7z, rar, xz, zstd 순서): 이름을 바꿔 놓아도 내용으로 알아본다 */
const ARCHIVE_HEADS = ['PK\x03\x04', 'PK\x05\x06', '\x1f\x8b\x08', '7z\xbc\xaf\x27\x1c', 'Rar!\x1a\x07', '\xfd7zXZ\x00', '\x28\xb5\x2f\xfd']

/**
 * 내용 첫머리가 압축 파일 모양인지 (bzip2는 첫머리가 보통 글자라서 따로 본다)
 * @param {string} text 바이트 그대로(latin1) 읽은 글
 */
function looksPacked(text) {
  return ARCHIVE_HEADS.some((head) => text.startsWith(head)) || /^BZh[1-9]1AY&SY/.test(text)
}

/** 글이 눌려 담겨서 속까지는 볼 수 없는 문서 */
const OPAQUE_DOC = /\.(pdf|docx?|xlsx?|pptx?|hwpx?|odt|ods|odp)$/i
const MAX_MB = 30
const MAX_BYTES = MAX_MB * 1024 * 1024
const MAX_GIT_BYTES = 1024 * 1024 * 1024
/** 목록이 길 때 화면에 보여 줄 이름 수 */
const SHOW_NAMES = 10

/**
 * 검사를 하지 못한 채로 "문제 없음"이 되지 않게, 이유를 알리고 실패로 끝낸다
 * @param {string} message
 * @returns {never}
 */
function stop(message) {
  console.error(`비밀값 검사를 하지 못했어요: ${message}`)
  process.exit(1)
}

const MODES = ['--staged', '--history', '--stdin']
const args = process.argv.slice(2)
/** @type {string[]} */
const modes = []
/** @type {string[]} */
const knownFiles = []
/** @type {string[]} */
const targets = []
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i]
  if (arg === '--known') {
    if (args[i + 1] === undefined) stop('--known 뒤에 파일 이름이 없어요.')
    knownFiles.push(args[i + 1])
    i += 1
  } else if (MODES.includes(arg)) modes.push(arg)
  // 잘못 쓴 옵션을 모른 척하면 엉뚱한 곳을 살피고 "문제 없음"이라고 하게 된다
  else if (arg.startsWith('--')) stop(`모르는 옵션이에요: ${arg}`)
  else targets.push(arg)
}
if (modes.length > 1) stop(`${modes.join(', ')} 가운데 하나만 골라 주세요.`)
const mode = modes[0] ?? 'folder'

/**
 * 폴더 안에서 열쇠를 두는 파일들(.env, .env.local 등. 보기 파일은 뺀다)
 * @param {string} dir
 * @returns {string[]}
 */
function envFilesIn(dir) {
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => ENV_NAME.test(name) && !ENV_EXAMPLE.test(name))
      .map((name) => path.join(dir, name))
  } catch {
    return []
  }
}

/** 값이 길어도 비밀이 아닌 설정의 이름 끝(모델 이름, 주소, 경로 등). 이런 값까지 배우면 문서에 적힌 모델 이름을 비밀값으로 잘못 짚는다 */
const PLAIN_NAME = /(MODEL|ORIGINS?|HOST|PORT|PATH|DIR|MODE|ENV|CAP|NAME|REGION|VERSION)$/

/**
 * .env 모양 파일에서 값만 읽는다 (화면에 찍지 않는다). 짧은 값은 헛짚기 쉬워서 뺀다
 * @param {string[]} files
 * @returns {string[]}
 */
function readKnownValues(files) {
  /** @type {Set<string>} */
  const values = new Set()
  for (const file of files) {
    let text
    try {
      // 살필 글과 똑같이 바이트 그대로 읽고 빈 바이트를 뺀다 (UTF-16으로 저장된 파일에서도 값을 배운다)
      text = fs.readFileSync(file, 'latin1').replaceAll('\0', '')
    } catch {
      continue
    }
    for (const line of text.split(/\r?\n/)) {
      const at = line.indexOf('=')
      if (at < 1 || line.trim().startsWith('#')) continue
      const raw = line.slice(at + 1).trim()
      const quoted = /^(["'])(.*)\1(\s+#.*)?$/.exec(raw)
      // 따옴표 없는 값 뒤의 설명(# …)은 값이 아니다
      const value = quoted ? quoted[2] : raw.replace(/\s+#.*$/, '')
      // 모델 이름이나 경로처럼 비밀이 아닌 설정은 배우지 않는다. 단, 값 안에 비밀번호가 든 주소(…:비밀번호@…)는 배운다
      const plain = PLAIN_NAME.test(line.slice(0, at).trim()) && !/:[^/@\s]+@/.test(value)
      if (value.length >= 20 && !plain && !/^https?:\/\/[^@]*$/.test(value)) values.add(value)
    }
  }
  // 같은 값을 다른 모양(base64, 주소용 글자)으로 바꿔 넣은 것도 찾는다
  const all = new Set(values)
  for (const value of values) {
    all.add(Buffer.from(value, 'latin1').toString('base64'))
    all.add(encodeURIComponent(value))
  }
  return [...all].filter((v) => v.length >= 20)
}

// 기본으로 이 프로젝트와, 옆 폴더의 백엔드(있을 때)가 쓰는 열쇠 파일에 적힌 실제 값도 함께 찾는다.
// 값은 이 안에서 비교하는 데만 쓰고 어디에도 찍지 않는다
const KNOWN = readKnownValues([
  ...envFilesIn(ROOT),
  ...envFilesIn(path.join(ROOT, '.vercel')),
  ...envFilesIn(path.join(ROOT, '..', 'modelhouse_v3', 'backend')),
  ...knownFiles,
])

/** @typedef {{ where: string, line: number, kind: string, expected: boolean }} Hit */
/** @type {Hit[]} */
const hits = []
/** 살피지 못하고 넘어간 것. 조용히 넘기지 않고 이름과 까닭을 적는다 @type {{ where: string, why: string }[]} */
const skipped = []
/** 글이 눌려 담겨서 속까지는 보지 못한 파일 @type {string[]} */
const opaque = []
let scanned = 0

/**
 * 화면에 보여 줄 이름: 지금 폴더 안이면 짧게 쓴다 (내 PC 경로가 보고서에 따라 들어가지 않게)
 * @param {string} file
 */
function shown(file) {
  const relative = path.relative(process.cwd(), file)
  if (relative === '') return '.'
  return relative.startsWith('..') || path.isAbsolute(relative) ? file : relative.split(path.sep).join('/')
}

/**
 * @param {string} text 바이트 그대로(latin1) 읽은 글
 * @param {string} where
 * @param {boolean} expected
 * @param {boolean} [numbered] 줄 번호를 셀지 (git 기록에서는 뜻이 없어서 세지 않는다)
 */
function scanText(text, where, expected, numbered = true) {
  if (!text) return
  // UTF-16·UTF-32로 저장된 글은 글자 사이에 빈 바이트가 끼어 있다. 빼고 보면 같은 모양이 된다
  const clean = text.replaceAll('\0', '')
  const lineAt = (/** @type {number} */ index) => {
    if (!numbered) return 0
    let line = 1
    for (let i = 0; i < index; i += 1) if (clean.charCodeAt(i) === 10) line += 1
    return line
  }
  for (const [kind, pattern, accept] of PATTERNS) {
    pattern.lastIndex = 0
    for (let m = pattern.exec(clean); m; m = pattern.exec(clean)) {
      if (!accept || accept(m[1])) hits.push({ where, line: lineAt(m.index), kind, expected })
    }
  }
  for (const value of KNOWN) {
    for (let at = clean.indexOf(value); at >= 0; at = clean.indexOf(value, at + value.length)) {
      hits.push({ where, line: lineAt(at), kind: '실제 쓰는 값과 똑같은 글자', expected })
    }
  }
}

/**
 * 밖으로 나갈 파일 하나를 이름과 내용으로 살핀다 (커밋·묶음용). 읽지 못하면 통과가 아니라 문제로 친다
 * @param {string} name
 * @param {() => string} read 내용을 바이트 그대로(latin1) 읽어 주는 함수
 */
function checkOutgoing(name, read) {
  if (ENV_NAME.test(name) && !ENV_EXAMPLE.test(name)) {
    hits.push({ where: name, line: 0, kind: '열쇠 파일(.env) 자체를 올리려고 함', expected: false })
  }
  /** @type {string | null} */
  let text = null
  try {
    text = read()
  } catch {
    hits.push({ where: name, line: 0, kind: '내용을 읽지 못해서 살피지 못함', expected: false })
  }
  const document = OPAQUE_DOC.test(name)
  // 압축 파일은 이름으로도, 내용 첫머리로도 알아본다 (문서 파일은 속이 zip이어도 막지 않고 아래에서 알리기만 한다)
  if (ARCHIVE.test(name) || (!document && text !== null && looksPacked(text))) {
    hits.push({ where: name, line: 0, kind: '압축 파일(속을 들여다볼 수 없어서 올리지 않아요)', expected: false })
  } else if (document || text?.startsWith('%PDF-')) opaque.push(name)
  if (text === null) return
  scanned += 1
  scanText(text, name, false)
}

/**
 * 열쇠 파일이 제자리에 있는지: 이름이 .env 모양이고, 웹으로 내보내는 폴더(dist, public 등) 안이 아니다
 * @param {string} file
 * @param {string} base 훑기 시작한 폴더
 */
function isEnvInPlace(file, base) {
  if (!ENV_FILE.test(file) || ENV_EXAMPLE.test(file)) return false
  // 프로젝트 안의 파일은 프로젝트 폴더부터, 밖의 파일은 훑기 시작한 폴더(그 이름 포함)부터의 길을 본다
  const fromRoot = path.relative(ROOT, file)
  const outside = fromRoot.startsWith('..') || path.isAbsolute(fromRoot)
  const inner = outside ? path.join(path.basename(base), path.relative(base, file)) : fromRoot
  return !PUBLISHED_DIR.test(inner)
}

/**
 * @param {string} file
 * @param {string} base 훑기 시작한 폴더
 */
function scanFile(file, base) {
  const where = shown(file)
  let stat
  try {
    stat = fs.statSync(file)
  } catch {
    skipped.push({ where, why: '읽지 못했어요' })
    return
  }
  if (stat.isDirectory()) {
    // 바로가기(링크)로 걸린 폴더는 끝없이 돌 수 있어서 들어가지 않는다
    skipped.push({ where, why: '바로가기(링크) 폴더라서 들어가지 않았어요' })
    return
  }
  if (!stat.isFile()) return
  if (stat.size > MAX_BYTES) {
    skipped.push({ where, why: `${MAX_MB}MB보다 커서 살피지 않았어요` })
    return
  }
  let text
  try {
    text = fs.readFileSync(file, 'latin1') // 어떤 글자 표든 바이트 그대로 읽어 영문·숫자 모양을 찾는다
  } catch {
    skipped.push({ where, why: '읽지 못했어요' })
    return
  }
  if (ARCHIVE.test(file) || OPAQUE_DOC.test(file) || looksPacked(text) || text.startsWith('%PDF-')) opaque.push(where)
  scanned += 1
  scanText(text, where, isEnvInPlace(file, base))
}

/**
 * @param {string} dir
 * @param {string} base 훑기 시작한 폴더
 */
function walk(dir, base) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    skipped.push({ where: shown(dir), why: '폴더를 읽지 못했어요' })
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full, base)
    } else scanFile(full, base)
  }
}

/**
 * @param {string[]} argv
 * @param {string} cwd
 * @param {'latin1' | 'utf8'} [encoding] 파일 내용은 latin1(바이트 그대로), 파일 이름은 utf8로 읽는다
 */
function git(argv, cwd, encoding = 'latin1') {
  return execFileSync('git', argv, { cwd, encoding, maxBuffer: MAX_GIT_BYTES, stdio: ['ignore', 'pipe', 'ignore'] })
}

/**
 * 내용 번호(해시)로 파일 내용을 한꺼번에 읽는다. 파일 이름을 명령줄에 넘기지 않아서 한글 이름도 그대로 읽힌다
 * @param {string[]} ids
 * @param {string} cwd
 * @returns {(string | null)[]} 읽지 못한 것은 null
 */
function readBlobs(ids, cwd) {
  /** @type {(string | null)[]} */
  const texts = []
  if (ids.length === 0) return texts
  let out
  try {
    out = execFileSync('git', ['cat-file', '--batch'], {
      cwd,
      input: `${ids.join('\n')}\n`,
      maxBuffer: MAX_GIT_BYTES,
      stdio: ['pipe', 'pipe', 'ignore'],
    })
  } catch {
    return ids.map(() => null)
  }
  // 답은 "번호 종류 크기" 한 줄 뒤에 내용이 그 크기만큼 온다. 없는 것은 "번호 missing" 한 줄뿐이다
  let at = 0
  for (const id of ids) {
    const lineEnd = out.indexOf(10, at)
    const [gotId, type, size] = lineEnd < 0 ? [] : out.toString('latin1', at, lineEnd).split(' ')
    if (gotId !== id) break // 순서가 어긋나면 남은 것은 모두 "읽지 못함"으로 둔다
    if (type === 'missing') {
      texts.push(null)
      at = lineEnd + 1
      continue
    }
    const start = lineEnd + 1
    const end = start + Number(size)
    if (!(end <= out.length)) break
    texts.push(type === 'blob' ? out.toString('latin1', start, end) : null)
    at = end + 1
  }
  while (texts.length < ids.length) texts.push(null)
  return texts
}

/** @type {string} */
let label
if (mode === '--staged') {
  const cwd = targets[0] ?? ROOT
  let raw
  try {
    // 지워지는 것만 빼고, 담긴 것을 모두 본다. 이름은 한글일 수 있어서 utf8로 읽는다
    raw = git(['diff', '--cached', '--raw', '--no-abbrev', '--no-renames', '--diff-filter=d', '-z'], cwd, 'utf8').split('\0')
  } catch {
    stop('git에 담아 둔 목록을 읽지 못했어요. git 저장소 폴더가 맞는지 확인해 주세요.')
  }
  /** @type {{ name: string, id: string }[]} */
  const entries = []
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const [, fileMode, , id] = raw[i].split(' ')
    // 160000은 다른 저장소를 가리키는 표시다. 표시만 올라가고 그 안의 파일은 올라가지 않는다
    if (fileMode !== '160000') entries.push({ name: raw[i + 1], id })
  }
  const texts = readBlobs(
    entries.map((entry) => entry.id),
    cwd,
  )
  entries.forEach((entry, index) => {
    checkOutgoing(entry.name, () => {
      const text = texts[index]
      if (text === null) throw new Error('unreadable')
      return text
    })
  })
  label = `git에 담아 둔(staged) 내용, 파일 ${entries.length}개`
} else if (mode === '--history') {
  const cwd = targets[0] ?? ROOT
  let count = 0
  try {
    const commits = git(['rev-list', '--all'], cwd, 'utf8').split('\n').filter(Boolean)
    count = commits.length
    // 어느 커밋에서 나왔는지 알 수 있게, 내용에 나올 수 없는 표시를 커밋마다 앞에 붙여서 받는다
    const mark = `@@commit-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}@@`
    for (let i = 0; i < commits.length; i += 40) {
      // --text: 글이 아니라고 본 파일(UTF-16 등)도 내용을 그대로 받는다. -m: 합친 커밋에서 바뀐 것도 받는다
      const out = git(
        ['show', '-m', '--text', '--no-color', '--no-ext-diff', '--no-textconv', `--format=${mark}%h%n%B`, ...commits.slice(i, i + 40)],
        cwd,
      )
      for (const part of out.split(mark).slice(1)) {
        scanText(part, `커밋 ${part.slice(0, part.indexOf('\n'))}`, false, false)
      }
    }
  } catch {
    stop('git 기록을 읽지 못했어요. git 저장소 폴더가 맞는지, 기록이 너무 크지 않은지 확인해 주세요.')
  }
  label = `git 기록 전체(커밋된 내용과 설명 글), 커밋 ${count}개`
} else if (mode === '--stdin') {
  const base = path.resolve(targets[0] ?? '.')
  let names
  try {
    names = fs.readFileSync(0, 'utf8').split('\0').filter(Boolean)
  } catch {
    stop('표준 입력에서 파일 목록을 읽지 못했어요.')
  }
  for (const name of names) checkOutgoing(name, () => fs.readFileSync(path.resolve(base, name), 'latin1'))
  label = `넘겨받은 파일 목록, 파일 ${names.length}개`
} else {
  const places = (targets.length ? targets : [ROOT]).map((target) => path.resolve(target))
  for (const place of places) {
    let stat
    try {
      stat = fs.statSync(place)
    } catch {
      stop(`살필 곳을 찾지 못했어요: ${shown(place)}`)
    }
    if (stat.isDirectory()) walk(place, place)
    else scanFile(place, path.dirname(place))
  }
  label = `${places.map(shown).join(', ')} (파일 ${scanned}개)`
}

/**
 * 같은 곳·같은 종류끼리 모은다
 * @param {Hit[]} list
 */
function group(list) {
  /** @type {Map<string, { where: string, kind: string, lines: number[], count: number }>} */
  const map = new Map()
  for (const hit of list) {
    const key = `${hit.where}\t${hit.kind}`
    const item = map.get(key) ?? { where: hit.where, kind: hit.kind, lines: [], count: 0 }
    if (hit.line > 0 && item.lines.length < 5) item.lines.push(hit.line)
    item.count += 1
    map.set(key, item)
  }
  return [...map.values()]
}

/**
 * 이름 목록을 몇 개만 보여 주고 나머지는 수로 알린다
 * @param {string[]} lines
 */
function printSome(lines) {
  for (const line of lines.slice(0, SHOW_NAMES)) console.log(`  - ${line}`)
  if (lines.length > SHOW_NAMES) console.log(`  … 외 ${lines.length - SHOW_NAMES}개`)
}

const problems = hits.filter((hit) => !hit.expected)
const expected = hits.filter((hit) => hit.expected)

console.log(`살핀 곳: ${label}`)
if (mode === 'folder') console.log(`들어가지 않은 폴더 이름: ${[...SKIP_DIRS].join(', ')}`)
if (skipped.length) {
  console.log(`살피지 못하고 건너뛴 것 ${skipped.length}개 (이 안에 무엇이 있는지는 몰라요):`)
  printSome(skipped.map((item) => `${item.where} (${item.why})`))
}
if (opaque.length) {
  console.log(
    `참고: 아래 ${opaque.length}개는 PDF·오피스·한글 문서나 압축 파일처럼 글이 눌려 담긴 파일이라 속까지는 살피지 못했어요. 비밀값을 붙여 넣은 적이 없는지는 직접 확인해 주세요:`,
  )
  printSome(opaque)
}
if (expected.length) {
  console.log(`제자리에 있는 열쇠 파일 ${group(expected).length}곳 (문제 아님, 올리지만 않으면 돼요):`)
  for (const item of group(expected)) console.log(`  - ${item.where} · ${item.kind}`)
}
if (problems.length === 0) {
  console.log('올리면 안 되는 곳에서 비밀값을 찾지 못했어요.')
} else {
  console.log(`!! 비밀값으로 보이는 것 ${problems.length}개를 찾았어요 (값은 보여 주지 않아요):`)
  for (const item of group(problems)) {
    const lines = item.lines.length ? ` (줄 ${item.lines.join(', ')}${item.count > item.lines.length ? ' …' : ''})` : ''
    console.log(`  - ${item.where} · ${item.kind} · ${item.count}번${lines}`)
  }
  process.exitCode = 1
}
