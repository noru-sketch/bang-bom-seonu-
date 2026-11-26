# 비밀값(API 열쇠) 지키기

AI 열쇠가 깃허브, 공개 사이트, 보낸 파일 어디로도 새지 않게 해 둔 장치와, 사람이 지킬 일을 적은 문서예요.

## 1. 비밀값이 있는 곳

| 비밀값 | 있어도 되는 곳 |
| :-- | :-- |
| AI 열쇠 `ANTHROPIC_API_KEY` | 프로젝트 폴더의 `.env.local`, 옆 폴더 백엔드의 `.env`, Vercel 프로젝트 설정(Environment Variables) |
| 저장소 접속 값 `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Vercel 프로젝트 설정에만 |

- 이 세 곳 말고는 어디에도 적지 않아요. 코드, 문서, 보고서, 커밋 설명 글, 진행 상황 글, 채팅 모두 안 돼요.
- `VITE_`로 시작하는 이름에는 넣지 않아요. 그 값은 브라우저로 그대로 나가요.
- `.env.example`은 이름만 적어 두는 보기 파일이에요. 깃허브에 올라가니까 값은 비워 둬요.

## 2. 지키는 장치

| 장치 | 언제 도나 | 무엇을 잡나 |
| :-- | :-- | :-- |
| `.gitignore`, `.vercelignore` | 항상 | 이름이 `.env`로 시작하거나 끝나는 파일(탐색기로 복사한 사본 포함), 열쇠·인증서 파일(`*.pem`, `*.key`, `*.p12`), 압축 파일, 도구가 만든 폴더 |
| 커밋 전 검사 `.githooks/pre-commit` | `git commit` 할 때마다 | 담아 둔 파일 속의 열쇠 모양, "이름 = 긴 값", "Bearer 긴 값", 열쇠 파일에 적힌 값과 똑같은 글자. 한글 이름 파일과 UTF-16으로 저장된 파일도 봐요. `.env` 파일과 압축 파일은 이름만으로 막아요. 읽지 못한 파일이 있으면 통과가 아니라 멈춤이에요 |
| 커밋 설명 글 검사 `.githooks/commit-msg` | `git commit` 할 때마다 | 커밋 설명 글에 붙여 넣은 열쇠 |
| 올리기 전 검사 `.githooks/pre-push` | `git push` 할 때마다 | git 기록 전체. 지운 파일, 설명 글, 검사를 건너뛴 커밋까지 다시 봐요 |
| `npm run check:secrets` | 직접 실행, `npm run verify`의 마지막 단계 | 프로젝트 폴더 전체 |
| `npm run check:dist` | 직접 실행, `npm run verify` | 빌드 결과(`dist/`)에 섞인 열쇠와 개인 경로 |
| `npm run pack` | 소스를 보낼 때 | 묶기 전에 담을 파일을 모두 검사하고, 걸리면 묶지 않아요 |
| 진행 상황 갱신 도구 | 갱신할 때마다 | 올릴 글을 커밋 전에 검사하고, 걸리면 커밋도 올리기도 하지 않아요 |
| GitHub 푸시 보호(Push protection) | 깃허브로 올릴 때 | 깃허브가 모양을 아는 열쇠(Anthropic 열쇠 등)를 한 번 더 막아요. 저장소 Settings의 보안(Security) 항목에서 켜져 있는지 확인해요 |

검사 도구는 찾은 값을 화면에 보여 주지 않아요. 어느 파일 몇째 줄에 무엇 종류가 있는지만 알려 줘요.

## 3. 잡지 못하는 것

도구가 "문제 없음"이라고 해도 아래는 사람이 조심해야 해요.

- PDF, 오피스 문서(docx, xlsx, pptx), 한글 문서(hwp, hwpx) 속의 글. 글이 눌려 담겨 있어서 속을 볼 수 없어요. 이런 파일을 담으면 도구가 "속까지는 살피지 못했다"고 이름을 알려 주기만 해요.
- 그림과 화면 캡처 속의 글자. 열쇠가 보이는 화면은 찍지 않아요.
- 머리글자가 없는 값을 이름 없이 값만 붙여 넣은 것. Vercel에만 있는 저장소 접속 값은 도구가 값을 몰라서, `KV_REST_API_TOKEN=값`처럼 이름과 함께 있을 때만 잡아요.
- 일부러 모양을 바꾼 값. 두 줄로 나눠 쓰기, 거꾸로 쓰기, 조각을 이어 붙이기 같은 것이에요.
- 폴더 전체 검사에서 30MB가 넘는 파일과 `node_modules`, `.git` 폴더. 건너뛴 파일은 이름을 알려 줘요.
- 채팅, 메신저, 메일에 붙여 넣는 것. 어떤 도구도 막지 못해요.
- 이미 밖에 보인 열쇠. 지워도 소용없으니 바로 바꿔요(7번).

## 4. 첫 커밋 전에 한 번

```bash
npm run hooks                      # 검사 켜기 (npm install 을 해도 저절로 켜져요)
git config --get core.hooksPath    # .githooks 라고 나오면 켜진 거예요
git add .
git add --chmod=+x .githooks/pre-commit .githooks/commit-msg .githooks/pre-push
```

- 마지막 줄은 맥·리눅스에서도 검사가 돌게 실행 권한을 함께 올리는 거예요.
- 새 PC나 새로 내려받은 폴더에서는 `npm install`을 한 번 하면 검사가 켜져요. 커밋 신원은 `CLAUDE.md` 6-5의 no-reply 주소로 맞춰요.

### 검사에 걸렸을 때

- 커밋 전 검사: 적힌 파일에서 값을 지우고 다시 담아요(`git add`). `.env` 파일이나 압축 파일이 담겼으면 `git rm --cached <파일>`로 빼요.
- 커밋 설명 글 검사: 설명 글에서 그 부분을 지우고 다시 커밋해요.
- 올리기 전 검사: 값이 이미 내 PC의 git 기록에 들어갔다는 뜻이에요. 진짜 열쇠였다면 먼저 7번대로 열쇠를 바꿔요. 그다음 아직 올리지 않은 그 커밋을 기록에서 고친 뒤에 올려요. 혼자 하기 어려우면 Claude에게 "올리기 전 검사에 걸린 커밋을 기록에서 고쳐 줘"라고 시켜요. 이미 깃허브에 올라간 커밋이 걸렸다면 열쇠부터 바꾸고, 기록 정리는 Claude와 함께 해요.
- 압축 파일은 이름을 바꿔 놓아도 내용 첫머리로 알아보고 막아요. 소스를 보내려는 것이면 5번의 `npm run pack`을 써요.

### `--no-verify`는 쓰지 않아요

`git commit --no-verify`와 `git push --no-verify`는 검사를 일부러 건너뛰는 명령이에요. 검사가 막더라도 쓰지 않아요.
커밋 검사를 건너뛴 커밋은 올리기 전 검사(`pre-push`)가 기록 전체를 다시 보면서 잡고, 그것마저 건너뛰어도 GitHub 푸시 보호가 모양이 알려진 열쇠를 막아요.
하지만 머리글자가 없는 값은 그 마지막 그물에 걸리지 않아요. 검사가 틀렸다고 생각되면 건너뛰지 말고 검사 도구(`scripts/check-secrets.mjs`)를 고쳐요.

## 5. 소스를 남에게 보낼 때

폴더를 손으로 압축하면 `.env.local`(열쇠)까지 들어가요. 아래 명령을 써요.

```bash
npm run pack
```

- git이 올릴 파일만 담아요. `.env.local`, `node_modules`, `dist`는 빠져요.
- 묶기 전에 담을 파일을 모두 검사하고, 하나라도 걸리면 묶지 않아요.
- 결과는 프로젝트 폴더 바로 옆에 `<폴더 이름>-source-<날짜>-<시각>.zip`으로 생겨요.

## 6. 같은 와이파이의 휴대폰으로 볼 때

```bash
npm run build
npm run serve
```

- `npm run serve`는 같은 와이파이의 모든 기기에 사이트를 열어요. 그래서 기본은 AI 열쇠를 읽지 않고, AI 대신 규칙으로 만든 기본 답이 나와요.
- AI까지 써 봐야 하면 집처럼 믿을 수 있는 와이파이에서만 아래처럼 켜고, 끝나면 Ctrl+C로 꺼요.
  - PowerShell: `$env:SERVE_AI = "1"; npm run serve` (끝난 뒤 `Remove-Item Env:SERVE_AI`)
  - Git Bash: `SERVE_AI=1 npm run serve`
- 카페나 행사장 와이파이에서는 켜지 말고 공개 사이트 주소로 봐요.
- `npm run dev`와 `npm run preview`는 내 PC에서만 열려서 지금처럼 열쇠를 읽어요.

## 7. 열쇠 바꾸기

열쇠가 채팅, 화면 공유, 커밋, 보고서 어디에든 보였다고 생각되면 바로 바꿔요.

1. Anthropic Console의 API Keys에서 새 열쇠를 만들어요. 값은 그때 한 번만 보여요.
2. 편집기로 `.env.local`을 직접 열어 `ANTHROPIC_API_KEY=` 뒤의 값을 새 값으로 바꾸고 저장해요. 옆 폴더 백엔드의 `.env`도 같은 방법으로 바꿔요. 값을 채팅(Claude 포함), 메신저, 문서에 붙여 넣지 않아요.
3. 프로젝트 폴더에서 아래 명령으로 Vercel에 올려요. PowerShell과 Git Bash 어디서나 한 줄 그대로 붙여 넣으면 돼요. 파일에서 읽어 바로 넘기므로 값이 화면이나 명령줄에 나오지 않아요.

   ```bash
   node -e "const fs=require('fs'),cp=require('child_process');const line=fs.readFileSync('.env.local','utf8').split(/\r?\n/).find(l=>l.startsWith('ANTHROPIC_API_KEY='));cp.execSync('npx vercel env add ANTHROPIC_API_KEY production --force',{input:line.slice(line.indexOf('=')+1).trim().replace(/^[\x22\x27]|[\x22\x27]$/g,''),stdio:['pipe','inherit','inherit']})"
   ```

   명령이 잘 안 되면 Vercel 화면의 Project Settings > Environment Variables에서 값을 직접 바꿔도 돼요.
4. 다시 배포해요: `npm run verify` 다음에 `npx vercel --prod`.
5. `https://<공개 주소>/api/health`를 열어 `"aiConfigured":true`가 나오는지 확인해요.
6. Anthropic Console에서 옛 열쇠를 지워요.
7. `npm run check:secrets`로 옛 값이나 새 값이 올리면 안 되는 파일에 남아 있지 않은지 확인해요.

Claude에게 3번부터 시켜도 돼요. 그때도 값은 채팅에 붙여 넣지 말고 "`.env.local`에 넣어 뒀어"라고만 말해요.

## 8. 돈이 새지 않게

- Anthropic Console의 Limits(사용 한도) 화면에서 한 달 사용 한도를 낮게 정해 두세요. 자동 충전은 꺼 두는 것이 안전해요. 열쇠가 새거나 누가 AI를 많이 불러도 그 한도에서 멈춰요.
- 이 열쇠는 이 프로젝트에만 쓰고, 다른 곳에 같은 열쇠를 돌려쓰지 않아요.
