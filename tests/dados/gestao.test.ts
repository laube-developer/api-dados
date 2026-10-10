import { beforeEach, afterEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import express from "express";
import { catalogoGestao, gravarGestao, listarGestao, prepararGestao, propriedadeGestao, reconciliarGestao, registroGestao } from "../../src/database/gestao.js";
import { rotasGestao } from "../../src/routes/gestao.js";
import type { GestaoComando } from "../../src/utils/interfaces.js";

const ids = {
    cron: "3ca46144576980ae9ec4e4d6451e04ef", joins: "3ca46144576980d9a217c1ef041fe47c", finalizadas: "3df46144576980f6b498cd7a75b7bbb7",
    clinicas: "11111111-1111-4111-8111-111111111111", integracoes: "22222222-2222-4222-8222-222222222222",
    row: "33333333-3333-4333-8333-333333333333", clinica: "44444444-4444-4444-8444-444444444444", op: "55555555-5555-4555-8555-555555555555",
};
const title = (s: string) => ({ type: "title", title: [{ type: "text", text: { content: s } }] });
const rich = (s: string) => ({ type: "rich_text", rich_text: [{ type: "text", text: { content: s } }] });
const schema = {
    nome: { type: "title" }, ativo: { type: "checkbox" }, cron: { type: "rich_text" }, unidades: { type: "rich_text" },
    clinica: { type: "relation", relation: { database_id: ids.clinicas } }, webhookurl: { type: "url" },
    chave_segura: { type: "rich_text" }, formula: { type: "formula" },
};
let page: any;
let calls: { path: string; method: string; body: any }[];
let overrides: (path: string, init?: RequestInit) => unknown;
let savedEnv: Record<string, string | undefined>;
beforeEach(() => {
    savedEnv = Object.fromEntries(["NOTION_API_TOKEN", "NOTION_API_URL", "GESTAO_API_TOKEN", "GESTAO_NOTION_PAGE_ID", "AUTH_TOKEN"].map(k => [k, process.env[k]]));
    process.env.NOTION_API_TOKEN = "fake"; process.env.NOTION_API_URL = "https://notion.example.invalid/v1"; process.env.GESTAO_API_TOKEN = "admin-api-token"; delete process.env.GESTAO_NOTION_PAGE_ID;
    page = { id: ids.row, parent: { database_id: ids.finalizadas }, last_edited_time: "2026-10-09T12:00:00Z", archived: false, properties: { nome: title("Consultas"), ativo: { type: "checkbox", checkbox: true }, cron: rich("30 14 * * *"), unidades: rich("10,20"), clinica: { type: "relation", relation: [{ id: ids.clinica }] }, webhookurl: { type: "url", url: "https://hook.example.invalid" }, chave_segura: rich("segredo-simulado"), formula: { type: "formula", formula: { string: "calculado" } } };
    calls = []; overrides = () => undefined;
    mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
        const u = new URL(String(url)); assert.equal(u.hostname, "notion.example.invalid");
        const path = u.pathname.replace("/v1/", "");
        calls.push({ path, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
        const custom = overrides(path, init);
        if (custom instanceof Error) throw custom;
        if (custom instanceof Response) return custom;
        if (custom !== undefined) return Response.json(custom);
        if (path === `databases/${ids.cron}`) return Response.json({ properties: { clinica: schema.clinica } });
        if (path === `databases/${ids.joins}`) return Response.json({ properties: { integracao: { type: "relation", relation: { database_id: ids.integracoes } } } });
        if (path === `databases/${ids.finalizadas}`) return Response.json({ properties: schema });
        if (path === `databases/${ids.finalizadas}/query`) return Response.json({ results: [page], has_more: false });
        if (path === `databases/${ids.clinicas}/query`) return Response.json({ results: [{ id: ids.clinica, properties: { nome: title("Clínica A") } }], has_more: false });
        if (path === `pages/${ids.clinica}`) return Response.json({ id: ids.clinica, parent: { database_id: ids.clinicas }, archived: false });
        if (path === `pages/${ids.row}`) return Response.json(page);
        if (path === "pages" && init?.method === "POST") return Response.json({ id: ids.row });
        if (path === `blocks/${ids.row}/children`) return Response.json({ results: [{ type: "paragraph", paragraph: { rich_text: [{ text: { content: `gestao-operacao:${ids.op}` } }] } }], has_more: false });
        throw new Error(`Transporte não simulado: ${path}`);
    });
});
afterEach(() => { for (const [k, v] of Object.entries(savedEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } mock.restoreAll(); });
const cmd = (): GestaoComando => ({ operacaoId: ids.op, tabela: "cron-consultas-finalizadas", acao: "alterar", id: ids.row, versao: registroGestao(page).versao, campos: { nome: "Alterado" } });

test("catálogo mantém IDs distintos, resolve clínicas e não publica database IDs", async () => {
    const lista = await catalogoGestao();
    assert.equal(lista.find(t => t.chave === "cron-consultas-finalizadas")?.databaseId, ids.finalizadas);
    assert.equal(lista.find(t => t.chave === "cron-agendas-medicas")?.databaseId, "3e8461445769803f952efb86c3403bec");
    assert.equal(lista.find(t => t.chave === "clinicas")?.databaseId, ids.clinicas);
});
test("leitura normaliza checkbox, relação e versão sem expor segredo", async () => {
    const lista = await listarGestao("cron-consultas-finalizadas");
    assert.equal(lista.registros[0]?.valores.ativo, true); assert.deepEqual(lista.registros[0]?.valores.clinica, [ids.clinica]);
    assert.equal(lista.registros[0]?.valores.chave_segura, ""); assert.equal(lista.campos.find(c => c.nome === "formula")?.editavel, false);
    assert.equal(JSON.stringify(lista).includes("segredo-simulado"), false); assert.equal("databaseId" in lista.tabela, false);
});
test("tabela arbitrária não é acessada", async () => {
    await assert.rejects(listarGestao("database-enviado-pelo-cliente"), /Tabela não permitida/);
});
test("PATCH envia somente propriedades alteradas e preserva segredo vazio", async () => {
    await gravarGestao({ ...cmd(), campos: { nome: "Alterado", chave_segura: "" } });
    assert.deepEqual(calls.find(c => c.method === "PATCH")?.body, { properties: { nome: { title: [{ type: "text", text: { content: "Alterado" } }] } } });
});
test("página de outra tabela impede escrita", async () => {
    page.parent.database_id = ids.cron;
    await assert.rejects(gravarGestao(cmd()), /não pertence/); assert.equal(calls.some(c => c.method === "PATCH"), false);
});
test("versão alterada impede escrita concorrente", async () => {
    const c = cmd(); page.last_edited_time = "2026-10-09T13:00:00Z";
    await assert.rejects(gravarGestao(c), /outra edição/); assert.equal(calls.some(c => c.method === "PATCH"), false);
});
test("fórmula e campo desconhecido são rejeitados", async () => {
    await assert.rejects(prepararGestao({ ...cmd(), campos: { formula: "novo" } }), /somente para leitura/);
    await assert.rejects(prepararGestao({ ...cmd(), campos: { inventado: "novo" } }), /não permitido/);
});
test("relação fora da tabela autorizada é rejeitada", async () => {
    overrides = path => path === `pages/${ids.clinica}` ? { id: ids.clinica, parent: { database_id: ids.cron } } : undefined;
    await assert.rejects(prepararGestao({ ...cmd(), campos: { clinica: [ids.clinica] } }), /Relação inválida/);
});
test("criação inclui marcador para reconciliação após resposta perdida", async () => {
    const c = { ...cmd(), acao: "criar" as const, campos: { nome: "Nova", ativo: false } };
    await gravarGestao(c);
    const payload = calls.find(x => x.path === "pages" && x.method === "POST")?.body;
    assert.equal(payload.parent.database_id, ids.finalizadas);
    assert.equal(payload.children[0].paragraph.rich_text[0].text.content, `gestao-operacao:${ids.op}`);
    assert.deepEqual(await reconciliarGestao(c), { estado: "salvo", registroId: ids.row });
});
test("reconciliação de alteração e arquivamento não grava novamente", async () => {
    assert.equal((await reconciliarGestao({ ...cmd(), campos: { nome: "Consultas" } })).estado, "salvo");
    assert.equal((await reconciliarGestao(cmd())).estado, "nao-confirmado");
    page.archived = true;
    assert.equal((await reconciliarGestao({ ...cmd(), acao: "arquivar", campos: {} })).estado, "salvo");
    assert.equal(calls.some(c => c.method === "PATCH"), false);
});
test("arquivamento usa PATCH archived sem excluir definitivamente", async () => {
    await gravarGestao({ ...cmd(), acao: "arquivar", campos: {} });
    assert.deepEqual(calls.find(c => c.method === "PATCH")?.body, { archived: true });
});
test("paginação inválida não vira lista vazia", async () => {
    overrides = path => path === `databases/${ids.finalizadas}/query` ? { has_more: false } : undefined;
    await assert.rejects(listarGestao("cron-consultas-finalizadas"), /Resposta inválida/);
});
test("novas tabelas da página Gestão aparecem somente para leitura", async () => {
    process.env.GESTAO_NOTION_PAGE_ID = ids.op;
    overrides = path => path === `blocks/${ids.op}/children` ? { results: [{ id: ids.row, type: "child_database", child_database: { title: "Outra tabela" } }], has_more: false } : undefined;
    const t = (await catalogoGestao()).find(t => t.nome === "Outra tabela"); assert.equal(t?.editavel, false);
});
test("erros do transporte não devolvem segredo", async () => {
    overrides = () => new Error("segredo-simulado");
    await assert.rejects(catalogoGestao(), e => e instanceof Error && !e.message.includes("segredo-simulado"));
});
test("tipos inválidos não são coercidos e URLs com credenciais são rejeitadas", () => {
    assert.throws(() => propriedadeGestao({ type: "checkbox" }, "true"));
    assert.throws(() => propriedadeGestao({ type: "number" }, "1"));
    assert.throws(() => propriedadeGestao({ type: "relation" }, ["inválido"]));
    assert.throws(() => propriedadeGestao({ type: "url" }, "https://user:pass@example.invalid"));
    assert.deepEqual(propriedadeGestao({ type: "checkbox" }, false), { checkbox: false });
});

async function request(token: string) {
    const app = express(); app.use("/gestao", rotasGestao());
    const req = new IncomingMessage(new Socket()); req.method = "GET"; req.url = "/gestao/tabelas"; req.headers.authorization = token;
    const res = new ServerResponse(req);
    return new Promise<{ status: number; body: any }>((resolve, reject) => {
        (res as unknown as express.Response).json = body => { resolve({ status: res.statusCode, body }); return res as unknown as express.Response; };
        (app as any).handle(req, res, reject);
    });
}
for (const token of ["", "Bearer token-atendimento", "Bearer 💡💡💡💡💡💡"]) {
    test(`rota administrativa rejeita ${token || "token ausente"} antes de chamar Notion`, async () => { assert.equal((await request(token)).status, 403); assert.equal(calls.length, 0); });
}
test("rota administrativa aceita apenas credencial própria e retorna catálogo sem database ID", async () => {
    const r = await request("Bearer admin-api-token"); assert.equal(r.status, 200); assert.equal(r.body.sucesso, true);
    assert.equal(r.body.dados.some((x: any) => "databaseId" in x), false);
});
test("rota Gestão usa AUTH_TOKEN quando GESTAO_API_TOKEN está ausente", async () => {
    delete process.env.GESTAO_API_TOKEN; process.env.AUTH_TOKEN = "token-existente";
    assert.equal((await request("Bearer token-existente")).status, 200);
});
test("credencial dedicada tem prioridade quando configurada", async () => {
    process.env.AUTH_TOKEN = "token-existente";
    assert.equal((await request("Bearer token-existente")).status, 403);
    assert.equal(calls.length, 0);
});
