import { idTabela } from "./crud";
import { dependenciasEstoque } from "./deps";
import { ErroNaoEncontrado, ErroValidacao } from "./erros";
import { lerCampo, paginaParaJson, type RegistroEstoque } from "./mapear";
import { recursoPorTabela } from "./schema";
import type { DetalhesRegistroConsumo } from "../../utils/interfaces";

const chaveId = (id: string) => id.replaceAll("-", "").toLowerCase();

/** Pagina pelo cursor do Notion, sem repetir páginas anteriores. */
async function consultarTabela(tabela: string, filter?: Record<string, unknown>, faltantes?: Set<string>) {
    if (faltantes?.size === 0) return [];
    const databaseId = await idTabela(tabela);
    const recurso = recursoPorTabela(tabela);
    const linhas = new Map<string, RegistroEstoque>();
    const cursores = new Set<string>();
    let cursor: string | undefined;
    do {
        const resposta = await dependenciasEstoque.chamarNotionAPI(`databases/${databaseId}/query`, "POST", {
            page_size: 100, ...(filter ? { filter } : {}), ...(cursor ? { start_cursor: cursor } : {}),
        });
        if (!Array.isArray(resposta?.results) || typeof resposta.has_more !== "boolean") throw new Error("Resposta incompleta ao consultar detalhes do registro.");
        for (const pagina of resposta.results) {
            if (pagina.archived || pagina.in_trash) continue;
            const chave = chaveId(String(pagina.id));
            if (faltantes && !faltantes.has(chave)) continue;
            linhas.set(chave, paginaParaJson(recurso, pagina));
            faltantes?.delete(chave);
        }
        if (faltantes?.size === 0 || !resposta.has_more) break;
        const proximo = resposta.next_cursor;
        if (typeof proximo !== "string" || !proximo || cursores.has(proximo)) throw new Error("Paginação incompleta dos detalhes do registro.");
        cursores.add(proximo);
        cursor = proximo;
    } while (cursor);
    return [...linhas.values()];
}

async function itensComNomes(tabela: "materiais_registro" | "kits_registro", registroId: string) {
    const campo = tabela === "materiais_registro" ? "material" : "kit";
    const catalogo = campo === "material" ? "materiais" : "kits";
    const itens = await consultarTabela(tabela, { property: "registro", relation: { contains: registroId } });
    const ids = new Set(itens.map((item) => chaveId(String(item[campo] ?? ""))).filter(Boolean));
    const nomes = new Map((await consultarTabela(catalogo, undefined, ids))
        .map((item) => [chaveId(item.id), String(item.nome || "Não informado")]));
    return itens.map((item) => ({
        id: item.id,
        nome: nomes.get(chaveId(String(item[campo] ?? ""))) ?? (campo === "material" ? "Material excluído" : "Kit excluído"),
        quantidade: typeof item.quantidade === "number" ? item.quantidade : 0,
    }));
}

export async function carregarDetalhesRegistro(id: string): Promise<DetalhesRegistroConsumo> {
    if (!/^[a-f\d]{8}-?(?:[a-f\d]{4}-?){3}[a-f\d]{12}$/i.test(id)) throw new ErroValidacao("Registro inválido.");
    const databaseId = await idTabela("registros");
    const pagina = await dependenciasEstoque.chamarNotionAPI(`pages/${id}`, "GET", undefined, { permitir404: true });
    if (!pagina || pagina.archived || pagina.in_trash || chaveId(String(pagina.parent?.database_id ?? "")) !== chaveId(databaseId)) {
        throw new ErroNaoEncontrado("Registro não encontrado nesta clínica.");
    }
    const [materiais, kits] = await Promise.all([
        itensComNomes("materiais_registro", id),
        itensComNomes("kits_registro", id),
    ]);
    return { obs: String(lerCampo(pagina.properties?.obs, "rich_text") ?? ""), materiais, kits };
}
