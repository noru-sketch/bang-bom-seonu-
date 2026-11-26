// 스케치업 내보내기(daeExport.js) 테스트. 만든 글을 작은 XML 검사기로 다시 읽어서 상자의 자리와 크기를 확인한다.

/** @import { FurnitureItem, Room, Rotation } from '../src/types/schema.ts' */

import test from 'node:test'
import assert from 'node:assert/strict'
import { DAE_WALL_THICKNESS_CM, projectToDae, roomToDae } from '../src/engine/daeExport.js'
import { footprint, footprintSize, frontDirection } from '../src/engine/geometry.js'
import { createEmptyProject, createExampleProject } from '../src/data/exampleProject.js'

/**
 * @typedef {{ tag: string, attrs: Record<string, string>, children: XmlNode[], text: string }} XmlNode
 * @typedef {{ min: number[], max: number[] }} Bounds 장면 좌표(m)의 상자
 * @typedef {{ name: string, color: string, matrix: number[], boxes: Bounds[], bounds: Bounds }} SceneNode
 */

/** 방 부분: 바닥 1 + 벽 4. 노드는 이 순서로 나온 뒤 가구가 이어진다 */
const ROOM_PARTS = ['바닥', '위쪽 벽', '아래쪽 벽', '왼쪽 벽', '오른쪽 벽']
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n'
/** 1mm를 m로 */
const MM = 0.001

// ── 작은 XML 검사기 ─────────────────────────────────────────────────────

/**
 * 이스케이프를 푼다. 이스케이프가 아닌 &가 남아 있으면 깨진 XML이다.
 * @param {string} text
 * @returns {string}
 */
function decodeXml(text) {
  assert.ok(!/&(?!(?:lt|gt|amp|quot|apos);)/.test(text), `이스케이프 안 된 &가 있어요: ${text.slice(0, 40)}`)
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/**
 * 태그 짝이 안 맞거나, 속성·글자에 이스케이프 안 된 < & 가 있거나, XML에 못 쓰는 글자가 있으면 오류를 던진다.
 * @param {string} xml
 * @returns {XmlNode} 뿌리 요소
 */
function parseXml(xml) {
  assert.ok(xml.startsWith(XML_HEAD), 'XML 선언으로 시작해야 해요')
  // eslint-disable-next-line no-control-regex
  assert.ok(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ud800-\udfff￾￿]/u.test(xml), 'XML에 못 쓰는 글자가 있어요')
  const token = /<(\/?)([A-Za-z_][\w.-]*)((?:\s+[A-Za-z_][\w.:-]*="[^"<]*")*)\s*(\/?)>|([^<]+)/y
  /** @type {XmlNode} */
  const top = { tag: '#문서', attrs: {}, children: [], text: '' }
  const stack = [top]
  token.lastIndex = XML_HEAD.length
  while (token.lastIndex < xml.length) {
    const at = token.lastIndex
    const match = token.exec(xml)
    if (!match) throw new Error(`XML이 깨졌어요 (${at}번째 글자: ${xml.slice(at, at + 30)})`)
    const [, closing, tag, attrText, selfClosing, text] = match
    const current = stack[stack.length - 1]
    if (text !== undefined) {
      current.text += decodeXml(text)
    } else if (closing) {
      assert.equal(attrText + selfClosing, '', `닫는 태그에 다른 것이 붙었어요: ${tag}`)
      assert.equal(tag, current.tag, `닫는 태그가 안 맞아요: </${tag}>`)
      stack.pop()
    } else {
      /** @type {Record<string, string>} */
      const attrs = {}
      for (const [, name, value] of attrText.matchAll(/([A-Za-z_][\w.:-]*)="([^"]*)"/g)) {
        assert.ok(!(name in attrs), `속성이 두 번 나와요: ${name}`)
        attrs[name] = decodeXml(value)
      }
      /** @type {XmlNode} */
      const node = { tag, attrs, children: [], text: '' }
      current.children.push(node)
      if (!selfClosing) stack.push(node)
    }
  }
  assert.equal(stack.length, 1, `닫히지 않은 태그가 있어요: ${stack[stack.length - 1].tag}`)
  assert.equal(top.children.length, 1, '뿌리 요소는 하나여야 해요')
  assert.equal(top.text.trim(), '', '뿌리 밖에 글자가 있어요')
  return top.children[0]
}

