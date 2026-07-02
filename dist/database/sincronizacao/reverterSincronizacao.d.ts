import type * as interfaces from "../../utils/interfaces.js";
export declare class ErroValidacao extends Error {
    constructor(mensagem: string);
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
export declare function reverterSincronizacao(dados: ReversaoSincronizacao): Promise<void>;
//# sourceMappingURL=reverterSincronizacao.d.ts.map