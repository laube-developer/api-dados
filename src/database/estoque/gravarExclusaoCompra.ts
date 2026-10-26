import { idTabela } from "./crud";
import { dependenciasEstoque } from "./deps";
import { ErroCompensacaoPendente, ErroOperacaoNaoConcluida } from "./erros";
import { jsonParaProperties } from "./mapear";
import { recursoPorTabela } from "./schema";

export type EscritaCompra = { tabela: string; id: string; depois: Record<string, unknown>; antes: Record<string, unknown> };
export type CriacaoCompra = { tabela: string; dados: Record<string, unknown> };

/** Compensa inclusive PATCH cuja resposta se perdeu; POST incerto exige revisão. */
export async function gravarExclusaoCompra(escritas: EscritaCompra[], criacoes: CriacaoCompra[]) {
    const reversoes: { tabela: string; id: string; antes: Record<string, unknown> }[] = [];
    let incerta: { tabela: string; id: string } | undefined;
    try {
        for (const criacao of criacoes) {
            const databaseId = await idTabela(criacao.tabela);
            const properties = jsonParaProperties(recursoPorTabela(criacao.tabela), criacao.dados, "criar");
            incerta = { tabela: criacao.tabela, id: String(criacao.dados.registro ?? criacao.dados.material ?? "criação sem resposta") };
            const criada = await dependenciasEstoque.chamarNotionAPI("pages", "POST", { parent: { database_id: databaseId }, properties });
            if (!criada?.id) throw new Error("Criação sem identificador.");
            reversoes.push({ tabela: criacao.tabela, id: criada.id, antes: { archived: true } });
            incerta = undefined;
        }
        for (const escrita of escritas) {
            reversoes.push(escrita);
            await dependenciasEstoque.chamarNotionAPI(`pages/${escrita.id}`, "PATCH", escrita.depois);
        }
    } catch (error) {
        const pendencias = incerta ? [incerta] : [];
        for (const reversao of reversoes.reverse()) {
            try { await dependenciasEstoque.chamarNotionAPI(`pages/${reversao.id}`, "PATCH", reversao.antes); }
            catch { pendencias.push({ tabela: reversao.tabela, id: reversao.id }); }
        }
        if (pendencias.length) throw new ErroCompensacaoPendente(pendencias);
        throw new ErroOperacaoNaoConcluida("Não foi possível concluir a exclusão. As alterações foram revertidas.");
    }
}