/**
 * 아래에 있는 모든 tag 요소.
 * @param {XmlNode} node
 * @param {string} tag
 * @returns {XmlNode[]}
 */
function findAll(node, tag) {
  return node.children.flatMap((child) => [...(child.tag === tag ? [child] : []), ...findAll(child, tag)])
}

/**
 * 아래에 하나만 있어야 하는 tag 요소.
 * @param {XmlNode} node
 * @param {string} tag
 * @returns {XmlNode}
 */
function only(node, tag) {
  const found = findAll(node, tag)
  assert.equal(found.length, 1, `<${node.tag}> 안에 <${tag}>가 하나여야 해요`)
  return found[0]
}

/**
 * 빈칸으로 나뉜 숫자들. 지수 표기·NaN 같은 글은 받지 않는다.
 * @param {string} text
 * @returns {number[]}
 */
function numbers(text) {
  return text
    .trim()
    .split(/\s+/)
    .map((word) => {
      assert.match(word, /^-?\d+(\.\d+)?$/, `숫자 모양이 아니에요: ${word}`)
      return Number(word)
    })
}

// ── 장면 읽기 ───────────────────────────────────────────────────────────

/**
 * @param {number[][]} points
 * @returns {Bounds}
 */
function boundsOf(points) {
  return {
    min: [0, 1, 2].map((axis) => Math.min(...points.map((point) => point[axis]))),
    max: [0, 1, 2].map((axis) => Math.max(...points.map((point) => point[axis]))),
  }
}

/** @param {Bounds} bounds */
const centerOf = (bounds) => bounds.min.map((value, axis) => (value + bounds.max[axis]) / 2)
/** @param {Bounds} bounds */
const sizeOf = (bounds) => bounds.max.map((value, axis) => value - bounds.min[axis])

/**
 * 문서를 읽어 노드마다 이름·색·상자(장면 좌표, m)를 꺼낸다.
 * 읽는 길에 id 겹침, 가리키는 곳, 개수, 삼각형 겉면 방향도 확인한다.
 * @param {string} xml
 * @returns {SceneNode[]}
 */
