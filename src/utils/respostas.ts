import type { Response } from "express";
import type { RespostaErro, RespostaSucesso } from "./interfaces";

export function responderSucesso<T>(res: Response, dados: T, status = 200): Response<RespostaSucesso<T>> {
    return res.status(status).json({ sucesso: true, dados });
}

export function responderErro(res: Response, erro: string, status = 500): Response<RespostaErro> {
    return res.status(status).json({ sucesso: false, erro });
}