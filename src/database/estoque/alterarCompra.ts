import { idTabela, listar } from "./crud";
import { dependenciasEstoque } from "./deps";
import { ErroCompensacaoPendente, ErroNaoEncontrado, ErroOperacaoNaoConcluida, ErroValidacao } from "./erros";
import { jsonParaProperties, paginaParaJson, validarCorpo, type RegistroEstoque } from "./mapear";
import { recursoPorTabela } from "./schema";
import { custoProporcional } from "./lotes";
import { comRetry } from "./transacao";

type Item = { id?: string; material: string; fornecedor: string; quantidade: number; custo: number };
type Escrita = { tabela: string; id: string; antes: Record<string, unknown>; depois: Record<string, unknown> };
const filas = new Map<string, Promise<unknown>>();
const pendentes = new Set<string>();
const normalizarId = (id: string) => id.replaceAll("-", "").toLowerCase();
function validarId(id: unknown): asserts id is string {
    if (typeof id !== "string" || !/^[a-f\d]{8}-?(?:[a-f\d]{4}-?){3}[a-f\d]{12}$/i.test(id)) throw new ErroValidacao("Identificador inválido.");
}
function validarItens(valor: unknown): Item[] {
    if (!Array.isArray(valor) || !valor.length) throw new ErroValidacao("Informe ao menos um item da compra.");
    const ids = new Set<string>();
    return valor.map((item) => {
        if (!item || typeof item !== "object") throw new ErroValidacao("Item inválido.");
        validarId(item.material); validarId(item.fornecedor);
        if (item.id !== undefined) {
            validarId(item.id);
            if (ids.has(normalizarId(item.id))) throw new ErroValidacao("Item duplicado.");
            ids.add(normalizarId(item.id));
        }
        if (!Number.isSafeInteger(item.quantidade) || item.quantidade < 0 || typeof item.custo !== "number" || !Number.isFinite(item.custo) || item.custo < 0) {
            throw new ErroValidacao("Quantidade ou custo inválido.");
        }
        return { ...item, material: normalizarId(item.material), fornecedor: normalizarId(item.fornecedor) };
    });
}
async function paginaDaClinica(tabela: string, id: string, permitirArquivada = false) {
    const databaseId = await idTabela(tabela);
    const pagina = await dependenciasEstoque.chamarNotionAPI(`pages/${id}`, "GET", undefined, { permitir404: true });
    if (!pagina || (!permitirArquivada && (pagina.archived || pagina.in_trash)) || normalizarId(String(pagina.parent?.database_id ?? "")) !== normalizarId(databaseId)) {
        throw new ErroNaoEncontrado("Registro não encontrado nesta clínica.");
    }
    return pagina;
}
function alterarLinha(tabela: string, linha: RegistroEstoque, dados: Record<string, unknown>): Escrita {
    const schema = recursoPorTabela(tabela);
    const anteriores = Object.fromEntries(Object.keys(dados).map((campo) => [campo, linha[campo]]));
    return { tabela, id: linha.id, antes: { properties: jsonParaProperties(schema, anteriores, "alterar") }, depois: { properties: jsonParaProperties(schema, dados, "alterar") } };
}
async function prepararItens(antigos: RegistroEstoque[], novos: Item[], escritas: Escrita[]) {
    const anteriores = new Map(antigos.map((item) => [normalizarId(item.id), item]));
    for (const item of novos) {
        if (item.id && !anteriores.has(normalizarId(item.id))) throw new ErroValidacao("Item não pertence à compra.");
        await paginaDaClinica("materiais", item.material);
        await paginaDaClinica("fornecedores", item.fornecedor);
    }
    for (const antigo of antigos) {
        const novo = novos.find((item) => item.id && normalizarId(item.id) === normalizarId(antigo.id));
        const consumos = await listar("materiais_registro", { item_compra: antigo.id });
        if (consumos.some((c) => !Number.isSafeInteger(c.quantidade) || Number(c.quantidade) < 0)) throw new ErroValidacao("Consumo inconsistente.");
        const consumido = consumos.reduce((soma, c) => soma + Number(c.quantidade), 0);
        if (consumos.length && (!novo || novo.material !== normalizarId(String(antigo.material)) || novo.quantidade < consumido)) {
            throw new ErroValidacao("O item possui consumo vinculado; preserve o material e a quantidade já consumida.");
        }
        if (!novo) escritas.push({ tabela: "itens_compra", id: antigo.id, antes: { archived: false }, depois: { archived: true } });
        else {
            escritas.push(alterarLinha("itens_compra", antigo, { material: novo.material, fornecedor: novo.fornecedor, quantidade: novo.quantidade, custo: novo.custo }));
            for (const consumo of consumos) escritas.push(alterarLinha("materiais_registro", consumo, { custo: custoProporcional(novo.custo, novo.quantidade, Number(consumo.quantidade)) }));
        }
    }
}
async function prepararSaldos(antigos: RegistroEstoque[], novos: Item[], escritas: Escrita[]) {
    const deltas = new Map<string, number>();
    for (const [itens, sinal] of [[antigos, -1], [novos, 1]] as const) {
        for (const item of itens) {
            if (!Number.isSafeInteger(item.quantidade) || Number(item.quantidade) < 0) throw new ErroValidacao("Quantidade anterior inconsistente.");
            const material = normalizarId(String(item.material));
            deltas.set(material, (deltas.get(material) ?? 0) + sinal * Number(item.quantidade));
        }
    }
    const criar: { material: string; quantidade: number; nome: string }[] = [];
    for (const [material, delta] of deltas) {
        if (!delta) continue;
        const linhas = await listar("estoque", { material });
        const saldo = linhas[0];
        const quantidade = Number(saldo?.quantidade ?? 0) + delta;
        if (linhas.length > 1 || (saldo && (!Number.isSafeInteger(saldo.quantidade) || Number(saldo.quantidade) < 0)) || !Number.isSafeInteger(quantidade) || quantidade < 0) {
            throw new ErroValidacao("A alteração deixaria saldo negativo ou o estoque está inconsistente.");
        }
        if (saldo) escritas.push(alterarLinha("estoque", saldo, { quantidade }));
        else {
            const pagina = await paginaDaClinica("materiais", material);
            const nome = String(paginaParaJson(recursoPorTabela("materiais"), pagina).nome ?? "");
            if (!nome) throw new ErroValidacao("Material sem nome.");
            criar.push({ material, quantidade, nome });
        }
    }
    return criar;
}
async function executar(id: string, body: Record<string, unknown>, banco: string, remover = false) {
    if (pendentes.has(banco)) throw new ErroCompensacaoPendente([{ tabela: "compras", id }]);
    const pagina = await paginaDaClinica("compras", id, remover);
    if (remover && (pagina.archived || pagina.in_trash)) return { id, removido: true };
    const compra = paginaParaJson(recursoPorTabela("compras"), pagina);
    const dados = Object.fromEntries(["data_hora", "obs"].filter((campo) => campo in body).map((campo) => [campo, body[campo]]));
    validarCorpo(recursoPorTabela("compras"), dados, "alterar");
    const escritas: Escrita[] = [];
    const criacoes: { tabela: string; dados: Record<string, unknown> }[] = [];
    if (remover || body.itens !== undefined) {
        const novos = remover ? [] : validarItens(body.itens);
        const antigos = await listar("itens_compra", { compra: id });
        if (antigos.some((item) => normalizarId(String(item.compra)) !== normalizarId(id))) throw new ErroValidacao("Item não pertence à compra.");
        await prepararItens(antigos, novos, escritas);
        const saldos = await prepararSaldos(antigos, novos, escritas);
        for (const item of novos.filter((item) => !item.id)) criacoes.push({ tabela: "itens_compra", dados: { material: item.material, fornecedor: item.fornecedor, quantidade: item.quantidade, custo: item.custo, compra: id } });
        for (const saldo of saldos) criacoes.push({ tabela: "estoque", dados: saldo });
    }
    escritas.push(remover
        ? { tabela: "compras", id: compra.id, antes: { archived: false }, depois: { archived: true } }
        : alterarLinha("compras", compra, dados));
    const tentadas: Escrita[] = [];
    let criacaoIncerta = false;
    try {
        for (const criacao of criacoes) {
            const databaseId = await idTabela(criacao.tabela);
            const properties = jsonParaProperties(recursoPorTabela(criacao.tabela), criacao.dados, "criar");
            // POST não é repetido: uma resposta perdida pode ocultar uma página já criada.
            criacaoIncerta = true;
            const criada = await dependenciasEstoque.chamarNotionAPI("pages", "POST", { parent: { database_id: databaseId }, properties });
            if (!criada?.id) throw new Error("Criação sem identificador.");
            tentadas.push({ tabela: criacao.tabela, id: criada.id, antes: { archived: true }, depois: {} });
            criacaoIncerta = false;
        }
        for (const escrita of escritas) {
            tentadas.push(escrita);
            await comRetry(() => dependenciasEstoque.chamarNotionAPI(`pages/${escrita.id}`, "PATCH", escrita.depois));
        }
        return remover ? { id, removido: true } : { ...compra, ...dados };
    } catch {
        const falhas: { tabela: string; id: string }[] = [];
        for (const escrita of tentadas.reverse()) {
            try { await comRetry(() => dependenciasEstoque.chamarNotionAPI(`pages/${escrita.id}`, "PATCH", escrita.antes)); }
            catch { falhas.push({ tabela: escrita.tabela, id: escrita.id }); }
        }
        if (criacaoIncerta || falhas.length) {
            pendentes.add(banco);
            throw new ErroCompensacaoPendente([...falhas, { tabela: "compras", id }]);
        }
        throw new ErroOperacaoNaoConcluida(`Não foi possível ${remover ? "excluir" : "editar"} a compra. As alterações foram revertidas.`);
    }
}
async function enfileirarCompra(id: string, body: Record<string, unknown>, remover: boolean) {
    validarId(id);
    const banco = await idTabela("compras");
    const anterior = filas.get(banco) ?? Promise.resolve();
    const atual = anterior.catch(() => undefined).then(() => executar(id, body, banco, remover));
    filas.set(banco, atual);
    try { return await atual; }
    finally { if (filas.get(banco) === atual) filas.delete(banco); }
}

export async function alterarCompra(id: string, body: Record<string, unknown>) {
    return enfileirarCompra(id, body, false);
}

export async function removerCompra(id: string) {
    return enfileirarCompra(id, {}, true);
}
