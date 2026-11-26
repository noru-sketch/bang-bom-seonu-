// 좁은 화면(휴대폰) 평면도의 가구 이름표 계산(layoutLabel) 검사.
// 이름을 "800…"처럼 뜻 없이 자르지 않고, 들어가는 모양을 차례로 고르는지 본다.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { layoutLabel } from '../src/canvas2d/planMath.ts'

test('이름표: 넉넉한 가구에는 온전한 이름을 한 줄로 써요', () => {
  assert.deepEqual(layoutLabel('800 옷장', '옷장', 120, 40), { lines: ['800 옷장'], vertical: false, fontPx: 11 })
})

test('이름표: 세로로 긴 가구에는 눕혀서 한 줄로 써요', () => {
  assert.deepEqual(layoutLabel('800 옷장', '옷장', 24, 80), { lines: ['800 옷장'], vertical: true, fontPx: 11 })
})

test('이름표: 한 줄이 안 들어가면 빈칸에서 두 줄로 나눠요', () => {
  assert.deepEqual(layoutLabel('800 옷장', '옷장', 40, 32), { lines: ['800', '옷장'], vertical: false, fontPx: 11 })
})

test('이름표: 두 줄도 빠듯하면 글자를 조금 줄여요', () => {
  assert.deepEqual(layoutLabel('800 옷장', '옷장', 40, 30), { lines: ['800', '옷장'], vertical: false, fontPx: 10 })
})

test('이름표: 온전한 이름이 안 들어가면 가구 종류 이름을 써요', () => {
  assert.deepEqual(layoutLabel('슈퍼싱글 수납 침대', '침대', 30, 20), { lines: ['침대'], vertical: false, fontPx: 11 })
})

test('이름표: 아무것도 안 들어가면 그리지 않아요', () => {
  assert.equal(layoutLabel('800 옷장', '옷장', 10, 10), null)
  assert.equal(layoutLabel('', '', 200, 200), null)
})

test('이름표: 어떤 크기에서도 말줄임표(…)로 자르지 않아요', () => {
  const names = [
    ['슈퍼싱글 수납 침대', '침대'],
    ['1200 책상', '책상'],
    ['2인 식탁', '테이블'],
    ['TV장', 'TV장'],
  ]
  for (const [name, shortName] of names) {
    for (let widthPx = 8; widthPx <= 160; widthPx += 4) {
      for (let heightPx = 8; heightPx <= 160; heightPx += 4) {
        const label = layoutLabel(name, shortName, widthPx, heightPx)
        if (label === null) continue
        assert.ok(label.lines.length >= 1 && label.lines.length <= 2)
        assert.ok(
          label.lines.every((line) => !line.includes('…')),
          `${name} ${widthPx}x${heightPx}`,
        )
        // 줄을 이으면 온전한 이름이거나 가구 종류 이름이어야 한다
        const joined = label.lines.join(' ')
        assert.ok(joined === name || joined === shortName, `${name} ${widthPx}x${heightPx}: ${joined}`)
      }
    }
  }
})
