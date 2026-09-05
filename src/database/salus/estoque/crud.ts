import { dependenciasEstoque } from "./deps";
import { ErroNaoEncontrado } from "./erros";
import { jsonParaProperties, paginaParaJson, validarCorpo, type RegistroEstoque } from "./mapear";
import { recursoPorTabela, type RecursoSchema, type TipoCampo } from "./schema";

export type PaginacaoLista = {
    page: number;
    limit: number;
    has_more: boolean;
};

export type ListaPaginada = {
    itens: RegistroEstoque[];
    paginacao?: PaginacaoLista;
};

const PARAMS_META = new Set(["id", "limit", "page", "q", "data_hora_de", "data_hora_ate"]);
const LIMIT_MAX = 100;

export function idDiretoDaTabela(recurso: RecursoSchema): string | undefined {
    if (recurso.databaseIdEnv) {
        const fromEnv = String(process.env[recurso.databaseIdEnv] ?? "").trim();
        if (fromEnv) {
            return fromEnv;
        }
    }
    const padrao = recurso.databaseId?.trim();
    return padrao || undefined;
}

async function idTabela(nome: string): Promise<string> {
    const recurso = recursoPorTabela(nome);
    const direto = idDiretoDaTabela(recurso);
    if (direto) {
        return direto;
    }
    const tabelas = await dependenciasEstoque.buscarTabelasBanco();
    const tabela = tabelas.find((item) => item.nome === nome);
    if (!tabela) {
        throw new Error(`Tabela '${nome}' não encontrada na página base do Notion.`);
    }
    return tabela.id;
}

function textoQuery(valor: unknown): string | undefined {
    if (typeof valor === "string") {
        return valor;
    }
    if (Array.isArray(valor) && typeof valor[0] === "string") {
        return valor[0];
    }
    return undefined;
}

function valoresQuery(valor: unknown): string[] {
    if (typeof valor === "string") {
        return valor
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
    }
    if (Array.isArray(valor)) {
        return valor.flatMap((item) => valoresQuery(item));
    }
    return [];
}

function agruparOu(filtros: Record<string, unknown>[]): Record<string, unknown> | undefined {
    if (filtros.length === 0) {
        return undefined;
    }
    if (filtros.length === 1) {
        return filtros[0];
    }
    return { or: filtros };
}

function agruparE(filtros: Record<string, unknown>[]): Record<string, unknown> | undefined {
    if (filtros.length === 0) {
        return undefined;
    }
    if (filtros.length === 1) {
        return filtros[0];
    }
    return { and: filtros };
}

function filtroCampo(nome: string, tipo: TipoCampo, valor: string): Record<string, unknown> | null {
    switch (tipo) {
        case "relation":
            return { property: nome, relation: { contains: valor } };
        case "checkbox":
            return { property: nome, checkbox: { equals: valor === "true" || valor === "1" } };
        case "title":
            return { property: nome, title: { contains: valor } };
        case "rich_text":
            if (nome === "codigo") {
                return { property: nome, rich_text: { equals: valor } };
            }
            return { property: nome, rich_text: { contains: valor } };
        case "email":
            return { property: nome, email: { equals: valor } };
        case "phone_number":
            return { property: nome, phone_number: { contains: valor } };
        case "number": {
            const n = Number(valor);
            if (!Number.isInteger(n)) {
                return null;
            }
            return { property: nome, number: { equals: n } };
        }
        case "date":
            return { property: nome, date: { equals: valor } };
        default:
            return null;
    }
}

function filtroQ(recurso: RecursoSchema, q: string): Record<string, unknown> | undefined {
    const termo = q.trim();
    if (!termo) {
        return undefined;
    }
    const filtros: Record<string, unknown>[] = [];
    for (const campo of recurso.campos) {
        if (campo.tipo === "title") {
            filtros.push({ property: campo.nome, title: { contains: termo } });
        } else if (campo.tipo === "rich_text") {
            filtros.push({ property: campo.nome, rich_text: { contains: termo } });
        } else if (campo.tipo === "phone_number") {
            filtros.push({ property: campo.nome, phone_number: { contains: termo } });
        }
    }
    return agruparOu(filtros);
}

function isoInicioDoDia(valor: string): string {
    return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? `${valor}T00:00:00` : valor;
}

function isoFimDoDia(valor: string): string {
    return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? `${valor}T23:59:59` : valor;
}

function filtrosData(recurso: RecursoSchema, query: Record<string, unknown>): Record<string, unknown>[] {
    const de = textoQuery(query.data_hora_de)?.trim();
    const ate = textoQuery(query.data_hora_ate)?.trim();
    if (!de && !ate) {
        return [];
    }
    const campoDate = recurso.campos.find((campo) => campo.tipo === "date");
    if (!campoDate) {
        return [];
    }
    const filtros: Record<string, unknown>[] = [];
    if (de) {
        filtros.push({ property: campoDate.nome, date: { on_or_after: isoInicioDoDia(de) } });
    }
    if (ate) {
        filtros.push({ property: campoDate.nome, date: { on_or_before: isoFimDoDia(ate) } });
    }
    return filtros;
}

