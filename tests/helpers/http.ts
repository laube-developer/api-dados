import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { Express } from "express";

export const TOKEN_TESTE = "token-teste";

export const DOMINIO_ESTOQUE_TESTE = "estoque.teste.com.br";

export const CONFIG_ESTOQUE_TESTE = {
    dominio: DOMINIO_ESTOQUE_TESTE,
    clinica: {
        id: "clinica-teste",
        nome: "Teste",
        base_de_dados_id: "base-teste",
        whatsapp: "",
    },
    estoque_database_page_id: "page-estoque-teste",
    medicos_database_id: "db-medicos-teste",
    pacientes_database_id: "db-pacientes-teste",
};

/** Acrescenta `?dominio=` (ou `&dominio=`) para as rotas `/estoque/*`. */
export function comDominioEstoque(path: string): string {
    const join = path.includes("?") ? "&" : "?";
    return `${path}${join}dominio=${DOMINIO_ESTOQUE_TESTE}`;
}

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
