import { buscarTabelasBanco, chamarNotionAPI } from "../notion.js";
function mapearPaginaParaAgenda(page) {
    const props = page.properties;
    return {
        id_unico: props.id_unico?.rich_text?.[0]?.text?.content || "",
        nome: props.nome?.title?.[0]?.text?.content || ""
    };
}
export async function buscarAgendas() {
    const tabelas = await buscarTabelasBanco();
    const tabelaAgendas = tabelas.find(tabela => tabela.nome === "agendas");
    if (!tabelaAgendas) {
        throw new Error("Tabela de agendas não encontrada na página base do Notion.");
    }
    const agendas = [];
    let cursor;
    do {
        const corpo = { page_size: 100 };
        if (cursor) {
            corpo.start_cursor = cursor;
        }
        const resultadoQuery = await chamarNotionAPI(`databases/${tabelaAgendas.id}/query`, "POST", corpo);
        for (const page of resultadoQuery.results || []) {
            agendas.push(mapearPaginaParaAgenda(page));
        }
        cursor = resultadoQuery.has_more ? resultadoQuery.next_cursor : undefined;
    } while (cursor);
    return agendas;
}
//# sourceMappingURL=buscarAgendas.js.map