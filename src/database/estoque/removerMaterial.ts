import { idTabela } from "./crud";
import { dependenciasEstoque } from "./deps";
import { ErroCompensacaoPendente, ErroNaoEncontrado, ErroOperacaoNaoConcluida, ErroValidacao } from "./erros";
import { comRetry } from "./transacao";
import { prepararVinculosMaterial } from "./vinculosMaterial";
import { nomesVinculosMaterial } from "./nomesVinculosMaterial";

const normalizarId = (id: string) => id.replaceAll("-", "").toLowerCase();
const filas = new Map<string, Promise<unknown>>();
const pendentes = new Set<string>();

async function carregarMaterial(id: string) {
    if (typeof id !== "string" || !/^[a-f\d]{8}-?(?:[a-f\d]{4}-?){3}[a-f\d]{12}$/i.test(id)) {
        throw new ErroValidacao("Material inválido.");
    }
    const databaseId = await idTabela("materiais");
    const chave = `${normalizarId(databaseId)}:${normalizarId(id)}`;
    if (pendentes.has(chave)) throw new ErroCompensacaoPendente([{ tabela: "materiais", id }], "A exclusão precisa de revisão administrativa antes de tentar novamente.");
    const pagina = await dependenciasEstoque.chamarNotionAPI(`pages/${id}`, "GET", undefined, { permitir404: true });
    if (!pagina || normalizarId(String(pagina.parent?.database_id ?? "")) !== normalizarId(databaseId)) {
        throw new ErroNaoEncontrado("Material não encontrado nesta clínica.");
    }
    return { pagina, chave };
}

export async function visualizarRemocaoMaterial(id: string) {
    const { pagina } = await carregarMaterial(id);
    if (pagina.archived || pagina.in_trash) throw new ErroNaoEncontrado("Material já excluído.");
    const { vinculos, resumo } = await prepararVinculosMaterial(id);
    return { ...resumo, detalhes: await nomesVinculosMaterial(vinculos) };
}

async function arquivarComCompensacao(itens: { tabela: string; id: string }[], chave: string) {
    const tentados: typeof itens = [];
    try {
        for (const item of itens) {
            // Inclui resposta perdida após uma escrita aplicada pelo Notion.
            tentados.push(item);
            await comRetry(() => dependenciasEstoque.chamarNotionAPI(`pages/${item.id}`, "PATCH", { archived: true }));
        }
    } catch {
        const falhas: typeof itens = [];
        for (const item of tentados.reverse()) {
            try {
                await comRetry(() => dependenciasEstoque.chamarNotionAPI(`pages/${item.id}`, "PATCH", { archived: false }));
            } catch { falhas.push(item); }
        }
        if (falhas.length) {
            pendentes.add(chave);
            throw new ErroCompensacaoPendente(falhas, "A exclusão falhou e alguns vínculos precisam de revisão administrativa. Não tente excluir novamente.");
        }
        throw new ErroOperacaoNaoConcluida("Não foi possível excluir o material. As alterações foram revertidas. Reabra a confirmação e tente novamente.");
    }
}

export async function removerMaterial(id: string, versao: string) {
    if (typeof versao !== "string" || !/^[a-f\d]{64}$/.test(versao)) {
        throw new ErroValidacao("Confira os vínculos e confirme a exclusão novamente.");
    }
    const { chave } = await carregarMaterial(id);
    const anterior = filas.get(chave) ?? Promise.resolve();
    const atual = anterior.catch(() => undefined).then(async () => {
        const { pagina } = await carregarMaterial(id);
        if (pagina.archived || pagina.in_trash) return { id, removido: true };
        const { vinculos, resumo } = await prepararVinculosMaterial(id);
        if (resumo.versao !== versao) throw new ErroValidacao("Os vínculos mudaram. Reabra a confirmação para conferir as quantidades atualizadas.");
        await arquivarComCompensacao([...vinculos, { tabela: "materiais", id }], chave);
        return { id, removido: true };
    });
    filas.set(chave, atual);
    try { return await atual; }
    finally { if (filas.get(chave) === atual) filas.delete(chave); }
}
