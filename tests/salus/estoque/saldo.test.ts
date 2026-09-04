import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { dependenciasEstoque } from "../../../src/database/salus/estoque/deps";
import { ErroSaldoInsuficiente } from "../../../src/database/salus/estoque/erros";
import { aplicarDeltaSaldo, decrementarSaldo, incrementarSaldo, obterSaldo } from "../../../src/database/salus/estoque/saldo";

const originais = { ...dependenciasEstoque };

type Pagina = {
    id: string;
    archived?: boolean;
    parent?: { database_id: string };
    properties: Record<string, any>;
};

function valorRelation(prop: any): string {
    return prop?.relation?.[0]?.id ?? "";
}

function valorNumber(prop: any): number {
    return typeof prop?.number === "number" ? prop.number : 0;
}

describe("saldo", () => {
    let paginas: Pagina[];
    let seq: number;

    beforeEach(() => {
        paginas = [
            {
                id: "mat-gaze",
                properties: { nome: { title: [{ text: { content: "Gaze" } }] } },
            },
        ];
        seq = 0;

        dependenciasEstoque.buscarTabelasBanco = async () => [
            { id: "db-estoque", nome: "estoque" },
            { id: "db-materiais", nome: "materiais" },
        ];

        dependenciasEstoque.chamarNotionAPI = async (endpoint: string, metodo = "GET", corpo?: any, opcoes?: { permitir404?: boolean }) => {
            if (endpoint === "databases/db-estoque/query" && metodo === "POST") {
                const materialId = corpo?.filter?.relation?.contains;
                const results = paginas.filter((p) => {
                    if (p.parent?.database_id !== "db-estoque" || p.archived) return false;
                    if (materialId) return valorRelation(p.properties.material) === materialId;
                    return true;
                });
                return { results, has_more: false };
            }

            if (endpoint === "pages" && metodo === "POST") {
                seq += 1;
                const page: Pagina = {
                    id: `est-${seq}`,
                    parent: corpo.parent,
                    properties: corpo.properties,
                };
                paginas.push(page);
                return page;
            }

            if (endpoint.startsWith("pages/") && metodo === "PATCH") {
                const id = endpoint.slice("pages/".length);
                const page = paginas.find((p) => p.id === id);
                if (!page) {
                    throw new Error("Falha na API do Notion [404]: not found");
                }
                page.properties = { ...page.properties, ...(corpo?.properties ?? {}) };
                return page;
            }

            if (endpoint.startsWith("pages/") && metodo === "GET") {
                const id = endpoint.slice("pages/".length);
                const page = paginas.find((p) => p.id === id);
                if (!page) {
                    if (opcoes?.permitir404) return null;
                    throw new Error("Falha na API do Notion [404]: not found");
                }
                return page;
            }

            throw new Error(`endpoint não mockado: ${metodo} ${endpoint}`);
        };
    });

    afterEach(() => {
        Object.assign(dependenciasEstoque, originais);
    });

    test("cria linha de estoque na primeira entrada", async () => {
        const linha = await incrementarSaldo("mat-gaze", 10);
        assert.equal(linha.material, "mat-gaze");
        assert.equal(linha.quantidade, 10);
        assert.equal(linha.nome, "Gaze");
        assert.equal(await obterSaldo("mat-gaze"), 10);
        assert.equal(paginas.filter((p) => p.parent?.database_id === "db-estoque").length, 1);
    });

    test("incrementa a linha existente", async () => {
        await incrementarSaldo("mat-gaze", 10);
        const linha = await incrementarSaldo("mat-gaze", 5);
        assert.equal(linha.quantidade, 15);
        assert.equal(await obterSaldo("mat-gaze"), 15);
    });

    test("decrementa o saldo", async () => {
        await incrementarSaldo("mat-gaze", 10);
        const linha = await decrementarSaldo("mat-gaze", 3);
        assert.equal(linha.quantidade, 7);
    });

    test("recusa saldo negativo", async () => {
        await incrementarSaldo("mat-gaze", 2);
        await assert.rejects(
            () => decrementarSaldo("mat-gaze", 5),
            ErroSaldoInsuficiente
        );
        assert.equal(await obterSaldo("mat-gaze"), 2);
    });

    test("delta de PATCH soma ou subtrai", async () => {
        await incrementarSaldo("mat-gaze", 10);
        await aplicarDeltaSaldo("mat-gaze", 4);
        assert.equal(await obterSaldo("mat-gaze"), 14);
        await aplicarDeltaSaldo("mat-gaze", -6);
        assert.equal(await obterSaldo("mat-gaze"), 8);
        await assert.rejects(() => aplicarDeltaSaldo("mat-gaze", -20), ErroSaldoInsuficiente);
        assert.equal(await obterSaldo("mat-gaze"), 8);
    });
});