function readScene(xml) {
  const root = parseXml(xml)
  /** @type {Map<string, XmlNode>} */
  const byId = new Map()
  /** @param {XmlNode} node */
  const collect = (node) => {
    if (node.attrs.id !== undefined) {
      assert.ok(!byId.has(node.attrs.id), `id가 겹쳐요: ${node.attrs.id}`)
      byId.set(node.attrs.id, node)
    }
    node.children.forEach(collect)
  }
  collect(root)
  /**
   * "#id"가 가리키는 요소.
   * @param {string} url
   * @param {string} tag
   * @returns {XmlNode}
   */
  const target = (url, tag) => {
    const node = url.startsWith('#') ? byId.get(url.slice(1)) : undefined
    if (!node) throw new Error(`가리키는 곳이 없어요: ${url}`)
    assert.equal(node.tag, tag, `${url}는 <${tag}>여야 해요`)
    return node
  }

  const scene = target(only(only(root, 'scene'), 'instance_visual_scene').attrs.url, 'visual_scene')
  return scene.children.map((node) => {
    assert.equal(node.tag, 'node')
    const matrix = numbers(only(node, 'matrix').text)
    assert.equal(matrix.length, 16)
    assert.deepEqual(matrix.slice(8), [0, 0, 1, 0, 0, 0, 0, 1], 'Z축 회전과 옮기기만 있어야 해요')
    // 거울 뒤집기가 섞이면 겉면이 안쪽을 보게 된다
    assert.equal(matrix[0] * matrix[5] - matrix[1] * matrix[4], 1, '거울 뒤집기가 없어야 해요')

    const instance = only(node, 'instance_geometry')
    const geometry = target(instance.attrs.url, 'geometry')
    assert.equal(geometry.attrs.name, node.attrs.name)
    const triangles = only(geometry, 'triangles')
    const bound = only(instance, 'instance_material')
    assert.equal(bound.attrs.symbol, triangles.attrs.material)
    const effect = target(only(target(bound.attrs.target, 'material'), 'instance_effect').attrs.url, 'effect')
    const rgba = numbers(only(only(effect, 'lambert'), 'color').text)
    assert.equal(rgba.length, 4)
    assert.ok(rgba.every((value) => value >= 0 && value <= 1))
    const color = `#${rgba.slice(0, 3).map((value) => Math.round(value * 255).toString(16).padStart(2, '0')).join('')}`

    const vertices = target(only(triangles, 'input').attrs.source, 'vertices')
    const source = target(only(vertices, 'input').attrs.source, 'source')
    const accessor = only(source, 'accessor')
    const array = target(accessor.attrs.source, 'float_array')
    const flat = numbers(array.text)
    assert.equal(flat.length, Number(array.attrs.count))
    assert.equal(flat.length, Number(accessor.attrs.count) * 3)
    assert.equal(accessor.attrs.stride, '3')
    assert.equal(flat.length % 24, 0, '상자 하나는 꼭짓점 8개예요')

    /** @type {number[][]} */
    const points = []
    for (let i = 0; i < flat.length; i += 3) {
      const [x, y, z] = [flat[i], flat[i + 1], flat[i + 2]]
      points.push([
        matrix[0] * x + matrix[1] * y + matrix[2] * z + matrix[3],
        matrix[4] * x + matrix[5] * y + matrix[6] * z + matrix[7],
        matrix[8] * x + matrix[9] * y + matrix[10] * z + matrix[11],
      ])
    }
    /** @type {Bounds[]} */
    const boxes = []
    for (let i = 0; i < points.length; i += 8) boxes.push(boundsOf(points.slice(i, i + 8)))

    const index = numbers(only(triangles, 'p').text)
    assert.equal(index.length, Number(triangles.attrs.count) * 3)
    assert.equal(index.length, boxes.length * 36, '상자 하나는 삼각형 12개예요')
    assert.ok(index.every((value) => Number.isInteger(value) && value >= 0 && value < points.length))
    // 삼각형은 밖에서 볼 때 반시계 방향이어야 스케치업에서 겉면이 바깥을 본다
    for (let i = 0; i < index.length; i += 3) {
      const [a, b, c] = [points[index[i]], points[index[i + 1]], points[index[i + 2]]]
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
      const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
      const middle = centerOf(boxes[Math.floor(index[i] / 8)])
      const outward = [0, 1, 2].reduce((sum, axis) => sum + normal[axis] * ((a[axis] + b[axis] + c[axis]) / 3 - middle[axis]), 0)
      assert.ok(outward > 0, `${node.attrs.name}: 삼각형 겉면이 안쪽을 봐요`)
    }
    return { name: node.attrs.name, color: color.toUpperCase(), matrix, boxes, bounds: boundsOf(points) }
  })
}

/**
 * @param {number[]} actual
 * @param {number[]} expected
 * @param {string} label
 */
function assertNear(actual, expected, label) {
  assert.equal(actual.length, expected.length, label)
  const close = actual.every((value, index) => Math.abs(value - expected[index]) <= MM)
  assert.ok(close, `${label}: [${actual.join(', ')}]가 [${expected.join(', ')}]와 1mm 넘게 달라요`)
}

/**
 * 점이 어느 상자 안에 있으면 true.
 * @param {SceneNode[]} nodes
 * @param {number[]} point
 */
function solidAt(nodes, point) {
  return nodes.some((node) =>
    node.boxes.some((box) => point.every((value, axis) => value > box.min[axis] && value < box.max[axis])),
  )
}

/**
 * 한 노드 안의 상자들이 서로 파고들지 않는지.
 * @param {SceneNode} node
 */
function assertNoOverlap(node) {
  node.boxes.forEach((a, i) => {
    node.boxes.slice(i + 1).forEach((b) => {
      const shared = [0, 1, 2].every((axis) => Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]) > MM)
      assert.ok(!shared, `${node.name}: 상자가 서로 겹쳐요`)
    })
  })
}

/**
 * 예시 방을 고친 뒤 내보낸 글.
 * @param {(room: Room) => void} change
 * @returns {string}
 */
