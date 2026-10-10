import { createHash } from "node:crypto";
import type { GestaoCampo, GestaoComando, GestaoLista, GestaoRegistro, GestaoTabela, GestaoValor } from "../utils/interfaces.js";

export class ErroGestao extends Error {
    constructor(message: string, public status = 422) { super(message); }
}

type Definicao = GestaoTabela & { databaseId: string };
const fixas: Definicao[] = [
    { chave: "cron-confirmacoes", nome: "Cron de confirmações", databaseId: "3ca46144576980ae9ec4e4d6451e04ef", editavel: true, servicos: ["confirmacoes"] },
    { chave: "cron-agendas-medicas", nome: "Cron de agendas médicas", databaseId: "3e8461445769803f952efb86c3403bec", editavel: true, servicos: ["agendas-medicas"] },
    { chave: "cron-consultas-finalizadas", nome: "Cron de consultas finalizadas", databaseId: "3df46144576980f6b498cd7a75b7bbb7", editavel: true, servicos: ["consultas-finalizadas"] },
    { chave: "integracoes-clinicas", nome: "Integrações de clínicas", databaseId: "3ca46144576980d9a217c1ef041fe47c", editavel: true, servicos: ["confirmacoes", "agendas-medicas", "consultas-finalizadas"] },
    { chave: "dominios-confirmacao", nome: "Domínios de confirmação", databaseId: "3dc461445769809785f3c86883371f58", editavel: true, servicos: [] },
    { chave: "estoque", nome: "Configuração de estoque", databaseId: "3db4614457698097ba8ef1c82e5ddee9", editavel: true, servicos: [] },
];
const uuid = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
const igualId = (a: unknown, b: unknown) => String(a).replace(/-/g, "") === String(b).replace(/-/g, "");
const secreto = (nome: string) => /chave|token|senha|password|secret|api.?key/i.test(nome);
const editaveis = new Set(["title", "rich_text", "checkbox", "number", "url", "phone_number", "email", "select", "multi_select", "relation", "date"]);

