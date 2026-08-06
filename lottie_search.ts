/**
 * LottieFiles 검색 & 다운로드 CLI
 * 
 * 사용법: npx tsx lottie_search.ts
 * 
 * 키워드를 입력하면 LottieFiles에서 애니메이션을 검색하고,
 * 번호를 선택하면 JSON 파일을 다운로드합니다.
 */
import { getAccessToken, MCP_ENDPOINT } from "./lottieAuth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import readline from "readline";
import fs from "fs";
import path from "path";
import os from "os";

const DOWNLOAD_DIR = path.join(os.homedir(), ".termvg", "downloads");

interface AnimationResult {
  id: string;
  name: string;
  jsonUrl: string | null;
  lottieUrl: string | null;
  url: string;
  likes: number;
  downloads: number;
  author: string;
  description: string;
  sourceName: string;
}

async function connectMcp(): Promise<Client> {
  const accessToken = await getAccessToken();
  const client = new Client(
    { name: "termvg-search", version: "1.0.0" },
    { capabilities: {} }
  );
  const transport = new StreamableHTTPClientTransport(
    new URL(MCP_ENDPOINT),
    { requestInit: { headers: { "Authorization": `Bearer ${accessToken}` } } }
  );
  await client.connect(transport);
  return client;
}

async function searchAnimations(client: Client, query: string): Promise<AnimationResult[]> {
  try {
    const result = await client.callTool({
      name: "graphql_execute",
      arguments: {
        query: `query Search($q: String!) {
          searchPublicAnimations(query: $q, first: 10) {
            edges {
              node {
                id
                name
                url
                jsonUrl
                lottieUrl
                likesCount
                downloads
                description
                sourceName
                createdBy { username }
              }
            }
          }
        }`,
        variables: { q: query }
      }
    });

    // 데이터는 structuredContent.data 에 있음
    const structured = (result as any).structuredContent;
    const edges = structured?.data?.searchPublicAnimations?.edges || [];
    return edges.map((e: any) => ({
      id: String(e.node.id),
      name: e.node.name || "(이름 없음)",
      jsonUrl: e.node.jsonUrl || null,
      lottieUrl: e.node.lottieUrl || null,
      url: e.node.url || "",
      likes: e.node.likesCount || 0,
      downloads: Math.round(e.node.downloads || 0),
      author: e.node.createdBy?.username || "unknown",
      description: (e.node.description || "").substring(0, 40),
      sourceName: e.node.sourceName || "",
    }));
  } catch (e: any) {
    console.error(`   검색 오류: ${e.message}`);
    return [];
  }
}

async function downloadFile(url: string, name: string): Promise<string> {
  if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

  const safeName = name.replace(/[^a-zA-Z0-9가-힣_-]/g, "_").substring(0, 50);
  const filePath = path.join(DOWNLOAD_DIR, `${safeName}.json`);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.text();
  fs.writeFileSync(filePath, data, "utf8");
  return filePath;
}

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function main() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  🎬 TermVG - Lottie 검색 & 다운로드");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  console.log("🔌 MCP 서버 연결 중...");
  const client = await connectMcp();
  console.log("✅ 연결 성공!\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  while (true) {
    const query = await prompt(rl, "🔍 검색 키워드 (종료: q): ");
    if (query === "q" || query === "quit" || query === "exit") break;
    if (query.length === 0) continue;

    console.log(`\n   '${query}' 검색 중...`);
    const results = await searchAnimations(client, query);

    if (results.length === 0) {
      console.log("   결과 없음.\n");
      continue;
    }

    console.log(`\n   ${results.length}개 결과:\n`);
    results.forEach((r, i) => {
      const hasJson = r.jsonUrl ? "✅" : "❌";
      const desc = r.description ? ` - ${r.description}` : "";
      const src = r.sourceName ? ` [${r.sourceName}]` : "";
      console.log(`   [${i + 1}] ${r.name}${desc}`);
      console.log(`       👤 ${r.author}  ❤️ ${r.likes}  ⬇️ ${r.downloads}  JSON:${hasJson}${src}`);
    });

    const choice = await prompt(rl, "\n📥 다운로드할 번호 (건너뛰기: Enter): ");
    if (choice === "") continue;

    const idx = parseInt(choice) - 1;
    if (idx < 0 || idx >= results.length) {
      console.log("   잘못된 번호.\n");
      continue;
    }

    const selected = results[idx];
    const downloadUrl = selected.jsonUrl || selected.lottieUrl;
    if (!downloadUrl) {
      console.log("   ❌ 다운로드 가능한 URL이 없습니다.\n");
      continue;
    }

    console.log(`   ⬇️  다운로드 중... (${downloadUrl.substring(0, 60)}...)`);
    try {
      const fname = `${selected.name}_by_${selected.author}_${selected.id}`;
      const filePath = await downloadFile(downloadUrl, fname);
      console.log(`   ✅ 저장 완료: ${filePath}`);
      console.log(`   💡 termvg에서 열기: 'O' → 경로 입력\n`);
    } catch (e: any) {
      console.log(`   ❌ 다운로드 실패: ${e.message}\n`);
    }
  }

  console.log("\n👋 종료합니다.");
  rl.close();
  await client.close();
}

main().catch(console.error);
