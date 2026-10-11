import type { Convenio } from "../../utils/interfaces.js";
import { buscarTabelasBanco, queryNotionTodasPaginas } from "../notion.js";

function texto(prop: any): string {
    if (prop?.number != null) return String(prop.number).trim();
    const fragmento = prop?.title?.[0] ?? prop?.rich_text?.[0];
    return String(fragmento?.text?.content ?? fragmento?.plain_text ?? "").trim();
}

export async function buscarConvenios(): Promise<Convenio[]> {
    const tabelas = await buscarTabelasBanco({ semCache: true });
    const tabela = tabelas.find(item => item.nome === "convenios");
    if (!tabela) throw new Error("Tabela convenios não encontrada na base da clínica.");
    const pages = await queryNotionTodasPaginas(tabela.id, {}, { validarPaginacao: true });
    return pages.filter(page => !page.archived && !page.in_trash).map(page => {
        const props = page.properties ?? {};
        const id = texto(props.id);
        const nome = texto(props.nome);
        if (!id || !nome) throw new Error("Convênio deve conter id e nome preenchidos.");
        return { id, nome };
    });
}
