import { isConfigured, createSync } from './firebase-sync.js';

const bridge = window.slideSyncBridge;
const params = new URLSearchParams(location.search);
const wantsAdmin = params.has('admin');
const viewOnly = params.has('view');
const $ = (id) => document.getElementById(id);
const login = $('syncLogin');
const loginError = $('syncLoginError');
const modeBadge = $('modeBadge');
const status = $('syncStatus');
const lockBtn = $('lockBtn');
const pdfBtn = $('pdfBtn');
const logoutBtn = $('logoutBtn');
const printBtn = $('printBtn');

let admin = false;
let locked = false;
let pdfAllowed = true;
let stateAvailable = false;
let latestSlide = 0;
let online = false;

function render() {
  const following = stateAvailable && locked && !viewOnly && !admin;
  modeBadge.textContent = admin ? '강사' : following ? '발표 따라가기' : '자유 열람';
  lockBtn.hidden = pdfBtn.hidden = logoutBtn.hidden = !admin;
  lockBtn.textContent = locked ? '잠금 중' : '자유 이동';
  lockBtn.setAttribute('aria-pressed', String(locked));
  pdfBtn.textContent = pdfAllowed ? 'PDF 허용 중' : 'PDF 막힘';
  pdfBtn.setAttribute('aria-pressed', String(pdfAllowed));
  printBtn.hidden = !pdfAllowed;
  document.documentElement.classList.toggle('no-pdf', !pdfAllowed);
  bridge.refresh();
}

if (!isConfigured(window.FIREBASE_CONFIG)) {
  status.textContent = 'Firebase 설정 전';
  modeBadge.textContent = '자유 열람';
} else if (viewOnly) {
  status.textContent = '복습 모드';
  modeBadge.textContent = '자유 열람';
} else {
  const sync = createSync(window.FIREBASE_CONFIG, window.DECK_ID || 'ai-lecture-2026-ks');
  bridge.setControl({
    canNavigate: () => admin || !stateAvailable || !locked,
    publishSlide: (n) => {
      if (admin) sync.setSlide(n).catch(() => {
        status.textContent = '슬라이드 저장 실패 · 권한 확인';
        bridge.show(latestSlide);
      });
    },
    canPrint: () => pdfAllowed
  });

  sync.onConnection((connected) => {
    online = connected;
    status.textContent = online ? '● 연결' : '○ 연결 대기';
  });
  sync.onState((state) => {
    if (!state) {
      stateAvailable = false;
      status.textContent = '동기화 읽기 실패 · 자유 열람';
      render();
      return;
    }
    stateAvailable = true;
    locked = !!state.locked;
    pdfAllowed = state.pdf !== false;
    latestSlide = Math.min(bridge.total - 1, Math.max(0, Number(state.slide) | 0));
    if (!admin && locked) bridge.show(latestSlide);
    render();
  });

  if (wantsAdmin) {
    login.hidden = false;
    bridge.setControl({
      canNavigate: () => admin,
      publishSlide: (n) => {
        if (admin) sync.setSlide(n).catch(() => {
          status.textContent = '슬라이드 저장 실패 · 권한 확인';
          bridge.show(latestSlide);
        });
      },
      canPrint: () => pdfAllowed
    });
  }
  sync.onAdmin((allowed, user) => {
    admin = wantsAdmin && allowed;
    login.hidden = !wantsAdmin || admin;
    if (admin) {
      loginError.textContent = '';
      if (stateAvailable) bridge.show(latestSlide);
    } else if (wantsAdmin && user) {
      loginError.textContent = '관리자 UID 등록 필요 · Authentication 사용자 목록에서 UID 확인';
    }
    render();
  });

  $('googleLoginBtn').addEventListener('click', () => {
    loginError.textContent = '';
    sync.loginGoogle().catch(() => {
      loginError.textContent = 'Google 로그인 실패 · 제공업체와 승인된 도메인 확인';
    });
  });
  logoutBtn.addEventListener('click', () => sync.logout());
  lockBtn.addEventListener('click', () => sync.setLock(!locked).catch(() => {
    status.textContent = '잠금 저장 실패 · 권한 확인';
  }));
  pdfBtn.addEventListener('click', () => sync.setPdf(!pdfAllowed).catch(() => {
    status.textContent = 'PDF 설정 실패 · 권한 확인';
  }));
}
