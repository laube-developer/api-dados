import express from "express";
import { runWithBaseDeDadosId } from "../../../database/notion";
import { RECURSOS } from "../../../database/salus/estoque/schema";
import { responderErro } from "../../../utils/respostas";
import { registrarAtivo } from "./ativo";
import { registrarCompras } from "./compras";
import { criarRotasRecurso } from "./criarRotasRecurso";
import { registrarRegistros } from "./registros";

export const estoqueRouter = express.Router();

estoqueRouter.use((req, res, next) => {
    const pageId = String(process.env.NOTION_SALUS_DATABASE_PAGE_ID ?? "").trim();
    if (!pageId) {
        return responderErro(res, "NOTION_SALUS_DATABASE_PAGE_ID não configurado.", 500);
    }
    runWithBaseDeDadosId(pageId, () => next());
});

for (const recurso of RECURSOS) {
    criarRotasRecurso(estoqueRouter, recurso);
    if (recurso.temAtivo) {
        registrarAtivo(estoqueRouter, recurso);
    }
}

registrarCompras(estoqueRouter);
registrarRegistros(estoqueRouter);
