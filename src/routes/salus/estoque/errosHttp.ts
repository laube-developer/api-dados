import type { NextFunction, Request, Response } from "express";
import {
    ErroCompensacaoPendente,
    ErroNaoEncontrado,
    ErroOperacaoNaoConcluida,
    ErroSaldoInsuficiente,
    ErroValidacao,
} from "../../../database/salus/estoque/erros";
import { responderErro } from "../../../utils/respostas";

export function responderErroEstoque(res: Response, error: unknown) {
    if (error instanceof ErroValidacao || error instanceof ErroSaldoInsuficiente) {
        return responderErro(res, error.message, 400);
    }
    if (error instanceof ErroNaoEncontrado) {
        return responderErro(res, error.message, 404);
    }
    if (error instanceof ErroCompensacaoPendente) {
        return res.status(500).json({
            sucesso: false,
            erro: error.message,
            compensacao_pendente: true,
            pendencias: error.pendencias,
        });
    }
    if (error instanceof ErroOperacaoNaoConcluida) {
        return responderErro(res, error.message, 500);
    }
    const mensagem = error instanceof Error ? error.message : "Erro interno do servidor";
    return responderErro(res, mensagem);
}

export function tratar(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            await handler(req, res, next);
        } catch (error) {
            if (res.headersSent) {
                return next(error);
            }
            console.error(error);
            responderErroEstoque(res, error);
        }
    };
}
