// 비밀값 검사 도구(scripts/check-secrets.mjs)와 그 둘레 도구(검사 켜기, 묶어 보내기, 와이파이 서버)의 검사.
// 가짜 열쇠는 실행 중에 조각을 이어 만든다: 이 파일에 열쇠 모양 글자가 그대로 있으면 검사 도구가 이 프로젝트를 문제로 본다.
// 임시 폴더와 임시 git 저장소만 쓰고, 이 프로젝트의 git 설정이나 파일은 건드리지 않는다.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'

const SCRIPTS = path.resolve(import.meta.dirname, '..', 'scripts')
const SCANNER = path.join(SCRIPTS, 'check-secrets.mjs')
const SETUP = path.join(SCRIPTS, 'setup-hooks.mjs')
const PACK = path.join(SCRIPTS, 'pack-source.mjs')

const FAKE_KEY = ['sk', 'ant', 'api03', 'Zq7'.repeat(14)].join('-') // Anthropic 열쇠 모양
const FAKE_TOKEN = 'AbCdEf0123'.repeat(5) // 정해진 머리글자가 없는 긴 값
const FAKE_PLAIN = 'qwertyuiop'.repeat(3) // 모양으로는 알 수 없어서, 열쇠 파일에서 배워야만 찾는 값
/** 출력 어디에도 보이면 안 되는 글자들 (값 전체와 그 한 토막) */
const FAKES = [FAKE_KEY, FAKE_TOKEN, FAKE_PLAIN].flatMap((value) => [value, value.slice(-12), Buffer.from(value).toString('base64')])

const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'bk2-secrets-'))
after(() => {
  try {
    fs.rmSync(BASE, { recursive: true, force: true, maxRetries: 3 })
  } catch {
    // 다른 프로그램이 파일을 잡고 있어 못 지워도 검사 결과와는 상관없다 (임시 폴더라 나중에 치워진다)
  }
})

// 이 PC의 git 설정(서명, 전역 검사 폴더 등)과 바깥 git 환경변수가 끼어들지 않게 한다
const EMPTY_CONFIG = path.join(BASE, 'empty.gitconfig')
fs.writeFileSync(EMPTY_CONFIG, '')
/** @type {Record<string, string | undefined>} */
const CLEAN_ENV = {
  ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith('GIT_'))),
  GIT_CONFIG_GLOBAL: EMPTY_CONFIG,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'tester',
  GIT_AUTHOR_EMAIL: 'tester@example.invalid',
  GIT_COMMITTER_NAME: 'tester',
  GIT_COMMITTER_EMAIL: 'tester@example.invalid',
}

/** @param {string} name */
function newDir(name) {
  const dir = path.join(BASE, name)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * @param {string} cwd
 * @param {...string} argv
 */
function git(cwd, ...argv) {
  return execFileSync('git', argv, { cwd, env: CLEAN_ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

/** @param {string} name */
function newRepo(name) {
  const dir = newDir(name)
  git(dir, 'init', '-q', '-b', 'main')
  return dir
}

/**
 * @param {string} dir
 * @param {string} name
 * @param {string | Buffer} content
 */
function put(dir, name, content) {
  const file = path.join(dir, name)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
  return file
}

/** @param {string} output */
function assertNoFake(output) {
  for (const fake of FAKES) assert.ok(!output.includes(fake), '도구의 출력에 가짜 값이 보이면 안 돼요')
}

/**
 * 도구 하나를 돌린다. 어떤 경우에도 가짜 값이 출력에 보이면 안 된다
 * @param {string} script
 * @param {string[]} args
 * @param {{ input?: string }} [options]
 */
function run(script, args, options = {}) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: BASE, input: options.input, env: CLEAN_ENV, encoding: 'utf8' })
  const output = `${result.stdout}\n${result.stderr}`
  assertNoFake(output)
  return { code: result.status, output }
}

/**
 * @param {string[]} args
 * @param {{ input?: string }} [options]
 */
function scan(args, options) {
  return run(SCANNER, args, options)
}

/** @param {string} text */
const utf16le = (text) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')])
/** @param {string} text */
const utf16be = (text) => Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(text, 'utf16le').swap16()])

const FOUND = '비밀값으로 보이는 것'
const CLEAN = '비밀값을 찾지 못했어요'

