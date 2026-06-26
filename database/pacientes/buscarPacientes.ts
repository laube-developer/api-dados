import type * as interfaces from "../../utils/interfaces.js";
import { buscarTabelasBanco, chamarNotionAPI } from "../notion.js";

function mapearPaginaParaPaciente(page: any): interfaces.Paciente {
    const props = page.properties;
    return {
        nome: props.nome?.title?.[0]?.text?.content || "Sem Nome",
        cpf: props.cpf?.rich_text?.[0]?.text?.content || "",
        id_unico: props.id_unico?.rich_text?.[0]?.text?.content || "",
        data_nascimento: props.data_nascimento?.date?.start || "",
        email: props.email?.email || "",
        telefone: props.telefone?.phone_number || "",
    };
}

export async function buscarPacientes(): Promise<interfaces.Paciente[]> {
    const tabelas = await buscarTabelasBanco();
    const tabelaPacientes = tabelas.find((tabela) => tabela.nome === "pacientes");

    if (!tabelaPacientes) {
        throw new Error("Tabela de pacientes não encontrada na página base do Notion.");
    }

    const pacientes: interfaces.Paciente[] = [];
    let cursor: string | undefined;

    do {
        const corpo: Record<string, unknown> = { page_size: 100 };

        if (cursor) {
            corpo.start_cursor = cursor;
        }

        const resultadoQuery = await chamarNotionAPI(`databases/${tabelaPacientes.id}/query`, "POST", corpo);

        for (const page of resultadoQuery.results || []) {
            pacientes.push(mapearPaginaParaPaciente(page));
        }

        cursor = resultadoQuery.has_more ? resultadoQuery.next_cursor : undefined;
    } while (cursor);

    return pacientes;
}