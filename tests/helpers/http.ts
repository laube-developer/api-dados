import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { Express } from "express";

export const TOKEN_TESTE = "token-teste";

export async function subirServidor(app: Express): Promise<{ url: string; fechar: () => Promise<void> }> {
    const server: Server = await new Promise((resolve, reject) => {
        const s = app.listen(0, "127.0.0.1", () => resolve(s));
        s.on("error", reject);
    });
    const address = server.address() as AddressInfo;
    return {
        url: `http://127.0.0.1:${address.port}`,
        fechar: () =>
            new Promise((resolve, reject) => {
                server.close((err) => (err ? reject(err) : resolve()));
            }),
    };
}

export async function chamar(
    url: string,
    method: string,
    path: string,
    opcoes?: { body?: unknown; token?: string | null; headers?: Record<string, string> }
) {
    const headers: Record<string, string> = { ...(opcoes?.headers ?? {}) };
    if (opcoes?.token !== null) {
        headers.Authorization = `Bearer ${opcoes?.token ?? TOKEN_TESTE}`;
    }
    if (opcoes?.body !== undefined) {
        headers["Content-Type"] = "application/json";
    }
    const resposta = await fetch(`${url}${path}`, {
        method,
        headers,
        body: opcoes?.body !== undefined ? JSON.stringify(opcoes.body) : undefined,
    });
    const json = await resposta.json();
    return { status: resposta.status, json };
}
