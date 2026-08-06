import { Writable } from 'stream';

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

/**
 * Ink 렌더러에 전달할 커스텀 stdout 스트림 팩토리 함수입니다.
 * Ink가 출력하는 모든 프레임(chunk) 앞뒤에 동기화 시퀀스를 강제로 붙여서,
 * 비동기 렌더링 시에도 확실한 더블 버퍼링을 보장합니다.
 */
export const createSyncStdout = (originalStdout: NodeJS.WriteStream): NodeJS.WriteStream => {
  const syncStream = new Writable({
    write(chunk: any, encoding: string, callback: () => void) {
      // 1. 동기화 시작 (Begin Synchronized Update)
      originalStdout.write('\x1b[?2026h');
      // 2. Ink의 렌더링 결과(청크) 출력
      originalStdout.write(chunk, encoding as any);
      // 3. 동기화 종료 (End Synchronized Update)
      originalStdout.write('\x1b[?2026l');
      callback();
    }
  });

  // Ink가 필요로 하는 터미널 속성을 원본 stdout에서 위임받음
  Object.defineProperty(syncStream, 'columns', { get: () => originalStdout.columns });
  Object.defineProperty(syncStream, 'rows', { get: () => originalStdout.rows });
  Object.defineProperty(syncStream, 'isTTY', { get: () => originalStdout.isTTY });
  
  // 리사이즈 이벤트 전달
  originalStdout.on('resize', () => syncStream.emit('resize'));

  return syncStream as unknown as NodeJS.WriteStream;
};
