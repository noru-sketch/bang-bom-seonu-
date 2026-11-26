// 저장소에 딸려 오는 검사(.githooks: 커밋 전, 커밋 설명 글, 올리기 전)를 이 PC의 git에 연결한다.
// npm install 때 저절로 돌고(prepare), "npm run hooks"로 직접 돌릴 수도 있다.
// 설치를 멈추게 하면 안 되므로 어떤 경우에도 0으로 끝난다. Vercel처럼 .git 폴더가 없는 곳에서는 한 줄만 알리고 아무것도 하지 않는다.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

// 폴더 인자는 자동 검사(tests)에서 다른 폴더로 시험할 때만 쓴다
const root = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, '..'))
const hooksDir = path.join(root, '.githooks')

try {
  if (fs.existsSync(path.join(root, '.git')) && fs.existsSync(hooksDir)) {
    // 맥·리눅스에서는 실행 권한이 없는 검사 파일을 git이 그냥 지나친다 (윈도우에서는 달라지는 것이 없다)
    for (const name of fs.readdirSync(hooksDir)) fs.chmodSync(path.join(hooksDir, name), 0o755)
    execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root, stdio: 'ignore' })
    console.log('커밋 전·올리기 전 비밀값 검사를 켰어요 (.githooks).')
  } else {
    console.log('(git 저장소가 아니라서 커밋 전 검사는 연결하지 않았어요)')
  }
} catch {
  console.log('커밋 전 검사를 켜지 못했어요. git이 설치돼 있는지 확인한 뒤 "npm run hooks"를 다시 실행해 주세요.')
}
