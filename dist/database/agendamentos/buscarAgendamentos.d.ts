import type * as interfaces from "../../utils/interfaces.js";
export declare class ErroValidacao extends Error {
    constructor(mensagem: string);
}
export declare function buscarAgendamentos(start_date: string, end_date: string): Promise<interfaces.Agendamento[]>;
//# sourceMappingURL=buscarAgendamentos.d.ts.map