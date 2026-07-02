import type * as interfaces from "../../utils/interfaces.js";
export declare class ErroValidacao extends Error {
    constructor(mensagem: string);
}
export declare class ErroNaoEncontrado extends Error {
    constructor(mensagem: string);
}
export declare function atualizarAgendamentos(agendamentos: unknown): Promise<interfaces.Agendamento[]>;
//# sourceMappingURL=atualizarAgendamentos.d.ts.map