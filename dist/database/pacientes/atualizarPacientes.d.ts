import type * as interfaces from "../../utils/interfaces.js";
export declare class ErroValidacao extends Error {
    constructor(mensagem: string);
}
export declare class ErroNaoEncontrado extends Error {
    constructor(mensagem: string);
}
export declare function atualizarPacientes(pacientes: unknown): Promise<interfaces.Paciente[]>;
//# sourceMappingURL=atualizarPacientes.d.ts.map