function exportChanged(change) {
  const project = createExampleProject()
  change(project.rooms[0])
  return projectToDae(project)
}

// ── 테스트 ──────────────────────────────────────────────────────────────

test('문서는 짝이 맞는 XML이고 단위는 미터, 위쪽은 Z예요', () => {
  const dae = projectToDae(createExampleProject())
  const root = parseXml(dae)
  assert.equal(root.tag, 'COLLADA')
  assert.equal(root.attrs.version, '1.4.1')
  assert.equal(root.attrs.xmlns, 'http://www.collada.org/2005/11/COLLADASchema')
  assert.ok(dae.includes('<unit name="meter" meter="1"/>'))
  assert.ok(dae.includes('<up_axis>Z_UP</up_axis>'))
  const asset = only(root, 'asset')
  assert.deepEqual(only(asset, 'unit').attrs, { name: 'meter', meter: '1' })
  assert.equal(only(asset, 'up_axis').text, 'Z_UP')
  assert.ok(dae.endsWith('</COLLADA>\n'))
})

test('XML 검사기는 깨진 글을 잡아내요', () => {
  const broken = [
    '<a><b></a></b>', // 짝이 엇갈림
    '<a><b></b>', // 안 닫힘
    '<a name="1 < 2"/>', // 속성 안의 <
    '<a>곰 & 여우</a>', // 이스케이프 안 된 &
    '<a name="곰 & 여우"/>',
    '<a/><b/>', // 뿌리가 둘
    '<a>\u0001</a>', // 제어 문자
    '<a x="1" x="2"/>', // 같은 속성 두 번
  ]
  for (const body of broken) assert.throws(() => parseXml(XML_HEAD + body), Error, body)
  const fine = parseXml(`${XML_HEAD}<a name="&lt;&amp;&quot;"><b/>글</a>\n`)
  assert.equal(fine.attrs.name, '<&"')
  assert.equal(fine.text, '글')
})

test('노드 수는 방 부분 5개(바닥 1 + 벽 4)에 가구 수를 더한 값이에요', () => {
  const project = createExampleProject()
  const furniture = project.rooms[0].furniture
  const nodes = readScene(projectToDae(project))
  assert.equal(nodes.length, ROOM_PARTS.length + furniture.length)
  assert.deepEqual(
    nodes.map((node) => node.name),
    [...ROOM_PARTS, ...furniture.map((item) => item.name)],
  )
})

test('예시 방의 가구 상자는 가운데와 크기가 방 자료와 1mm 안에서 같아요', () => {
  const project = createExampleProject()
  const room = project.rooms[0]
  const nodes = readScene(projectToDae(project)).slice(ROOM_PARTS.length)
  room.furniture.forEach((item, index) => {
    const body = footprint(item)
    const { bounds, boxes } = nodes[index]
    assert.equal(boxes.length, 1, `${item.name}은 상자 하나예요`)
    assertNear(
      centerOf(bounds),
      [(body.xCm + body.widthCm / 2) / 100, (room.depthCm - body.yCm - body.depthCm / 2) / 100, item.heightCm / 200],
      `${item.name} 가운데`,
    )
    assertNear(sizeOf(bounds), [body.widthCm / 100, body.depthCm / 100, item.heightCm / 100], `${item.name} 크기`)
  })
  // 손으로 계산한 값: 평면도 위쪽 벽에 붙은 침대(x 185~300, y 0~205)는 Y가 방 세로 4m까지 닿는다
  assertNear([...nodes[0].bounds.min, ...nodes[0].bounds.max], [1.85, 1.95, 0, 3, 4, 0.45], '침대')
  // 회전 270인 옷장(80×60)은 60×80으로 놓인다 (x 240~300, y 260~340)
  assertNear([...nodes[3].bounds.min, ...nodes[3].bounds.max], [2.4, 0.6, 0, 3, 1.4, 2], '옷장')
})

