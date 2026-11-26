// 리포트에 넣는 2D 평면도 그림. 벽, 문(열리는 호), 창문, 가구(이름과 앞쪽 표시)를 실제 치수 비율로 그린다.
// 편집기와 따로 그리는 읽기 전용 그림이라 종이에 그대로 찍힌다. 선은 글자색(currentColor)을 따라가서 인쇄하면 검정이 된다.
import { footprint, frontDirection, openingSpan } from '../../engine/geometry.js'
import type { FurnitureItem, Opening, Room } from '../../types/schema.ts'

interface PlanFigureProps {
  room: Room
  /** true면 방 가로·세로 치수선을 같이 그린다 (업체용) */
  showDimensions?: boolean
  className?: string
}

interface Point {
  x: number
  y: number
}

/** 문·창문이 벽에서 차지하는 선분의 시작점, 벽을 따라가는 방향, 방 안쪽 방향 */
function openingGeometry(opening: Opening, room: Room): { from: Point; along: Point; inward: Point } {
  const span = openingSpan(opening)
  if (span.axis === 'x') {
    const top = opening.wall === 'top'
    return { from: { x: span.startCm, y: top ? 0 : room.depthCm }, along: { x: 1, y: 0 }, inward: { x: 0, y: top ? 1 : -1 } }
  }
  const left = opening.wall === 'left'
  return { from: { x: left ? 0 : room.widthCm, y: span.startCm }, along: { x: 0, y: 1 }, inward: { x: left ? 1 : -1, y: 0 } }
}