// ───────── 폴더 살피기 ─────────

test('폴더: 깨끗한 폴더는 통과해요', () => {
  const dir = newDir('clean')
  put(dir, 'README.md', '# 안녕하세요\n')
  put(dir, 'src/app.js', 'export const answer = 42\n')
  const result = scan([dir])
  assert.equal(result.code, 0, result.output)
  assert.match(result.output, new RegExp(CLEAN))
  assert.match(result.output, /파일 2개/)
})

test('폴더: 보통 파일에 든 가짜 열쇠를 찾고, 값은 보여 주지 않아요', () => {
  const dir = newDir('leak')
  put(dir, 'notes/todo.txt', `첫 줄\n메모: ${FAKE_KEY}\n`)
  const result = scan([dir])
  assert.equal(result.code, 1, result.output)
  assert.match(result.output, new RegExp(FOUND))
  assert.match(result.output, /leak\/notes\/todo\.txt · Anthropic API 열쇠 · 1번 \(줄 2\)/)
})

test('폴더: UTF-16(LE·BE)으로 저장한 파일 속 열쇠도 찾아요', () => {
  const dir = newDir('utf16')
  put(dir, 'le.txt', utf16le(`메모\r\n${FAKE_KEY}\r\n`))
  put(dir, 'be.txt', utf16be(`메모\r\n${FAKE_KEY}\r\n`))
  const result = scan([dir])
  assert.equal(result.code, 1, result.output)
  assert.match(result.output, /utf16\/le\.txt · Anthropic API 열쇠/)
  assert.match(result.output, /utf16\/be\.txt · Anthropic API 열쇠/)
})

test('폴더: .env는 제자리로 보지만, 올리는 보기 파일(.env.example) 속 열쇠는 문제로 봐요', () => {
  const home = newDir('env-home')
  put(home, '.env', `ANTHROPIC_API_KEY=${FAKE_KEY}\n`)
  const inPlace = scan([home])
  assert.equal(inPlace.code, 0, inPlace.output)
  assert.match(inPlace.output, /제자리에 있는 열쇠 파일/)

  const example = newDir('env-example')
  put(example, '.env.example', `ANTHROPIC_API_KEY=${FAKE_KEY}\n`)
  const leaked = scan([example])
  assert.equal(leaked.code, 1, leaked.output)
  assert.match(leaked.output, /env-example\/\.env\.example · Anthropic API 열쇠/)

  // 웹으로 내보내는 폴더(dist, public) 안의 .env는 그대로 공개되므로 제자리가 아니다
  const built = newDir('env-built')
  put(built, 'dist/.env', `ANTHROPIC_API_KEY=${FAKE_KEY}\n`)
  const served = scan([path.join(built, 'dist')])
  assert.equal(served.code, 1, served.output)
  assert.match(served.output, /env-built\/dist\/\.env · Anthropic API 열쇠/)
  put(built, 'public/.env.local', `ANTHROPIC_API_KEY=${FAKE_KEY}\n`)
  assert.match(scan([built]).output, /env-built\/public\/\.env\.local · Anthropic API 열쇠/)
})

test('폴더: 머리글자가 없는 값도 "이름 = 긴 값"과 "Bearer 긴 값" 모양으로 찾아요', () => {
  const dir = newDir('generic')
  put(dir, 'handover.md', `KV_REST_API_TOKEN="${FAKE_TOKEN}"\n`)
  put(dir, 'call.js', `fetch(url, { headers: { Authorization: "Bearer ${FAKE_TOKEN}" } })\n`)
  put(dir, 'settings.py', `os.environ["KV_REST_API_TOKEN"] = "${FAKE_TOKEN}"\n`)
  for (const name of ['CLIENT_SECRET', 'DB_PASSWORD', 'SERVICE_API_KEY', 'SIGNING_PRIVATE_KEY', 'AWS_SECRET_ACCESS_KEY']) {
    put(dir, `${name}.txt`, `${name}: ${FAKE_TOKEN}\n`)
  }
  const result = scan([dir])
  assert.equal(result.code, 1, result.output)
  assert.match(result.output, /generic\/handover\.md · 이름이 TOKEN·SECRET·PASSWORD·KEY로 끝나는 설정에 긴 값이 적혀 있음 · 1번/)
  assert.match(result.output, /generic\/call\.js · Bearer 뒤에 긴 값이 적혀 있음 · 1번/)
  assert.match(result.output, /generic\/settings\.py · 이름이 TOKEN/)
  for (const name of ['CLIENT_SECRET', 'DB_PASSWORD', 'SERVICE_API_KEY', 'SIGNING_PRIVATE_KEY', 'AWS_SECRET_ACCESS_KEY']) {
    assert.ok(result.output.includes(`generic/${name}.txt · 이름이`), `${name} 뒤의 값을 찾지 못했어요`)
  }
})

