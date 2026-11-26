/* ═══════ 서버(파이썬 백엔드) 연결 · 서버가 답하지 못하면 화면은 브라우저 계산으로 돌아간다 ═══════
   화면은 같은 사이트의 "/backend/<경로>" 로만 서버를 부른다 (서버의 "/api/<경로>" 로 전달된다).
   build.py 가 이 파일을 페이지 스크립트의 { } 안에 그대로 붙인다. 다른 파일과 이름이 겹치지 않게 맨 위 이름은 createBackend 와 Backend 둘뿐이다. */

/**
 * @typedef {"checking" | "server" | "browser" | "off"} BackendMode
 * @typedef {{ mode: BackendMode, failures: number, retryAt: number }} BackendState
 * @typedef {{ llm: boolean, stats: string, rules_version: string | null, data_hash: string | null }} BackendInfo
 * @typedef {"off" | "paused" | "network" | "timeout" | "http" | "json" | "shape" | "rejected"} BackendErrorKind
 * @typedef {Error & { kind: BackendErrorKind, status?: number }} BackendError
 *
 * @typedef {object} BackendEnv 바깥 세상. 테스트가 가짜를 끼울 수 있게 모두 받아서 쓴다
 * @property {(url: string, init: RequestInit) => Promise<Response>} fetch
 * @property {{ search?: string, protocol?: string } | undefined} location
 * @property {{ documentElement?: { dataset: Record<string, string | undefined> } | null } | undefined} document
 * @property {() => number} now
 * @property {(run: () => void, ms: number) => unknown} setTimeout
 * @property {(timer: any) => void} clearTimeout
 *
 * @typedef {object} BackendApi
 * @property {BackendState} state 지금 상태 (읽기만 한다)
 * @property {BackendInfo | null} info 마지막으로 받은 health 답 (아직 없으면 null)
 * @property {(listener: (state: BackendState) => void) => () => void} on 상태가 바뀔 때마다 부른다. 돌려받은 함수를 부르면 그만 듣는다
 * @property {() => Promise<BackendInfo>} health
 * @property {(profile: object, options?: { track?: boolean, ids?: string[] }) => Promise<any>} match
 * @property {(type: "complex_view" | "house_view", complexId: string) => void} event
 * @property {(payload: object) => Promise<any>} chat
 */

/**
 * 서버 연결 하나를 만든다. 만들 때는 서버를 부르지 않는다.
 * @param {BackendEnv} env
 * @returns {BackendApi}
 */
