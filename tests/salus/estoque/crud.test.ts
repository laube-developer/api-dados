import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { dependenciasEstoque } from "../../../src/database/salus/estoque/deps";
import {
    listar,
    listarPaginado,
    montarFiltroLista,
    parsePaginacao,
} from "../../../src/database/salus/estoque/crud";
import { recursoPorTabela } from "../../../src/database/salus/estoque/schema";

const originais = { ...dependenciasEstoque };

function paginaMaterial(id: string, nome: string, codigo = "") {
    return {
        id,
        archived: false,
        properties: {
            nome: { title: [{ text: { content: nome } }] },
            codigo: { rich_text: codigo ? [{ text: { content: codigo } }] : [] },
        },
    };
}

describe("listar estoque", () => {
    afterEach(() => {
        Object.assign(dependenciasEstoque, originais);
    });

    test("montarFiltroLista: q em pacientes inclui telefone", () => {
        const filtro = montarFiltroLista(recursoPorTabela("pacientes"), { q: "6199" });
        assert.deepEqual(filtro, {
            or: [
                { property: "nome", title: { contains: "6199" } },
                { property: "telefone", phone_number: { contains: "6199" } },
            ],
        });
    });

    test("montarFiltroLista: q faz OR em title e rich_text", () => {
        const filtro = montarFiltroLista(recursoPorTabela("materiais"), { q: "gaze" });
        assert.deepEqual(filtro, {
            or: [
                { property: "nome", title: { contains: "gaze" } },
                { property: "codigo", rich_text: { contains: "gaze" } },
            ],
        });
    });

    test("montarFiltroLista: ativo + q combinam com AND", () => {
        const filtro = montarFiltroLista(recursoPorTabela("fornecedores"), {
            q: "acme",
            ativo: "true",
        });
        assert.equal(filtro && "and" in filtro, true);
        const and = (filtro as { and: unknown[] }).and;
        assert.equal(and.length, 2);
        assert.deepEqual(and[1], { property: "ativo", checkbox: { equals: true } });
    });

    test("montarFiltroLista: intervalo de datas inclusivo", () => {
        const filtro = montarFiltroLista(recursoPorTabela("compras"), {
            data_hora_de: "2026-09-01",
            data_hora_ate: "2026-09-30",
        });
        assert.deepEqual(filtro, {
            and: [
                { property: "data_hora", date: { on_or_after: "2026-09-01T00:00:00" } },
                { property: "data_hora", date: { on_or_before: "2026-09-30T23:59:59" } },
            ],
        });
    });

    test("montarFiltroLista: relations CSV viram OR", () => {
        const filtro = montarFiltroLista(recursoPorTabela("itens_compra"), {
            compra: "c1,c2",
        });
        assert.deepEqual(filtro, {
            or: [
                { property: "compra", relation: { contains: "c1" } },
                { property: "compra", relation: { contains: "c2" } },
            ],
        });
    });

    test("parsePaginacao ignora ausência de limit e limita a 100", () => {
        assert.equal(parsePaginacao({}), undefined);
        assert.deepEqual(parsePaginacao({ limit: "10" }), { page: 1, limit: 10 });
        assert.deepEqual(parsePaginacao({ limit: "10", page: "3" }), { page: 3, limit: 10 });
        assert.deepEqual(parsePaginacao({ limit: "999", page: "1" }), { page: 1, limit: 100 });
        assert.equal(parsePaginacao({ limit: "0" }), undefined);
    });

    test("listar sem limit percorre todas as páginas Notion", async () => {
        const chamadas: unknown[] = [];
        dependenciasEstoque.buscarTabelasBanco = async () => [{ id: "db-mat", nome: "materiais" }];
        dependenciasEstoque.chamarNotionAPI = async (_endpoint, _metodo, corpo) => {
            chamadas.push(corpo);
            if (chamadas.length === 1) {
                return {
                    results: [paginaMaterial("1", "A"), paginaMaterial("2", "B")],
                    has_more: true,
                    next_cursor: "cur-2",
                };
            }
            return {
                results: [paginaMaterial("3", "C")],
                has_more: false,
            };
        };

        const itens = await listar("materiais");
        assert.equal(itens.length, 3);
        assert.equal(chamadas.length, 2);
        assert.equal((chamadas[1] as { start_cursor?: string }).start_cursor, "cur-2");
    });

    test("listarPaginado com limit não busca o banco inteiro e informa has_more", async () => {
        const chamadas: { page_size?: number }[] = [];
        const paginas = Array.from({ length: 15 }, (_, i) => paginaMaterial(String(i + 1), `M${i + 1}`));
        dependenciasEstoque.buscarTabelasBanco = async () => [{ id: "db-mat", nome: "materiais" }];
        dependenciasEstoque.chamarNotionAPI = async (_endpoint, _metodo, corpo) => {
            chamadas.push(corpo);
            const results = paginas.slice(0, corpo.page_size);
            return {
                results,
                has_more: paginas.length > corpo.page_size,
                next_cursor: paginas.length > corpo.page_size ? "x" : undefined,
            };
        };

        const pagina1 = await listarPaginado("materiais", { limit: "10", page: "1" });
        assert.equal(pagina1.itens.length, 10);
        assert.equal(pagina1.itens[0].nome, "M1");
        assert.deepEqual(pagina1.paginacao, { page: 1, limit: 10, has_more: true });
        assert.equal(chamadas.length, 1);
        assert.equal(chamadas[0].page_size, 11);

        chamadas.length = 0;
        const pagina2 = await listarPaginado("materiais", { limit: "10", page: "2" });
        assert.equal(pagina2.itens.length, 5);
        assert.equal(pagina2.itens[0].nome, "M11");
        assert.deepEqual(pagina2.paginacao, { page: 2, limit: 10, has_more: false });
        assert.equal(chamadas[0].page_size, 21);
    });

    test("listarPaginado envia o filtro montado para o Notion", async () => {
        let corpoRecebido: Record<string, unknown> | undefined;
        dependenciasEstoque.buscarTabelasBanco = async () => [{ id: "db-mat", nome: "materiais" }];
        dependenciasEstoque.chamarNotionAPI = async (_endpoint, _metodo, corpo) => {
            corpoRecebido = corpo;
            return { results: [], has_more: false };
        };

        await listarPaginado("materiais", { q: "luva", limit: "10" });
        assert.ok(corpoRecebido?.filter);
        assert.deepEqual(corpoRecebido.filter, {
            or: [
                { property: "nome", title: { contains: "luva" } },
                { property: "codigo", rich_text: { contains: "luva" } },
            ],
        });
    });

    test("listar medicos/pacientes usa database_id direto e não descobre na página", async () => {
        let buscouPagina = false;
        const endpoints: string[] = [];
        dependenciasEstoque.buscarTabelasBanco = async () => {
            buscouPagina = true;
            return [];
        };
        dependenciasEstoque.chamarNotionAPI = async (endpoint) => {
            endpoints.push(endpoint);
            return { results: [], has_more: false };
        };

        await listar("medicos", { limit: "10" });
        await listar("pacientes", { limit: "10" });

        assert.equal(buscouPagina, false);
        assert.equal(endpoints[0], "databases/38a461445769809a9b05d0e6fc5e50dd/query");
        assert.equal(endpoints[1], "databases/38a46144576980fea4b6d19fd96bff8d/query");
    });
});
