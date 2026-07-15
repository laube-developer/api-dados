import { buscarTabelasBanco, chamarNotionAPI } from "../notion.js";

export class ErroValidacao extends Error {
    constructor(mensagem: string) {
        super(mensagem);
        this.name = "ErroValidacao";
    }
}

const TAMANHO_LOTE_FILTRO = 50;

function normalizarIdUnico(valor: unknown): string {
    if (valor == null) {
        return "";
    }

    return String(valor).trim();
}

function validarIdUnicos(entrada: unknown): string[] {
    if (!Array.isArray(entrada)) {
        throw new ErroValidacao("O corpo da requisição deve ser um array de id_unico, ou um objeto com o campo 'id_unicos'.");
    }

    const ids: string[] = [];
    const vistos = new Set<string>();

    for (let indice = 0; indice < entrada.length; indice++) {
        const id = normalizarIdUnico(entrada[indice]);

        if (!id) {
            throw new ErroValidacao(`O id_unico na posição ${indice} é inválido.`);
        }

        if (!vistos.has(id)) {
            vistos.add(id);
            ids.push(id);
        }
    }

    return ids;
}

function extrairIdUnicosDoBody(body: unknown): unknown {
    if (Array.isArray(body)) {
        return body;
    }

    if (body && typeof body === "object" && Array.isArray((body as { id_unicos?: unknown }).id_unicos)) {
        return (body as { id_unicos: unknown[] }).id_unicos;
    }

    throw new ErroValidacao("Envie um array de id_unico ou um objeto { id_unicos: [...] }.");
}

/**
 * Recebe uma lista de id_unico e retorna apenas os médicos que já estão cadastrados na base.
 */
export async function doctorsExists(body: unknown): Promise<string[]> {
    const idUnicos = validarIdUnicos(extrairIdUnicosDoBody(body));

    if (idUnicos.length === 0) {
        return [];
    }

    const tabelas = await buscarTabelasBanco();
    const tabelaMedicos = tabelas.find((tabela) => tabela.nome === "medicos");

    if (!tabelaMedicos) {
        throw new Error("Tabela de médicos não encontrada na página base do Notion.");
    }

    const idsEncontrados = new Set<string>();

    for (let inicio = 0; inicio < idUnicos.length; inicio += TAMANHO_LOTE_FILTRO) {
        const lote = idUnicos.slice(inicio, inicio + TAMANHO_LOTE_FILTRO);
        const filtros = lote.map((id_unico) => ({
            property: "id_unico",
            rich_text: {
                equals: id_unico,
            },
        }));

        let cursor: string | undefined;

        do {
            const corpo: Record<string, unknown> = {
                page_size: 100,
                filter: filtros.length === 1 ? filtros[0] : { or: filtros },
            };

            if (cursor) {
                corpo.start_cursor = cursor;
            }

            const resultadoQuery = await chamarNotionAPI(
                `databases/${tabelaMedicos.id}/query`,
                "POST",
                corpo
            );

            for (const page of resultadoQuery.results || []) {
                const idUnico =
                    page.properties?.id_unico?.rich_text?.[0]?.text?.content || "";

                if (idUnico) {
                    idsEncontrados.add(String(idUnico).trim());
                }
            }

            cursor = resultadoQuery.has_more ? resultadoQuery.next_cursor : undefined;
        } while (cursor);
    }

    return idUnicos.filter((id) => idsEncontrados.has(id));
}
