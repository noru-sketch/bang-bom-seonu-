// POST /api/render-photo : 연출 이미지. 이미지 생성 AI가 아직 정해지지 않아 항상 기본 답(받은 그림 그대로)이다.
/** @import { RenderPhotoResponse, TimeOfDay } from '../src/types/schema.ts' */
import { HttpError, IMAGE_BODY_LIMIT, handle, parseImage } from '../server/http.js'
import { fallbackRenderPhoto } from '../src/engine/fallback.js'

/** AI 연출 없이 받은 그림을 그대로 돌려줄 때의 안내. AI 문구를 쓰지 않는다. */
export const PLAIN_SNAPSHOT_NOTE = '3D 화면 그림 그대로예요 (AI 연출 아님)'

/** @type {TimeOfDay[]} */
const TIMES = ['morning', 'noon', 'evening', 'night']

/**
 * @param {Record<string, unknown>} body
 * @returns {RenderPhotoResponse}
 */
function renderPhoto(body) {
  if (typeof body.snapshotBase64 !== 'string' || !body.snapshotBase64) {
    throw new HttpError(400, 'invalid_request', '3D 화면 그림(snapshotBase64)을 보내 주세요.')
  }
  parseImage(body.snapshotBase64)
  if (body.styleName !== undefined && typeof body.styleName !== 'string') {
    throw new HttpError(400, 'invalid_request', '스타일 이름은 글자여야 해요.')
  }
  if (body.timeOfDay !== undefined && !TIMES.some((time) => time === body.timeOfDay)) {
    throw new HttpError(400, 'invalid_request', '시간대는 morning, noon, evening, night 중 하나여야 해요.')
  }
  return { ...fallbackRenderPhoto({ snapshotBase64: body.snapshotBase64 }), disclaimer: PLAIN_SNAPSHOT_NOTE }
}

export default handle(renderPhoto, { maxBytes: IMAGE_BODY_LIMIT })
