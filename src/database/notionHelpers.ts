import { buscarTabelasBanco, chamarNotionAPI } from "./notion";

export async function buscarPaginaPorCampoTexto(
    nomeTabela: string,
    propriedade: string,
    valor: string
): Promise<any | null> {
    const tabelas = await buscarTabelasBanco();
    const tabela = tabelas.find((item) => item.nome === nomeTabela);

    if (!tabela) {
        throw new Error(`Tabela '${nomeTabela}' não encontrada na página base do Notion.`);
    }

    const resultadoQuery = await chamarNotionAPI(`databases/${tabela.id}/query`, "POST", {
        filter: {
            property: propriedade,
            rich_text: {
                equals: valor
            }
        },
        page_size: 1
    });

    return resultadoQuery.results?.[0] ?? null;
}

export async function arquivarPagina(pageId: string): Promise<void> {
    await chamarNotionAPI(`pages/${pageId}`, "PATCH", {
        archived: true
    });
}