import type * as interfaces from "../../utils/interfaces.js";
export declare class ErroValidacao extends Error {
    constructor(mensagem: string);
}
export declare function normalizarDadosAgendamento(dados: interfaces.Agendamento): interfaces.Agendamento;
export declare function validarDadosAgendamento(dados: interfaces.Agendamento): void;
export declare function criarPropriedadesNotionAgendamento(dados: interfaces.Agendamento): Record<string, unknown>;
export declare function mapearPaginaParaAgendamento(page: any): interfaces.Agendamento;
export declare function adicionarAgendamento(dados: interfaces.Agendamento): Promise<interfaces.Agendamento>;
//# sourceMappingURL=adicionarAgendamento.d.ts.map