/** Transporte administrativo próprio: timeout e erros sem conteúdo de segredos. */
export async function notionGestao(endpoint: string, method = "GET", body?: unknown): Promise<any> {
    const base = String(process.env.NOTION_API_URL ?? "").replace(/\/$/, "");
    if (!base || !process.env.NOTION_API_TOKEN) throw new ErroGestao("Integração Notion não configurada.", 503);
    let response: Response;
    try {
        response = await fetch(`${base}/${endpoint}`, {
            method, headers: { Authorization: `Bearer ${process.env.NOTION_API_TOKEN}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15_000),
        });
    } catch { throw new ErroGestao("Sem confirmação da resposta do Notion.", 504); }
    if (!response.ok) throw new ErroGestao(`Notion respondeu com status ${response.status}.`, response.status === 404 ? 404 : response.status >= 500 ? 502 : 422);
    return response.json();
}

async function paginar(endpoint: string, body?: Record<string, unknown>): Promise<any[]> {
    const rows: any[] = []; const vistos = new Set<string>(); let cursor: string | undefined;
    do {
        const data = body === undefined
            ? await notionGestao(`${endpoint}?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ""}`)
            : await notionGestao(endpoint, "POST", { ...body, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
        if (!Array.isArray(data?.results) || typeof data.has_more !== "boolean") throw new ErroGestao("Resposta de paginação inválida.", 502);
        rows.push(...data.results);
        cursor = data.has_more ? data.next_cursor : undefined;
        if (data.has_more && (typeof cursor !== "string" || !cursor || vistos.has(cursor))) throw new ErroGestao("Cursor Notion inválido.", 502);
        if (cursor) vistos.add(cursor);
    } while (cursor);
    return rows;
}

export async function catalogoGestao(): Promise<Definicao[]> {
    const cron = await notionGestao(`databases/${fixas[0]!.databaseId}`);
    const idClinicas = cron.properties?.clinica?.relation?.database_id;
    if (!uuid.test(String(idClinicas))) throw new ErroGestao("Relação de clínicas não configurada.", 502);
    const lista: Definicao[] = [...fixas, { chave: "clinicas", nome: "Clínicas", databaseId: idClinicas, editavel: true, servicos: ["confirmacoes", "agendas-medicas", "consultas-finalizadas"] }];
    const joins = await notionGestao("databases/3ca46144576980d9a217c1ef041fe47c");
    const idIntegracoes = joins.properties?.integracao?.relation?.database_id;
    if (uuid.test(String(idIntegracoes))) lista.push({ chave: "integracoes", nome: "Tipos de integração", databaseId: idIntegracoes, editavel: true, servicos: ["confirmacoes", "agendas-medicas", "consultas-finalizadas"] });
    // Tabelas ainda sem contrato são visíveis, mas não ganham escrita arbitrária.
    const pagina = process.env.GESTAO_NOTION_PAGE_ID;
    if (pagina) {
        if (!uuid.test(pagina)) throw new ErroGestao("Página Gestão inválida.", 503);
        for (const block of await paginar(`blocks/${pagina}/children`)) {
            if (block.type === "child_database" && !lista.some(t => igualId(t.databaseId, block.id))) {
                lista.push({ chave: `leitura-${String(block.id).replace(/-/g, "")}`, nome: block.child_database.title, databaseId: block.id, editavel: false, servicos: [], motivo: "Tabela descoberta: contrato de edição e processos afetados ainda não cadastrados." });
            }
        }
    }
    return lista;
}

export function tabelaPublica(t: Definicao): GestaoTabela {
    const { databaseId: _id, ...publica } = t; return publica;
}
async function tabela(chave: string): Promise<Definicao> {
    const t = (await catalogoGestao()).find(item => item.chave === chave);
    if (!t) throw new ErroGestao("Tabela não permitida.", 404); return t;
}
function texto(p: any): string { return (p?.title ?? p?.rich_text ?? []).map((x: any) => x?.text?.content ?? x?.plain_text ?? "").join(""); }
export function valorGestao(p: any): GestaoValor {
    switch (p?.type) {
        case "title": case "rich_text": return texto(p);
        case "checkbox": return p.checkbox === true;
        case "number": return p.number ?? null;
        case "relation": return (p.relation ?? []).map((x: any) => x.id);
        case "select": return p.select?.name ?? "";
        case "multi_select": return (p.multi_select ?? []).map((x: any) => x.name);
        case "url": case "email": case "phone_number": return p[p.type] ?? "";
        case "date": return p.date?.start ?? "";
        default: return "Somente leitura";
    }
}
export function registroGestao(page: any): GestaoRegistro {
    const valores: Record<string, GestaoValor> = {};
    for (const [nome, prop] of Object.entries(page.properties ?? {})) valores[nome] = secreto(nome) ? "" : valorGestao(prop);
    return { id: page.id, versao: createHash("sha256").update(JSON.stringify([page.last_edited_time, page.properties, page.archived])).digest("hex"), valores };
}
async function paginaDaTabela(t: Definicao, id: string): Promise<any> {
    if (!uuid.test(id)) throw new ErroGestao("Registro inválido.", 404);
    const page = await notionGestao(`pages/${id}`);
    if (!igualId(page.parent?.database_id, t.databaseId)) throw new ErroGestao("Registro não pertence à tabela.", 404);
    return page;
}

export async function listarGestao(chave: string, cursor?: string): Promise<GestaoLista> {
    const t = await tabela(chave);
    const db = await notionGestao(`databases/${t.databaseId}`);
    const campos: GestaoCampo[] = [];
    for (const [nome, raw] of Object.entries(db.properties ?? {})) {
        const p = raw as any;
        let opcoes = (p[p.type]?.options ?? []).map((x: any) => ({ id: x.name, nome: x.name }));
        if (p.type === "relation" && uuid.test(String(p.relation?.database_id))) {
            // O destino vem do schema da tabela autorizada, não de um ID fornecido pelo cliente.
            opcoes = (await paginar(`databases/${p.relation.database_id}/query`, {})).filter(x => !x.archived && !x.in_trash).map(x => ({
                id: x.id, nome: texto(Object.values(x.properties ?? {}).find((v: any) => v.type === "title")) || x.id,
            }));
        }
        campos.push({ nome, tipo: p.type, editavel: t.editavel && editaveis.has(p.type), secreto: secreto(nome), opcoes });
    }
    if (cursor && (typeof cursor !== "string" || cursor.length > 200)) throw new ErroGestao("Cursor inválido.");
    const data = await notionGestao(`databases/${t.databaseId}/query`, "POST", { page_size: 50, ...(cursor ? { start_cursor: cursor } : {}) });
    if (!Array.isArray(data?.results) || typeof data.has_more !== "boolean" || (data.has_more && typeof data.next_cursor !== "string")) throw new ErroGestao("Resposta inválida da tabela.", 502);
    return { tabela: tabelaPublica(t), campos, registros: data.results.filter((x: any) => !x.archived && !x.in_trash).map(registroGestao), proximoCursor: data.has_more ? data.next_cursor : null };
}

export function propriedadeGestao(schema: any, value: GestaoValor): any {
    const tipo = schema.type;
    if (!editaveis.has(tipo)) throw new ErroGestao("Campo somente para leitura.");
    if (tipo === "checkbox") { if (typeof value !== "boolean") throw new ErroGestao("Checkbox deve ser booleano."); return { checkbox: value }; }
    if (tipo === "number") { if (value !== null && (typeof value !== "number" || !Number.isFinite(value))) throw new ErroGestao("Número inválido."); return { number: value }; }
    if (tipo === "relation" || tipo === "multi_select") {
        if (!Array.isArray(value) || value.length > 100 || value.some(x => typeof x !== "string")) throw new ErroGestao("Lista inválida.");
        if (tipo === "relation" && value.some(x => !uuid.test(x))) throw new ErroGestao("Relação inválida.");
        if (tipo === "multi_select" && value.some(x => !(schema.multi_select?.options ?? []).some((o: any) => o.name === x))) throw new ErroGestao("Opção não cadastrada.");
        return { [tipo]: [...new Set(value)].map(x => tipo === "relation" ? { id: x } : { name: x }) };
    }
    if (typeof value !== "string" || value.length > 2000) throw new ErroGestao("Texto inválido ou maior que 2000 caracteres.");
    if (tipo === "title" || tipo === "rich_text") return { [tipo]: value ? [{ type: "text", text: { content: value } }] : [] };
    if (tipo === "select") {
        if (value && !(schema.select?.options ?? []).some((x: any) => x.name === value)) throw new ErroGestao("Opção não cadastrada.");
        return { select: value ? { name: value } : null };
    }
    if (tipo === "url" && value) {
        try { const u = new URL(value); if (!["http:", "https:"].includes(u.protocol) || u.username || u.password) throw new Error(); }
        catch { throw new ErroGestao("URL inválida."); }
    }
    if (tipo === "date") {
        if (value && !/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value)) throw new ErroGestao("Data inválida.");
        return { date: value ? { start: value } : null };
    }
    return { [tipo]: value || null };
}

export async function prepararGestao(cmd: GestaoComando) {
    if (!cmd || !["criar", "alterar", "arquivar"].includes(cmd.acao) || !uuid.test(cmd.operacaoId)) throw new ErroGestao("Operação inválida.");
    const t = await tabela(cmd.tabela);
    if (!t.editavel) throw new ErroGestao("Tabela somente para leitura.", 403);
    const schema = await notionGestao(`databases/${t.databaseId}`);
    const page = cmd.acao === "criar" ? null : await paginaDaTabela(t, cmd.id ?? "");
    if (page && (page.archived || page.in_trash)) throw new ErroGestao("Registro arquivado.", 409);
    if (page && (!cmd.versao || registroGestao(page).versao !== cmd.versao)) throw new ErroGestao("Registro alterado por outra edição. Recarregue antes de salvar.", 409);
    if (!cmd.campos || typeof cmd.campos !== "object" || Array.isArray(cmd.campos)) throw new ErroGestao("Campos inválidos.");
    const properties: Record<string, any> = {};
    for (const [nome, value] of Object.entries(cmd.campos)) {
        const prop = schema.properties?.[nome];
        if (!prop || cmd.acao === "arquivar") throw new ErroGestao("Campo não permitido.");
        if (secreto(nome) && value === "") continue; // vazio significa preservar segredo
        properties[nome] = propriedadeGestao(prop, value);
        if (prop.type === "relation") {
            for (const id of value as string[]) {
                const relacionada = await notionGestao(`pages/${id}`);
                if (relacionada.archived || relacionada.in_trash || !igualId(relacionada.parent?.database_id, prop.relation?.database_id)) throw new ErroGestao(`Relação inválida em ${nome}.`);
            }
        }
    }
    if (cmd.acao === "criar") {
        const title = Object.keys(schema.properties ?? {}).find(k => schema.properties[k].type === "title");
        if (!title || !texto(properties[title]).trim()) throw new ErroGestao("Nome é obrigatório.");
    }
    // Valores completos para validação de domínio no super-app. Nunca devolver segredos.
    const merged: Record<string, GestaoValor> = {};
    for (const [nome, prop] of Object.entries(schema.properties ?? {})) {
        const p = prop as any;
        merged[nome] = secreto(nome) ? "" : valorGestao(properties[nome] ? { type: p.type, ...properties[nome] } : page?.properties?.[nome] ?? { type: p.type });
    }
    return { tabela: tabelaPublica(t), valores: merged, properties, databaseId: t.databaseId, page };
}

const marcador = (id: string) => `gestao-operacao:${id}`;
export async function reconciliarGestao(cmd: GestaoComando): Promise<{ estado: "salvo" | "nao-confirmado"; registroId: string | null }> {
    const t = await tabela(cmd.tabela);
    if (cmd.acao === "criar") {
        for (const page of await paginar(`databases/${t.databaseId}/query`, {})) {
            const blocks = await paginar(`blocks/${page.id}/children`);
            if (blocks.some(b => texto(b.paragraph) === marcador(cmd.operacaoId))) return { estado: "salvo", registroId: page.id };
        }
        return { estado: "nao-confirmado", registroId: null };
    }
    const page = await paginaDaTabela(t, cmd.id ?? "");
    if (cmd.acao === "arquivar") return { estado: page.archived || page.in_trash ? "salvo" : "nao-confirmado", registroId: page.id };
    // Não repetir escrita quando o resultado é desconhecido. Conferir apenas campos enviados.
    const schema = await notionGestao(`databases/${t.databaseId}`);
    const confere = Object.entries(cmd.campos).every(([nome, value]) => {
        if (secreto(nome) && value === "") return true;
        const prop = schema.properties?.[nome];
        if (!prop) return false;
        const esperado = valorGestao({ type: prop.type, ...propriedadeGestao(prop, value) });
        return JSON.stringify(valorGestao(page.properties?.[nome])) === JSON.stringify(esperado);
    });
    return { estado: confere ? "salvo" : "nao-confirmado", registroId: page.id };
}

export async function gravarGestao(cmd: GestaoComando): Promise<{ registroId: string }> {
    const prepared = await prepararGestao(cmd);
    let result: any;
    if (cmd.acao === "criar") {
        result = await notionGestao("pages", "POST", {
            parent: { database_id: prepared.databaseId }, properties: prepared.properties,
            // Marcador permite reconhecer uma criação confirmada após timeout/reinício.
            children: [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: marcador(cmd.operacaoId) } }] } }],
        });
    } else {
        result = await notionGestao(`pages/${cmd.id}`, "PATCH", cmd.acao === "arquivar" ? { archived: true } : { properties: prepared.properties });
    }
    if (!uuid.test(String(result?.id))) throw new ErroGestao("Gravação sem confirmação do registro.", 504);
    return { registroId: result.id };
}
