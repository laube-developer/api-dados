import { after, afterEach, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { criarApp } from "../../src/app";
import { ErroSaldoInsuficiente } from "../../src/database/estoque/erros";
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

describe("rotas /estoque", () => {
    let url = "";
    let fechar: () => Promise<void> = async () => undefined;
    let incrementos: { material: string; quantidade: number }[] = [];
    let baixas: { material: string; quantidade: number }[] = [];
    let seq = 0;

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
        incrementos = [];
        baixas = [];
        seq = 0;
        Object.assign(dependenciasEstoque, depsOriginais);
        dependenciasEstoque.buscarConfigEstoquePorDominio = async () => CONFIG_ESTOQUE_TESTE;
        Object.assign(servicosEstoque, originais);
        servicosEstoque.listar = async () => [{ id: "mat-1", nome: "Gaze", codigo: "GZ" }];
        servicosEstoque.listarPaginado = async () => ({
            itens: [{ id: "mat-1", nome: "Gaze", codigo: "GZ" }],
        });
        servicosEstoque.buscarPorId = async (_tabela, id) => ({ id, nome: "Gaze", codigo: "GZ" });
        servicosEstoque.adicionar = async (tabela, dados) => {
            seq += 1;
            return { id: `${tabela}-${seq}`, ...dados };
        };
        servicosEstoque.alterar = async (_tabela, id, dados) => ({ id, nome: "Gaze", ...dados });
        servicosEstoque.incrementarSaldo = async (material, quantidade) => {
            incrementos.push({ material, quantidade });
            return { id: "est-1", material, quantidade, nome: "Gaze" };
        };
        servicosEstoque.decrementarSaldo = async (material, quantidade) => {
            baixas.push({ material, quantidade });
            return { id: "est-1", material, quantidade: 0, nome: "Gaze" };
        };
        servicosEstoque.aplicarDeltaSaldo = async (material, delta) => {
            if (delta > 0) incrementos.push({ material, quantidade: delta });
            if (delta < 0) baixas.push({ material, quantidade: -delta });
            return { id: "est-1", material, quantidade: 0, nome: "Gaze" };
        };
        servicosEstoque.calcularConsumo = async () => [{ material: "mat-1", quantidade: 2 }];
        servicosEstoque.alocarConsumoPorLotes = async (consumo) =>
            consumo.map((item) => ({
                material: item.material,
                quantidade: item.quantidade,
                item_compra: "lote-1",
                custo: 20,
            }));
        servicosEstoque.garantirSaldos = async () => undefined;
        servicosEstoque.compensarPaginas = async () => undefined;
        servicosEstoque.comRetry = originais.comRetry;
        servicosEstoque.executarComCompensacao = originais.executarComCompensacao;
    });

    afterEach(() => {
        Object.assign(servicosEstoque, originais);
        Object.assign(dependenciasEstoque, depsOriginais);
    });

    test("GET /materiais sem token retorna 401", async () => {
        const res = await chamar(url, "GET", "/estoque/materiais", { token: null });
        assert.equal(res.status, 401);
        assert.equal(res.json.sucesso, false);
    });

    test("GET /materiais sem dominio retorna 400", async () => {
        const res = await chamar(url, "GET", "/estoque/materiais");
        assert.equal(res.status, 400);
        assert.equal(res.json.sucesso, false);
        assert.match(res.json.erro, /dominio é obrigatório/i);
    });

    test("GET /materiais com dominio desconhecido retorna 404", async () => {
        dependenciasEstoque.buscarConfigEstoquePorDominio = async () => null;
        const res = await chamar(url, "GET", "/estoque/materiais?dominio=nao-existe.example");
        assert.equal(res.status, 404);
        assert.equal(res.json.sucesso, false);
        assert.match(res.json.erro, /Domínio de estoque não encontrado/i);
    });

    test("CRUD materiais", async () => {
        const lista = await chamar(url, "GET", comDominioEstoque("/estoque/materiais"));
        assert.equal(lista.status, 200);
        assert.equal(lista.json.sucesso, true);
        assert.equal(lista.json.dados[0].nome, "Gaze");

        const um = await chamar(url, "GET", comDominioEstoque("/estoque/materiais/mat-1"));
        assert.equal(um.status, 200);
        assert.equal(um.json.dados.id, "mat-1");

        const criado = await chamar(url, "POST", comDominioEstoque("/estoque/materiais"), {
            body: { nome: "Luva", codigo: "LV" },
        });
        assert.equal(criado.status, 201);
        assert.equal(criado.json.dados.nome, "Luva");

        const patch = await chamar(url, "PATCH", comDominioEstoque("/estoque/materiais/mat-1"), {
            body: { codigo: "GZ-2" },
        });
        assert.equal(patch.status, 200);
        assert.equal(patch.json.dados.codigo, "GZ-2");
    });

    test("GET lista com limit inclui paginacao no envelope", async () => {
        servicosEstoque.listarPaginado = async () => ({
            itens: [{ id: "mat-1", nome: "Gaze", codigo: "GZ" }],
            paginacao: { page: 1, limit: 10, has_more: true },
        });
        const lista = await chamar(url, "GET", comDominioEstoque("/estoque/materiais?limit=10&page=1"));
        assert.equal(lista.status, 200);
        assert.deepEqual(lista.json.paginacao, { page: 1, limit: 10, has_more: true });
        assert.equal(lista.json.dados.length, 1);
    });

    test("POST compras com itens chama incremento", async () => {
        const res = await chamar(url, "POST", comDominioEstoque("/estoque/compras"), {
            body: {
                data_hora: "2026-09-03T10:00:00",
                obs: "",
                itens: [{ material: "mat-1", fornecedor: "forn-1", quantidade: 10 }],
            },
        });
        assert.equal(res.status, 201);
        assert.equal(res.json.sucesso, true);
        assert.deepEqual(incrementos, [{ material: "mat-1", quantidade: 10 }]);
        assert.ok(res.json.dados.id);
        assert.equal(res.json.dados.itens.length, 1);
    });

    test("POST registro com kit chama baixa", async () => {
        const res = await chamar(url, "POST", comDominioEstoque("/estoque/registros"), {
            body: {
                data_hora: "2026-09-03T11:00:00",
                tipo_procedimento: "tp-1",
                paciente: "pac-1",
                medico: "med-1",
                quantidade: 1,
                kits: [{ kit: "kit-1", quantidade: 1 }],
            },
        });
        assert.equal(res.status, 201);
        assert.deepEqual(baixas, [{ material: "mat-1", quantidade: 2 }]);
    });

    test("POST registro com saldo insuficiente retorna 400 e não cria", async () => {
        let adicionou = false;
        servicosEstoque.garantirSaldos = async () => {
            throw new ErroSaldoInsuficiente([{ material: "mat-1", necessario: 2, disponivel: 0 }]);
        };
        servicosEstoque.adicionar = async () => {
            adicionou = true;
            return { id: "x" };
        };
        const res = await chamar(url, "POST", comDominioEstoque("/estoque/registros"), {
            body: {
                data_hora: "2026-09-03T11:00:00",
                tipo_procedimento: "tp-1",
                paciente: "pac-1",
                medico: "med-1",
                quantidade: 1,
                kits: [{ kit: "kit-1", quantidade: 1 }],
            },
        });
        assert.equal(res.status, 400);
        assert.match(res.json.erro, /Saldo insuficiente/);
        assert.equal(adicionou, false);
        assert.deepEqual(baixas, []);
    });

    test("POST registro parte o consumo em lotes FIFO", async () => {
        const gravados: Record<string, unknown>[] = [];
        servicosEstoque.calcularConsumo = async () => [{ material: "mat-1", quantidade: 8 }];
        servicosEstoque.alocarConsumoPorLotes = async () => [
            { material: "mat-1", quantidade: 6, item_compra: "lote-antigo", custo: 60 },
            { material: "mat-1", quantidade: 2, item_compra: "lote-novo", custo: 40 },
        ];
        servicosEstoque.adicionar = async (tabela, dados) => {
            seq += 1;
            const linha = { id: `${tabela}-${seq}`, ...dados };
            if (tabela === "materiais_registro") gravados.push(linha);
            return linha;
        };
        const res = await chamar(url, "POST", comDominioEstoque("/estoque/registros"), {
            body: {
                data_hora: "2026-09-03T11:00:00",
                paciente: "pac-1",
                medico: "med-1",
                materiais: [{ material: "mat-1", quantidade: 8 }],
            },
        });
        assert.equal(res.status, 201);
        assert.equal(gravados.length, 2);
        assert.equal(gravados[0]?.item_compra, "lote-antigo");
        assert.equal(gravados[0]?.quantidade, 6);
        assert.equal(gravados[0]?.custo, 60);
        assert.equal(gravados[1]?.item_compra, "lote-novo");
        assert.equal(gravados[1]?.quantidade, 2);
        assert.equal(gravados[1]?.custo, 40);
        assert.deepEqual(baixas, [{ material: "mat-1", quantidade: 8 }]);
        assert.equal(res.json.dados.materiais.length, 2);
    });
});
