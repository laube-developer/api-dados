import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { somarConsumo } from "../../../src/database/salus/estoque/consumo";

const bom = [
    { kit: "kit-a", material: "gaze", quantidade: 2 },
    { kit: "kit-a", material: "luva", quantidade: 1 },
    { kit: "kit-b", material: "gaze", quantidade: 3 },
];

describe("somarConsumo", () => {
    test("explode kit pelo BOM", () => {
        const consumo = somarConsumo({
            kits: [{ kit: "kit-a", quantidade: 2 }],
            materiais: [],
            composicao: bom,
        });
        const mapa = Object.fromEntries(consumo.map((c) => [c.material, c.quantidade]));
        assert.equal(mapa.gaze, 4);
        assert.equal(mapa.luva, 2);
    });

    test("soma materiais avulsos ao kit", () => {
        const consumo = somarConsumo({
            kits: [{ kit: "kit-a", quantidade: 1 }],
            materiais: [{ material: "gaze", quantidade: 5 }],
            composicao: bom,
        });
        const mapa = Object.fromEntries(consumo.map((c) => [c.material, c.quantidade]));
        assert.equal(mapa.gaze, 7);
        assert.equal(mapa.luva, 1);
    });

    test("registros.quantidade não entra no cálculo (não é parâmetro)", () => {
        const consumo = somarConsumo({
            kits: [{ kit: "kit-a", quantidade: 1 }],
            materiais: [],
            composicao: bom,
        });
        const mapa = Object.fromEntries(consumo.map((c) => [c.material, c.quantidade]));
        assert.equal(mapa.gaze, 2);
    });

    test("vários kits com o mesmo material somam", () => {
        const consumo = somarConsumo({
            kits: [
                { kit: "kit-a", quantidade: 1 },
                { kit: "kit-b", quantidade: 2 },
            ],
            materiais: [],
            composicao: bom,
        });
        const mapa = Object.fromEntries(consumo.map((c) => [c.material, c.quantidade]));
        assert.equal(mapa.gaze, 2 + 6);
        assert.equal(mapa.luva, 1);
    });
});
