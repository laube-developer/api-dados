import type * as interfaces from "../../utils/interfaces.js";
import { buscarTabelasBanco, chamarNotionAPI } from "../notion.js";
import {
    ErroValidacao,
    criarPropriedadesNotionAgendamento,
    mapearPaginaParaAgendamento,
    normalizarDadosAgendamento,
    validarDadosAgendamento,
} from "./adicionarAgendamento.js";

function validarListaAgendamentos(agendamentos: unknown): interfaces.Agendamento[] {
    if (!Array.isArray(agendamentos)) {
        throw new ErroValidacao("O campo 'agendamentos' deve ser um array.");
    }

    if (agendamentos.length === 0) {
        throw new ErroValidacao("O campo 'agendamentos' não pode estar vazio.");
    }

    const erros: string[] = [];
    const agendamentosValidados: interfaces.Agendamento[] = [];

    agendamentos.forEach((agendamento, indice) => {
        try {
            const dadosNormalizados = normalizarDadosAgendamento(agendamento as interfaces.Agendamento);
            validarDadosAgendamento(dadosNormalizados);
            agendamentosValidados.push(dadosNormalizados);
        } catch (error) {
            const mensagem = error instanceof Error ? error.message : "Dados inválidos";
            erros.push(`Item ${indice + 1}: ${mensagem}`);
        }
    });

    if (erros.length > 0) {
        throw new ErroValidacao(erros.join(" "));
    }

    return agendamentosValidados;
}

export async function adicionarAgendamentos(agendamentos: unknown): Promise<interfaces.Agendamento[]> {
    const agendamentosValidados = validarListaAgendamentos(agendamentos);

    const tabelas = await buscarTabelasBanco();
    const tabelaAgendamentos = tabelas.find((tabela) => tabela.nome === "agendamentos");

    if (!tabelaAgendamentos) {
        throw new Error("Tabela de agendamentos não encontrada na página base do Notion.");
    }

    const agendamentosCriados: interfaces.Agendamento[] = [];

    for (const agendamento of agendamentosValidados) {
        const resultado = await chamarNotionAPI("pages", "POST", {
            parent: { database_id: tabelaAgendamentos.id },
            properties: criarPropriedadesNotionAgendamento(agendamento),
        });

        agendamentosCriados.push(mapearPaginaParaAgendamento(resultado));
    }

    return agendamentosCriados;
}