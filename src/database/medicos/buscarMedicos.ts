import type * as interfaces from "../../utils/interfaces.js";
import { buscarTabelasBanco, chamarNotionAPI } from "../notion.js";

function mapearPaginaParaMedico(page: any): interfaces.Medico {
    const props = page.properties;
    return {
        id_unico: props.id_unico?.rich_text?.[0]?.text?.content || "",
        nome: props.nome?.title?.[0]?.text?.content || ""
    };
}

export async function buscarMedicos(): Promise<interfaces.Medico[]> {
    const tabelas = await buscarTabelasBanco();
    const tabelaMedicos = tabelas.find(tabela => tabela.nome === "medicos");

    if (!tabelaMedicos) {
        throw new Error("Tabela de médicos não encontrada na página base do Notion.");
    }

    const medicos: interfaces.Medico[] = [];
    let cursor: string | undefined;

    do {
        const corpo: Record<string, unknown> = { page_size: 100 };

        if (cursor) {
            corpo.start_cursor = cursor;
        }

        const resultadoQuery = await chamarNotionAPI(`databases/${tabelaMedicos.id}/query`, "POST", corpo);

        for (const page of resultadoQuery.results || []) {
            medicos.push(mapearPaginaParaMedico(page));
        }

        cursor = resultadoQuery.has_more ? resultadoQuery.next_cursor : undefined;
    } while (cursor);

    return medicos;
}