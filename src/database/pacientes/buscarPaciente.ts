import type * as interfaces from "../../utils/interfaces.js";
import { buscarTabelasBanco, chamarNotionAPI } from "../notion.js";

function normalizarDigitos(valor: string): string {
    return valor.replace(/\D/g, "");
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

/**
 * Busca pacientes por nome, CPF ou telefone.
 * - Nome: contains no título
 * - CPF: equals com 11 dígitos
 * - Telefone: contains no phone_number (a partir de 8 dígitos)
 */
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

    const digitos = normalizarDigitos(termo);

    const filtros: object[] = [
        {
            property: "nome",
            title: {
                contains: termo
            }
        }
    ];

    if (digitos.length === 11) {
        filtros.push({
            property: "cpf",
            rich_text: {
                equals: digitos
            }
        });
    }

    if (digitos.length >= 8) {
        filtros.push({
            property: "telefone",
            phone_number: {
                contains: digitos
            }
        });
    }

    const resultadoQuery = await chamarNotionAPI(`databases/${tabelaPacientes.id}/query`, "POST", {
        filter: filtros.length === 1 ? filtros[0] : { or: filtros }
    });

    return (resultadoQuery.results || []).map(mapearPaginaParaPaciente);
}
