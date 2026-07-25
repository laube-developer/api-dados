import type * as interfaces from "../../utils/interfaces.js";
import { STATUS_AGENDAMENTO_VALIDOS } from "../../utils/interfaces.js";
import { normalizarDataHoraIso } from "../../utils/datas.js";
import { buscarTabelasBanco, chamarNotionAPI } from "../notion.js";

export class ErroValidacao extends Error {
    constructor(mensagem: string) {
        super(mensagem);
        this.name = "ErroValidacao";
    }
}

export class ErroNaoEncontrado extends Error {
    constructor(mensagem: string) {
        super(mensagem);
        this.name = "ErroNaoEncontrado";
    }
}

function normalizarCpf(cpf: string | null | undefined): string {
    if (cpf == null) {
        return "";
    }
    return String(cpf).replace(/\D/g, "");
}

function validarData(data: string): boolean {
    return !Number.isNaN(Date.parse(data));
}

function mapearPaginaParaAgendamento(page: any): interfaces.Agendamento {
    const props = page.properties;
    return {
        id_agenda: props.id_agenda?.rich_text?.[0]?.text?.content || "",
        id_unico: props.id_unico?.rich_text?.[0]?.text?.content || "",
        data_hora_inicio: normalizarDataHoraIso(props.data_hora_inicio?.date?.start || ""),
        data_hora_fim: normalizarDataHoraIso(props.data_hora_fim?.date?.start || ""),
        id_medico: props.id_medico?.rich_text?.[0]?.text?.content || "",
        id_paciente: props.id_paciente?.rich_text?.[0]?.text?.content || "",
        nome_paciente: props.nome_paciente?.rich_text?.[0]?.text?.content || "",
        cpf_paciente: props.cpf_paciente?.rich_text?.[0]?.text?.content || "",
        id_tipo_procedimento: props.id_tipo_procedimento?.rich_text?.[0]?.text?.content || "",
        status: props.status?.status?.name || "",
        guia_assinada: props.guia_assinada?.checkbox ?? false,
        insurance_id: props.insurance_id?.rich_text?.[0]?.text?.content || ""
    };
}

function validarListaAgendamentos(agendamentos: unknown): interfaces.AtualizacaoAgendamento[] {
    if (!Array.isArray(agendamentos)) {
        throw new ErroValidacao("O campo 'agendamentos' deve ser um array.");
    }

    if (agendamentos.length === 0) {
        throw new ErroValidacao("O campo 'agendamentos' não pode estar vazio.");
    }

    const erros: string[] = [];

    const agendamentosValidados = agendamentos.map((agendamento, indice) => {
        const item = agendamento as interfaces.AtualizacaoAgendamento;

        if (typeof item?.id_unico !== "string" || !item.id_unico.trim()) {
            erros.push(`O campo 'id_unico' é obrigatório no item ${indice + 1}.`);
        }

        const camposAtualizacao = Object.keys(item || {}).filter((campo) => campo !== "id_unico");

        if (camposAtualizacao.length === 0) {
            erros.push(`O item ${indice + 1} deve conter ao menos um campo para atualizar.`);
        }

        if (item.status !== undefined && !STATUS_AGENDAMENTO_VALIDOS.includes(item.status)) {
            erros.push(
                `O campo 'status' do item ${indice + 1} deve ser um dos seguintes: ${STATUS_AGENDAMENTO_VALIDOS.join(", ")}.`
            );
        }

        if (item.cpf_paciente !== undefined) {
            const cpfNormalizado = normalizarCpf(item.cpf_paciente);
            if (cpfNormalizado && cpfNormalizado.length !== 11) {
                erros.push(`O campo 'cpf_paciente' do item ${indice + 1} deve conter um CPF válido com 11 dígitos.`);
            }
        }

        if (item.data_hora_inicio !== undefined && !validarData(item.data_hora_inicio)) {
            erros.push(`O campo 'data_hora_inicio' do item ${indice + 1} deve conter uma data/hora válida.`);
        }

        if (item.data_hora_fim !== undefined && !validarData(item.data_hora_fim)) {
            erros.push(`O campo 'data_hora_fim' do item ${indice + 1} deve conter uma data/hora válida.`);
        }

        if (
            item.data_hora_inicio &&
            item.data_hora_fim &&
            validarData(item.data_hora_inicio) &&
            validarData(item.data_hora_fim) &&
            new Date(item.data_hora_fim) <= new Date(item.data_hora_inicio)
        ) {
            erros.push(`O campo 'data_hora_fim' do item ${indice + 1} deve ser posterior a 'data_hora_inicio'.`);
        }

        const camposTexto: (keyof interfaces.AtualizacaoAgendamento)[] = [
            "id_agenda",
            "data_hora_inicio",
            "data_hora_fim",
            "id_medico",
            "id_paciente",
            "nome_paciente",
            "id_tipo_procedimento",
        ];

        for (const campo of camposTexto) {
            const valor = item[campo];
            if (valor !== undefined && (typeof valor !== "string" || !valor.trim())) {
                erros.push(`O campo '${campo}' não pode estar vazio no item ${indice + 1}.`);
            }
        }

        if (item.insurance_id !== undefined && typeof item.insurance_id !== "string") {
            erros.push(`O campo 'insurance_id' deve ser uma string no item ${indice + 1}.`);
        }

        return {
            id_unico: item.id_unico?.trim() || "",
            ...(item.id_agenda !== undefined ? { id_agenda: item.id_agenda.trim() } : {}),
            ...(item.data_hora_inicio !== undefined ? { data_hora_inicio: item.data_hora_inicio.trim() } : {}),
            ...(item.data_hora_fim !== undefined ? { data_hora_fim: item.data_hora_fim.trim() } : {}),
            ...(item.id_medico !== undefined ? { id_medico: item.id_medico.trim() } : {}),
            ...(item.id_paciente !== undefined ? { id_paciente: item.id_paciente.trim() } : {}),
            ...(item.nome_paciente !== undefined ? { nome_paciente: item.nome_paciente.trim() } : {}),
            ...(item.cpf_paciente !== undefined ? { cpf_paciente: normalizarCpf(item.cpf_paciente) } : {}),
            ...(item.id_tipo_procedimento !== undefined ? { id_tipo_procedimento: item.id_tipo_procedimento.trim() } : {}),
            ...(item.status !== undefined ? { status: item.status } : {}),
            ...(item.insurance_id !== undefined ? { insurance_id: item.insurance_id.trim() } : {}),
            ...(typeof item.guia_assinada === "boolean"
                ? { guia_assinada: item.guia_assinada }
                : {}),
        };
    });

    if (erros.length > 0) {
        throw new ErroValidacao(erros.join(" "));
    }

    return agendamentosValidados;
}

