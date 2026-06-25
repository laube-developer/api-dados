import type * as interfaces from "../utils/interfaces.js";

const NOTION_API_TOKEN = process.env.NOTION_API_TOKEN || "";
const NOTION_DATABASE_PAGE_ID = process.env.NOTION_DATABASE_PAGE_ID || "";

function normalizarCpf(cpf: string): string {
    return cpf.replace(/\D/g, "");
}

// Função auxiliar para fazer chamadas HTTP seguras para o Notion
async function chamarNotionAPI(endpoint: string, método: string = "GET", corpo?: any) {
    const url = `https://api.notion.com/v1/${endpoint}`;
    
    const resposta = await fetch(url, {
        method: método,
        headers: {
            "Authorization": `Bearer ${NOTION_API_TOKEN}`,
            "Notion-Version": "2022-06-28", // Versão estável da API pública do Notion
            "Content-Type": "application/json"
        },
        body: corpo ? JSON.stringify(corpo) : null
    });

    if (!resposta.ok) {
        const erroTexto = await resposta.text();
        throw new Error(`Falha na API do Notion [${resposta.status}]: ${erroTexto}`);
    }

    return resposta.json();
}

export async function buscarTabelasBanco() {
    // Lista os blocos filhos da página mãe para mapear os bancos inline
    const dados = await chamarNotionAPI(`blocks/${NOTION_DATABASE_PAGE_ID}/children`);

    const tabelas = (dados.results || [])
        .filter((block: any) => block.type === "child_database")
        .map((block: any) => ({
            id: block.id,
            nome: block.child_database?.title?.toLowerCase().trim() || ""
        }));

    return tabelas;
}

export async function buscarPacientesPorCpf(cpf: string): Promise<interfaces.Paciente[]> {
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

    // Faz a busca (Query) filtrada diretamente via POST no endpoint correto da API
    const resultadoQuery = await chamarNotionAPI(`databases/${pacientes_pageid}/query`, "POST", {
        filter: {
            property: "cpf",
            rich_text: {
                equals: cpfNormalizado
            }
        }
    });

    // Mapeamento dos campos retornados em JSON puro
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
