/**
 * lottieMcpClient.ts - LottieFiles MCP 클라이언트
 * 
 * OAuth 인증 후 MCP 서버에 연결하여 GraphQL 쿼리를 실행합니다.
 * - 애니메이션 검색
 * - 애니메이션 다운로드 URL 획득
 * - JSON 데이터 직접 다운로드
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getAccessToken, MCP_ENDPOINT } from "./lottieAuth.js";
import fs from "fs";
import path from "path";
import os from "os";

export interface LottieSearchResult {
  id: string;
  name: string;
  url: string;           // LottieFiles 페이지 URL
  jsonUrl: string | null; // 다운로드 가능한 JSON URL
  previewUrl: string | null;
}

let mcpClient: Client | null = null;

/**
 * MCP 서버에 인증된 연결을 수립합니다.
 */
async function ensureConnected(): Promise<Client> {
  if (mcpClient) return mcpClient;

  const accessToken = await getAccessToken();

  const client = new Client(
    { name: "termvg", version: "1.0.0" },
    { capabilities: {} }
  );

  const transport = new StreamableHTTPClientTransport(
    new URL(MCP_ENDPOINT),
    {
      requestInit: {
        headers: { "Authorization": `Bearer ${accessToken}` },
      },
    }
  );

  await client.connect(transport);
  mcpClient = client;
  return client;
}

/**
 * LottieFiles에서 애니메이션을 검색합니다.
 */
export async function searchAnimations(query: string, limit = 10): Promise<LottieSearchResult[]> {
  const client = await ensureConnected();

  // GraphQL 쿼리로 애니메이션 검색
  const graphqlQuery = `
    query SearchPublicAnimations($query: String!, $limit: Int) {
      searchPublicAnimations(query: $query, first: $limit) {
        edges {
          node {
            id
            name
            url
            jsonUrl
            imageUrl
          }
        }
      }
    }
  `;

  const result = await client.callTool({
    name: "graphql_execute",
    arguments: {
      query: graphqlQuery,
      variables: { query, limit },
    },
  });

  // MCP 응답 파싱
  const content = result.content as any[];
  const textContent = content?.find((c: any) => c.type === "text");
  if (!textContent) return [];

  try {
    const parsed = JSON.parse(textContent.text);
    const edges = parsed?.data?.searchPublicAnimations?.edges || [];
    return edges.map((edge: any) => ({
      id: edge.node.id,
      name: edge.node.name,
      url: edge.node.url || "",
      jsonUrl: edge.node.jsonUrl || null,
      previewUrl: edge.node.imageUrl || null,
    }));
  } catch {
    // 직접 파싱이 안 되면 원본 텍스트 반환
    console.log("[MCP 원본 응답]", textContent.text.substring(0, 500));
    return [];
  }
}

/**
 * Lottie JSON 파일을 다운로드하여 임시 폴더에 저장합니다.
 * @returns 저장된 파일의 절대 경로
 */
export async function downloadAnimation(jsonUrl: string, filename?: string): Promise<string> {
  const res = await fetch(jsonUrl);
  if (!res.ok) throw new Error(`다운로드 실패: HTTP ${res.status}`);

  const data = await res.text();
  const dir = path.join(os.homedir(), ".termvg", "downloads");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const fname = filename || `lottie_${Date.now()}.json`;
  const filePath = path.join(dir, fname);
  fs.writeFileSync(filePath, data, "utf8");

  return filePath;
}

/**
 * MCP 연결을 정리합니다.
 */
export async function disconnect(): Promise<void> {
  if (mcpClient) {
    await mcpClient.close();
    mcpClient = null;
  }
}
