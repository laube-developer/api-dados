import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { alocarFifo, custoProporcional, type LoteMaterial } from "../../src/database/estoque/lotes";

function lote(parcial: Partial<LoteMaterial> & { id: string }): LoteMaterial {
    return {
        material: "gaze",
        quantidade: parcial.quantidade ?? parcial.restante ?? 0,
        custo: 0,
        restante: 0,
        data_hora: "2026-01-01",
        ...parcial,
    };
}

describe("custoProporcional", () => {
    test("reparte o custo total do lote pela quantidade usada", () => {
        assert.equal(custoProporcional(60, 6, 6), 60);
        assert.equal(custoProporcional(200, 10, 2), 40);
        assert.equal(custoProporcional(10, 1, 1), 10);
    });

    test("lote vazio ou quantidade 0 vira 0", () => {
        assert.equal(custoProporcional(10, 0, 1), 0);
        assert.equal(custoProporcional(10, 5, 0), 0);
    });
});

describe("alocarFifo", () => {
    test("6 do lote antigo e 2 do lote novo", () => {
        const fatias = alocarFifo(
            [
                lote({
                    id: "lote-novo",
                    quantidade: 10,
                    restante: 10,
                    custo: 200,
                    data_hora: "2026-02-01",
                }),
                lote({
                    id: "lote-antigo",
                    quantidade: 6,
                    restante: 6,
                    custo: 60,
                    data_hora: "2026-01-01",
                }),
            ],
            8
        );
        assert.deepEqual(fatias, [
            { item_compra: "lote-antigo", quantidade: 6, custo: 60 },
            { item_compra: "lote-novo", quantidade: 2, custo: 40 },
        ]);
    });

    test("um lote cobre o consumo", () => {
        const fatias = alocarFifo(
            [lote({ id: "unico", quantidade: 10, restante: 10, custo: 100, data_hora: "2026-01-01" })],
            3
        );
        assert.deepEqual(fatias, [{ item_compra: "unico", quantidade: 3, custo: 30 }]);
    });

    test("pula lote esgotado", () => {
        const fatias = alocarFifo(
            [
                lote({ id: "vazio", quantidade: 4, restante: 0, custo: 40, data_hora: "2026-01-01" }),
                lote({ id: "cheio", quantidade: 5, restante: 5, custo: 100, data_hora: "2026-02-01" }),
            ],
            2
        );
        assert.deepEqual(fatias, [{ item_compra: "cheio", quantidade: 2, custo: 40 }]);
    });

    test("sobra sem lote quando as compras não cobrem", () => {
        const fatias = alocarFifo(
            [lote({ id: "pouco", quantidade: 2, restante: 2, custo: 20, data_hora: "2026-01-01" })],
            5
        );
        assert.deepEqual(fatias, [
            { item_compra: "pouco", quantidade: 2, custo: 20 },
            { item_compra: "", quantidade: 3, custo: 0 },
        ]);
    });
});
