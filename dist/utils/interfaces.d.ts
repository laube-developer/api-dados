export interface Paciente {
    nome: string;
    cpf: string;
    id_unico: string;
    data_nascimento: string;
    email: string;
    telefone: string;
}
export type StatusAgendamento = "CONFIRMED" | "SCHEDULED" | "IN_ATTENDANCE" | "ARRIVED" | "MISSED" | "DONE" | "CANCELED";
export declare const STATUS_AGENDAMENTO_VALIDOS: StatusAgendamento[];
export interface Agendamento {
    id_agenda: string;
    id_unico: string;
    data_hora_inicio: string;
    data_hora_fim: string;
    id_medico: string;
    cpf_paciente: string;
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
export type AtualizacaoMedico = Partial<Medico> & {
    id_unico: string;
};
export interface Agenda {
    id_unico: string;
    nome: string;
}
export type AtualizacaoAgenda = Partial<Agenda> & {
    id_unico: string;
};
export type AtualizacaoPaciente = Partial<Paciente> & {
    cpf: string;
};
export type AtualizacaoAgendamento = Partial<Omit<Agendamento, "guia_assinada">> & {
    id_unico: string;
};
export interface RespostaSucesso<T> {
    sucesso: true;
    dados: T;
}
export interface RespostaErro {
    sucesso: false;
    erro: string;
}
export type RespostaApi<T> = RespostaSucesso<T> | RespostaErro;
//# sourceMappingURL=interfaces.d.ts.map