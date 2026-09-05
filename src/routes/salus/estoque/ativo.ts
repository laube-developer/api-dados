import type { Router } from "express";
import type { RecursoSchema } from "../../../database/salus/estoque/schema";
import { servicosEstoque } from "../../../database/salus/estoque/servicos";
import { responderSucesso } from "../../../utils/respostas";
import { tratar } from "./errosHttp";

export function registrarAtivo(router: Router, recurso: RecursoSchema) {
    const base = `/${recurso.slug}`;

    router.post(`${base}/:id/ativar`, tratar(async (req, res) => {
        const dados = await servicosEstoque.alterar(recurso.tabela, String(req.params.id ?? ""), { ativo: true });
        return responderSucesso(res, dados);
    }));

    router.post(`${base}/:id/desativar`, tratar(async (req, res) => {
        const dados = await servicosEstoque.alterar(recurso.tabela, String(req.params.id ?? ""), { ativo: false });
        return responderSucesso(res, dados);
    }));
}
