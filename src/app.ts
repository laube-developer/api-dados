import express from "express";
import { runWithBaseDeDadosId } from "./database/notion";
import { responderErro } from "./utils/respostas";
import { bearerAuth } from "./middlewares/auth";
import { rotasDados } from "./routes/dados";
import { estoqueRouter } from "./routes/salus/estoque";

export function criarApp() {
    const app = express();

    app.use(express.json());
    app.use(bearerAuth);
    app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
        const baseId = String(req.headers["x-base-de-dados-id"] ?? "").trim();
        if (!baseId) {
            next();
            return;
        }
        runWithBaseDeDadosId(baseId, () => next());
    });

    /**
     * Rotas de dados
     */
    app.use(rotasDados);
    app.use("/salus/estoque", estoqueRouter);

    app.use((req: express.Request, res: express.Response) => {
        return responderErro(res, "Rota não encontrada", 404);
    });

    app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
        if (res.headersSent) {
            return next(error);
        }

        console.error(`[${new Date().toISOString()}] Erro não tratado em ${req.method} ${req.path}:`, error);
        const mensagem = error instanceof Error ? error.message : "Erro interno do servidor";
        return responderErro(res, mensagem);
    });

    return app;
}
