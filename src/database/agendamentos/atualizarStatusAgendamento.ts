import type * as interfaces from "../../utils/interfaces.js";
import { STATUS_AGENDAMENTO_VALIDOS } from "../../utils/interfaces.js";
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

function mapearPaginaParaAgendamento(page: any): interfaces.Agendamento {
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

export async function atualizarStatusAgendamento(
    id_unico: string,
    status: interfaces.StatusAgendamento
): Promise<interfaces.Agendamento> {
    if (!id_unico?.trim()) {
        throw new ErroValidacao("O campo 'id_unico' é obrigatório.");
    }

    if (!status || !STATUS_AGENDAMENTO_VALIDOS.includes(status)) {
        throw new ErroValidacao(
            `O campo 'status' é obrigatório e deve ser um dos seguintes: ${STATUS_AGENDAMENTO_VALIDOS.join(", ")}.`
        );
    }

    const tabelas = await buscarTabelasBanco();
    const tabelaAgendamentos = tabelas.find(tabela => tabela.nome === "agendamentos");

    if (!tabelaAgendamentos) {
        throw new Error("Tabela de agendamentos não encontrada na página base do Notion.");
    }

    const resultadoQuery = await chamarNotionAPI(`databases/${tabelaAgendamentos.id}/query`, "POST", {
        filter: {
            property: "id_unico",
            rich_text: {
                equals: id_unico.trim()
            }
        },
        page_size: 1
    });

    const pagina = resultadoQuery.results?.[0];

    if (!pagina) {
        throw new ErroNaoEncontrado("Agendamento não encontrado.");
    }

    const resultado = await chamarNotionAPI(`pages/${pagina.id}`, "PATCH", {
        properties: {
            status: {
                status: { name: status }
            }
        }
    });

    return mapearPaginaParaAgendamento(resultado);
}