test('회전 90·270은 바닥 차지 크기를 바꾸고, 정면은 geometry.js와 같은 쪽을 봐요', () => {
  /** @param {Rotation} rotation */
  const exportDesk = (rotation) => {
    /** @type {FurnitureItem | undefined} */
    let desk
    const dae = exportChanged((room) => {
      desk = { ...room.furniture[1], xCm: 100, yCm: 100, rotation }
      room.furniture = [desk]
    })
    if (!desk) throw new Error('책상이 없어요')
    return { desk, node: readScene(dae)[ROOM_PARTS.length] }
  }
  /** @type {Rotation[]} */
  const rotations = [0, 90, 180, 270]
  for (const rotation of rotations) {
    const { desk, node } = exportDesk(rotation)
    const size = footprintSize(desk)
    assertNear(sizeOf(node.bounds), [size.widthCm / 100, size.depthCm / 100, 0.72], `회전 ${rotation} 크기`)
    // 묶음의 정면은 자기 좌표의 −Y다. 평면도의 아래(+y)는 내보낸 좌표의 −Y라서 y 부호만 바뀐다
    const front = frontDirection(rotation)
    assertNear([-node.matrix[1], -node.matrix[5]], [front.dx, -front.dy], `회전 ${rotation} 정면`)
  }
  // 손으로 계산한 값: 120×60 책상을 (100, 100)에 놓으면 회전 0은 x 100~220·y 100~160, 회전 90은 x 100~160·y 100~220
  const flat = exportDesk(0).node.bounds
  assertNear([flat.min[0], flat.min[1], flat.max[0], flat.max[1]], [1, 2.4, 2.2, 3], '회전 0')
  const turned = exportDesk(90).node.bounds
  assertNear([turned.min[0], turned.min[1], turned.max[0], turned.max[1]], [1, 1.8, 1.6, 3], '회전 90')
})

test('이름의 <, &, 따옴표는 이스케이프되고 XML에 못 쓰는 글자는 빠져요', () => {
  const tricky = `책상 <"특가" & '새것'>`
  const fakeTag = '"/><node name="가짜'
  const dae = exportChanged((room) => {
    room.furniture[0].name = tricky
    room.furniture[1].name = fakeTag
    room.furniture[2].name = '의자\u0000\u0007\uD83D'
    room.furniture[3].name = '   '
  })
  assert.ok(!dae.includes(tricky))
  assert.ok(dae.includes('name="책상 &lt;&quot;특가&quot; &amp; &apos;새것&apos;&gt;"'))
  const names = readScene(dae)
    .slice(ROOM_PARTS.length)
    .map((node) => node.name)
  assert.deepEqual(names, [tricky, fakeTag, '의자', '이름 없는 가구', '800 책장'])
})

test('가구가 없는 빈 방도 방 부분만으로 내보내요', () => {
  const nodes = readScene(projectToDae(createEmptyProject({ widthCm: 300, depthCm: 400 })))
  assert.deepEqual(
    nodes.map((node) => node.name),
    ROOM_PARTS,
  )
  // 방이 하나도 없는 프로젝트도 깨지지 않고 빈 장면이 나온다
  assert.deepEqual(readScene(projectToDae({ ...createExampleProject(), rooms: [] })), [])
})

test('이상한 숫자(NaN, 음수 크기, 끝없는 값)가 든 가구는 건너뛰고 쓰지 않아요', () => {
  const dae = exportChanged((room) => {
    const good = room.furniture[0]
    room.furniture = [
      { ...good, id: 'bad_1', name: '숫자 아님', xCm: NaN },
      { ...good, id: 'bad_2', name: '음수 크기', widthCm: -50 },
      { ...good, id: 'bad_3', name: '높이 0', heightCm: 0 },
      { ...good, id: 'bad_4', name: '끝없는 값', yCm: Infinity },
      { ...good, id: 'bad_5', name: '너무 큰 값', depthCm: 1e300 },
      /** @type {FurnitureItem} */ (/** @type {unknown} */ ({ ...good, id: 'bad_6', name: '글자 숫자', widthCm: '115' })),
      /** @type {FurnitureItem} */ (/** @type {unknown} */ (null)),
      good,
    ]
  })
  assert.doesNotMatch(dae, /NaN|Infinity|undefined|null|e\+/)
  assert.deepEqual(
    readScene(dae).map((node) => node.name),
    [...ROOM_PARTS, '슈퍼싱글 수납 침대'],
  )
})

