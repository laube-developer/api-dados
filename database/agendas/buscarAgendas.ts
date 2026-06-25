import type * as interfaces from "../../utils/interfaces.js";
import { buscarTabelasBanco, chamarNotionAPI } from "../notion.js";

function mapearPaginaParaAgenda(page: any): interfaces.Agenda {
    const props = page.properties;
    return {
        id_unico: props.id_unico?.rich_text?.[0]?.text?.content || "",
        nome: props.nome?.title?.[0]?.text?.content || ""
    };
}

export async function buscarAgendas(): Promise<interfaces.Agenda[]> {
    const tabelas = await buscarTabelasBanco();
    const tabelaAgendas = tabelas.find(tabela => tabela.nome === "agendas");

    if (!tabelaAgendas) {
        throw new Error("Tabela de agendas não encontrada na página base do Notion.");
    }

    const agendas: interfaces.Agenda[] = [];
    let cursor: string | undefined;

    do {
        const corpo: Record<string, unknown> = { page_size: 100 };

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