test('폴더: 보통 코드와 빈 설정, 설명 글은 비밀값으로 보지 않아요', () => {
  const dir = newDir('ordinary')
  put(
    dir,
    'code.js',
    [
      'const key = process.env.ANTHROPIC_API_KEY',
      "const token = process.env.KV_REST_API_TOKEN ?? ''",
      'const headers = { Authorization: `Bearer ${token}` }',
      'const body = { max_tokens: 1024 }',
      'const names = { TOKEN: KV_REST_API_READ_ONLY_TOKEN }',
      '',
    ].join('\n'),
  )
  put(
    dir,
    'guide.md',
    [
      'KV_REST_API_TOKEN=<Vercel 화면에서 복사>',
      'ANTHROPIC_API_KEY=여기에_값을_넣어요',
      'KV_REST_API_READ_ONLY_TOKEN=your_upstash_token_goes_here_please',
      'Authorization: Bearer <토큰>',
      '',
    ].join('\n'),
  )
  // 값이 비어 있는 설정 다음 줄의 긴 이름을 값으로 보면 안 된다
  put(dir, '.env.example', 'ANTHROPIC_API_KEY=\nKV_REST_API_TOKEN=\nUPSTASH_REDIS_REST_TOKEN=\nKV_REST_API_READ_ONLY_TOKEN=\n')
  const result = scan([dir])
  assert.equal(result.code, 0, result.output)
  assert.match(result.output, new RegExp(CLEAN))
})

test('폴더: 너무 커서 살피지 않은 파일과 속을 못 보는 압축 파일은 조용히 넘기지 않고 이름을 알려 줘요', () => {
  const dir = newDir('big')
  put(dir, 'small.txt', 'ok\n')
  put(dir, 'renamed.dat', Buffer.from([0x50, 0x4b, 3, 4, 20, 0, 0, 0]))
  fs.truncateSync(put(dir, 'movie.bin', ''), 31 * 1024 * 1024)
  const result = scan([dir])
  assert.equal(result.code, 0, result.output)
  assert.match(result.output, /건너뛴 것 1개/)
  assert.match(result.output, /big\/movie\.bin \(30MB보다 커서 살피지 않았어요\)/)
  assert.match(result.output, /참고: 아래 1개는 PDF·오피스·한글 문서나 압축 파일/)
  assert.ok(result.output.includes('  - big/renamed.dat'), result.output)
})

test('폴더: 옆 폴더 백엔드의 열쇠 파일에 적힌 값을 배워서, 옮겨 적힌 것을 찾아요', () => {
  // 도구를 임시 프로젝트 자리에 옮겨 놓고 돌린다: <임시>/site/scripts 와 <임시>/modelhouse_v3/backend/.env
  const home = newDir('sibling')
  const script = put(home, 'site/scripts/check-secrets.mjs', fs.readFileSync(SCANNER))
  put(home, 'site/docs/memo.md', `옮겨 적은 값: ${FAKE_PLAIN}\n`)
  put(home, 'site/docs/encoded.md', `${Buffer.from(FAKE_PLAIN).toString('base64')}\n`)
  // 모델 이름처럼 비밀이 아닌 설정은 값이 길어도 배우지 않는다 (문서에 적힌 모델 이름을 비밀값으로 잘못 짚지 않게)
  const modelName = ['model', 'opus', 'five', 'five', 'latest', 'edition'].join('-')
  put(home, 'site/docs/model.md', `쓰는 모델: ${modelName}\n`)
  const site = path.join(home, 'site')

  const before = run(script, [site])
  assert.equal(before.code, 0, before.output)

  put(home, 'modelhouse_v3/backend/.env', `# 설명\nSOME_SETTING="${FAKE_PLAIN}"\nAI_MODEL=${modelName}\n`)
  const learned = run(script, [site])
  assert.equal(learned.code, 1, learned.output)
  assert.match(learned.output, /memo\.md · 실제 쓰는 값과 똑같은 글자 · 1번 \(줄 1\)/)
  assert.match(learned.output, /encoded\.md · 실제 쓰는 값과 똑같은 글자/)
  assert.doesNotMatch(learned.output, /model\.md/)
})