test('방 크기가 이상하면 그 숫자에 기대는 부분은 쓰지 않아요', () => {
  const furnitureNames = createExampleProject().rooms[0].furniture.map((item) => item.name)
  /** @param {(room: Room) => void} change */
  const namesAfter = (change) => {
    const dae = exportChanged(change)
    assert.doesNotMatch(dae, /NaN|Infinity|undefined|e\+/)
    return readScene(dae).map((node) => node.name)
  }
  // 높이가 없으면 벽을 세울 수 없다. 바닥과 가구는 그대로 낸다
  assert.deepEqual(
    namesAfter((room) => {
      room.heightCm = NaN
    }),
    ['바닥', ...furnitureNames],
  )
  // 가로·세로가 잘못되면 가구 자리도 정할 수 없어서 빈 장면이 나온다
  assert.deepEqual(
    namesAfter((room) => {
      room.widthCm = -300
    }),
    [],
  )
  assert.deepEqual(
    namesAfter((room) => {
      room.depthCm = NaN
    }),
    [],
  )
})

test('벽은 방 바깥에 10cm 두께로 서고, 문과 창문 자리는 비어 있어요', () => {
  // 예시 방: 가로 3m × 세로 4m × 높이 2.4m. 문은 아래 벽 x 0.2~1.1m, 창문은 위 벽 x 0.8~2.3m·높이 0.9~2.1m
  const nodes = readScene(projectToDae(createExampleProject())).slice(0, ROOM_PARTS.length)
  const [floor, top, bottom, left, right] = nodes
  assert.equal(DAE_WALL_THICKNESS_CM, 10)
  assertNear([...floor.bounds.min, ...floor.bounds.max], [-0.1, -0.1, -0.06, 3.1, 4.1, 0], '바닥')
  assertNear([...top.bounds.min, ...top.bounds.max], [-0.1, 4, 0, 3.1, 4.1, 2.4], '위쪽 벽')
  assertNear([...bottom.bounds.min, ...bottom.bounds.max], [-0.1, -0.1, 0, 3.1, 0, 2.4], '아래쪽 벽')
  assertNear([...left.bounds.min, ...left.bounds.max], [-0.1, 0, 0, 0, 4, 2.4], '왼쪽 벽')
  assertNear([...right.bounds.min, ...right.bounds.max], [3, 0, 0, 3.1, 4, 2.4], '오른쪽 벽')
  nodes.forEach(assertNoOverlap)

  // 문: 가운데는 비고, 문 위(2.1m부터)와 문 옆은 벽이다
  assert.equal(solidAt(nodes, [0.65, -0.05, 1]), false, '문 자리')
  assert.equal(solidAt(nodes, [0.65, -0.05, 2.2]), true, '문 위')
  assert.equal(solidAt(nodes, [1.5, -0.05, 1]), true, '문 옆')
  // 창문: 가운데는 비고, 창 아래·창 위·창 옆은 벽이다
  assert.equal(solidAt(nodes, [1.55, 4.05, 1.5]), false, '창문 자리')
  assert.equal(solidAt(nodes, [1.55, 4.05, 0.5]), true, '창 아래')
  assert.equal(solidAt(nodes, [1.55, 4.05, 2.2]), true, '창 위')
  assert.equal(solidAt(nodes, [0.4, 4.05, 1.5]), true, '창 옆')
  // 네 모서리는 막혀 있고 방 안은 비어 있다
  for (const corner of [[-0.05, -0.05], [3.05, -0.05], [-0.05, 4.05], [3.05, 4.05]]) {
    assert.equal(solidAt(nodes, [...corner, 1]), true, `모서리 ${corner.join(', ')}`)
  }
  assert.equal(solidAt(nodes, [1.5, 2, 1]), false, '방 안')

  // 벽 두께를 바꿔 달라고 하면 그 값으로 선다
  const thick = readScene(projectToDae(createExampleProject(), { wallThicknessCm: 20 }))[3]
  assertNear([thick.bounds.min[0], thick.bounds.max[0]], [-0.2, 0], '두께 20cm 왼쪽 벽')
})

