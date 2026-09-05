import { after, afterEach, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { criarApp } from "../../../src/app";
import { servicosEstoque } from "../../../src/database/salus/estoque/servicos";
import { comRetry, ehErroTransitorio, transacaoConfig } from "../../../src/database/salus/estoque/transacao";
import { ErroValidacao } from "../../../src/database/salus/estoque/erros";
import { TOKEN_TESTE, chamar, subirServidor } from "../../helpers/http";

process.env.AUTH_TOKEN = TOKEN_TESTE;
process.env.NOTION_SALUS_DATABASE_PAGE_ID = "page-salus-teste";

const originais = { ...servicosEstoque };
const delaysOriginais = { ...transacaoConfig };

describe("transacao (retry + compensação)", () => {
    test("ehErroTransitorio: 5xx sim, 4xx e validação não", () => {
        assert.equal(ehErroTransitorio(new Error("Falha na API do Notion [503]: x")), true);
        assert.equal(ehErroTransitorio(new Error("Falha na API do Notion [400]: x")), false);
        assert.equal(ehErroTransitorio(new ErroValidacao("x")), false);
        assert.equal(ehErroTransitorio(new Error("fetch failed")), true);
    });

    test("comRetry passa na 3ª tentativa", async () => {
        transacaoConfig.delaysMs = [0, 0];
        transacaoConfig.dormir = async () => undefined;
        let n = 0;
        const valor = await comRetry(async () => {
            n += 1;
            if (n < 3) throw new Error("Falha na API do Notion [500]: x");
            return "ok";
        });
        assert.equal(valor, "ok");
        assert.equal(n, 3);
        Object.assign(transacaoConfig, delaysOriginais);
    });

    describe("HTTP compras / registros", () => {
        let url = "";
        let fechar: () => Promise<void> = async () => undefined;
        let arquivados: string[] = [];
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
            arquivados = [];
            seq = 0;
            Object.assign(servicosEstoque, originais);
            servicosEstoque.adicionar = async (tabela, dados) => {
                seq += 1;
                return { id: `${tabela}-${seq}`, ...dados };
            };
            servicosEstoque.compensarPaginas = async (ids) => {
                arquivados.push(...ids);
            };
            servicosEstoque.aplicarDeltaSaldo = async () => ({ id: "e", material: "m", quantidade: 0, nome: "" });
            servicosEstoque.calcularConsumo = async () => [{ material: "mat-1", quantidade: 2 }];
            servicosEstoque.garantirSaldos = async () => undefined;
            servicosEstoque.comRetry = originais.comRetry;
            servicosEstoque.executarComCompensacao = originais.executarComCompensacao;
        });

        afterEach(() => {
            Object.assign(servicosEstoque, originais);
        });

        test("saldo falha 2x e passa na 3ª → 201 e compra não arquivada", async () => {
            let tentativas = 0;
            servicosEstoque.incrementarSaldo = async (material, quantidade) => {
                tentativas += 1;
                if (tentativas < 3) {
                    throw new Error("Falha na API do Notion [500]: timeout");
                }
                return { id: "est-1", material, quantidade, nome: "Gaze" };
            };

            const res = await chamar(url, "POST", "/salus/estoque/compras", {
                body: {
                    data_hora: "2026-09-03T10:00:00",
                    itens: [{ material: "mat-1", fornecedor: "forn-1", quantidade: 10 }],
                },
            });
            assert.equal(res.status, 201);
            assert.equal(tentativas, 3);
            assert.deepEqual(arquivados, []);
        });

        test("saldo falha 3x → arquiva compra+itens, 500", async () => {
            servicosEstoque.incrementarSaldo = async () => {
                throw new Error("Falha na API do Notion [500]: timeout");
            };

            const res = await chamar(url, "POST", "/salus/estoque/compras", {
                body: {
                    data_hora: "2026-09-03T10:00:00",
                    itens: [{ material: "mat-1", fornecedor: "forn-1", quantidade: 10 }],
                },
            });
            assert.equal(res.status, 500);
            assert.equal(res.json.sucesso, false);
            assert.equal(res.json.compensacao_pendente, undefined);
            assert.ok(arquivados.includes("compras-1"));
            assert.ok(arquivados.includes("itens_compra-2"));
        });

        test("compensação também falha → 500 com compensacao_pendente", async () => {
            servicosEstoque.incrementarSaldo = async () => {
                throw new Error("Falha na API do Notion [500]: timeout");
            };
            servicosEstoque.compensarPaginas = async () => {
                throw new Error("Falha na API do Notion [500]: archive");
            };
            servicosEstoque.aplicarDeltaSaldo = async () => {
                throw new Error("Falha na API do Notion [500]: saldo");
            };

            const res = await chamar(url, "POST", "/salus/estoque/compras", {
                body: {
                    data_hora: "2026-09-03T10:00:00",
                    itens: [{ material: "mat-1", fornecedor: "forn-1", quantidade: 10 }],
                },
            });
            assert.equal(res.status, 500);
            assert.equal(res.json.compensacao_pendente, true);
            assert.ok(Array.isArray(res.json.pendencias));
            assert.ok(res.json.pendencias.length > 0);
        });

        test("registro com baixa falha → arquiva registro/filhos", async () => {
            servicosEstoque.decrementarSaldo = async () => {
                throw new Error("Falha na API do Notion [500]: timeout");
            };

            const res = await chamar(url, "POST", "/salus/estoque/registros", {
                body: {
                    data_hora: "2026-09-03T11:00:00",
                    tipo_procedimento: "tp-1",
                    paciente: "pac-1",
                    medico: "med-1",
                    quantidade: 1,
                    kits: [{ kit: "kit-1", quantidade: 1 }],
                },
            });
            assert.equal(res.status, 500);
            assert.ok(arquivados.some((id) => id.startsWith("registros-")));
            assert.ok(arquivados.some((id) => id.startsWith("kits_registro-")));
        });
    });
});
