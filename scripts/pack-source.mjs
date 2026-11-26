// 프로젝트를 남에게 보낼 zip 하나로 묶는다. 폴더를 손으로 압축하면 .env.local(열쇠)까지 들어가므로 이 명령을 쓴다.
// 쓰는 법:  npm run pack
//   - git이 올릴 파일만 담는다 (.gitignore가 막는 .env.local, node_modules, dist 같은 것은 빠진다)
//   - 묶기 전에 그 파일들을 비밀값 검사 도구로 살피고, 하나라도 걸리면 묶지 않는다
//   - 결과는 프로젝트 폴더 "바로 옆"에 만든다 (폴더 안에 두면 다음 묶음이나 커밋에 섞일 수 있어서)
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const SCANNER = path.join(import.meta.dirname, 'check-secrets.mjs')
// 폴더 인자는 자동 검사(tests)에서 다른 폴더로 시험할 때만 쓴다
const root = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, '..'))
const top = path.basename(root)

/**
 * @param {string} message
 * @returns {never}
 */
function stop(message) {
  console.error(`묶지 않았어요: ${message}`)
  process.exit(1)
}

/**
 * zip 안에 든 파일 이름들(폴더 항목은 뺀다). 만든 묶음이 담으려던 목록과 똑같은지 확인하는 데 쓴다
 * @param {string} file
 * @returns {string[]}
 */
function zipFileNames(file) {
  const data = fs.readFileSync(file)
  const end = data.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (end < 0) throw new Error('not a zip')
  const total = data.readUInt16LE(end + 10)
  let at = data.readUInt32LE(end + 16)
  /** @type {string[]} */
  const names = []
  for (let i = 0; i < total; i += 1) {
    if (data.readUInt32LE(at) !== 0x02014b50) throw new Error('broken zip list')
    const nameLength = data.readUInt16LE(at + 28)
    const name = data.toString('utf8', at + 46, at + 46 + nameLength)
    if (!name.endsWith('/')) names.push(name)
    at += 46 + nameLength + data.readUInt16LE(at + 30) + data.readUInt16LE(at + 32)
  }
  return names
}

if (path.dirname(root) === root) stop('프로젝트 폴더 옆에 묶음을 둘 자리가 없어요.')

let listed
try {
  listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
} catch {
  stop('git이 올릴 파일 목록을 읽지 못했어요. git 저장소인 프로젝트 폴더에서 실행해 주세요.')
}
const all = [...new Set(listed.split('\0').filter(Boolean))]
// 지워서 지금은 없는 파일과, 안에 들어 있는 다른 저장소 폴더는 담지 않는다
const names = all.filter((name) => fs.statSync(path.join(root, name), { throwIfNoEntry: false })?.isFile())
if (names.length === 0) stop('담을 파일이 없어요.')
if (names.length < all.length) console.log(`(지금 없는 파일이나 다른 저장소 폴더 ${all.length - names.length}개는 담지 않아요)`)

// 담을 목록 그대로를 검사 도구에 넘긴다. 이름은 한글일 수 있어서 명령줄이 아니라 표준 입력으로 보낸다
const check = spawnSync(process.execPath, [SCANNER, '--stdin', root], {
  input: names.join('\0'),
  stdio: ['pipe', 'inherit', 'inherit'],
})
if (check.status !== 0) stop('비밀값 검사를 통과하지 못했어요. 위에 적힌 파일을 고친 뒤 다시 실행해 주세요.')

const now = new Date()
const two = (/** @type {number} */ value) => String(value).padStart(2, '0')
const stamp = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}`
const out = path.join(path.dirname(root), `${top}-source-${stamp}.zip`)
// 윈도우에 들어 있는 tar(bsdtar)를 쓴다. 터미널 종류에 따라 다른 tar가 잡히지 않게 윈도우 폴더 안의 것을 짚어서 부른다
const windowsDir = process.env.SystemRoot ?? process.env.windir
const tar = process.platform === 'win32' && windowsDir ? path.join(windowsDir, 'System32', 'tar.exe') : 'tar'
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-source-'))
/** @type {string | null} */
let failure = null
// 어디서 멈췄는지 알려 주려고, 단계마다 실패했을 때 할 말을 먼저 정해 둔다
let ifFails = '담을 파일을 임시 폴더로 옮기지 못했어요.'
try {
  // 목록에 있는 파일만 임시 폴더에 옮겨 놓고 그 폴더를 묶는다 (목록에 없는 파일이 따라 들어갈 길이 없다)
  for (const name of names) {
    const to = path.join(stage, top, name)
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.copyFileSync(path.join(root, name), to)
  }
  fs.rmSync(out, { force: true })
  ifFails = '이 PC의 tar로 zip을 만들지 못했어요 (윈도우 10 이상에 들어 있는 tar가 필요해요).'
  // hdrcharset=UTF-8: 한글 파일 이름이 다른 PC에서도 깨지지 않게 한다
  execFileSync(tar, ['-a', '-c', '-f', out, '--options', 'hdrcharset=UTF-8', '-C', stage, top], { stdio: 'ignore' })
  ifFails = '만든 묶음을 다시 읽어 확인하지 못했어요.'
  const inside = zipFileNames(out)
  const wanted = new Set(names.map((name) => `${top}/${name}`))
  if (inside.length !== wanted.size || inside.some((name) => !wanted.has(name))) failure = '만든 묶음 안의 파일이 담으려던 목록과 달라요.'
} catch {
  failure = ifFails
} finally {
  fs.rmSync(stage, { recursive: true, force: true })
}
if (failure) {
  fs.rmSync(out, { force: true })
  stop(failure)
}

console.log(`묶음을 만들었어요: ../${path.basename(out)} (파일 ${names.length}개, git이 올릴 파일만 담았어요)`)
