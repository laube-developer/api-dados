import { after, afterEach, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { criarApp } from "../../src/app";
import { ErroNaoEncontrado } from "../../src/database/estoque/erros";
import { servicosEstoque } from "../../src/database/estoque/servicos";
import { transacaoConfig } from "../../src/database/estoque/transacao";
import { dependenciasEstoque } from "../../src/database/estoque/deps";
import {
    TOKEN_TESTE,
    chamar,
    subirServidor,
    CONFIG_ESTOQUE_TESTE,
    comDominioEstoque,
} from "../helpers/http";

process.env.AUTH_TOKEN = TOKEN_TESTE;

const originais = { ...servicosEstoque };
const depsOriginais = { ...dependenciasEstoque };
const delaysOriginais = { ...transacaoConfig };

describe("ativar / desativar", () => {
    let url = "";
    let fechar: () => Promise<void> = async () => undefined;
    let ultimoAlterar: { tabela: string; id: string; dados: Record<string, unknown> } | null = null;
    let ultimoAdicionar: { tabela: string; dados: Record<string, unknown> } | null = null;

    before(async () => {
        transacaoConfig.delaysMs = [0, 0];
        transacaoConfig.dormir = async () => undefined;
        const servidor = await subirServidor(criarApp());
        url = servidor.url;
        fechar = servidor.fechar;
    });

    after(async () => {
        Object.assign(transacaoConfig, delaysOriginais);
        await fechar();
    });

    beforeEach(() => {
        ultimoAlterar = null;
        ultimoAdicionar = null;
        Object.assign(dependenciasEstoque, depsOriginais);
        dependenciasEstoque.buscarConfigEstoquePorDominio = async () => CONFIG_ESTOQUE_TESTE;
        Object.assign(servicosEstoque, originais);
        servicosEstoque.adicionar = async (tabela, dados) => {
            ultimoAdicionar = { tabela, dados };
            return { id: "forn-1", nome: "ACME", ativo: dados.ativo ?? true, ...dados };
        };
        servicosEstoque.alterar = async (tabela, id, dados) => {
            ultimoAlterar = { tabela, id, dados };
            return { id, nome: "ACME", ativo: dados.ativo, ...dados };
        };
        servicosEstoque.buscarPorId = async (_tabela, id) => ({ id, nome: "ACME", ativo: true });
    });

    afterEach(() => {
        Object.assign(servicosEstoque, originais);
        Object.assign(dependenciasEstoque, depsOriginais);
    });

    test("POST fornecedor sem ativo retorna 201", async () => {
        const res = await chamar(url, "POST", comDominioEstoque("/estoque/fornecedores"), {
            body: { nome: "ACME" },
        });
        assert.equal(res.status, 201);
        assert.equal(ultimoAdicionar?.tabela, "fornecedores");
        assert.equal("ativo" in (ultimoAdicionar?.dados ?? {}), false);
    });

    test("POST :id/ativar atualiza ativo=true", async () => {
        const res = await chamar(url, "POST", comDominioEstoque("/estoque/fornecedores/forn-1/ativar"));
        assert.equal(res.status, 200);
        assert.equal(res.json.dados.ativo, true);
        assert.deepEqual(ultimoAlterar, { tabela: "fornecedores", id: "forn-1", dados: { ativo: true } });
    });

    test("POST :id/desativar atualiza ativo=false", async () => {
        const res = await chamar(url, "POST", comDominioEstoque("/estoque/fornecedores/forn-1/desativar"));
        assert.equal(res.status, 200);
        assert.equal(res.json.dados.ativo, false);
        assert.deepEqual(ultimoAlterar?.dados, { ativo: false });
    });

    test("ativar registro inexistente retorna 404", async () => {
        servicosEstoque.alterar = async () => {
            throw new ErroNaoEncontrado("Registro não encontrado.");
        };
        const res = await chamar(url, "POST", comDominioEstoque("/estoque/fornecedores/x/ativar"));
        assert.equal(res.status, 404);
    });

    test("ativar em recurso sem ativo não existe (404)", async () => {
        const res = await chamar(url, "POST", comDominioEstoque("/estoque/materiais/m1/ativar"));
        assert.equal(res.status, 404);
    });
});
