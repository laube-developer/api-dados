import { buscarTabelasBanco, chamarNotionAPI } from "../notion.js";
export class ErroValidacao extends Error {
    constructor(mensagem) {
        super(mensagem);
        this.name = "ErroValidacao";
    }
}
function normalizarCpf(cpf) {
    return cpf.replace(/\D/g, "");
}
function validarDataIso(data) {
    return /^\d{4}-\d{2}-\d{2}$/.test(data) && !Number.isNaN(Date.parse(`${data}T00:00:00`));
}
function diaSeguinte(data) {
    const proximoDia = new Date(`${data}T00:00:00`);
    proximoDia.setDate(proximoDia.getDate() + 1);
    return proximoDia.toISOString().split("T")[0];
}
function mapearPaginaParaAgendamento(page) {
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
export async function buscarAgendamento(cpf, start_date, end_date) {
    const cpfNormalizado = normalizarCpf(cpf);
    if (!cpfNormalizado) {
        return [];
    }
    if (!start_date || !end_date) {
        throw new ErroValidacao("Os parâmetros 'start_date' e 'end_date' são obrigatórios (formato: YYYY-MM-DD).");
    }
    if (!validarDataIso(start_date) || !validarDataIso(end_date)) {
        throw new ErroValidacao("Os parâmetros 'start_date' e 'end_date' devem estar no formato YYYY-MM-DD.");
    }
    if (new Date(`${start_date}T00:00:00`) > new Date(`${end_date}T00:00:00`)) {
        throw new ErroValidacao("O parâmetro 'start_date' não pode ser posterior a 'end_date'.");
    }
    const tabelas = await buscarTabelasBanco();
    const tabelaAgendamentos = tabelas.find(tabela => tabela.nome === "agendamentos");
    if (!tabelaAgendamentos) {
        throw new Error("Tabela de agendamentos não encontrada na página base do Notion.");
    }
    const agendamentos_pageid = tabelaAgendamentos.id;
    const agendamentos = [];
    let cursor;
    do {
        const corpo = {
            filter: {
                and: [
                    {
                        property: "cpf_paciente",
                        rich_text: {
                            equals: cpfNormalizado
                        }
                    },
                    {
                        property: "data_hora_inicio",
                        date: {
                            on_or_after: start_date
                        }
                    },
                    {
                        property: "data_hora_inicio",
                        date: {
                            before: diaSeguinte(end_date)
                        }
                    }
                ]
            },
            page_size: 100
        };
        if (cursor) {
            corpo.start_cursor = cursor;
        }
        const resultadoQuery = await chamarNotionAPI(`databases/${agendamentos_pageid}/query`, "POST", corpo);
        for (const page of resultadoQuery.results || []) {
            agendamentos.push(mapearPaginaParaAgendamento(page));
        }
        cursor = resultadoQuery.has_more ? resultadoQuery.next_cursor : undefined;
    } while (cursor);
    return agendamentos;
}
//# sourceMappingURL=buscarAgendamento.js.map