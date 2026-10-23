import { createHash } from "node:crypto";
import { idTabela } from "./crud";
import { dependenciasEstoque } from "./deps";
import { ErroValidacao } from "./erros";

export const tabelasVinculos = ["materiais_registro", "kits_materiais", "estoque", "itens_compra"] as const;
export type TabelaVinculo = typeof tabelasVinculos[number];
export type VinculoMaterial = { tabela: TabelaVinculo; id: string; atualizado: string; referencia: string; nome: string; quantidade: number };
const normalizarId = (id: string) => id.replaceAll("-", "").toLowerCase();

async function listarVinculos(tabela: TabelaVinculo, material: string): Promise<VinculoMaterial[]> {
    const databaseId = await idTabela(tabela);
    const linhas = new Map<string, VinculoMaterial>();
    const cursores = new Set<string>();
    let cursor: string | undefined;
    do {
        const resposta = await dependenciasEstoque.chamarNotionAPI(`databases/${databaseId}/query`, "POST", {
            page_size: 100,
            filter: { property: "material", relation: { contains: material } },
            ...(cursor ? { start_cursor: cursor } : {}),
        });
        if (!Array.isArray(resposta?.results) || typeof resposta.has_more !== "boolean") {
            throw new ErroValidacao("Não foi possível verificar todos os vínculos do material. Tente novamente.");
        }
        for (const pagina of resposta.results) {
            if (pagina.archived || pagina.in_trash) continue;
            const relacao = pagina.properties?.material?.relation;
            if (typeof pagina.id !== "string" || !pagina.id
                || normalizarId(String(pagina.parent?.database_id ?? "")) !== normalizarId(databaseId)
                || !Array.isArray(relacao) || !relacao.some((r: { id: string }) => normalizarId(String(r.id)) === normalizarId(material))) {
                throw new ErroValidacao("Vínculo inconsistente. Não foi possível preparar a exclusão do material.");
            }
            const campoReferencia = tabela === "kits_materiais" ? "kit" : tabela === "itens_compra" ? "compra" : "registro";
            linhas.set(pagina.id, {
                tabela, id: pagina.id, atualizado: String(pagina.last_edited_time ?? ""),
                referencia: String(pagina.properties?.[campoReferencia]?.relation?.[0]?.id ?? ""),
                nome: String(pagina.properties?.nome?.title?.[0]?.text?.content ?? ""),
                quantidade: Number(pagina.properties?.quantidade?.number ?? 0),
            });
        }
        if (!resposta.has_more) break;
        const proximo = resposta.next_cursor;
        if (typeof proximo !== "string" || !proximo || cursores.has(proximo)) {
            throw new ErroValidacao("Paginação incompleta dos vínculos. Tente novamente.");
        }
        cursores.add(proximo);
        cursor = proximo;
    } while (cursor);
    return [...linhas.values()];
}

export async function prepararVinculosMaterial(id: string) {
    const vinculos: VinculoMaterial[] = [];
    for (const tabela of tabelasVinculos) vinculos.push(...await listarVinculos(tabela, id));
    const contagens = Object.fromEntries(tabelasVinculos.map(tabela => [tabela, vinculos.filter(v => v.tabela === tabela).length])) as Record<TabelaVinculo, number>;
    const versao = createHash("sha256").update(JSON.stringify([normalizarId(id), vinculos.map(v => `${v.tabela}:${v.id}:${v.atualizado}`).sort()])).digest("hex");
    return { vinculos, resumo: { contagens, versao } };
}