function createBackend(env) {
  "use strict";
  /* 기다리는 시간(ms). 쉬던 공개 서버는 첫 답에 몇 초가 걸리고, 상담은 AI 답을 기다린다 */
  const LIMIT_MS = { health: 4000, match: 6000, events: 3000, chat: 25000 };
  /* 연달아 2번 실패하면 30초 쉰다. 죽은 서버를 기다리느라 화면이 매번 느려지지 않게 */
  const MAX_FAILURES = 2, PAUSE_MS = 30000;
  const LIGHTS = ["on", "dim", "off"];
  const AMOUNTS = ["net_monthly", "net_monthly_best", "net_monthly_worst"];
  /* 화면에 그대로 보여도 되게 쉬운 문장으로 둔다 */
  const MESSAGES = {
    off: "서버 연결을 꺼 둔 화면이에요",
    paused: "서버가 답하지 않아서 잠시 쉬고 있어요",
    network: "서버에 연결하지 못했어요",
    timeout: "서버가 제때 답하지 않았어요",
    http: "서버에서 오류가 났어요",
    json: "서버의 답을 읽지 못했어요",
    shape: "서버의 답이 약속한 모양과 달라요",
    rejected: "서버가 이 요청을 받지 않았어요",
  };

  /* 시연·오프라인 스위치: 주소에 server=off 가 있거나 파일로 바로 연 화면은 서버를 절대 부르지 않는다 */
  const loc = env.location;
  const off = !loc || loc.protocol === "file:" || new URLSearchParams(loc.search || "").getAll("server").includes("off");

  /** @type {BackendState} */
  const state = { mode: off ? "off" : "checking", failures: 0, retryAt: 0 };
  /** @type {((state: BackendState) => void)[]} */
  const listeners = [];

  /** @param {BackendErrorKind} kind @param {number} [status] @returns {BackendError} */
  const problem = (kind, status) => Object.assign(new Error(MESSAGES[kind]), { name: "BackendError", kind, status });
  /** @param {any} v */
  const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

  /* 꾸밈(CSS)과 테스트가 지금 어느 쪽 계산인지 알 수 있게 <html data-server> 에 적어 둔다 */
  function showMode() {
    const root = env.document && env.document.documentElement;
    if (root && root.dataset) root.dataset.server = state.mode;
  }

  /** @param {BackendMode} mode @param {number} failures @param {number} retryAt */
  function update(mode, failures, retryAt) {
    if (state.mode === mode && state.failures === failures && state.retryAt === retryAt) return;
    const modeChanged = state.mode !== mode;
    state.mode = mode; state.failures = failures; state.retryAt = retryAt;
    if (modeChanged) showMode();
    for (const listener of listeners.slice()) {
      try { listener(state); } catch { /* 듣는 쪽의 오류로 요청 결과가 뒤바뀌지 않게 삼킨다 */ }
    }
  }

  /**
   * 요청 하나. 실패를 세고 쉬는 규칙은 이 함수 한 곳에만 있다.
   * @param {"health" | "match" | "events" | "chat"} name
   * @param {string} path
   * @param {(data: any) => any} pick 답의 모양이 맞으면 돌려줄 값, 아니면 undefined
   * @param {unknown} [body]
   * @returns {Promise<any>}
   */
  async function request(name, path, pick, body) {
    if (state.mode === "off") throw problem("off");
    if (env.now() < state.retryAt) throw problem("paused");
    const ctrl = new AbortController();
    /* keepalive: 화면을 떠나는 순간에 보낸 이용 기록도 끝까지 전해지게 한다 */
    /** @type {RequestInit} */
    const init = name === "health"
      ? { method: "GET", cache: "no-store", signal: ctrl.signal }
      : { method: "POST", cache: "no-store", signal: ctrl.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: name === "events" };
    /** @type {unknown} */
    let timer;
    /* 거절을 먼저 하고 끊는다. 그래야 끊긴 요청의 오류보다 "제때 답하지 않음"이 먼저 전해진다 */
    const late = new Promise((_, reject) => {
      timer = env.setTimeout(() => { reject(problem("timeout")); ctrl.abort(); }, LIMIT_MS[name]);
    });
    const send = async () => {
      let res;
      try { res = await env.fetch("/backend/" + path, init); } catch { throw problem("network"); }
      /* 4xx 는 보낸 값이 틀렸거나(422) 너무 자주 불렀다는(429) 뜻이라 서버 고장으로 세지 않는다 */
      if (res.status >= 400 && res.status < 500) throw problem("rejected", res.status);
      if (!res.ok) throw problem("http", res.status);
      let data;
      try { data = await res.json(); } catch { throw problem("json"); }
      let value;
      try { value = pick(data); } catch { /* 살펴보다 난 오류도 모양이 다른 답으로 본다 */ }
      if (value === undefined) throw problem("shape");
      return value;
    };
    let value;
    try {
      value = await Promise.race([send(), late]);
    } catch (err) {
      if (/** @type {BackendError} */ (err).kind !== "rejected") {
        const failures = state.failures + 1;
        update("browser", failures, failures >= MAX_FAILURES ? env.now() + PAUSE_MS : state.retryAt);
      }
      throw err;
    } finally {
      env.clearTimeout(timer);
    }
    /* 상태가 바뀌었다는 알림을 받은 쪽이 새 info 를 바로 읽을 수 있게 먼저 적는다 */
    if (name === "health") api.info = value;
    update("server", 0, 0);
    return value;
  }

  /** @param {any} d @returns {BackendInfo | undefined} */
  function pickHealth(d) {
    if (!isObj(d) || d.status !== "ok") return undefined;
    /** @param {unknown} v */
    const text = (v) => (typeof v === "string" && v !== "" ? v : null);
    return { llm: d.llm === true, stats: text(d.stats) || "off", rules_version: text(d.rules_version), data_hash: text(d.data_hash) };
  }

  /* 화면이 가진 단지(ids)가 하나라도 빠지거나 겹친 답으로는 카드를 그릴 수 없어서, 그런 답은 쓰지 않는다 */
  /** @param {any} d @param {string[]} ids */
  function pickMatch(d, ids) {
    const pr = isObj(d) ? d.profile_result : null;
    if (!isObj(pr) || !Array.isArray(pr.loans) || !Array.isArray(pr.policies) || !Array.isArray(d.complexes)) return undefined;
    /** @type {Map<string, number>} */
    const seen = new Map();
    for (const c of d.complexes) {
      if (!isObj(c) || typeof c.id !== "string" || !LIGHTS.includes(c.light)) return undefined;
      if (!AMOUNTS.every((k) => c[k] === null || Number.isFinite(c[k]))) return undefined;
      seen.set(c.id, (seen.get(c.id) || 0) + 1);
    }
    return ids.every((id) => seen.get(id) === 1) ? d : undefined;
  }

  /** @param {any} d */
  const pickEvent = (d) => (isObj(d) && typeof d.recorded === "boolean" ? d : undefined);

  /* mode 가 있어야 화면이 AI 답인지 미리 써 둔 답인지 정직하게 표시할 수 있다 */
  /** @param {any} d */
  const pickChat = (d) => (isObj(d) && typeof d.reply === "string" && d.reply.trim() !== "" && Array.isArray(d.status_mentions)
    && Array.isArray(d.links) && Array.isArray(d.quick_replies) && (d.mode === "llm" || d.mode === "template") ? d : undefined);

  /** @type {BackendApi} */
  const api = {
    state,
    info: null,
    on(listener) {
      listeners.push(listener);
      return () => { const i = listeners.indexOf(listener); if (i >= 0) listeners.splice(i, 1); };
    },
    health: () => request("health", "health", pickHealth),
    match(profile, options) {
      const o = options || {};
      const ids = Array.isArray(o.ids) ? o.ids : [];
      /* track=1 은 통계 1건으로 세어지므로, 분명히 true 로 부탁받았을 때만 붙인다 */
      return request("match", "match?detail=1" + (o.track === true ? "&track=1" : ""), (d) => pickMatch(d, ids), profile);
    },
    event(type, complexId) {
      /* 이용 기록은 화면과 상관없는 일이라, 어떤 오류도 화면으로 올라가지 않게 삼킨다 */
      request("events", "events", pickEvent, { type, complex_id: complexId }).catch(() => {});
    },
    chat: (payload) => request("chat", "chat", pickChat, payload),
  };
  showMode();
  return api;
}

/* 노드(테스트)에는 location·document 가 없다. 아랫줄이 멈추지 않게 빈 이름만 만들어 둔다 (브라우저에서는 건너뛴다) */
if (typeof location === "undefined") globalThis.location = undefined;
if (typeof document === "undefined") globalThis.document = undefined;
const Backend = createBackend({ fetch: (...a) => fetch(...a), location, document, now: () => Date.now(), setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (t) => clearTimeout(t) });
if (typeof module !== "undefined") module.exports = { createBackend };
