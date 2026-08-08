/**
 * lottieAuth.ts - LottieFiles OAuth 2.0 인증 모듈
 * 
 * CLI 환경에서 OAuth authorization_code 플로우를 수행합니다.
 * - QR 코드를 터미널에 출력하여 스마트폰으로 인증 가능
 * - refresh_token을 ~/.termvg/token.json에 캐싱하여 재인증 불필요
 */
import crypto from "crypto";
import http from "http";
import fs from "fs";
import path from "path";
import os from "os";
import readline from "readline";
import { execSync } from "child_process";

// @ts-ignore
import qrcode from "qrcode-terminal";

const MCP_ENDPOINT = "https://mcp.lottiefiles.com/mcp";
const REGISTER_URL = "https://mcp.lottiefiles.com/register";
const AUTH_URL = "https://mcp.lottiefiles.com/authorize";
const TOKEN_URL = "https://mcp.lottiefiles.com/token";
const REDIRECT_PORT = 9876;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;

const TOKEN_DIR = path.join(os.homedir(), ".termvg");
const TOKEN_FILE = path.join(TOKEN_DIR, "token.json");

export interface TokenData {
  access_token: string;
  refresh_token: string;
  client_id: string;
  expires_at: number; // unix timestamp
}

// --- PKCE helpers ---
function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generatePKCE() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

// --- Token persistence ---
function saveToken(data: TokenData): void {
  if (!fs.existsSync(TOKEN_DIR)) {
    fs.mkdirSync(TOKEN_DIR, { recursive: true });
  }
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2), "utf8");
}

function loadToken(): TokenData | null {
  if (!fs.existsSync(TOKEN_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
  } catch {
    return null;
  }
}

// --- Token refresh ---
async function refreshAccessToken(token: TokenData): Promise<TokenData | null> {
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: token.refresh_token,
        client_id: token.client_id,
      }).toString(),
    });

    if (!res.ok) return null;

    const data = await res.json() as any;
    const newToken: TokenData = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || token.refresh_token,
      client_id: token.client_id,
      expires_at: Date.now() + (data.expires_in || 3600) * 1000,
    };
    saveToken(newToken);
    return newToken;
  } catch {
    return null;
  }
}

