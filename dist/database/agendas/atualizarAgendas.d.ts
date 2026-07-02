import type * as interfaces from "../../utils/interfaces.js";
export declare class ErroValidacao extends Error {
    constructor(mensagem: string);
}
export declare class ErroNaoEncontrado extends Error {
    constructor(mensagem: string);
}
export declare function atualizarAgendas(agendas: unknown): Promise<interfaces.Agenda[]>;
//# sourceMappingURL=atualizarAgendas.d.ts.map