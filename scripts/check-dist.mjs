// 빌드 결과(dist/)에 비밀값이나 개인 경로가 섞여 나가지 않았는지 검사한다.
// 쓰는 법:  npm run check:dist            (먼저 npm run build)
//           node scripts/check-dist.mjs --self-test   (검사 규칙이 실제로 잡는지 스스로 확인)
// 찾은 값 자체는 절대 출력하지 않는다. 파일 이름, 줄 번호, 규칙 이름만 알려 준다.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** @typedef {{ id: string, label: string, regex: RegExp }} Rule */
/** @typedef {{ file: string, line: number, ruleId: string, label: string }} Hit */

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..')
const DIST_DIR = path.join(PROJECT_ROOT, 'dist')

/** 정규식에 넣을 글자를 그대로 찾도록 바꾼다. @param {string} text */
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 현재 PC의 사용자 이름. 못 읽으면 빈 글자. */
function currentUserName() {
  try {
    return os.userInfo().username || ''
  } catch {
    return ''
  }
}

/**
 * 홈 폴더 경로를 찾는 정규식. 구분자가 \ 이든 / 이든 \\ (JS 글자 안에서 두 번 쓴 모양)이든 잡는다.
 * @param {string} home
 * @returns {RegExp | null}
 */
function homeDirRegex(home) {
  const parts = home.split(/[\\/]+/).filter(Boolean)
  // '/' 나 '/root' 처럼 너무 짧은 경로는 우연히 걸릴 수 있어 건너뛴다.
  if (parts.length < 2) return null
  const body = parts.map(escapeRegex).join('(?:\\\\{1,2}|/)')
  return new RegExp(body, 'i')
}

/**
 * 검사 규칙 목록을 만든다. 사용자 이름과 홈 폴더는 지금 PC 값으로 만든다.
 * @param {{ userName?: string, homeDir?: string }} [env]
 * @returns {Rule[]}
 */