test('잘못 쓴 옵션이나 없는 폴더는 "문제 없음"이 아니라 실패로 끝나요', () => {
  assert.equal(scan(['--stagd']).code, 1)
  assert.equal(scan([path.join(BASE, 'no-such-folder')]).code, 1)
  assert.equal(scan(['--staged', newDir('not-a-repo')]).code, 1)
})

// ───────── 커밋 전 검사 (--staged) ─────────

const staged = newRepo('staged')

/**
 * 담아 둔 것을 비우고 새로 담는다. 커밋이 하나도 없는 저장소라서(이 프로젝트의 첫 커밋과 같은 상황) 색인을 통째로 비운다
 * @param {Record<string, string | Buffer>} files
 */
function stage(files) {
  git(staged, 'read-tree', '--empty')
  for (const name of fs.readdirSync(staged)) {
    if (name !== '.git') fs.rmSync(path.join(staged, name), { recursive: true, force: true })
  }
  for (const [name, content] of Object.entries(files)) put(staged, name, content)
  git(staged, 'add', '-f', '--', '.')
  return scan(['--staged', staged])
}

test('커밋 전: 깨끗한 파일과 값이 빈 .env.example은 통과해요', () => {
  const result = stage({
    'README.md': '# 안녕하세요\n',
    'reports/1단계 보고.md': '깨끗한 글\n',
    '.env.example': '# .env.local 로 복사해서 값을 넣어요\nANTHROPIC_API_KEY=\nKV_REST_API_TOKEN=\n',
    'font.bin': Buffer.from([0, 1, 2, 3, 0, 255, 254, 0]),
    'empty.txt': '',
  })
  assert.equal(result.code, 0, result.output)
  assert.match(result.output, /파일 5개/)
  assert.match(result.output, new RegExp(CLEAN))
})

test('커밋 전: 한글 이름 파일에 든 열쇠를 막아요', () => {
  const result = stage({
    '메모.txt': `${FAKE_KEY}\n`,
    'reports/1단계_조사와_계획.md': `첫 줄\n${FAKE_KEY}\n`,
    '보고서/notes.txt': `${FAKE_KEY}\n`,
    'docs/café.md': `${FAKE_KEY}\n`,
  })
  assert.equal(result.code, 1, result.output)
  assert.match(result.output, /메모\.txt · Anthropic API 열쇠/)
  assert.match(result.output, /reports\/1단계_조사와_계획\.md · Anthropic API 열쇠 · 1번 \(줄 2\)/)
  assert.match(result.output, /보고서\/notes\.txt · Anthropic API 열쇠/)
  assert.match(result.output, /docs\/café\.md · Anthropic API 열쇠/)
})

test('커밋 전: UTF-16(LE·BE) 파일에 든 열쇠를 막아요', () => {
  const result = stage({
    'le.txt': utf16le(`${FAKE_KEY}\r\n`),
    'be.txt': utf16be(`${FAKE_KEY}\r\n`),
  })
  assert.equal(result.code, 1, result.output)
  assert.match(result.output, /le\.txt · Anthropic API 열쇠/)
  assert.match(result.output, /be\.txt · Anthropic API 열쇠/)
})

test('커밋 전: .env 파일과 그 사본은 내용과 상관없이 이름만으로 막아요', () => {
  const result = stage({
    '.env': 'PORT=3000\n',
    'backend/.env.local': 'PORT=3000\n',
    '.env - 복사본.local': 'PORT=3000\n',
    ' - 복사본.env': 'PORT=3000\n',
  })
  assert.equal(result.code, 1, result.output)
  for (const name of ['.env', 'backend/.env.local', '.env - 복사본.local', ' - 복사본.env']) {
    assert.ok(result.output.includes(`${name} · 열쇠 파일(.env) 자체를 올리려고 함`), `${name} 을 이름으로 막지 못했어요`)
  }
})

