import type * as interfaces from "../../utils/interfaces.js";
import { normalizarDataHoraIso } from "../../utils/datas.js";
import { buscarPaginaPorCampoTexto } from "../notionHelpers.js";

export class ErroValidacao extends Error {
    constructor(mensagem: string) {
        super(mensagem);
        this.name = "ErroValidacao";
    }
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

export async function buscarAgendamentoPorId(id_unico: string): Promise<interfaces.Agendamento | null> {
    if (!id_unico?.trim()) {
        throw new ErroValidacao("O parâmetro 'id_unico' é obrigatório.");
    }

    const pagina = await buscarPaginaPorCampoTexto("agendamentos", "id_unico", id_unico.trim());

    if (!pagina) {
        return null;
    }

    return mapearPaginaParaAgendamento(pagina);
}