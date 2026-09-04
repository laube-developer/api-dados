import { dependenciasEstoque } from "./deps";
import { ErroNaoEncontrado } from "./erros";
import { jsonParaProperties, paginaParaJson, validarCorpo, type RegistroEstoque } from "./mapear";
import { recursoPorTabela, type RecursoSchema, type TipoCampo } from "./schema";

async function idTabela(nome: string): Promise<string> {
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

function filtroNotion(recurso: RecursoSchema, query: Record<string, unknown>): Record<string, unknown> | undefined {
    const filtros: Record<string, unknown>[] = [];

    for (const campo of recurso.campos) {
        const bruto = textoQuery(query[campo.nome]);
        if (bruto === undefined || bruto === "") {
            continue;
        }
        const filtro = filtroCampo(campo.nome, campo.tipo, bruto);
        if (filtro) {
            filtros.push(filtro);
        }
    }

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

export async function listar(tabela: string, query: Record<string, unknown> = {}): Promise<RegistroEstoque[]> {
    const recurso = recursoPorTabela(tabela);
    const idFiltro = textoQuery(query.id);
    if (idFiltro) {
        try {
            const item = await buscarPorId(tabela, idFiltro);
            return [item];
        } catch (error) {
            if (error instanceof ErroNaoEncontrado) {
                return [];
            }
            throw error;
        }
    }

    const databaseId = await idTabela(tabela);
    const filter = filtroNotion(recurso, query);
    const resultados: any[] = [];
    let cursor: string | undefined;

    do {
        const corpo: Record<string, unknown> = { page_size: 100 };
        if (filter) {
            corpo.filter = filter;
        }
        if (cursor) {
            corpo.start_cursor = cursor;
        }
        const dados = await dependenciasEstoque.chamarNotionAPI(`databases/${databaseId}/query`, "POST", corpo);
        resultados.push(...(dados?.results ?? []));
        cursor = dados?.has_more ? dados.next_cursor : undefined;
    } while (cursor);

    return resultados
        .filter((page) => !page?.archived)
        .map((page) => paginaParaJson(recurso, page));
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