test('커밋 전: .env.example에 진짜처럼 생긴 값이 들어가면 막아요', () => {
  const result = stage({ '.env.example': `ANTHROPIC_API_KEY=${FAKE_KEY}\n` })
  assert.equal(result.code, 1, result.output)
  assert.match(result.output, /\.env\.example · Anthropic API 열쇠/)
  assert.doesNotMatch(result.output, /자체를 올리려고 함/)
})

test('커밋 전: 압축 파일은 막고, PDF·오피스·한글 문서는 속을 못 본다고 알려 줘요', () => {
  const zipHead = Buffer.from([0x50, 0x4b, 3, 4, 20, 0, 0, 0])
  const gzipHead = Buffer.from([0x1f, 0x8b, 8, 0, 0, 0, 0, 0])
  const blocked = stage({ 'backup.zip': zipHead, 'dump.tar.gz': gzipHead, 'named-like-text.txt': 'clean\n' })
  assert.equal(blocked.code, 1, blocked.output)
  assert.match(blocked.output, /backup\.zip · 압축 파일/)
  assert.match(blocked.output, /dump\.tar\.gz · 압축 파일/)
  assert.doesNotMatch(blocked.output, /named-like-text/)

  // 이름을 바꿔 놓은 압축 파일도 내용 첫머리로 알아보고 막는다
  const renamed = stage({ 'sample.dat': zipHead, '자료/묶음.bin': gzipHead })
  assert.equal(renamed.code, 1, renamed.output)
  assert.match(renamed.output, /sample\.dat · 압축 파일/)
  assert.match(renamed.output, /자료\/묶음\.bin · 압축 파일/)

  // 문서 파일은 속이 zip이어도 막지 않고, 속을 보지 못했다고 이름을 알려 준다
  const noted = stage({ 'reports/pdf/보고서.pdf': '%PDF-1.4\n', '계획.hwpx': zipHead, '표.xlsx': zipHead, 'scan.dat': '%PDF-1.7\n' })
  assert.equal(noted.code, 0, noted.output)
  assert.match(noted.output, /참고: 아래 4개는 PDF·오피스·한글 문서/)
  for (const name of ['reports/pdf/보고서.pdf', '계획.hwpx', '표.xlsx', 'scan.dat']) assert.ok(noted.output.includes(`  - ${name}`), name)
})

test('커밋 전: 머리글자가 없는 값도 막아요', () => {
  const result = stage({ 'handover.md': `KV_REST_API_TOKEN=${FAKE_TOKEN}\n`, 'call.js': `const auth = 'Bearer ${FAKE_TOKEN}'\n` })
  assert.equal(result.code, 1, result.output)
  assert.match(result.output, /handover\.md · 이름이 TOKEN/)
  assert.match(result.output, /call\.js · Bearer/)
})

test('커밋 전: 내용을 읽지 못한 파일은 조용히 넘기지 않고 커밋을 막아요', () => {
  stage({ 'README.md': 'ok\n' })
  // 저장소에 없는 내용 번호를 가리키는 항목을 일부러 만든다
  git(staged, 'update-index', '--add', '--cacheinfo', `100644,${'1234567890'.repeat(4)},ghost.txt`)
  const result = scan(['--staged', staged])
  assert.equal(result.code, 1, result.output)
  assert.match(result.output, /ghost\.txt · 내용을 읽지 못해서 살피지 못함/)
  assert.doesNotMatch(result.output, /README\.md ·/)
})

test('목록으로 받기(--stdin): 넘겨받은 이름만 살피고, 없는 파일은 문제로 봐요', () => {
  const dir = newDir('list')
  put(dir, '보고서.md', `${FAKE_KEY}\n`)
  put(dir, 'clean.md', 'ok\n')
  put(dir, 'not-listed.md', `${FAKE_KEY}\n`)
  const result = scan(['--stdin', dir], { input: ['보고서.md', 'clean.md', 'gone.md'].join('\0') })
  assert.equal(result.code, 1, result.output)
  assert.match(result.output, /보고서\.md · Anthropic API 열쇠/)
  assert.match(result.output, /gone\.md · 내용을 읽지 못해서 살피지 못함/)
  assert.doesNotMatch(result.output, /not-listed/)
  assert.equal(scan(['--stdin', dir], { input: 'clean.md' }).code, 0)
})