export function buildRules(env = {}) {
  const userName = env.userName ?? currentUserName()
  const homeDir = env.homeDir ?? os.homedir()

  /** @type {Rule[]} */
  const rules = [
    { id: 'anthropic-key', label: 'Anthropic API 키 모양 (sk-ant-)', regex: /sk-ant-/ },
    {
      id: 'sk-key',
      label: 'API 키 모양 (sk- 뒤에 20자 이상)',
      regex: /(?<![A-Za-z0-9_-])sk-[A-Za-z0-9_-]{20,}/,
    },
    { id: 'google-key', label: 'Google API 키 모양 (AIza...)', regex: /AIza[0-9A-Za-z_-]{20,}/ },
    {
      id: 'env-assignment',
      label: 'ANTHROPIC_API_KEY= 뒤에 값이 들어 있음',
      regex: /ANTHROPIC_API_KEY\s*=\s*["'`]?[A-Za-z0-9_-]{4,}/,
    },
    {
      id: 'process-env-key',
      label: 'process.env.ANTHROPIC_API_KEY 글자 (서버 코드가 브라우저 묶음에 들어감)',
      regex: /process\.env\.ANTHROPIC_API_KEY/,
    },
    {
      id: 'windows-users-path',
      label: 'C:\\Users\\ 경로',
      regex: /[A-Za-z]:(?:\\{1,2}|\/)Users(?:\\{1,2}|\/)/i,
    },
    {
      id: 'mac-users-path',
      label: '/Users/ 경로',
      regex: /(?<![\w.-])\/Users\/[^\s"'`/\\]+/,
    },
    {
      id: 'linux-home-path',
      label: '/home/ 경로',
      regex: /(?<![\w.-])\/home\/[^\s"'`/\\]+/,
    },
  ]

  if (userName.length >= 3) {
    rules.push({
      id: 'os-user-name',
      label: '경로 안의 이 PC 사용자 이름',
      regex: new RegExp(`[\\\\/]${escapeRegex(userName)}(?=[\\\\/])`, 'i'),
    })
  }
  const home = homeDirRegex(homeDir)
  if (home) {
    rules.push({ id: 'home-dir', label: '이 PC의 홈 폴더 경로', regex: home })
  }
  return rules
}

/**
 * 폴더 안의 모든 파일 경로(하위 폴더 포함).
 * @param {string} dir
 * @returns {string[]}
 */
function listFiles(dir) {
  /** @type {string[]} */
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listFiles(full))
    else if (entry.isFile()) out.push(full)
  }
  return out
}

/** 앞부분에 0 바이트가 있으면 그림·글꼴 같은 이진 파일로 본다. @param {Buffer} buffer */
function looksBinary(buffer) {
  const end = Math.min(buffer.length, 8000)
  for (let i = 0; i < end; i += 1) {
    if (buffer[i] === 0) return true
  }
  return false
}

/**
 * 폴더를 검사한다.
 * @param {string} dir
 * @param {Rule[]} rules
 * @returns {{ scanned: number, skippedBinary: number, hits: Hit[] }}
 */
export function scanDir(dir, rules) {
  /** @type {Hit[]} */
  const hits = []
  let scanned = 0
  let skippedBinary = 0
  for (const file of listFiles(dir)) {
    const buffer = fs.readFileSync(file)
    if (looksBinary(buffer)) {
      skippedBinary += 1
      continue
    }
    scanned += 1
    const text = buffer.toString('utf8')
    const relative = path.relative(dir, file).split(path.sep).join('/')
    for (const rule of rules) {
      const match = rule.regex.exec(text)
      if (!match) continue
      const line = text.slice(0, match.index).split('\n').length
      hits.push({ file: relative, line, ruleId: rule.id, label: rule.label })
    }
  }
  return { scanned, skippedBinary, hits }
}

/** 검사 규칙마다 가짜 값을 임시 폴더에 써 보고 정말 잡히는지 확인한다. */
function selfTest() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-dist-'))
  // 가짜 사용자와 홈 폴더로 규칙을 만든다(실제 이름을 파일에 쓰지 않으려고).
  const fakeUser = 'sampleuser'
  const fakeHome = 'D:\\People\\sampleuser'
  const rules = buildRules({ userName: fakeUser, homeDir: fakeHome })
  const filler = 'a1B2'.repeat(8)

  // 가짜 값은 조각을 이어 붙여 만든다. 이 파일 자체가 검사에 걸리지 않게 하려는 것이다.
  /** @type {Record<string, string>} */
  const samples = {
    'anthropic-key': `const k = "${'sk-' + 'ant-'}${filler}"`,
    'sk-key': `const k = "${'s' + 'k-'}${filler}"`,
    'google-key': `const k = "${'AI' + 'za'}${filler}"`,
    'env-assignment': `${'ANTHROPIC_API' + '_KEY'}=${filler}`,
    'process-env-key': `fetch(x, { key: ${'process.env.' + 'ANTHROPIC_API_KEY'} })`,
    'windows-users-path': `at ${'C:' + '\\\\Users\\\\'}somebody\\\\app\\\\main.js`,
    'mac-users-path': `at ${'/Us' + 'ers/'}somebody/app/main.js`,
    'linux-home-path': `at ${'/ho' + 'me/'}somebody/app/main.js`,
    'os-user-name': `at E:/work/${fakeUser}/app/main.js`,
    'home-dir': `at ${fakeHome.split('\\').join('/')}/app/main.js`,
  }

  /** @type {string[]} */
  const failures = []
  try {
    for (const rule of rules) {
      const sample = samples[rule.id]
      if (sample === undefined) {
        failures.push(`${rule.id}: 시험용 예시가 없어요`)
        continue
      }
      const caseDir = path.join(tempDir, rule.id)
      fs.mkdirSync(path.join(caseDir, 'assets'), { recursive: true })
      fs.writeFileSync(path.join(caseDir, 'assets', 'bundle.js'), `// 줄 1\n${sample}\n`)
      const result = scanDir(caseDir, rules)
      const caught = result.hits.some((hit) => hit.ruleId === rule.id && hit.line === 2)
      console.log(`${caught ? '잡음' : '놓침'}  ${rule.label}`)
      if (!caught) failures.push(`${rule.id}: 예시를 잡지 못했어요`)
    }

    // 깨끗한 파일은 걸리지 않아야 하고, 이진 파일은 건너뛰어야 한다.
    const cleanDir = path.join(tempDir, 'clean')
    fs.mkdirSync(cleanDir, { recursive: true })
    fs.writeFileSync(
      path.join(cleanDir, 'index.js'),
      'const task = "mask-image"; fetch("/api/advice"); const url = "https://example.com/home/";\n',
    )
    fs.writeFileSync(path.join(cleanDir, 'image.png'), Buffer.from([0x89, 0x50, 0x00, 0x00, 0x01]))
    const clean = scanDir(cleanDir, rules)
    const cleanOk = clean.hits.length === 0 && clean.scanned === 1 && clean.skippedBinary === 1
    console.log(`${cleanOk ? '통과' : '실패'}  문제 없는 파일은 걸리지 않고, 그림 파일은 건너뛰어요`)
    if (!cleanOk) failures.push('clean: 문제 없는 파일이 걸렸거나 파일 수가 맞지 않아요')
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }

  if (failures.length > 0) {
    console.error(`자체 점검 실패 ${failures.length}건이에요.`)
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }
  console.log(`자체 점검 통과: 검사 규칙 ${rules.length}개가 모두 잡혀요.`)
}

function main() {
  if (process.argv.includes('--self-test')) {
    selfTest()
    return
  }

  if (!fs.existsSync(DIST_DIR) || !fs.statSync(DIST_DIR).isDirectory()) {
    console.error('dist 폴더가 없어요. 먼저 "npm run build"를 실행해 주세요.')
    process.exit(1)
  }

  const { scanned, skippedBinary, hits } = scanDir(DIST_DIR, buildRules())
  if (scanned === 0) {
    console.error('dist 폴더에 검사할 글자 파일이 없어요. 빌드가 제대로 됐는지 확인해 주세요.')
    process.exit(1)
  }
  if (hits.length > 0) {
    console.error(`dist 검사 실패: 내보내면 안 되는 내용이 ${hits.length}건 있어요.`)
    for (const hit of hits) {
      console.error(`- dist/${hit.file} ${hit.line}번째 줄: ${hit.label}`)
    }
    console.error('찾은 값은 화면에 보여 주지 않아요. 위 파일을 열어 확인하고 원인을 고친 뒤 다시 빌드해 주세요.')
    process.exit(1)
  }
  console.log(
    `dist 검사 통과: 글자 파일 ${scanned}개를 살펴봤고 API 키나 개인 경로가 없어요.` +
      (skippedBinary > 0 ? ` (그림·글꼴 같은 파일 ${skippedBinary}개는 건너뜀)` : ''),
  )
}

main()
