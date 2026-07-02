import type * as interfaces from "../../utils/interfaces.js";
export declare class ErroValidacao extends Error {
    constructor(mensagem: string);
}
export declare function buscarAgendamentoPorId(id_unico: string): Promise<interfaces.Agendamento | null>;
//# sourceMappingURL=buscarAgendamentoPorId.d.ts.map