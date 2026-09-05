import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { escreverCampo, jsonParaProperties, lerCampo, paginaParaJson } from "../../../src/database/salus/estoque/mapear";
import { recursoPorTabela } from "../../../src/database/salus/estoque/schema";

describe("mapear Notion ↔ JSON", () => {
    test("title e rich_text leem a posição [0]", () => {
        assert.equal(
            lerCampo({ title: [{ text: { content: "Gaze" } }] }, "title"),
            "Gaze"
        );
        assert.equal(
            lerCampo({ rich_text: [{ text: { content: "GZ-01" } }] }, "rich_text"),
            "GZ-01"
        );
        assert.equal(lerCampo({ title: [] }, "title"), "");
        assert.equal(lerCampo(undefined, "rich_text"), "");
    });

    test("relation vira uuid da primeira page", () => {
        assert.equal(
            lerCampo({ relation: [{ id: "mat-uuid" }, { id: "outro" }] }, "relation"),
            "mat-uuid"
        );
        assert.equal(lerCampo({ relation: [] }, "relation"), "");
    });

    test("phone_number lê e escreve o valor plano", () => {
        assert.equal(lerCampo({ phone_number: "61993862137" }, "phone_number"), "61993862137");
        assert.equal(lerCampo(undefined, "phone_number"), "");
        assert.deepEqual(escreverCampo("phone_number", "6199"), { phone_number: "6199" });
        assert.deepEqual(escreverCampo("phone_number", "  "), { phone_number: null });
    });

    test("checkbox ativo", () => {
        assert.equal(lerCampo({ checkbox: true }, "checkbox"), true);
        assert.equal(lerCampo({ checkbox: false }, "checkbox"), false);
        assert.equal(lerCampo(undefined, "checkbox"), false);
    });

    test("date ISO em date.start", () => {
        assert.equal(
            lerCampo({ date: { start: "2026-09-03T10:00:00" } }, "date"),
            "2026-09-03T10:00:00"
        );
    });

    test("paginaParaJson monta id + campos do schema", () => {
        const json = paginaParaJson(recursoPorTabela("fornecedores"), {
            id: "forn-1",
            properties: {
                nome: { title: [{ text: { content: "ACME" } }] },
                contato: { rich_text: [{ text: { content: "João" } }] },
                whatsapp: { rich_text: [] },
                email: { email: "a@b.com" },
                obs: { rich_text: [{ text: { content: "ok" } }] },
                ativo: { checkbox: true },
            },
        });
        assert.deepEqual(json, {
            id: "forn-1",
            nome: "ACME",
            contato: "João",
            whatsapp: "",
            email: "a@b.com",
            obs: "ok",
            ativo: true,
        });
    });

    test("criar fornecedor sem ativo preenche checkbox true", () => {
        const props = jsonParaProperties(recursoPorTabela("fornecedores"), { nome: "ACME" }, "criar");
        assert.deepEqual(props.ativo, { checkbox: true });
        assert.deepEqual(props.nome, { title: [{ text: { content: "ACME" } }] });
    });

    test("escreverCampo usa title/rich_text envelopados", () => {
        assert.deepEqual(escreverCampo("title", "Gaze"), {
            title: [{ text: { content: "Gaze" } }],
        });
        assert.deepEqual(escreverCampo("relation", "mat-uuid"), {
            relation: [{ id: "mat-uuid" }],
        });
    });
});
