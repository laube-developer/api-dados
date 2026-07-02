import { arquivarPagina, buscarPaginaPorCampoTexto } from "../notionHelpers.js";
import { atualizarAgendamentos } from "../agendamentos/atualizarAgendamentos.js";
import { atualizarAgendas } from "../agendas/atualizarAgendas.js";
import { atualizarMedicos } from "../medicos/atualizarMedicos.js";
import { atualizarPacientes } from "../pacientes/atualizarPacientes.js";
export class ErroValidacao extends Error {
    constructor(mensagem) {
        super(mensagem);
        this.name = "ErroValidacao";
    }
}
function normalizarCpf(cpf) {
    return cpf.replace(/\D/g, "");
}
async function arquivarPorIdUnico(nomeTabela, ids) {
    for (const id of ids) {
        const pagina = await buscarPaginaPorCampoTexto(nomeTabela, "id_unico", id);
        if (pagina) {
            await arquivarPagina(pagina.id);
        }
    }
}
async function arquivarPacientesPorCpf(cpfs) {
    for (const cpf of cpfs) {
        const pagina = await buscarPaginaPorCampoTexto("pacientes", "cpf", normalizarCpf(cpf));
        if (pagina) {
            await arquivarPagina(pagina.id);
        }
    }
}
export async function reverterSincronizacao(dados) {
    const erros = [];
    try {
        if (dados.agendamentos_criados?.length) {
            await arquivarPorIdUnico("agendamentos", dados.agendamentos_criados);
        }
    }
    catch (error) {
        erros.push(error instanceof Error ? error.message : "Erro ao arquivar agendamentos criados.");
    }
    try {
        if (dados.pacientes_criados?.length) {
            await arquivarPacientesPorCpf(dados.pacientes_criados);
        }
    }
    catch (error) {
        erros.push(error instanceof Error ? error.message : "Erro ao arquivar pacientes criados.");
    }
    try {
        if (dados.agendas_criadas?.length) {
            await arquivarPorIdUnico("agendas", dados.agendas_criadas);
        }
    }
    catch (error) {
        erros.push(error instanceof Error ? error.message : "Erro ao arquivar agendas criadas.");
    }
    try {
        if (dados.medicos_criados?.length) {
            await arquivarPorIdUnico("medicos", dados.medicos_criados);
        }
    }
    catch (error) {
        erros.push(error instanceof Error ? error.message : "Erro ao arquivar médicos criados.");
    }
    try {
        if (dados.agendamentos_anteriores?.length) {
            await atualizarAgendamentos(dados.agendamentos_anteriores);
        }
    }
    catch (error) {
        erros.push(error instanceof Error ? error.message : "Erro ao restaurar agendamentos atualizados.");
    }
    try {
        if (dados.pacientes_anteriores?.length) {
            await atualizarPacientes(dados.pacientes_anteriores);
        }
    }
    catch (error) {
        erros.push(error instanceof Error ? error.message : "Erro ao restaurar pacientes atualizados.");
    }
    try {
        if (dados.agendas_anteriores?.length) {
            await atualizarAgendas(dados.agendas_anteriores);
        }
    }
    catch (error) {
        erros.push(error instanceof Error ? error.message : "Erro ao restaurar agendas atualizadas.");
    }
    try {
        if (dados.medicos_anteriores?.length) {
            await atualizarMedicos(dados.medicos_anteriores);
        }
    }
    catch (error) {
        erros.push(error instanceof Error ? error.message : "Erro ao restaurar médicos atualizados.");
    }
    if (erros.length > 0) {
        throw new ErroValidacao(erros.join(" "));
    }
}
//# sourceMappingURL=reverterSincronizacao.js.map