async function buscarPaginaAgendamento(tabelaId: string, id_unico: string): Promise<any> {
    const resultadoQuery = await chamarNotionAPI(`databases/${tabelaId}/query`, "POST", {
        filter: {
            property: "id_unico",
            rich_text: {
                equals: id_unico
            }
        },
        page_size: 1
    });

    return resultadoQuery.results?.[0];
}

export async function atualizarAgendamentos(agendamentos: unknown): Promise<interfaces.Agendamento[]> {
    const agendamentosValidados = validarListaAgendamentos(agendamentos);

    const tabelas = await buscarTabelasBanco();
    const tabelaAgendamentos = tabelas.find(tabela => tabela.nome === "agendamentos");

    if (!tabelaAgendamentos) {
        throw new Error("Tabela de agendamentos não encontrada na página base do Notion.");
    }

    const agendamentosAtualizados: interfaces.Agendamento[] = [];

    for (const agendamento of agendamentosValidados) {
        const pagina = await buscarPaginaAgendamento(tabelaAgendamentos.id, agendamento.id_unico);

        if (!pagina) {
            throw new ErroNaoEncontrado(`Agendamento não encontrado: ${agendamento.id_unico}.`);
        }

        const properties: Record<string, unknown> = {};

        if (agendamento.id_agenda !== undefined) {
            properties.id_agenda = {
                rich_text: [{ text: { content: agendamento.id_agenda } }]
            };
        }

        if (agendamento.data_hora_inicio !== undefined) {
            properties.data_hora_inicio = {
                date: { start: agendamento.data_hora_inicio }
            };
        }

        if (agendamento.data_hora_fim !== undefined) {
            properties.data_hora_fim = {
                date: { start: agendamento.data_hora_fim }
            };
        }

        if (agendamento.id_medico !== undefined) {
            properties.id_medico = {
                rich_text: [{ text: { content: agendamento.id_medico } }]
            };
        }

        if (agendamento.id_paciente !== undefined) {
            properties.id_paciente = {
                rich_text: [{ text: { content: agendamento.id_paciente } }]
            };
        }

        if (agendamento.nome_paciente !== undefined) {
            properties.nome_paciente = {
                rich_text: [{ text: { content: agendamento.nome_paciente } }]
            };
        }

        if (agendamento.cpf_paciente !== undefined) {
            properties.cpf_paciente = {
                rich_text: [{ text: { content: agendamento.cpf_paciente } }]
            };
        }

        if (agendamento.id_tipo_procedimento !== undefined) {
            properties.id_tipo_procedimento = {
                rich_text: [{ text: { content: agendamento.id_tipo_procedimento } }]
            };
        }

        if (agendamento.status !== undefined) {
            properties.status = {
                status: { name: agendamento.status }
            };
        }

        if (agendamento.insurance_id !== undefined) {
            properties.insurance_id = {
                rich_text: [{ text: { content: agendamento.insurance_id } }]
            };
        }

        if (typeof agendamento.guia_assinada === "boolean") {
            properties.guia_assinada = {
                checkbox: agendamento.guia_assinada,
            };
        }

        const resultado = await chamarNotionAPI(`pages/${pagina.id}`, "PATCH", { properties });
        agendamentosAtualizados.push(mapearPaginaParaAgendamento(resultado));
    }

    return agendamentosAtualizados;
}
