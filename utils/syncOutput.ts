/**
 * 터미널 Synchronized Output Mode (더블 버퍼링)
 *
 * DEC Private Mode \x1b[?2026h ~ \x1b[?2026l 사이의 모든 출력을
 * 터미널이 내부 버퍼에 쌓아두고, 종료 마커를 받으면 한 번에 플러시합니다.
 * Clear→Write 사이의 빈 화면이 사용자에게 보이지 않아 깜빡임을 방지합니다.
 *
 * 지원 터미널: iTerm2, kitty, WezTerm, Windows Terminal, foot 등
 * 미지원 터미널: 마커가 무시되어 기존과 동일하게 동작 (Graceful Degradation)
 */

export const enableSyncOutput = () => {
  process.stdout.write('\x1b[?2026h');
};

export const disableSyncOutput = () => {
  process.stdout.write('\x1b[?2026l');
};
