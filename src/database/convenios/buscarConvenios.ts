import type { Convenio } from "../../utils/interfaces.js";
import { LogClass } from "../../utils/log.js";
import { buscarTabelasBanco, queryNotionTodasPaginas } from "../notion.js";

function texto(prop: any): string {
    if (prop?.number != null) return String(prop.number).trim();
    const fragmento = prop?.title?.[0] ?? prop?.rich_text?.[0];
    const restantes = (prop?.title ?? prop?.rich_text ?? []).slice(1);
    return [fragmento, ...restantes].map(item => String(item?.text?.content ?? item?.plain_text ?? "")).join("").trim();
}

export async function buscarConvenios(): Promise<Convenio[]> {
    const tabelas = await buscarTabelasBanco({ semCache: true });
    const tabela = tabelas.find(item => item.nome === "convenios");
    if (!tabela) throw new Error("Tabela convenios não encontrada na base da clínica.");
    const pages = await queryNotionTodasPaginas(tabela.id, {}, { validarPaginacao: true });
    const convenios: Convenio[] = [];
    for (const page of pages.filter(page => !page.archived && !page.in_trash)) {
        const props = page.properties ?? {};
        const id = texto(props.id);
        const nome = texto(props.nome);
        if (!id || !nome) {
            LogClass.warn(`Convênio ${page.id}: linha ignorada por ${!id ? "id" : "nome"} ausente ou tipo de coluna incompatível.`, "buscarConvenios");
            continue;
        }
        convenios.push({ id, nome });
    }
    LogClass.log(`Convênios: ${convenios.length} registros válidos de ${pages.length} linhas da tabela ${tabela.id}.`, "buscarConvenios");
    return convenios;
}
