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

export interface PaginacaoLista {
    page: number;
    limit: number;
    has_more: boolean;
}

export interface RespostaSucesso<T> {
    sucesso: true;
    dados: T;
    paginacao?: PaginacaoLista;
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
    integracao: CronIntegracao;
    chave_segura: string;
    botconversa_msg_url: string;
    cron: string;
    tipo_antecedencia: string;
    antecedencia: number;
    tipo_dia: string;
    unidades: string;
    medicos: string;
    ativo: boolean;
}

/** Página da tabela `clinicas` no Notion. `id` = id da page. */
export interface Clinica {
    id: string;
    nome: string;
    base_de_dados_id: string;
    whatsapp: string;
}

/** Linha da tabela Notion `dominios_confirmacao`. */
export interface DominioConfirmacao {
    dominio: string;
    clinica: Clinica;
}

/** Linha da tabela Notion `gestao > estoque`. */
export interface ConfigEstoquePorDominio {
    dominio: string;
    clinica: Clinica | null;
    estoque_database_page_id: string;
    medicos_database_id: string;
    pacientes_database_id: string;
}

export interface EstoqueTipoProcedimento { id: string; nome: string; }
export interface EstoqueMaterial { id: string; nome: string; codigo: string; }
export interface EstoqueFornecedor {
    id: string;
    nome: string;
    contato: string;
    whatsapp: string;
    email: string;
    obs: string;
    ativo: boolean;
}
export interface EstoqueCompra { id: string; data_hora: string; obs: string; }
export interface EstoqueItemCompra {
    id: string;
    compra: string;
    material: string;
    fornecedor: string;
    quantidade: number;
}
export interface EstoqueKit { id: string; nome: string; tipo_procedimento: string; }
export interface EstoqueKitMaterial {
    id: string;
    kit: string;
    material: string;
    quantidade: number;
}
export interface EstoqueMedico { id: string; nome: string; especialidade: string; }
export interface EstoquePaciente {
    id: string;
    nome: string;
    cpf: string;
    id_unico: string;
    telefone: string;
}
export interface EstoqueRegistro {
    id: string;
    data_hora: string;
    tipo_procedimento: string;
    paciente: string;
    medico: string;
    obs: string;
}
export interface EstoqueKitRegistro {
    id: string;
    registro: string;
    kit: string;
    quantidade: number;
}
export interface EstoqueMaterialRegistro {
    id: string;
    registro: string;
    material: string;
    quantidade: number;
}
export interface EstoqueSaldo {
    id: string;
    material: string;
    quantidade: number;
    nome: string;
}