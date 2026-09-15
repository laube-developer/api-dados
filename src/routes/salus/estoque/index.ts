import express from "express";
import { buscarConfigEstoquePorDominio, isHostLocalEstoque } from "../../../database/config/estoque/buscarEstoquePorDominio";
import { runWithEstoqueTenant } from "../../../database/config/estoque/estoqueTenant";
import { ErroValidacaoClinica } from "../../../database/config/clinicas/buscarClinica";
import { runWithBaseDeDadosId } from "../../../database/notion";
import { RECURSOS } from "../../../database/salus/estoque/schema";
import { responderErro } from "../../../utils/respostas";
import { normalizarDominio } from "../../../database/config/clinicas/buscarDominioConfirmacao";
import { registrarAtivo } from "./ativo";
import { registrarCompras } from "./compras";
import { criarRotasRecurso } from "./criarRotasRecurso";
import { registrarRegistros } from "./registros";

export const estoqueRouter = express.Router();

function dominioDaRequest(req: express.Request): string {
    const query = String(req.query.dominio ?? "").trim();
    if (query) return normalizarDominio(query);

    const headerExplicito = String(req.headers["x-estoque-dominio"] ?? "").trim();
    if (headerExplicito) return normalizarDominio(headerExplicito);

    const forwarded = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "");
    const host = normalizarDominio(forwarded);
    if (host.startsWith("estoque.")) return host;
    return "";
}

estoqueRouter.use(async (req, res, next) => {
    try {
        const dominio = dominioDaRequest(req);
        if (dominio && !isHostLocalEstoque(dominio)) {
            const cfg = await buscarConfigEstoquePorDominio(dominio);
            if (!cfg) {
                return responderErro(res, "Domínio de estoque não encontrado", 404);
            }
            if (!cfg.estoque_database_page_id) {
                return responderErro(res, "estoque_database_page_id não configurado para este domínio", 500);
            }
            return runWithEstoqueTenant(cfg, () =>
                runWithBaseDeDadosId(cfg.estoque_database_page_id, () => next())
            );
        }

        const pageId = String(process.env.NOTION_SALUS_DATABASE_PAGE_ID ?? "").trim();
        if (!pageId) {
            return responderErro(res, "NOTION_SALUS_DATABASE_PAGE_ID não configurado.", 500);
        }
        return runWithBaseDeDadosId(pageId, () => next());
    } catch (error) {
        if (error instanceof ErroValidacaoClinica) {
            return responderErro(res, error.message, 400);
        }
        next(error);
    }
});

for (const recurso of RECURSOS) {
    criarRotasRecurso(estoqueRouter, recurso);
    if (recurso.temAtivo) {
        registrarAtivo(estoqueRouter, recurso);
    }
}

registrarCompras(estoqueRouter);
registrarRegistros(estoqueRouter);