// ───────── 올리기 전 검사 (--history) ─────────

test('기록: 커밋했다가 지운 열쇠, 설명 글에만 있는 열쇠, UTF-16 파일 속 열쇠를 찾아요', () => {
  const repo = newRepo('history')
  /** @param {string} message */
  const commit = (message) => {
    git(repo, 'add', '-A')
    git(repo, 'commit', '-q', '--allow-empty', '-m', message)
    return git(repo, 'rev-parse', '--short', 'HEAD').trim()
  }
  put(repo, 'README.md', 'hello\n')
  commit('first')
  const clean = scan(['--history', repo])
  assert.equal(clean.code, 0, clean.output)
  assert.match(clean.output, /커밋 1개/)

  put(repo, 'notes.txt', `메모 ${FAKE_KEY}\n`)
  const added = commit('add notes')
  fs.rmSync(path.join(repo, 'notes.txt'))
  commit('remove notes')
  // 지금 폴더에는 없어서 폴더 검사는 통과하지만, 기록에는 남아 있다
  assert.equal(scan([repo]).code, 0)
  const removed = scan(['--history', repo])
  assert.equal(removed.code, 1, removed.output)
  assert.ok(removed.output.includes(`커밋 ${added} · Anthropic API 열쇠`), removed.output)

  const cleanRepo = newRepo('history-message')
  put(cleanRepo, 'README.md', 'hello\n')
  git(cleanRepo, 'add', '-A')
  git(cleanRepo, 'commit', '-q', '-m', `열쇠를 바꿨어요 ${FAKE_KEY}`)
  const messageOnly = scan(['--history', cleanRepo])
  assert.equal(messageOnly.code, 1, messageOnly.output)
  assert.match(messageOnly.output, /커밋 [0-9a-f]+ · Anthropic API 열쇠 · 1번/)

  const wideRepo = newRepo('history-utf16')
  put(wideRepo, 'saved.txt', utf16le(`${FAKE_KEY}\r\n`))
  git(wideRepo, 'add', '-A')
  git(wideRepo, 'commit', '-q', '-m', 'saved output')
  const wide = scan(['--history', wideRepo])
  assert.equal(wide.code, 1, wide.output)
  assert.match(wide.output, /Anthropic API 열쇠/)
})

// ───────── 검사 켜기 (setup-hooks) ─────────

test('검사 켜기: .git이 없는 곳(Vercel 설치 때)에서는 아무것도 하지 않고 0으로 끝나요', () => {
  const dir = newDir('no-git')
  put(dir, '.githooks/pre-commit', '#!/bin/sh\nexit 0\n')
  const result = run(SETUP, [dir])
  assert.equal(result.code, 0, result.output)
  // 설치 기록을 어지럽히지 않게 많아야 한 줄만 말한다
  assert.ok(result.output.trim().split('\n').length <= 1, result.output)
  assert.doesNotMatch(result.output, /켰어요/)
  assert.equal(fs.existsSync(path.join(dir, '.git')), false)
})

test('검사 켜기: git 저장소에서는 core.hooksPath를 .githooks로 맞춰요', () => {
  const repo = newRepo('with-git')
  put(repo, '.githooks/pre-commit', '#!/bin/sh\nexit 0\n')
  const result = run(SETUP, [repo])
  assert.equal(result.code, 0, result.output)
  assert.equal(git(repo, 'config', '--get', 'core.hooksPath').trim(), '.githooks')
})

// ───────── 묶어 보내기 (pack-source) ─────────

/**
 * zip 안의 파일 이름들 (폴더 항목은 뺀다)
 * @param {string} file
 */