export function montarFiltroLista(
    recurso: RecursoSchema,
    query: Record<string, unknown>
): Record<string, unknown> | undefined {
    const filtros: Record<string, unknown>[] = [];

    const q = textoQuery(query.q);
    const filtroBusca = q ? filtroQ(recurso, q) : undefined;
    if (filtroBusca) {
        filtros.push(filtroBusca);
    }

    filtros.push(...filtrosData(recurso, query));

    for (const campo of recurso.campos) {
        if (PARAMS_META.has(campo.nome)) {
            continue;
        }
        const bruto = query[campo.nome];
        if (bruto === undefined || bruto === null || bruto === "") {
            continue;
        }
        const valores = valoresQuery(bruto);
        if (valores.length === 0) {
            continue;
        }
        const partes = valores
            .map((valor) => filtroCampo(campo.nome, campo.tipo, valor))
            .filter((item): item is Record<string, unknown> => item != null);
        const agrupado = agruparOu(partes);
        if (agrupado) {
            filtros.push(agrupado);
        }
    }

    return agruparE(filtros);
}

export function parsePaginacao(query: Record<string, unknown>): { page: number; limit: number } | undefined {
    const brutoLimit = textoQuery(query.limit);
    if (brutoLimit === undefined || brutoLimit === "") {
        return undefined;
    }
    const lido = Number(brutoLimit);
    if (!Number.isInteger(lido) || lido < 1) {
        return undefined;
    }
    const limit = Math.min(lido, LIMIT_MAX);
    const brutoPage = textoQuery(query.page);
    const pageLido = brutoPage === undefined || brutoPage === "" ? 1 : Number(brutoPage);
    const page = Number.isInteger(pageLido) && pageLido >= 1 ? pageLido : 1;
    return { page, limit };
}

export async function listar(tabela: string, query: Record<string, unknown> = {}): Promise<RegistroEstoque[]> {
    return (await listarPaginado(tabela, query)).itens;
}

export async function listarPaginado(
    tabela: string,
    query: Record<string, unknown> = {}
): Promise<ListaPaginada> {
    const recurso = recursoPorTabela(tabela);
    const idFiltro = textoQuery(query.id);
    if (idFiltro) {
        try {
            const item = await buscarPorId(tabela, idFiltro);
            return { itens: [item] };
        } catch (error) {
            if (error instanceof ErroNaoEncontrado) {
                return { itens: [] };
            }
            throw error;
        }
    }

    const databaseId = await idTabela(tabela);
    const filter = montarFiltroLista(recurso, query);
    const paginacao = parsePaginacao(query);
    const need = paginacao ? paginacao.page * paginacao.limit + 1 : undefined;
    const resultados: any[] = [];
    let cursor: string | undefined;

    do {
        const restante = need == null ? 100 : Math.max(1, need - resultados.length);
        const corpo: Record<string, unknown> = { page_size: Math.min(100, restante) };
        if (filter) {
            corpo.filter = filter;
        }
        if (cursor) {
            corpo.start_cursor = cursor;
        }
        const dados = await dependenciasEstoque.chamarNotionAPI(`databases/${databaseId}/query`, "POST", corpo);
        const pages = (dados?.results ?? []).filter((page: { archived?: boolean }) => !page?.archived);
        resultados.push(...pages);
        cursor = dados?.has_more ? dados.next_cursor : undefined;
    } while (cursor && (need == null || resultados.length < need));

    const mapeados = resultados.map((page) => paginaParaJson(recurso, page));
    if (!paginacao) {
        return { itens: mapeados };
    }

    const inicio = (paginacao.page - 1) * paginacao.limit;
    return {
        itens: mapeados.slice(inicio, inicio + paginacao.limit),
        paginacao: {
            page: paginacao.page,
            limit: paginacao.limit,
            has_more: mapeados.length > inicio + paginacao.limit,
        },
    };
}

export async function buscarPorId(tabela: string, id: string): Promise<RegistroEstoque> {
    const recurso = recursoPorTabela(tabela);
    if (!id?.trim()) {
        throw new ErroNaoEncontrado("Registro não encontrado.");
    }
    const page = await dependenciasEstoque.chamarNotionAPI(`pages/${id.trim()}`, "GET", undefined, { permitir404: true });
    if (!page || page.archived) {
        throw new ErroNaoEncontrado("Registro não encontrado.");
    }
    return paginaParaJson(recurso, page);
}

export async function adicionar(tabela: string, dados: Record<string, unknown>): Promise<RegistroEstoque> {
    const recurso = recursoPorTabela(tabela);
    validarCorpo(recurso, dados, "criar");
    const databaseId = await idTabela(tabela);
    const properties = jsonParaProperties(recurso, dados, "criar");
    const page = await dependenciasEstoque.chamarNotionAPI("pages", "POST", {
        parent: { database_id: databaseId },
        properties,
    });
    return paginaParaJson(recurso, page);
}

export async function alterar(tabela: string, id: string, dados: Record<string, unknown>): Promise<RegistroEstoque> {
    const recurso = recursoPorTabela(tabela);
    await buscarPorId(tabela, id);
    validarCorpo(recurso, dados, "alterar");
    const properties = jsonParaProperties(recurso, dados, "alterar");
    const page = await dependenciasEstoque.chamarNotionAPI(`pages/${id.trim()}`, "PATCH", { properties });
    return paginaParaJson(recurso, page);
}
