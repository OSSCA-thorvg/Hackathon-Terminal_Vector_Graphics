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
  let buffer: Buffer[] = [];
  let isTickScheduled = false;

  const flushBuffer = () => {
    if (buffer.length === 0) return;
    const data = Buffer.concat(buffer);
    buffer = [];
    isTickScheduled = false;

    let dataStr = data.toString('utf8');
    // xterm.js (ttyd) 등에서 동기화 시퀀스(BSU/ESU)를 무시할 경우를 대비하여,
    // 화면을 지우는 이스케이프 시퀀스(Clear Line 2K, Clear Screen J)를 강제로 제거하고 
    // '단순 덮어쓰기(Overwrite)' 모드로 렌더링되게 합니다.
    dataStr = dataStr.replace(/\x1b\[(2K|[0-2]?J)/g, '');

    // 1. 동기화 시작 (Begin Synchronized Update)
    originalStdout.write('\x1b[?2026h');
    // 2. 버퍼링된 텍스트 출력
    originalStdout.write(dataStr);
    // 3. 동기화 종료 (End Synchronized Update)
    originalStdout.write('\x1b[?2026l');
  };

  const syncStream = new Writable({
    write(chunk: any, encoding: string, callback: () => void) {
      buffer.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding as BufferEncoding));
      
      if (!isTickScheduled) {
        isTickScheduled = true;
        // React Ink의 한 렌더 사이클(동기적 write 연속 호출)이 끝나면 한 번에 flush
        process.nextTick(flushBuffer);
      }
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
