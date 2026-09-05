import type { Response } from "express";
import type { PaginacaoLista, RespostaErro, RespostaSucesso } from "./interfaces";

export function responderSucesso<T>(
    res: Response,
    dados: T,
    status = 200,
    paginacao?: PaginacaoLista
): Response<RespostaSucesso<T>> {
    const corpo: RespostaSucesso<T> = { sucesso: true, dados };
    if (paginacao) {
        corpo.paginacao = paginacao;
    }
    return res.status(status).json(corpo);
}

export function responderErro(res: Response, erro: string, status = 500): Response<RespostaErro> {
    return res.status(status).json({ sucesso: false, erro });
}