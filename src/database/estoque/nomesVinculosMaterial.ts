import { idTabela } from "./crud";
import { dependenciasEstoque } from "./deps";
import { tabelasVinculos, type TabelaVinculo, type VinculoMaterial } from "./vinculosMaterial";

const normalizarId = (id: string) => id.replaceAll("-", "").toLowerCase();
const referencias = {
    kits_materiais: { tabela: "kits", nome: "Kit" },
    itens_compra: { tabela: "compras", nome: "Compra" },
    materiais_registro: { tabela: "registros", nome: "Consumo" },
};

export async function nomesVinculosMaterial(vinculos: VinculoMaterial[]) {
    const detalhes = Object.fromEntries(tabelasVinculos.map(tabela => [tabela, []])) as Record<TabelaVinculo, { id: string; nome: string; quantidade: number }[]>;
    const nomes = new Map<string, string>();
    const bancos = new Map<string, string>();
    for (const vinculo of vinculos) {
        let nome = vinculo.nome || "Saldo do material";
        if (vinculo.tabela !== "estoque") {
            const ref = referencias[vinculo.tabela];
            const chave = `${ref.tabela}:${vinculo.referencia}`;
            if (!nomes.has(chave)) {
                let descricao = `${ref.nome} indisponível`;
                if (vinculo.referencia) {
                    if (!bancos.has(ref.tabela)) bancos.set(ref.tabela, await idTabela(ref.tabela));
                    const pagina = await dependenciasEstoque.chamarNotionAPI(`pages/${encodeURIComponent(vinculo.referencia)}`, "GET", undefined, { permitir404: true });
                    // Não exponha nomes de registros de outra clínica ou tabela.
                    if (pagina && !pagina.archived && !pagina.in_trash
                        && normalizarId(String(pagina.parent?.database_id ?? "")) === normalizarId(bancos.get(ref.tabela)!)) {
                        const titulo = String(pagina.properties?.nome?.title?.[0]?.text?.content ?? "").trim();
                        const data = String(pagina.properties?.data_hora?.date?.start ?? "");
                        if (ref.tabela === "kits") descricao = titulo || "Kit sem nome";
                        else {
                            const instante = new Date(data);
                            const dataFormatada = data && !Number.isNaN(instante.getTime())
                                ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(instante)
                                : "Sem data";
                            descricao = `${ref.nome} · ${dataFormatada} · ${vinculo.referencia.slice(0, 8)}`;
                            if (titulo && !titulo.startsWith(`${ref.tabela} `) && titulo !== ref.tabela) descricao = `${titulo} · ${descricao}`;
                        }
                    }
                }
                nomes.set(chave, descricao);
            }
            nome = nomes.get(chave)!;
        }
        detalhes[vinculo.tabela].push({ id: vinculo.id, nome, quantidade: vinculo.quantidade });
    }
    return detalhes;
}
