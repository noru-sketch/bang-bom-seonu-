// 위에서 본 작은 평면도. 방 테두리, 문·창문 표시, 가구 자리를 실제 치수 비율 그대로 그린다.
import { footprint, openingSpan } from '../../engine/geometry.js'
import type { Opening, Placement, Room } from '../../types/schema.ts'

interface RoomThumbnailProps {
  room: Room
  /** 배치안의 좌표. 없으면 지금 놓인 자리 그대로 그린다 */
  placements?: Placement[]
  /** 자리를 찾지 못한 가구 (점선으로 그린다) */
  unplacedIds?: string[]
  /** 읽기 도구에 알려 줄 설명 */
  label: string
  className?: string
}

interface Point {
  x: number
  y: number
}

/** 문·창문이 벽에서 차지하는 선분의 두 끝과, 방 안쪽을 향하는 방향 */
function openingGeometry(opening: Opening, room: Room): { from: Point; to: Point; inward: Point; along: Point } {
  const span = openingSpan(opening)
  if (span.axis === 'x') {
    const y = opening.wall === 'top' ? 0 : room.depthCm
    return {
      from: { x: span.startCm, y },
      to: { x: span.endCm, y },
      inward: { x: 0, y: opening.wall === 'top' ? 1 : -1 },
      along: { x: 1, y: 0 },
    }
  }
  const x = opening.wall === 'left' ? 0 : room.widthCm
  return {
    from: { x, y: span.startCm },
    to: { x, y: span.endCm },
    inward: { x: opening.wall === 'left' ? 1 : -1, y: 0 },
    along: { x: 0, y: 1 },
  }
}

function OpeningMark({ opening, room }: { opening: Opening; room: Room }) {
  const { from, to, inward, along } = openingGeometry(opening, room)
  if (opening.type === 'window') {
    return (
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        className="stroke-accent-strong"
        strokeWidth={3}
        vectorEffect="non-scaling-stroke"
      />
    )
  }
  // 문: 벽을 끊어 보이게 하고, 안으로 열리면 문짝과 열리는 호를 가늘게 그린다
  const w = opening.widthCm
  const leafEnd = { x: from.x + inward.x * w, y: from.y + inward.y * w }
  const arcEnd = { x: from.x + along.x * w, y: from.y + along.y * w }
  const cross = (leafEnd.x - from.x) * (arcEnd.y - from.y) - (leafEnd.y - from.y) * (arcEnd.x - from.x)
  return (
    <g>
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        className="stroke-surface"
        strokeWidth={3}
        vectorEffect="non-scaling-stroke"
      />
      {opening.swingInward ? (
        <path
          d={`M ${from.x} ${from.y} L ${leafEnd.x} ${leafEnd.y} A ${w} ${w} 0 0 ${cross > 0 ? 1 : 0} ${arcEnd.x} ${arcEnd.y}`}
          className="fill-none stroke-muted"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </g>
  )
}

export default function RoomThumbnail({ room, placements, unplacedIds, label, className }: RoomThumbnailProps) {
  const pad = Math.max(room.widthCm, room.depthCm) * 0.04
  const byId = new Map((placements ?? []).map((placement) => [placement.furnitureId, placement]))
  const unplaced = new Set(unplacedIds ?? [])
  // 매트는 바닥에 깔리는 것이라 먼저 그려서 다른 가구 아래에 둔다
  const ordered = [...room.furniture].sort((a, b) => Number(b.category === 'mat') - Number(a.category === 'mat'))

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`${-pad} ${-pad} ${room.widthCm + pad * 2} ${room.depthCm + pad * 2}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
    >
      <rect
        x={0}
        y={0}
        width={room.widthCm}
        height={room.depthCm}
        className="fill-paper stroke-line-strong"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
      {ordered.map((item) => {
        const spot = byId.get(item.id)
        const rect = footprint(spot ? { ...item, xCm: spot.xCm, yCm: spot.yCm, rotation: spot.rotation } : item)
        const missing = unplaced.has(item.id)
        const look = missing
          ? 'fill-danger-soft stroke-danger'
          : item.category === 'mat'
            ? 'fill-sunken stroke-line-strong'
            : 'fill-accent-soft stroke-accent'
        return (
          <rect
            key={item.id}
            x={rect.xCm}
            y={rect.yCm}
            width={rect.widthCm}
            height={rect.depthCm}
            rx={3}
            className={look}
            strokeWidth={1}
            strokeDasharray={missing ? '3 2' : undefined}
            vectorEffect="non-scaling-stroke"
          />
        )
      })}
      {room.openings.map((opening) => (
        <OpeningMark key={opening.id} opening={opening} room={room} />
      ))}
    </svg>
  )
}
