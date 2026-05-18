// Shared session ID — persisted in localStorage so the same anonymous
// visitor is linked across pages (bracket, challenge, homepage hydration).
export function getOrCreateSessionId(): string {
  try {
    let sid = localStorage.getItem('tribepicks_session_id')
    if (!sid) {
      sid = crypto.randomUUID()
      localStorage.setItem('tribepicks_session_id', sid)
    }
    return sid
  } catch {
    return 'unknown'
  }
}
