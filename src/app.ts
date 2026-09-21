import express from "express";
import { runWithBaseDeDadosId } from "./database/notion";
import { buscarClinicaPorId } from "./database/config/clinicas/buscarClinica";
import { responderErro } from "./utils/respostas";
import { bearerAuth } from "./middlewares/auth";
import { rotasDados } from "./routes/dados";
import { estoqueRouter } from "./routes/estoque";

export function criarApp() {
    const app = express();

    app.use(express.json());
    app.use(bearerAuth);
    app.use(async (req: express.Request, res: express.Response, next: express.NextFunction) => {
        try {
            const baseId = String(req.headers["x-base-de-dados-id"] ?? "").trim();
            const clinicaId = String(req.headers["x-clinica-id"] ?? "").trim();

            if (baseId) {
                runWithBaseDeDadosId(baseId, () => next());
                return;
            }

            if (clinicaId) {
                const clinica = await buscarClinicaPorId(clinicaId);
                if (!clinica) {
                    return responderErro(res, "Clínica não encontrada.", 404);
                }
                if (!clinica.base_de_dados_id) {
                    return responderErro(res, "Clínica sem base_de_dados_id configurada.", 422);
                }
                runWithBaseDeDadosId(clinica.base_de_dados_id, () => next());
                return;
            }

            next();
        } catch (error) {
            next(error);
        }
    });

    /**
     * Rotas de dados
     */
    app.use(rotasDados);
    app.use("/estoque", estoqueRouter);

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
