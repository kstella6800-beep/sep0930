/* ============================================================
 * Firebase Realtime Database 웹슬라이드 동기화 모듈
 * - 서버(PHP) 없이 정적 호스팅(Vercel · GitHub Pages · Netlify)에서 청중 동기화
 * - 데이터 경로: decks/{덱 이름}/state = { slide, locked, pdf, updatedAt }
 * - 강사 Google 로그인 + 관리자 UID 허용 목록
 * - 쓰기 권한: database.rules.json 의 admins/{UID} = true 인 계정만
 * ============================================================ */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getDatabase, ref, get, set, update, onValue, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';

const DEFAULT_STATE = { slide: 0, locked: true, pdf: true };

/* firebase-config.js 를 아직 채우지 않았으면 false - 이때 덱은 자유 열람으로 동작 */
export function isConfigured(cfg) {
  return !!(cfg && typeof cfg.apiKey === 'string' && cfg.apiKey && !cfg.apiKey.includes('[') &&
    typeof cfg.databaseURL === 'string' && /^https:\/\//.test(cfg.databaseURL));
}

export function createSync(cfg, deckId) {
  const app = initializeApp(cfg);
  const db = getDatabase(app);
  const auth = getAuth(app);
  const base = 'decks/' + deckId;
  const stateRef = ref(db, base + '/state');

  let isAdmin = false;
  let user = null;
  const adminListeners = [];

  /* 로그인만으로는 부족 - admins 목록에 있는 UID 인지 확인 */
  onAuthStateChanged(auth, async (u) => {
    user = u; isAdmin = false;
    if (u) {
      try { isAdmin = (await get(ref(db, 'admins/' + u.uid))).val() === true; } catch (e) { isAdmin = false; }
      if (isAdmin) {
        try {
          const cur = await get(stateRef);
          if (!cur.exists()) await set(stateRef, { ...DEFAULT_STATE, updatedAt: serverTimestamp() });
        } catch (e) { /* 연결 오류는 onState에서 안내 */ }
      }
    }
    adminListeners.forEach((cb) => cb(isAdmin, user));
  });

  function patch(values) {
    if (!isAdmin) return Promise.reject(new Error('not-admin'));
    return update(stateRef, { ...values, updatedAt: serverTimestamp() });
  }

  return {
    /* 상태가 바뀔 때마다 즉시 호출 (폴링 없음) */
    onState(cb) {
      return onValue(stateRef, (s) => cb({ ...DEFAULT_STATE, ...(s.val() || {}) }), () => cb(null));
    },
    onConnection(cb) {
      return onValue(ref(db, '.info/connected'), (s) => cb(s.val() === true));
    },
    onAdmin(cb) { adminListeners.push(cb); cb(isAdmin, user); },
    loginGoogle() { return signInWithPopup(auth, new GoogleAuthProvider()); },
    logout() { return signOut(auth); },
    setSlide(n) { return patch({ slide: Math.max(0, n | 0) }); },
    setLock(on) { return patch({ locked: !!on }); },
    setPdf(on) { return patch({ pdf: !!on }); },
    reset() { return patch({ ...DEFAULT_STATE }); }
  };
}