// --- Full OAuth login flow ---
async function performLogin(): Promise<TokenData> {
  // 1. Dynamic Client Registration
  console.log("🔐 LottieFiles 인증을 시작합니다...\n");
  const regRes = await fetch(REGISTER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "TermVG CLI",
      redirect_uris: [REDIRECT_URI],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "mcp:full",
    }),
  });

  if (!regRes.ok) {
    throw new Error(`Client Registration 실패: ${regRes.status}`);
  }
  const regData = await regRes.json() as any;
  const clientId = regData.client_id;

  // 2. PKCE + Build auth URL
  const { verifier, challenge } = generatePKCE();
  const state = base64url(crypto.randomBytes(16));

  const authUrl = `${AUTH_URL}?` + new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: "mcp:full",
    state: state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();

  // 3. QR 코드 출력 + URL 표시
  console.log("📱 아래 QR 코드를 스마트폰으로 스캔하여 로그인하세요:\n");
  qrcode.generate(authUrl, { small: true }, (qr: string) => {
    console.log(qr);
  });
  console.log("\n또는 아래 URL을 브라우저에서 직접 열어주세요:");
  console.log(`🔗 ${authUrl}\n`);

  // 4. 콜백 서버 + 수동 코드 입력 (듀얼 모드)
  const code = await new Promise<string>((resolve, reject) => {
    let resolved = false;

    // 방법 A: 로컬 HTTP 콜백 서버 (같은 PC의 브라우저로 인증 시)
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost:${REDIRECT_PORT}`);
      if (url.pathname === "/callback" && !resolved) {
        const code = url.searchParams.get("code");
        const returnedState = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`<h1>❌ 인증 실패</h1><p>${error}</p>`);
          server.close();
          rl.close();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (returnedState !== state) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end("<h1>❌ State 불일치</h1>");
          server.close();
          rl.close();
          reject(new Error("State mismatch"));
          return;
        }

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<html><body style='text-align:center;padding:50px;font-family:sans-serif'><h1>✅ 인증 성공!</h1><p>이 창을 닫고 터미널로 돌아가세요.</p></body></html>");
        resolved = true;
        server.close();
        rl.close();
        resolve(code!);
      }
    });

    // 방법 B: 수동 코드 입력 (스마트폰 등 외부 기기로 인증 시)
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    server.listen(REDIRECT_PORT, () => {
      console.log(`⏳ 인증 대기 중... (localhost:${REDIRECT_PORT})\n`);
      console.log("─────────────────────────────────────────────────────────");
      console.log("💡 스마트폰으로 인증한 경우, 리다이렉트된 URL에서");
      console.log("   'code=' 뒤의 값을 복사하여 아래에 붙여넣으세요.");
      console.log("   (예: ffa947cf3c317fa...)");
      console.log("─────────────────────────────────────────────────────────");
      rl.question("\n📋 code 값 입력 (또는 브라우저 자동 인증 대기 중): ", (input: string) => {
        if (resolved) return;
        const trimmed = input.trim();
        if (trimmed.length > 0) {
          resolved = true;
          server.close();
          rl.close();
          // 입력 파싱: URL 전체, code=xxx&state=yyy, 또는 code값만 모두 지원
          let extractedCode = trimmed;
          const codeMatch = trimmed.match(/code=([^&\s]+)/);
          if (codeMatch) {
            extractedCode = codeMatch[1];
          } else {
            // code= 없이 직접 값을 붙여넣은 경우, &state= 등 뒤쪽 제거
            extractedCode = trimmed.split('&')[0].split('?')[0];
          }
          resolve(extractedCode);
        }
      });

      // 데스크탑 환경이면 브라우저 자동 열기 시도
      try {
        execSync(`open "${authUrl}" 2>/dev/null || xdg-open "${authUrl}" 2>/dev/null`, { stdio: "ignore" });
      } catch { /* CLI-only 환경에서는 무시 */ }
    });

    setTimeout(() => {
      if (!resolved) {
        server.close();
        rl.close();
        reject(new Error("인증 타임아웃 (3분). 다시 시도해주세요."));
      }
    }, 180000);
  });

  console.log("\n✅ 인증 코드 수신 완료! 토큰 교환 중...");

  // 5. Code → Token
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: code,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      code_verifier: verifier,
    }).toString(),
  });

  if (!tokenRes.ok) {
    throw new Error(`Token 교환 실패: ${tokenRes.status} ${await tokenRes.text()}`);
  }

  const tokenData = await tokenRes.json() as any;
  const result: TokenData = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    client_id: clientId,
    expires_at: Date.now() + (tokenData.expires_in || 3600) * 1000,
  };

  saveToken(result);
  console.log(`✅ 로그인 성공! 토큰이 ${TOKEN_FILE} 에 저장되었습니다.\n`);
  console.log("💡 이후에는 자동으로 인증됩니다. 재로그인이 필요하면 'termvg --login' 을 실행하세요.\n");

  return result;
}

/**
 * 유효한 access_token을 반환합니다.
 * - 캐싱된 토큰이 있으면 → 만료 확인 후 refresh 시도
 * - 없으면 → 전체 OAuth 로그인 플로우 실행
 */
export async function getAccessToken(forceLogin = false): Promise<string> {
  if (!forceLogin) {
    const cached = loadToken();
    if (cached) {
      // 만료 5분 전까지는 기존 토큰 사용
      if (Date.now() < cached.expires_at - 300000) {
        return cached.access_token;
      }
      // 만료 임박 → refresh 시도
      console.log("🔄 토큰 갱신 중...");
      const refreshed = await refreshAccessToken(cached);
      if (refreshed) {
        console.log("✅ 토큰 갱신 완료!\n");
        return refreshed.access_token;
      }
      console.log("⚠️  토큰 갱신 실패. 재로그인이 필요합니다.\n");
    }
  }

  // 캐시 없거나 refresh 실패 → 전체 로그인
  const token = await performLogin();
  return token.access_token;
}

export { MCP_ENDPOINT };
