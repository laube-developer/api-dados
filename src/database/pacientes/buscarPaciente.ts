import type * as interfaces from "../../utils/interfaces.js";
import { buscarTabelasBanco, chamarNotionAPI } from "../notion.js";

function normalizarCpf(cpf: string): string {
    return cpf.replace(/\D/g, "");
}

function mapearPaginaParaPaciente(page: any): interfaces.Paciente {
    const props = page.properties;
    return {
        nome: props.nome?.title?.[0]?.text?.content || "Sem Nome",
        cpf: props.cpf?.rich_text?.[0]?.text?.content || "",
        id_unico: props.id_unico?.rich_text?.[0]?.text?.content || "",
        data_nascimento: props.data_nascimento?.date?.start || "",
        email: props.email?.email || "",
        telefone: props.telefone?.phone_number || ""
    };
}

export async function buscarPaciente(cpfOrName: string): Promise<interfaces.Paciente[]> {
    const termo = (cpfOrName || "").trim();

    if (!termo) {
        return [];
    }

    const tabelas = await buscarTabelasBanco();
    const tabelaPacientes = tabelas.find(tabela => tabela.nome === "pacientes");

    if (!tabelaPacientes) {
        throw new Error("Tabela de pacientes não encontrada na página base do Notion.");
    }

    const pacientes_pageid = tabelaPacientes.id;
    const cpfNormalizado = normalizarCpf(termo);

    const filtros: object[] = [
        {
            property: "nome",
            title: {
                contains: termo
            }
        }
    ];

    // Só inclui filtro por CPF quando o termo possui dígitos (evita equals vazio).
    if (cpfNormalizado) {
        filtros.push({
            property: "cpf",
            rich_text: {
                equals: cpfNormalizado
            }
        });
    }

    const resultadoQuery = await chamarNotionAPI(`databases/${pacientes_pageid}/query`, "POST", {
        filter: filtros.length === 1 ? filtros[0] : { or: filtros }
    });

    const pacientes: interfaces.Paciente[] = (resultadoQuery.results || []).map(mapearPaginaParaPaciente);

    return pacientes;
}
