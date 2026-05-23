/**
 * In-memory session store (per chat user id).
 */

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_HISTORY_TURNS = 10;

/**
 * @typedef {object} PendingSendAction
 * @property {'send_email'} type
 * @property {string} to
 * @property {string} subject
 * @property {string} body
 * @property {string} [thread_id]
 */

/**
 * @typedef {object} Session
 * @property {string} id
 * @property {Array<{ role: string; parts: object[] }>} history
 * @property {PendingSendAction | null} pendingAction
 * @property {'idle' | 'awaiting_send_confirm'} confirmationState
 * @property {number} updatedAt
 */

/** @type {Map<string, Session>} */
const sessions = new Map();

/**
 * @param {number} ttlHours
 */
export function createSessionManager(ttlHours = 24) {
  const ttlMs = ttlHours * 60 * 60 * 1000 || DEFAULT_TTL_MS;

  function prune() {
    const now = Date.now();
    for (const [id, session] of sessions) {
      if (now - session.updatedAt > ttlMs) {
        sessions.delete(id);
      }
    }
  }

  /**
   * @param {string} sessionId
   */
  function getOrCreate(sessionId) {
    prune();
    let session = sessions.get(sessionId);
    if (!session) {
      session = {
        id: sessionId,
        history: [],
        pendingAction: null,
        confirmationState: "idle",
        updatedAt: Date.now(),
      };
      sessions.set(sessionId, session);
    }
    return session;
  }

  /**
   * @param {string} sessionId
   * @param {{ role: string; parts: object[] }} entry
   */
  function appendHistory(sessionId, entry) {
    const session = getOrCreate(sessionId);
    session.history.push(entry);
    const maxEntries = MAX_HISTORY_TURNS * 2;
    if (session.history.length > maxEntries) {
      session.history = session.history.slice(-maxEntries);
    }
    session.updatedAt = Date.now();
  }

  /**
   * @param {string} sessionId
   */
  function getHistory(sessionId) {
    return getOrCreate(sessionId).history;
  }

  /**
   * Replace Gemini chat history (e.g. after agent turn).
   * @param {string} sessionId
   * @param {Array<{ role: string; parts: object[] }>} newHistory
   */
  function replaceHistory(sessionId, newHistory) {
    const session = getOrCreate(sessionId);
    session.history = newHistory.slice(-MAX_HISTORY_TURNS * 2);
    session.updatedAt = Date.now();
  }

  /**
   * @param {string} sessionId
   * @param {PendingSendAction} action
   */
  function setPendingSend(sessionId, action) {
    const session = getOrCreate(sessionId);
    session.pendingAction = action;
    session.confirmationState = "awaiting_send_confirm";
    session.updatedAt = Date.now();
  }

  /**
   * @param {string} sessionId
   */
  function clearPending(sessionId) {
    const session = getOrCreate(sessionId);
    session.pendingAction = null;
    session.confirmationState = "idle";
    session.updatedAt = Date.now();
  }

  /**
   * @param {string} sessionId
   */
  function getPending(sessionId) {
    return getOrCreate(sessionId).pendingAction;
  }

  /**
   * @param {string} sessionId
   */
  function isAwaitingConfirm(sessionId) {
    return getOrCreate(sessionId).confirmationState === "awaiting_send_confirm";
  }

  return {
    getOrCreate,
    appendHistory,
    getHistory,
    replaceHistory,
    setPendingSend,
    clearPending,
    getPending,
    isAwaitingConfirm,
  };
}

/** @type {ReturnType<typeof createSessionManager> | null} */
let defaultManager = null;

/**
 * @param {number} [ttlHours]
 */
export function getSessionManager(ttlHours) {
  if (!defaultManager) {
    defaultManager = createSessionManager(ttlHours);
  }
  return defaultManager;
}