function zipNames(file) {
  const data = fs.readFileSync(file)
  const end = data.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  assert.ok(end >= 0, 'zip 파일이 아니에요')
  /** @type {string[]} */
  const names = []
  let at = data.readUInt32LE(end + 16)
  for (let i = 0; i < data.readUInt16LE(end + 10); i += 1) {
    const length = data.readUInt16LE(at + 28)
    const name = data.toString('utf8', at + 46, at + 46 + length)
    if (!name.endsWith('/')) names.push(name)
    at += 46 + length + data.readUInt16LE(at + 30) + data.readUInt16LE(at + 32)
  }
  return names.sort()
}

/** 윈도우와 맥에 들어 있는 tar만 zip을 만들 수 있다 */
const packSkip = process.platform === 'win32' || process.platform === 'darwin' ? false : '이 운영체제의 tar는 zip을 만들지 못해요'

test('묶어 보내기: git이 올릴 파일만 프로젝트 폴더 옆에 묶고, 열쇠 파일은 넣지 않아요', { skip: packSkip }, () => {
  const parent = newDir('pack-ok')
  const project = newRepo('pack-ok/site')
  put(project, '.gitignore', '.env*\n!.env.example\nnode_modules\n')
  put(project, '.env.example', 'ANTHROPIC_API_KEY=\n')
  put(project, '.env.local', `ANTHROPIC_API_KEY=${FAKE_KEY}\n`)
  put(project, 'README.md', '# 안녕하세요\n')
  put(project, 'docs/작업 보고.md', '깨끗한 글\n')
  put(project, 'node_modules/thing/index.js', 'export {}\n')
  const result = run(PACK, [project])
  assert.equal(result.code, 0, result.output)
  assert.match(result.output, /묶음을 만들었어요: \.\.\/site-source-\d{8}-\d{4}\.zip \(파일 4개/)

  const zips = fs.readdirSync(parent).filter((name) => name.endsWith('.zip'))
  assert.equal(zips.length, 1)
  assert.deepEqual(zipNames(path.join(parent, zips[0])), ['site/.env.example', 'site/.gitignore', 'site/README.md', 'site/docs/작업 보고.md'])
  // 프로젝트 폴더 안에는 묶음을 만들지 않는다
  assert.deepEqual(fs.readdirSync(project).filter((name) => name.endsWith('.zip')), [])
})

test('묶어 보내기: 담을 파일에 비밀값이 있으면 묶지 않아요', { skip: packSkip }, () => {
  const parent = newDir('pack-leak')
  const project = newRepo('pack-leak/site')
  put(project, 'README.md', '# 안녕하세요\n')
  put(project, 'notes.txt', `메모: ${FAKE_KEY}\n`)
  const result = run(PACK, [project])
  assert.equal(result.code, 1, result.output)
  assert.match(result.output, /notes\.txt · Anthropic API 열쇠/)
  assert.match(result.output, /묶지 않았어요/)
  assert.deepEqual(fs.readdirSync(parent).filter((name) => name.endsWith('.zip')), [])
})

// ───────── 와이파이에 연 서버 (dev-api-plugin) ─────────

test('내 PC 서버: 와이파이에 열린 서버는 SERVE_AI=1 일 때만 AI 열쇠를 읽어요', async () => {
  const { isOpenToNetwork, shouldLoadServerEnv } = await import('../scripts/dev-api-plugin.js')
  // 내 PC에서만 열리는 설정: 지금처럼 열쇠를 읽는다
  for (const host of [undefined, false, 'localhost', '127.0.0.1', '127.0.0.53', '::1', '[::1]', ' LOCALHOST ']) {
    assert.equal(isOpenToNetwork(host), false, String(host))
    assert.equal(shouldLoadServerEnv(host, {}), true, String(host))
  }
  // 와이파이에 열리는 설정(--host, 0.0.0.0, 이 PC의 주소): 기본은 읽지 않는다
  for (const host of [true, '0.0.0.0', '::', '192.168.0.10', 'my-pc.local', '']) {
    assert.equal(isOpenToNetwork(host), true, String(host))
    assert.equal(shouldLoadServerEnv(host, {}), false, String(host))
    assert.equal(shouldLoadServerEnv(host, { SERVE_AI: '0' }), false, String(host))
    assert.equal(shouldLoadServerEnv(host, { SERVE_AI: 'true' }), false, String(host))
    assert.equal(shouldLoadServerEnv(host, { SERVE_AI: '1' }), true, String(host))
  }
})
