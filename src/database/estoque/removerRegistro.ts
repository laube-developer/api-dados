import { idTabela, listar } from "./crud";
import { dependenciasEstoque } from "./deps";
import { ErroCompensacaoPendente, ErroNaoEncontrado, ErroOperacaoNaoConcluida, ErroValidacao } from "./erros";
import { comRetry } from "./transacao";

type Alteracao = { tabela: string; id: string; antes: Record<string, unknown>; depois: Record<string, unknown> };
const filas = new Map<string, Promise<unknown>>();
const pendentes = new Set<string>();
const normalizarId = (id: string) => id.replaceAll("-", "").toLowerCase();

async function prepararRemocao(id: string): Promise<Alteracao[]> {
    const materiais = await listar("materiais_registro", { registro: id });
    const kits = await listar("kits_registro", { registro: id });
    const consumo = new Map<string, number>();
    for (const linha of materiais) {
        if (!linha.material || !Number.isSafeInteger(linha.quantidade) || Number(linha.quantidade) < 0) {
            throw new ErroValidacao("O registro possui materiais inconsistentes. Regularize os itens antes de remover.");
        }
        const material = String(linha.material);
        consumo.set(material, (consumo.get(material) ?? 0) + Number(linha.quantidade));
    }
    const alteracoes: Alteracao[] = [];
    for (const [material, quantidade] of consumo) {
        if (quantidade === 0) continue;
        const saldos = await listar("estoque", { material });
        const saldo = saldos[0];
        if (saldos.length !== 1 || !saldo || !Number.isSafeInteger(saldo.quantidade) || Number(saldo.quantidade) < 0
            || !Number.isSafeInteger(Number(saldo.quantidade) + quantidade)) {
            throw new ErroValidacao("Saldo ausente ou inconsistente. Regularize o estoque antes de remover o registro.");
        }
        alteracoes.push({ tabela: "estoque", id: saldo.id,
            antes: { properties: { quantidade: { number: saldo.quantidade } } },
            depois: { properties: { quantidade: { number: Number(saldo.quantidade) + quantidade } } } });
    }
    for (const [tabela, linhas] of [["materiais_registro", materiais], ["kits_registro", kits]] as const) {
        for (const linha of linhas) {
            if (normalizarId(String(linha.registro)) !== normalizarId(id)) {
                throw new ErroValidacao("Item não pertence ao registro solicitado.");
            }
            alteracoes.push({ tabela, id: linha.id, antes: { archived: false }, depois: { archived: true } });
        }
    }
    alteracoes.push({ tabela: "registros", id, antes: { archived: false }, depois: { archived: true } });
    return alteracoes;
}

async function executarRemocao(id: string, databaseId: string) {
    const chave = `${databaseId}:${normalizarId(id)}`;
    if (pendentes.has(chave)) throw new ErroCompensacaoPendente([{ tabela: "registros", id }]);
    const pagina = await dependenciasEstoque.chamarNotionAPI(`pages/${id}`, "GET", undefined, { permitir404: true });
    if (!pagina || normalizarId(String(pagina.parent?.database_id ?? "")) !== normalizarId(databaseId)) {
        throw new ErroNaoEncontrado("Registro não encontrado nesta clínica.");
    }
    if (pagina.archived || pagina.in_trash) return { id, removido: true };
    const alteracoes = await prepararRemocao(id);
    const tentadas: Alteracao[] = [];
    try {
        for (const alteracao of alteracoes) {
            // Inclui a chamada que falhou: o Notion pode ter gravado antes de perder a resposta.
            tentadas.push(alteracao);
            await comRetry(() => dependenciasEstoque.chamarNotionAPI(`pages/${alteracao.id}`, "PATCH", alteracao.depois));
        }
        return { id, removido: true };
    } catch {
        const falhas: { tabela: string; id: string }[] = [];
        for (const alteracao of tentadas.reverse()) {
            try {
                await comRetry(() => dependenciasEstoque.chamarNotionAPI(`pages/${alteracao.id}`, "PATCH", alteracao.antes));
            } catch {
                falhas.push({ tabela: alteracao.tabela, id: alteracao.id });
            }
        }
        if (falhas.length) {
            pendentes.add(chave);
            throw new ErroCompensacaoPendente(falhas, "A remoção falhou e precisa de revisão do estoque antes de tentar novamente.");
        }
        throw new ErroOperacaoNaoConcluida("Não foi possível remover o registro. As alterações foram revertidas.");
    }
}

export async function removerRegistro(id: string) {
    if (!/^[a-f\d]{8}-?(?:[a-f\d]{4}-?){3}[a-f\d]{12}$/i.test(id)) throw new ErroValidacao("Registro inválido.");
    const databaseId = await idTabela("registros");
    // Serializa exclusões da mesma clínica nesta instância, inclusive cliques repetidos.
    const anterior = filas.get(databaseId) ?? Promise.resolve();
    const atual = anterior.catch(() => undefined).then(() => executarRemocao(id, databaseId));
    filas.set(databaseId, atual);
    try { return await atual; }
    finally { if (filas.get(databaseId) === atual) filas.delete(databaseId); }
}
