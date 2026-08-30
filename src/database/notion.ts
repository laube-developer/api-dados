import { AsyncLocalStorage } from "node:async_hooks";

const NOTION_API_TOKEN = process.env.NOTION_API_TOKEN || "";
const NOTION_DATABASE_PAGE_ID = process.env.NOTION_DATABASE_PAGE_ID || "";

const baseDeDadosStore = new AsyncLocalStorage<{ pageId: string }>();

export function runWithBaseDeDadosId<T>(pageId: string, fn: () => T): T {
    return baseDeDadosStore.run({ pageId }, fn);
}

// Função auxiliar para fazer chamadas HTTP seguras para o Notion
export async function chamarNotionAPI(
    endpoint: string,
    método: string = "GET",
    corpo?: any,
    opcoes?: { permitir404?: boolean }
) {
    const url = `${process.env.NOTION_API_URL}/${endpoint}`;
    
    console.log("Fetch: chamarNotionAPI -> " + url);

    const resposta = await fetch(url, {
        method: método,
        headers: {
            "Authorization": `Bearer ${NOTION_API_TOKEN}`,
            "Notion-Version": "2022-06-28", // Versão estável da API pública do Notion
            "Content-Type": "application/json"
        },
        body: corpo ? JSON.stringify(corpo) : null
    });

    if (!resposta.ok) {
        if (resposta.status === 404 && opcoes?.permitir404) {
            return null;
        }
        const erroTexto = await resposta.text();
        throw new Error(`Falha na API do Notion [${resposta.status}]: ${erroTexto}`);
    }

    return resposta.json();
}

const cacheTabelasPorPagina = new Map<
    string,
    { expiraEm: number; tabelas: { id: string; nome: string }[] }
>();
const TTL_CACHE_TABELAS_MS = 5 * 60 * 1000;

export async function buscarTabelasBanco() {
    const agora = Date.now();
    const pageId =
        baseDeDadosStore.getStore()?.pageId || NOTION_DATABASE_PAGE_ID;

    if (!pageId) {
        throw new Error("NOTION_DATABASE_PAGE_ID não configurado.");
    }

    const cache = cacheTabelasPorPagina.get(pageId);
    if (cache && agora < cache.expiraEm) {
        return cache.tabelas;
    }

    const dados = await chamarNotionAPI(`blocks/${pageId}/children`);

    const tabelas = (dados.results || [])
        .filter((block: any) => block.type === "child_database")
        .map((block: any) => ({
            id: block.id,
            nome: block.child_database?.title?.toLowerCase().trim() || ""
        }));

    cacheTabelasPorPagina.set(pageId, {
        expiraEm: agora + TTL_CACHE_TABELAS_MS,
        tabelas,
    });

    return tabelas;
}
