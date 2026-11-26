// GET /api/health : 서버가 살아 있는지, AI 열쇠가 설정됐는지만 알려 준다. 열쇠 값은 절대 내보내지 않는다.
import { errorJson, guardOrigin, json, preflight } from '../server/http.js'
import { isAiConfigured } from '../server/ai.js'

export default {
  /**
   * @param {Request} request
   * @returns {Promise<Response>}
   */
  fetch(request) {
    return guardOrigin(request, () => {
      if (request.method === 'OPTIONS') return preflight()
      if (request.method !== 'GET') return errorJson(405, 'method_not_allowed', 'GET으로만 부를 수 있어요.')
      return json({ status: 'ok', aiConfigured: isAiConfigured() })
    })
  },
}
