import type * as interfaces from "../../utils/interfaces";
import { STATUS_AGENDAMENTO_VALIDOS } from "../../utils/interfaces";
import { buscarTabelasBanco, chamarNotionAPI } from "../notion";

export class ErroValidacao extends Error {
    constructor(mensagem: string) {
        super(mensagem);
        this.name = "ErroValidacao";
    }
}

function normalizarCpf(cpf: string): string {
    return cpf.replace(/\D/g, "");
}

function validarData(data: string): boolean {
    return !Number.isNaN(Date.parse(data));
}

export function normalizarDadosAgendamento(dados: interfaces.Agendamento): interfaces.Agendamento {
    return {
        ...dados,
        insurance_id: typeof dados.insurance_id === "string" ? dados.insurance_id.trim() : "",
    };
}

export function validarDadosAgendamento(dados: interfaces.Agendamento): void {
    const erros: string[] = [];

    const camposTexto: (keyof interfaces.Agendamento)[] = [
        "id_agenda",
        "id_unico",
        "data_hora_inicio",
        "data_hora_fim",
        "id_medico",
        "id_tipo_procedimento",
    ];

    for (const campo of camposTexto) {
        const valor = dados[campo];
        if (typeof valor !== "string" || !valor.trim()) {
            erros.push(`O campo '${campo}' é obrigatório.`);
        }
    }

    if (typeof dados.guia_assinada !== "boolean") {
        erros.push("O campo 'guia_assinada' deve ser um valor booleano.");
    }

    if (!dados.status || !STATUS_AGENDAMENTO_VALIDOS.includes(dados.status)) {
        erros.push(`O campo 'status' é obrigatório e deve ser um dos seguintes: ${STATUS_AGENDAMENTO_VALIDOS.join(", ")}.`);
    }

    const cpfNormalizado = normalizarCpf(dados.cpf_paciente || "");
    if (cpfNormalizado.length !== 11) {
        erros.push("O campo 'cpf_paciente' deve conter um CPF válido com 11 dígitos.");
    }

    if (dados.data_hora_inicio && !validarData(dados.data_hora_inicio)) {
        erros.push("O campo 'data_hora_inicio' deve conter uma data/hora válida.");
    }

    if (dados.data_hora_fim && !validarData(dados.data_hora_fim)) {
        erros.push("O campo 'data_hora_fim' deve conter uma data/hora válida.");
    }

    if (
        dados.data_hora_inicio &&
        dados.data_hora_fim &&
        validarData(dados.data_hora_inicio) &&
        validarData(dados.data_hora_fim) &&
        new Date(dados.data_hora_fim) <= new Date(dados.data_hora_inicio)
    ) {
        erros.push("O campo 'data_hora_fim' deve ser posterior a 'data_hora_inicio'.");
    }

    if (erros.length > 0) {
        throw new ErroValidacao(erros.join(" "));
    }
}

export function criarPropriedadesNotionAgendamento(dados: interfaces.Agendamento): Record<string, unknown> {
    const cpfNormalizado = normalizarCpf(dados.cpf_paciente);

    return {
        id_agenda: {
            rich_text: [{ text: { content: dados.id_agenda } }],
        },
        id_unico: {
            rich_text: [{ text: { content: dados.id_unico } }],
        },
        data_hora_inicio: {
            date: { start: dados.data_hora_inicio },
        },
        data_hora_fim: {
            date: { start: dados.data_hora_fim },
        },
        id_medico: {
            rich_text: [{ text: { content: dados.id_medico } }],
        },
        cpf_paciente: {
            rich_text: [{ text: { content: cpfNormalizado } }],
        },
        id_tipo_procedimento: {
            rich_text: [{ text: { content: dados.id_tipo_procedimento } }],
        },
        status: {
            status: { name: dados.status },
        },
        guia_assinada: {
            checkbox: dados.guia_assinada,
        },
        insurance_id: {
            rich_text: [{ text: { content: dados.insurance_id } }],
        },
    };
}

export function mapearPaginaParaAgendamento(page: any): interfaces.Agendamento {
    const props = page.properties;
    return {
        id_agenda: props.id_agenda?.rich_text?.[0]?.text?.content || "",
        id_unico: props.id_unico?.rich_text?.[0]?.text?.content || "",
        data_hora_inicio: props.data_hora_inicio?.date?.start || "",
        data_hora_fim: props.data_hora_fim?.date?.start || "",
        id_medico: props.id_medico?.rich_text?.[0]?.text?.content || "",
        cpf_paciente: props.cpf_paciente?.rich_text?.[0]?.text?.content || "",
        id_tipo_procedimento: props.id_tipo_procedimento?.rich_text?.[0]?.text?.content || "",
        status: props.status?.status?.name || "",
        guia_assinada: props.guia_assinada?.checkbox ?? false,
        insurance_id: props.insurance_id?.rich_text?.[0]?.text?.content || ""
    };
}

export async function adicionarAgendamento(dados: interfaces.Agendamento): Promise<interfaces.Agendamento> {
    const dadosNormalizados = normalizarDadosAgendamento(dados);

    validarDadosAgendamento(dadosNormalizados);

    const tabelas = await buscarTabelasBanco();
    const tabelaAgendamentos = tabelas.find(tabela => tabela.nome === "agendamentos");

    if (!tabelaAgendamentos) {
        throw new Error("Tabela de agendamentos não encontrada na página base do Notion.");
    }

    const resultado = await chamarNotionAPI("pages", "POST", {
        parent: { database_id: tabelaAgendamentos.id },
        properties: criarPropriedadesNotionAgendamento(dadosNormalizados),
    });

    return mapearPaginaParaAgendamento(resultado);
}