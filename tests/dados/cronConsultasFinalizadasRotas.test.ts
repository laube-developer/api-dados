import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import type express from "express";
import { criarApp } from "../../src/app";
import { dependenciasDados } from "../../src/routes/dados";
import type { CronConsultaFinalizadaTable } from "../../src/utils/interfaces";

const original = dependenciasDados.buscarTableCronConsultasFinalizadas;
const registro: CronConsultaFinalizadaTable = {
    id: "row", nome: "Consultas finalizadas", clinicaId: "clinica-a",
    cron: "30 14 * * *", ativo: true, unidades: "10, 20", webhookurl: "https://webhook.example.invalid",
};
let tokenOriginal: string | undefined;
let urlOriginal: string | undefined;

beforeEach(t => {
    tokenOriginal = process.env.AUTH_TOKEN;
    urlOriginal = process.env.NOTION_API_URL;
    process.env.AUTH_TOKEN = "test-token";
    process.env.NOTION_API_URL = "https://notion.example.invalid/v1";
    t.mock.method(globalThis, "fetch", async () => { throw new Error("Transporte externo não simulado"); });
    dependenciasDados.buscarTableCronConsultasFinalizadas = async () => [registro];
});
afterEach(() => {
    dependenciasDados.buscarTableCronConsultasFinalizadas = original;
    if (tokenOriginal === undefined) delete process.env.AUTH_TOKEN;
    else process.env.AUTH_TOKEN = tokenOriginal;
    if (urlOriginal === undefined) delete process.env.NOTION_API_URL;
    else process.env.NOTION_API_URL = urlOriginal;
});

/** Exercita autenticação e rota com objetos HTTP em memória, sem abrir servidor. */
function request(authorization: string | undefined = "Bearer test-token") {
    const app = criarApp();
    const req = new IncomingMessage(new Socket());
    req.method = "GET";
    req.url = "/buscarTableCronConsultasFinalizadas";
    if (authorization) req.headers.authorization = authorization;
    const res = new ServerResponse(req);
    return new Promise<{ status: number; body: unknown }>((resolve, reject) => {
        (res as unknown as express.Response).json = (body: unknown) => {
            resolve({ status: res.statusCode, body });
            return res as unknown as express.Response;
        };
        (app as unknown as { handle: (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => void })
            .handle(req, res, reject);
    });
}

test("retorna o envelope e contrato esperados pelo super-app", async () => {
    assert.deepEqual(await request(), { status: 200, body: { sucesso: true, dados: [registro] } });
});
test("retorna tabela vazia como sucesso", async () => {
    dependenciasDados.buscarTableCronConsultasFinalizadas = async () => [];
    assert.deepEqual(await request(), { status: 200, body: { sucesso: true, dados: [] } });
});
test("retorna erro sem vazar detalhes do transporte", async () => {
    dependenciasDados.buscarTableCronConsultasFinalizadas = async () => { throw new Error("credencial simulada"); };
    assert.deepEqual(await request(), {
        status: 500, body: { sucesso: false, erro: "Erro ao buscar cron de consultas finalizadas" },
    });
});
for (const [token, status] of [["", 401], ["Bearer errado", 403]] as const) {
    test(`token ${token || "ausente"} retorna ${status} sem buscar tabela`, async () => {
        let chamadas = 0;
        dependenciasDados.buscarTableCronConsultasFinalizadas = async () => { chamadas++; return []; };
        assert.equal((await request(token)).status, status);
        assert.equal(chamadas, 0);
    });
}
test("integra rota e leitura Notion simulada, incluindo registros inativos", async t => {
    dependenciasDados.buscarTableCronConsultasFinalizadas = original;
    let chamadas = 0;
    t.mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
        chamadas++;
        assert.equal(String(url), "https://notion.example.invalid/v1/databases/3df46144576980f6b498cd7a75b7bbb7/query");
        return Response.json({ results: [{ id: "row", properties: {
            nome: { title: [{ text: { content: registro.nome } }] },
            clinica: { relation: [{ id: registro.clinicaId }] },
            cron: { rich_text: [{ text: { content: registro.cron } }] },
            ativo: { checkbox: false }, unidades: { rich_text: [{ text: { content: registro.unidades } }] },
            webhookurl: { url: registro.webhookurl },
        } }], has_more: false });
    });
    assert.deepEqual(await request(), { status: 200, body: { sucesso: true, dados: [{ ...registro, ativo: false }] } });
    assert.equal(chamadas, 1);
});
