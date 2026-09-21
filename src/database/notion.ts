import { AsyncLocalStorage } from "node:async_hooks";
import { comCache } from "./redisCache.js";

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
    const inicio = Date.now();

    let resposta: Response;
    try {
        resposta = await fetch(url, {
            method: método,
            headers: {
                "Authorization": `Bearer ${NOTION_API_TOKEN}`,
                "Notion-Version": "2022-06-28",
                "Content-Type": "application/json"
            },
            body: corpo ? JSON.stringify(corpo) : null
        });
    } catch (erro) {
        const ms = Date.now() - inicio;
        console.error(
            `[${new Date().toISOString()}] Notion ${método} ${endpoint} falhou após ${ms}ms`,
            erro
        );
        throw erro;
    }

    const ms = Date.now() - inicio;

    if (!resposta.ok) {
        const erroTexto = await resposta.text();
        const trecho = erroTexto.slice(0, 500);
        if (resposta.status === 404 && opcoes?.permitir404) {
            console.warn(
                `[${new Date().toISOString()}] Notion ${método} ${endpoint} → 404 ${ms}ms (ignorado)`
            );
            return null;
        }
        console.error(
            `[${new Date().toISOString()}] Notion ${método} ${endpoint} → ${resposta.status} ${ms}ms ${trecho}`
        );
        throw new Error(`Falha na API do Notion [${resposta.status}]: ${erroTexto}`);
    }

    return resposta.json();
}

/** Query a database Notion até `has_more` ser falso (100 por página). */
export async function queryNotionTodasPaginas(
    databaseId: string,
    corpo: Record<string, unknown> = {}
): Promise<any[]> {
    const paginas: any[] = [];
    let cursor: string | undefined;

    do {
        const payload: Record<string, unknown> = { ...corpo, page_size: 100 };
        if (cursor) {
            payload.start_cursor = cursor;
        }
        const resultado = await chamarNotionAPI(`databases/${databaseId}/query`, "POST", payload);
        const lote = Array.isArray(resultado?.results) ? resultado.results : [];
        paginas.push(...lote);
        cursor = resultado?.has_more ? String(resultado.next_cursor ?? "") : undefined;
        if (!cursor) {
            cursor = undefined;
        }
    } while (cursor);

    return paginas;
}

/** Lista children de um bloco Notion até acabar. */
export async function listarTodosBlocosFilhos(blockId: string): Promise<any[]> {
    const blocos: any[] = [];
    let cursor: string | undefined;

    do {
        const qs = new URLSearchParams({ page_size: "100" });
        if (cursor) {
            qs.set("start_cursor", cursor);
        }
        const dados = await chamarNotionAPI(`blocks/${blockId}/children?${qs.toString()}`, "GET");
        const lote = Array.isArray(dados?.results) ? dados.results : [];
        blocos.push(...lote);
        cursor = dados?.has_more ? String(dados.next_cursor ?? "") : undefined;
        if (!cursor) {
            cursor = undefined;
        }
    } while (cursor);

    return blocos;
}

export async function buscarTabelasBanco() {
    const pageId =
        baseDeDadosStore.getStore()?.pageId || NOTION_DATABASE_PAGE_ID;

    if (!pageId) {
        throw new Error("NOTION_DATABASE_PAGE_ID não configurado.");
    }

    return comCache(`api-dados:tabelas:${pageId}`, async () => {
        const blocos = await listarTodosBlocosFilhos(pageId);
        return blocos
            .filter((block: any) => block.type === "child_database")
            .map((block: any) => ({
                id: block.id,
                nome: block.child_database?.title?.toLowerCase().trim() || "",
            }));
    });
}
