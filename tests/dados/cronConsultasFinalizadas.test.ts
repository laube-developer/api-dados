import { afterEach, beforeEach, describe, test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { buscarTableCronConsultasFinalizadas } from "../../src/database/config/cron/buscarTableCronConsultasFinalizadas";

const DATABASE_ID = "3df46144576980f6b498cd7a75b7bbb7";
const BASE_URL = "https://notion.example.invalid/v1";
const richText = (content: string) => ({ rich_text: [{ text: { content } }] });
const pagina = (id = "row", ativo: unknown = true) => ({
    id,
    properties: {
        nome: { title: [{ text: { content: "Consultas finalizadas" } }] },
        clinica: { relation: [{ id: "clinica-a" }] },
        cron: richText("30 14 * * *"), ativo: { checkbox: ativo },
        unidades: richText("10, 20"), webhookurl: { url: "https://webhook.example.invalid" },
    },
});
const esperado = {
    id: "row", nome: "Consultas finalizadas", clinicaId: "clinica-a", cron: "30 14 * * *",
    ativo: true, unidades: "10, 20", webhookurl: "https://webhook.example.invalid",
};

let urlOriginal: string | undefined;
beforeEach(t => {
    urlOriginal = process.env.NOTION_API_URL;
    process.env.NOTION_API_URL = BASE_URL;
    t.mock.method(globalThis, "fetch", async () => { throw new Error("Transporte externo não simulado"); });
    t.mock.method(console, "error", () => undefined);
});
afterEach(() => {
    if (urlOriginal === undefined) delete process.env.NOTION_API_URL;
    else process.env.NOTION_API_URL = urlOriginal;
});

function simularPaginas(t: TestContext, respostas: unknown[]) {
    let index = 0;
    const chamadas: { url: string; init: RequestInit | undefined }[] = [];
    t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
        assert.ok(index < respostas.length, "Requisição inesperada: possível paginação infinita");
        chamadas.push({ url: String(url), init });
        return Response.json(respostas[index++]);
    });
    return chamadas;
}

describe("leitura de cron consultas finalizadas", () => {
    test("consulta o ID fixo e pagina todas as linhas", async t => {
        const chamadas = simularPaginas(t, [
            { results: [pagina()], has_more: true, next_cursor: "cursor-2" },
            { results: [pagina("row-b", false)], has_more: false, next_cursor: null },
        ]);
        assert.deepEqual(await buscarTableCronConsultasFinalizadas(), [esperado, { ...esperado, id: "row-b", ativo: false }]);
        assert.equal(chamadas.length, 2);
        for (const chamada of chamadas) {
            assert.equal(chamada.url, `${BASE_URL}/databases/${DATABASE_ID}/query`);
            assert.equal(chamada.init?.method, "POST");
            assert.equal((chamada.init?.headers as Record<string, string>)["Notion-Version"], "2022-06-28");
        }
        assert.deepEqual(JSON.parse(String(chamadas[0]!.init?.body)), { page_size: 100 });
        assert.deepEqual(JSON.parse(String(chamadas[1]!.init?.body)), { page_size: 100, start_cursor: "cursor-2" });
    });

    test("sem cache: alterações e desativações aparecem na próxima leitura", async t => {
        const chamadas = simularPaginas(t, [
            { results: [pagina()], has_more: false },
            { results: [pagina("row", false)], has_more: false },
        ]);
        assert.equal((await buscarTableCronConsultasFinalizadas())[0]?.ativo, true);
        assert.equal((await buscarTableCronConsultasFinalizadas())[0]?.ativo, false);
        assert.equal(chamadas.length, 2);
    });

    test("retorna tabela vazia e ignora páginas arquivadas ou na lixeira", async t => {
        simularPaginas(t, [
            { results: [], has_more: false },
            { results: [{ ...pagina(), archived: true }, { ...pagina(), in_trash: true }, pagina("row-b")], has_more: false },
        ]);
        assert.deepEqual(await buscarTableCronConsultasFinalizadas(), []);
        assert.deepEqual(await buscarTableCronConsultasFinalizadas(), [{ ...esperado, id: "row-b" }]);
    });

    test("campos ausentes ficam vazios e não habilitam o job", async t => {
        simularPaginas(t, [{ results: [{ id: "incompleto" }], has_more: false }]);
        assert.deepEqual(await buscarTableCronConsultasFinalizadas(), [{
            id: "incompleto", nome: "", clinicaId: "", cron: "", ativo: false, unidades: "", webhookurl: "",
        }]);
    });

    test("somente checkbox booleano true habilita um registro", async t => {
        simularPaginas(t, [{ results: [false, "true", "false", 1, null].map((ativo, i) => pagina(String(i), ativo)), has_more: false }]);
        assert.ok((await buscarTableCronConsultasFinalizadas()).every(row => row.ativo === false));
    });

    test("lê Nome, plain_text, múltiplos fragmentos e webhook em rich_text", async t => {
        simularPaginas(t, [{ results: [{ id: "row", properties: {
            ...pagina().properties, nome: undefined,
            Nome: { title: [{ plain_text: " Consultas " }, { text: { content: "finalizadas " } }] },
            unidades: { rich_text: [{ plain_text: "10," }, { text: { content: " 20" } }] },
            webhookurl: richText(" https://webhook.example.invalid "),
        } }], has_more: false }]);
        assert.deepEqual(await buscarTableCronConsultasFinalizadas(), [esperado]);
    });

    test("não escolhe clínica arbitrariamente em relações ausentes, múltiplas ou incompletas", async t => {
        const relations = [
            { relation: [] }, { relation: [{ id: "a" }, { id: "b" }] },
            { relation: [{ id: "a" }], has_more: true },
        ];
        simularPaginas(t, [{ results: relations.map(clinica => ({ ...pagina(), properties: { ...pagina().properties, clinica } })), has_more: false }]);
        assert.ok((await buscarTableCronConsultasFinalizadas()).every(row => row.clinicaId === ""));
    });

    for (const [nome, resposta] of [
        ["results ausente", { has_more: false }],
        ["results inválido", { results: {}, has_more: false }],
        ["has_more ausente", { results: [] }],
        ["cursor ausente", { results: [], has_more: true }],
        ["cursor vazio", { results: [], has_more: true, next_cursor: " " }],
    ] as const) {
        test(`rejeita ${nome} sem produzir configuração parcial`, async t => {
            simularPaginas(t, [resposta]);
            await assert.rejects(buscarTableCronConsultasFinalizadas(), /inválida/);
        });
    }

    test("rejeita cursor repetido e interrompe a paginação", async t => {
        const chamadas = simularPaginas(t, [
            { results: [pagina()], has_more: true, next_cursor: "cursor" },
            { results: [], has_more: true, next_cursor: "cursor" },
        ]);
        await assert.rejects(buscarTableCronConsultasFinalizadas(), /Paginação inválida/);
        assert.equal(chamadas.length, 2);
    });

    test("propaga falha HTTP na segunda página sem retornar somente a primeira", async t => {
        let chamadas = 0;
        t.mock.method(globalThis, "fetch", async () => ++chamadas === 1
            ? Response.json({ results: [pagina()], has_more: true, next_cursor: "cursor" })
            : new Response("falha simulada", { status: 503 }));
        await assert.rejects(buscarTableCronConsultasFinalizadas(), /503/);
        assert.equal(chamadas, 2);
    });

    test("propaga falha de transporte", async t => {
        t.mock.method(globalThis, "fetch", async () => { throw new Error("falha simulada de rede"); });
        await assert.rejects(buscarTableCronConsultasFinalizadas(), /falha simulada de rede/);
    });
});
