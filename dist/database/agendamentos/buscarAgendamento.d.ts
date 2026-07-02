import type * as interfaces from "../../utils/interfaces.js";
export declare class ErroValidacao extends Error {
    constructor(mensagem: string);
}
export declare function buscarAgendamento(cpf: string, start_date: string, end_date: string): Promise<interfaces.Agendamento[]>;
//# sourceMappingURL=buscarAgendamento.d.ts.map