test('문·창문 숫자가 이상하거나 서로 겹쳐도 벽은 깨지지 않아요', () => {
  // 숫자가 잘못된 문은 비우지 않는다(벽으로 막힌 채로 둔다)
  const blocked = readScene(
    exportChanged((room) => {
      room.openings[0].offsetCm = NaN
    }),
  )
  assert.equal(solidAt(blocked, [0.65, -0.05, 1]), true)

  // 벽보다 넓은 문은 벽 길이 안에서만 비운다(모서리는 남는다)
  const wide = readScene(
    exportChanged((room) => {
      room.openings[0] = { ...room.openings[0], offsetCm: -50, widthCm: 1000 }
    }),
  )
  assert.equal(solidAt(wide, [1.5, -0.05, 1]), false)
  assert.equal(solidAt(wide, [-0.05, -0.05, 1]), true)
  assert.equal(solidAt(wide, [3.05, -0.05, 1]), true)

  // 문(x 20~110) 뒤에 겹쳐 놓인 창문(x 100~200)은 겹친 곳을 다시 비우지 않는다
  const overlapped = readScene(
    exportChanged((room) => {
      room.openings.push({ ...room.openings[1], id: 'op_win_2', wall: 'bottom', offsetCm: 100, widthCm: 100 })
    }),
  )
  overlapped.forEach(assertNoOverlap)
  assert.equal(solidAt(overlapped, [1.05, -0.05, 1]), false, '문 자리')
  assert.equal(solidAt(overlapped, [1.5, -0.05, 1.5]), false, '창문 자리')
  assert.equal(solidAt(overlapped, [1.5, -0.05, 0.5]), true, '창 아래')
})

test('색마다 재질이 하나이고, 색 값은 0~1로 바뀌어요', () => {
  const dae = projectToDae(createExampleProject())
  const root = parseXml(dae)
  // 바닥, 벽, 침대, 책상·책장(같은 색), 의자, 옷장 = 6가지
  assert.equal(findAll(root, 'material').length, 6)
  assert.equal(findAll(root, 'effect').length, 6)
  assert.deepEqual(
    readScene(dae).map((node) => node.color),
    ['#D9C3A3', '#F7F5F0', '#F7F5F0', '#F7F5F0', '#F7F5F0', '#E8DFD5', '#C9A77C', '#6E7B85', '#F2EFE9', '#C9A77C'],
  )
  assert.ok(dae.includes('<color>0.85098 0.764706 0.639216 1</color>'))

  // 세 자리 색은 여섯 자리로 풀고, 색이 아닌 값은 기본색으로 바꾼다
  const odd = readScene(
    exportChanged((room) => {
      room.furniture[0].color = '#abc'
      room.furniture[1].color = 'red'
    }),
  )
  assert.equal(odd[5].color, '#AABBCC')
  assert.equal(odd[6].color, '#CFCBC2')
})

test('같은 방은 언제나 같은 글이 되고, 날짜가 들어가지 않아요', () => {
  const first = createExampleProject()
  const second = createExampleProject()
  second.updatedAt = '2099-12-31T23:59:59.000Z'
  const dae = projectToDae(first)
  assert.equal(dae, projectToDae(second))
  assert.equal(dae, projectToDae(first))
  assert.doesNotMatch(dae, /\d{4}-\d{2}-\d{2}|<created>|<modified>|<author>/)
})

test('프로젝트에서는 지금 보고 있는 방을 내보내고, roomId로 다른 방을 고를 수 있어요', () => {
  const project = createExampleProject()
  const small = createEmptyProject({ widthCm: 200, depthCm: 250 }).rooms[0]
  small.id = 'room_2'
  project.rooms.push(small)
  assert.equal(projectToDae(project), roomToDae(project.rooms[0]))
  assert.equal(projectToDae(project, { roomId: 'room_2' }), roomToDae(small))
  project.activeRoomId = 'room_2'
  assert.equal(projectToDae(project), roomToDae(small))
  // 없는 방을 가리키면 첫 방을 낸다
  project.activeRoomId = 'room_없음'
  assert.equal(projectToDae(project), roomToDae(project.rooms[0]))
})
