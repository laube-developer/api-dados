import type * as interfaces from "../../utils/interfaces.js";
import { arquivarPagina, buscarPaginaPorCampoTexto } from "../notionHelpers.js";
import { atualizarAgendamentos } from "../agendamentos/atualizarAgendamentos.js";
import { atualizarAgendas } from "../agendas/atualizarAgendas.js";
import { atualizarMedicos } from "../medicos/atualizarMedicos.js";
import { atualizarPacientes } from "../pacientes/atualizarPacientes.js";

export class ErroValidacao extends Error {
    constructor(mensagem: string) {
        super(mensagem);
        this.name = "ErroValidacao";
    }
}

export interface ReversaoSincronizacao {
    medicos_criados?: string[];
    agendas_criadas?: string[];
    pacientes_criados?: string[];
    agendamentos_criados?: string[];
    medicos_anteriores?: interfaces.Medico[];
    agendas_anteriores?: interfaces.Agenda[];
    pacientes_anteriores?: interfaces.Paciente[];
    agendamentos_anteriores?: interfaces.Agendamento[];
}

function normalizarCpf(cpf: string): string {
    return cpf.replace(/\D/g, "");
}

async function arquivarPorIdUnico(nomeTabela: string, ids: string[]): Promise<void> {
    for (const id of ids) {
        const pagina = await buscarPaginaPorCampoTexto(nomeTabela, "id_unico", id);
        if (pagina) {
            await arquivarPagina(pagina.id);
        }
    }
}

async function arquivarPacientesPorCpf(cpfs: string[]): Promise<void> {
    for (const cpf of cpfs) {
        const pagina = await buscarPaginaPorCampoTexto("pacientes", "cpf", normalizarCpf(cpf));
        if (pagina) {
            await arquivarPagina(pagina.id);
        }
    }
}

export async function reverterSincronizacao(dados: ReversaoSincronizacao): Promise<void> {
    const erros: string[] = [];

    try {
        if (dados.agendamentos_criados?.length) {
            await arquivarPorIdUnico("agendamentos", dados.agendamentos_criados);
        }
    } catch (error) {
        erros.push(error instanceof Error ? error.message : "Erro ao arquivar agendamentos criados.");
    }

    try {
        if (dados.pacientes_criados?.length) {
            await arquivarPacientesPorCpf(dados.pacientes_criados);
        }
    } catch (error) {
        erros.push(error instanceof Error ? error.message : "Erro ao arquivar pacientes criados.");
    }

    try {
        if (dados.agendas_criadas?.length) {
            await arquivarPorIdUnico("agendas", dados.agendas_criadas);
        }
    } catch (error) {
        erros.push(error instanceof Error ? error.message : "Erro ao arquivar agendas criadas.");
    }

    try {
        if (dados.medicos_criados?.length) {
            await arquivarPorIdUnico("medicos", dados.medicos_criados);
        }
    } catch (error) {
        erros.push(error instanceof Error ? error.message : "Erro ao arquivar médicos criados.");
    }

    try {
        if (dados.agendamentos_anteriores?.length) {
            await atualizarAgendamentos(dados.agendamentos_anteriores);
        }
    } catch (error) {
        erros.push(error instanceof Error ? error.message : "Erro ao restaurar agendamentos atualizados.");
    }

    try {
        if (dados.pacientes_anteriores?.length) {
            await atualizarPacientes(dados.pacientes_anteriores);
        }
    } catch (error) {
        erros.push(error instanceof Error ? error.message : "Erro ao restaurar pacientes atualizados.");
    }

    try {
        if (dados.agendas_anteriores?.length) {
            await atualizarAgendas(dados.agendas_anteriores);
        }
    } catch (error) {
        erros.push(error instanceof Error ? error.message : "Erro ao restaurar agendas atualizadas.");
    }

    try {
        if (dados.medicos_anteriores?.length) {
            await atualizarMedicos(dados.medicos_anteriores);
        }
    } catch (error) {
        erros.push(error instanceof Error ? error.message : "Erro ao restaurar médicos atualizados.");
    }

    if (erros.length > 0) {
        throw new ErroValidacao(erros.join(" "));
    }
}