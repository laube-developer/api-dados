import type { Router } from "express";
import type { RecursoSchema } from "../../../database/salus/estoque/schema";
import { servicosEstoque } from "../../../database/salus/estoque/servicos";
import { responderSucesso } from "../../../utils/respostas";
import { tratar } from "./errosHttp";

export function criarRotasRecurso(router: Router, recurso: RecursoSchema) {
    const base = `/${recurso.slug}`;

    router.get(base, tratar(async (req, res) => {
        const dados = await servicosEstoque.listar(recurso.tabela, req.query as Record<string, unknown>);
        return responderSucesso(res, dados);
    }));

    router.get(`${base}/:id`, tratar(async (req, res) => {
        const dados = await servicosEstoque.buscarPorId(recurso.tabela, String(req.params.id ?? ""));
        return responderSucesso(res, dados);
    }));

    if (!recurso.postEspecial) {
        router.post(base, tratar(async (req, res) => {
            const dados = await servicosEstoque.adicionar(recurso.tabela, req.body ?? {});
            return responderSucesso(res, dados, 201);
        }));
    }

    if (!recurso.patchEspecial) {
        router.patch(`${base}/:id`, tratar(async (req, res) => {
            const dados = await servicosEstoque.alterar(recurso.tabela, String(req.params.id ?? ""), req.body ?? {});
            return responderSucesso(res, dados);
        }));
    }
}
