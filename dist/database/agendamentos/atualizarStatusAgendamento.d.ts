import type * as interfaces from "../../utils/interfaces.js";
export declare class ErroValidacao extends Error {
    constructor(mensagem: string);
}
export declare class ErroNaoEncontrado extends Error {
    constructor(mensagem: string);
}
export declare function atualizarStatusAgendamento(id_unico: string, status: interfaces.StatusAgendamento): Promise<interfaces.Agendamento>;
//# sourceMappingURL=atualizarStatusAgendamento.d.ts.map