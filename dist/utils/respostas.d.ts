import type { Response } from "express";
import type { RespostaErro, RespostaSucesso } from "./interfaces.js";
export declare function responderSucesso<T>(res: Response, dados: T, status?: number): Response<RespostaSucesso<T>>;
export declare function responderErro(res: Response, erro: string, status?: number): Response<RespostaErro>;
//# sourceMappingURL=respostas.d.ts.map