import type * as interfaces from "../../utils/interfaces.js";
import { buscarTabelasBanco, chamarNotionAPI } from "../notion.js";

function normalizarCpf(cpf: string): string {
    return cpf.replace(/\D/g, "");
}

export async function buscarPaciente(cpf: string): Promise<interfaces.Paciente[]> {
    const cpfNormalizado = normalizarCpf(cpf);

    if (!cpfNormalizado) {
        return [];
    }

    const tabelas = await buscarTabelasBanco();
    const tabelaPacientes = tabelas.find(tabela => tabela.nome === "pacientes");

    if (!tabelaPacientes) {
        throw new Error("Tabela de pacientes não encontrada na página base do Notion.");
    }

    const pacientes_pageid = tabelaPacientes.id;

    const resultadoQuery = await chamarNotionAPI(`databases/${pacientes_pageid}/query`, "POST", {
        filter: {
            property: "cpf",
            rich_text: {
                equals: cpfNormalizado
            }
        }
    });

    const pacientes: interfaces.Paciente[] = (resultadoQuery.results || []).map((page: any) => {
        const props = page.properties;
        return {
            nome: props.nome?.title?.[0]?.text?.content || "Sem Nome",
            cpf: props.cpf?.rich_text?.[0]?.text?.content || "",
            id_unico: props.id_unico?.rich_text?.[0]?.text?.content || "",
            data_nascimento: props.data_nascimento?.date?.start || "",
            email: props.email?.email || "",
            telefone: props.telefone?.phone_number || ""
        };
    });

    return pacientes;
}