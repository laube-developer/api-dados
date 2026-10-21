import { listar } from "./crud";
import type { RegistroEstoque } from "./mapear";

/** Consulta só as relações solicitadas, paginando cada grupo até o fim. */
export async function listarPorRelacoes(tabela: string, campo: string, ids: string[]): Promise<RegistroEstoque[]> {
    const unicos = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    const registros = new Map<string, RegistroEstoque>();
    for (let inicio = 0; inicio < unicos.length; inicio += 20) {
        const linhas = await listar(tabela, { [campo]: unicos.slice(inicio, inicio + 20).join(",") });
        for (const linha of linhas) registros.set(linha.id, linha);
    }
    return [...registros.values()];
}
