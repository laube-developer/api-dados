export interface Paciente {
    nome: string;
    cpf?: string;
    id_unico: string;
    data_nascimento: string;
    email: string;
    telefone: string;
}

export type StatusAgendamento =
    | "CONFIRMED"
    | "SCHEDULED"
    | "IN_ATTENDANCE"
    | "ARRIVED"
    | "MISSED"
    | "DONE"
    | "CANCELED";

export const STATUS_AGENDAMENTO_VALIDOS: StatusAgendamento[] = [
    "CONFIRMED",
    "SCHEDULED",
    "IN_ATTENDANCE",
    "ARRIVED",
    "MISSED",
    "DONE",
    "CANCELED"
];

export interface Agendamento {
    id_agenda: string;
    id_unico: string;
    data_hora_inicio: string;
    data_hora_fim: string;
    id_medico: string;
    /** id_unico do paciente (plataforma / tabela pacientes). */
    id_paciente: string;
    nome_paciente: string;
    cpf_paciente?: string;
    id_tipo_procedimento: string;
    status: StatusAgendamento;
    guia_assinada: boolean;
    insurance_id: string;
}

export interface Tabela {
    id: string;
    nome: string;
}

export interface Medico {
    id_unico: string;
    nome: string;
}

export type AtualizacaoMedico = Partial<Medico> & { id_unico: string };

export interface Agenda {
    id_unico: string;
    nome: string;
}

export type AtualizacaoAgenda = Partial<Agenda> & { id_unico: string };

export type AtualizacaoPaciente = Partial<Paciente> & { cpf: string };

/** Atualização parcial; `guia_assinada` pode ser alterada pela recepção. */
export type AtualizacaoAgendamento = Partial<Agendamento> & { id_unico: string };

export interface RespostaSucesso<T> {
    sucesso: true;
    dados: T;
}

export interface RespostaErro {
    sucesso: false;
    erro: string;
}

export type RespostaApi<T> = RespostaSucesso<T> | RespostaErro;

export interface CronClinica {
    id: string;
    name: string;
    base_de_dados_id: string;
}

export interface CronIntegracao {
    name: string;
}

export interface CronTable {
    name: string;
    clinica: CronClinica;
    metadata: string;
    cron_rule: string;
    integracao: CronIntegracao;
    chave_segura: string;
}

/** Página da tabela `clinicas` no Notion. `id` = id da page. */
export interface Clinica {
    id: string;
    nome: string;
    base_de_dados_id: string;
}