function OpeningMark({ opening, room, unit }: { opening: Opening; room: Room; unit: number }) {
  const { from, along, inward } = openingGeometry(opening, room)
  const w = opening.widthCm
  const to = { x: from.x + along.x * w, y: from.y + along.y * w }
  if (opening.type === 'window') {
    // 창문: 벽에 걸친 가는 상자 (도면에서 흔히 쓰는 표시)
    const t = unit * 0.9
    const x = Math.min(from.x, to.x) - (along.x === 0 ? t / 2 : 0)
    const y = Math.min(from.y, to.y) - (along.y === 0 ? t / 2 : 0)
    return (
      <g>
        <rect
          x={x}
          y={y}
          width={along.x === 0 ? t : w}
          height={along.y === 0 ? t : w}
          className="fill-surface"
          stroke="currentColor"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="currentColor" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      </g>
    )
  }
  // 문: 벽을 끊어 보이게 하고, 안으로 열리면 문짝과 열리는 호를 그린다
  const leafEnd = { x: from.x + inward.x * w, y: from.y + inward.y * w }
  const cross = (leafEnd.x - from.x) * (to.y - from.y) - (leafEnd.y - from.y) * (to.x - from.x)
  return (
    <g>
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="stroke-surface" strokeWidth={4} vectorEffect="non-scaling-stroke" />
      {opening.swingInward ? (
        <path
          d={`M ${from.x} ${from.y} L ${leafEnd.x} ${leafEnd.y} A ${w} ${w} 0 0 ${cross > 0 ? 1 : 0} ${to.x} ${to.y}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={1}
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </g>
  )
}

function FurnitureMark({ item, index, unit }: { item: FurnitureItem; index: number; unit: number }) {
  const body = footprint(item)
  const { dx, dy } = frontDirection(item.rotation)
  const cx = body.xCm + body.widthCm / 2
  const cy = body.yCm + body.depthCm / 2
  // 앞쪽 변의 두 끝
  const front =
    dy === 1
      ? { x1: body.xCm, y1: body.yCm + body.depthCm, x2: body.xCm + body.widthCm, y2: body.yCm + body.depthCm }
      : dy === -1
        ? { x1: body.xCm, y1: body.yCm, x2: body.xCm + body.widthCm, y2: body.yCm }
        : dx === 1
          ? { x1: body.xCm + body.widthCm, y1: body.yCm, x2: body.xCm + body.widthCm, y2: body.yCm + body.depthCm }
          : { x1: body.xCm, y1: body.yCm, x2: body.xCm, y2: body.yCm + body.depthCm }
  // 앞쪽을 가리키는 작은 세모 (앞쪽 변 바로 안쪽)
  const fx = (front.x1 + front.x2) / 2
  const fy = (front.y1 + front.y2) / 2
  const s = Math.min(unit * 0.7, body.widthCm / 5, body.depthCm / 5)
  const tip = { x: fx - dx * s * 0.3, y: fy - dy * s * 0.3 }
  const base = { x: fx - dx * s * 1.4, y: fy - dy * s * 1.4 }
  const triangle = `${tip.x},${tip.y} ${base.x - dy * s * 0.7},${base.y + dx * s * 0.7} ${base.x + dy * s * 0.7},${base.y - dx * s * 0.7}`

  // 이름은 긴 쪽 방향으로 쓰고, 자리에 맞게 글자 크기를 줄인다. 너무 작아지면 번호만 쓴다
  const vertical = body.depthCm > body.widthCm * 1.4
  const room = vertical ? body.depthCm : body.widthCm
  const across = vertical ? body.widthCm : body.depthCm
  const label = `${index + 1}. ${item.name}`
  const fitSize = Math.min(unit * 1.2, (room * 0.8) / Math.max(1, label.length * 0.85), across * 0.4)
  const showName = fitSize >= unit * 0.75
  const fontSize = showName ? fitSize : Math.min(unit * 1.2, across * 0.5, room * 0.5)
  // 글자는 앞쪽 세모와 겹치지 않게 뒤쪽으로 조금 물린다
  const tx = cx - dx * s
  const ty = cy - dy * s
  return (
    <g>
      <rect
        x={body.xCm}
        y={body.yCm}
        width={body.widthCm}
        height={body.depthCm}
        className="fill-surface"
        fillOpacity={item.category === 'mat' ? 0 : 0.85}
        stroke="currentColor"
        strokeWidth={1}
        strokeDasharray={item.category === 'mat' ? '3 3' : undefined}
        vectorEffect="non-scaling-stroke"
      />
      <line {...front} stroke="currentColor" strokeWidth={3} vectorEffect="non-scaling-stroke" />
      <polygon points={triangle} fill="currentColor" />
      <text
        x={tx}
        y={ty}
        fontSize={fontSize}
        textAnchor="middle"
        dominantBaseline="central"
        fill="currentColor"
        transform={vertical ? `rotate(-90 ${tx} ${ty})` : undefined}
      >
        {showName ? label : index + 1}
      </text>
    </g>
  )
}

export default function PlanFigure({ room, showDimensions = false, className }: PlanFigureProps) {
  // 그림 안의 글자·표시 크기 기준 (방 크기에 비례)
  const unit = Math.max(room.widthCm, room.depthCm) * 0.028
  const pad = unit * 1.2
  const dim = showDimensions ? unit * 4 : 0
  const viewBox = `${-pad - dim} ${-pad - dim} ${room.widthCm + pad * 2 + dim} ${room.depthCm + pad * 2 + dim}`
  // 매트는 바닥에 깔리는 것이라 먼저 그려서 다른 가구 아래에 둔다. 번호는 가구 표와 같게 원래 순서를 쓴다
  const ordered = room.furniture
    .map((item, index) => ({ item, index }))
    .sort((a, b) => Number(b.item.category === 'mat') - Number(a.item.category === 'mat'))
  const dimY = -pad - dim * 0.45
  const dimX = -pad - dim * 0.45
  const tick = unit * 0.6

  return (
    <figure className={className}>
      <svg
        viewBox={viewBox}
        role="img"
        aria-label={`${room.name} 평면도. 가로 ${room.widthCm}cm, 세로 ${room.depthCm}cm, 가구 ${room.furniture.length}개`}
        className="block h-auto w-full text-ink"
      >
        <rect
          x={0}
          y={0}
          width={room.widthCm}
          height={room.depthCm}
          className="fill-surface"
          stroke="currentColor"
          strokeWidth={2.5}
          vectorEffect="non-scaling-stroke"
        />
        {room.openings.map((opening) => (
          <OpeningMark key={opening.id} opening={opening} room={room} unit={unit} />
        ))}
        {ordered.map(({ item, index }) => (
          <FurnitureMark key={item.id} item={item} index={index} unit={unit} />
        ))}
        {showDimensions ? (
          <g stroke="currentColor" strokeWidth={1} fill="currentColor">
            <line x1={0} y1={dimY} x2={room.widthCm} y2={dimY} vectorEffect="non-scaling-stroke" />
            <line x1={0} y1={dimY - tick} x2={0} y2={dimY + tick} vectorEffect="non-scaling-stroke" />
            <line x1={room.widthCm} y1={dimY - tick} x2={room.widthCm} y2={dimY + tick} vectorEffect="non-scaling-stroke" />
            <text x={room.widthCm / 2} y={dimY - unit * 0.6} fontSize={unit * 1.2} textAnchor="middle" stroke="none">
              가로 {room.widthCm}cm
            </text>
            <line x1={dimX} y1={0} x2={dimX} y2={room.depthCm} vectorEffect="non-scaling-stroke" />
            <line x1={dimX - tick} y1={0} x2={dimX + tick} y2={0} vectorEffect="non-scaling-stroke" />
            <line x1={dimX - tick} y1={room.depthCm} x2={dimX + tick} y2={room.depthCm} vectorEffect="non-scaling-stroke" />
            <text
              x={dimX - unit * 0.6}
              y={room.depthCm / 2}
              fontSize={unit * 1.2}
              textAnchor="middle"
              stroke="none"
              transform={`rotate(-90 ${dimX - unit * 0.6} ${room.depthCm / 2})`}
            >
              세로 {room.depthCm}cm
            </text>
          </g>
        ) : null}
      </svg>
      <figcaption className="mt-1 text-[12px] leading-snug text-muted">
        굵은 변과 세모가 가구의 앞쪽이에요. 점선 호는 문이 열리는 자리, 벽에 걸친 가는 상자는 창문이에요. 번호는 가구 표와 같아요.
      </figcaption>
    </figure>
  )
}
