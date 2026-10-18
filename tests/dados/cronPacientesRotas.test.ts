import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import type express from "express";
import { criarApp } from "../../src/app";
import type { CronTable } from "../../src/utils/interfaces";

const BASE_URL = "https://notion.example.invalid/v1";
let tokenOriginal: string | undefined;
let urlOriginal: string | undefined;

beforeEach(t => {
    tokenOriginal = process.env.AUTH_TOKEN;
    urlOriginal = process.env.NOTION_API_URL;
    process.env.AUTH_TOKEN = "test-token";
    process.env.NOTION_API_URL = BASE_URL;
    t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Transporte externo não simulado");
    });
});

afterEach(() => {
    if (tokenOriginal === undefined) delete process.env.AUTH_TOKEN;
    else process.env.AUTH_TOKEN = tokenOriginal;
    if (urlOriginal === undefined) delete process.env.NOTION_API_URL;
    else process.env.NOTION_API_URL = urlOriginal;
});

/** Exercita a rota e o mapeamento real com HTTP em memória e Notion simulado. */
function request() {
    const app = criarApp();
    const req = new IncomingMessage(new Socket());
    req.method = "GET";
    req.url = "/buscarTableCron";
    req.headers.authorization = "Bearer test-token";
    const res = new ServerResponse(req);
    return new Promise<{ status: number; body: unknown }>((resolve, reject) => {
        (res as unknown as express.Response).json = (body: unknown) => {
            resolve({ status: res.statusCode, body });
            return res as unknown as express.Response;
        };
        (app as unknown as {
            handle: (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => void;
        }).handle(req, res, reject);
    });
}

for (const [cenario, pacientes] of [
    ["dois IDs", "123456,123459"],
    ["um ID", "123456"],
    ["coluna vazia", ""],
    ["coluna ausente", undefined],
] as const) {
    test(`GET /buscarTableCron preserva pacientes: ${cenario}`, async t => {
        let chamadas = 0;
        t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
            chamadas++;
            assert.equal(String(url), `${BASE_URL}/databases/3ca46144576980ae9ec4e4d6451e04ef/query`);
            assert.equal(init?.method, "POST");
            return Response.json({
                results: [{ id: "row", properties: {
                    name: { type: "title", title: [{ plain_text: "Confirmação" }] },
                    medicos: { type: "rich_text", rich_text: [{ plain_text: "10,20" }] },
                    unidades: { type: "rich_text", rich_text: [{ plain_text: "30" }] },
                    ...(pacientes === undefined ? {} : {
                        pacientes: {
                            type: "rich_text",
                            rich_text: pacientes ? [{ plain_text: pacientes }] : [],
                        },
                    }),
                } }],
                has_more: false,
            });
        });
        const esperado: CronTable = {
            name: "Confirmação",
            clinica: { id: "", name: "", base_de_dados_id: "" },
            integracao: { name: "" },
            chave_segura: "",
            botconversa_msg_url: "",
            cron: "",
            tipo_antecedencia: "",
            antecedencia: 0,
            tipo_dia: "",
            unidades: "30",
            medicos: "10,20",
            pacientes: pacientes ?? "",
            ativo: true,
        };
        assert.deepEqual(await request(), {
            status: 200,
            body: { sucesso: true, dados: [esperado] },
        });
        assert.equal(chamadas, 1);
    });
}
