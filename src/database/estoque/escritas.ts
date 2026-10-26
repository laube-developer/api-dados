import { estoqueTenantAtual } from "../config/estoque/estoqueTenant";

const filas = new Map<string, Promise<unknown>>();

/** Todas as mutações HTTP do estoque compartilham a fila da base nesta instância. */
export async function serializarEscritaEstoque<T>(executar: () => Promise<T>): Promise<T> {
    const base = estoqueTenantAtual()?.estoque_database_page_id ?? "sem-tenant";
    const chave = base.replaceAll("-", "").toLowerCase();
    const anterior = filas.get(chave) ?? Promise.resolve();
    const atual = anterior.catch(() => undefined).then(executar);
    filas.set(chave, atual);
    try { return await atual; }
    finally { if (filas.get(chave) === atual) filas.delete(chave); }
}
