import { useState } from 'react';
import { getAccessToken, MCP_ENDPOINT } from '../lottieAuth.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { FileItem } from './useFileScanner.js';

export interface SearchResultItem {
  label: string;
  value: string;
  meta: {
    jsonUrl: string | null;
    name: string;
    author: string;
    id: string;
    likes: number;
    downloads: number;
  };
}

const SEARCH_QUERY = `
  query Search($q: String!) {
    searchPublicAnimations(query: $q, first: 10) {
      edges {
        node {
          id name url jsonUrl lottieUrl
          likesCount downloads description sourceName
          createdBy { username }
        }
      }
    }
  }
`;

export function useMcpSearch(onFileAdded: (file: FileItem) => void, downloadDir: string) {
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchStatus, setSearchStatus] = useState('');
  const [mcpClient, setMcpClient] = useState<Client | null>(null);

  const ensureClient = async (): Promise<Client> => {
    if (mcpClient) return mcpClient;

    const accessToken = await getAccessToken();
    const client = new Client({ name: 'termvg', version: '1.0.0' }, { capabilities: {} });
    const transport = new StreamableHTTPClientTransport(
      new URL(MCP_ENDPOINT),
      { requestInit: { headers: { 'Authorization': `Bearer ${accessToken}` } } }
    );
    await client.connect(transport);
    setMcpClient(client);
    return client;
  };

  const doSearch = async (query: string) => {
    setIsSearching(true);
    setSearchStatus('🔌 MCP 연결 중...');
    try {
      const client = await ensureClient();
      setSearchStatus(`🔍 '${query}' 검색 중...`);

      const result = await client.callTool({
        name: 'graphql_execute',
        arguments: { query: SEARCH_QUERY, variables: { q: query } }
      });

      const structured = (result as any).structuredContent;
      const edges = structured?.data?.searchPublicAnimations?.edges || [];
      const items: SearchResultItem[] = edges.map((e: any, i: number) => ({
        label: `${e.node.name}`,
        value: `__mcp__${i}`,
        meta: {
          jsonUrl: e.node.jsonUrl || e.node.lottieUrl || null,
          name: e.node.name,
          author: e.node.createdBy?.username || 'unknown',
          id: String(e.node.id),
          likes: e.node.likesCount || 0,
          downloads: Math.round(e.node.downloads || 0),
        }
      }));

      setSearchResults(items);
      setSearchStatus(items.length > 0 ? `✅ ${items.length}개 결과` : '❌ 결과 없음');
    } catch (e: any) {
      setSearchStatus(`❌ 오류: ${e.message.substring(0, 50)}`);
    }
    setIsSearching(false);
  };

  const doDownload = async (item: SearchResultItem) => {
    const { jsonUrl, name, author, id } = item.meta;
    if (!jsonUrl) { setSearchStatus('❌ 다운로드 URL 없음'); return; }
    setSearchStatus('⬇️ 다운로드 중...');
    try {
      const dir = downloadDir || path.join(os.homedir(), '.termvg', 'downloads');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const safeName = `${name}_by_${author}_${id}`.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 60);
      const filePath = path.join(dir, `${safeName}.json`);

      const res = await fetch(jsonUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fs.writeFileSync(filePath, await res.text(), 'utf8');

      const stats = fs.statSync(filePath);
      const newFile: FileItem = {
        label: `🌐 ${name} (${author})`,
        value: filePath,
        meta: { duration: 0, size: `${Math.round(stats.size / 1024)}kb` }
      };

      onFileAdded(newFile);
      setSearchMode(false);
      setSearchResults([]);
      setSearchStatus('');
    } catch (e: any) {
      setSearchStatus(`❌ 다운로드 실패: ${e.message.substring(0, 40)}`);
    }
  };

  const openSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSearchStatus('');
    setSearchMode(true);
  };

  const closeSearch = () => {
    setSearchMode(false);
    setSearchResults([]);
    setSearchStatus('');
  };

  return {
    searchMode,
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    searchStatus,
    doSearch,
    doDownload,
    openSearch,
    closeSearch,
  };
}
