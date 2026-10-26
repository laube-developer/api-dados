import { idTabela, listar } from "./crud";
import { listarPorRelacoes } from "./consultasEmLote";
import { dependenciasEstoque } from "./deps";
import { ErroNaoEncontrado, ErroValidacao } from "./erros";
import { jsonParaProperties, paginaParaJson, validarCorpo, type RegistroEstoque } from "./mapear";
import { recursoPorTabela } from "./schema";
import { custoProporcional } from "./lotes";

type Item = { id?: string; material: string; fornecedor: string; quantidade: number; custo: number };
type Escrita = { tabela: string; id: string; depois: Record<string, unknown> };
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
function camposAlterados(tabela: string, linha: RegistroEstoque, dados: Record<string, unknown>) {
    return Object.fromEntries(Object.entries(dados).filter(([campo, valor]) => {
        const tipo = recursoPorTabela(tabela).campos.find((c) => c.nome === campo)?.tipo;
        if (tipo === "relation") return normalizarId(String(linha[campo] ?? "")) !== normalizarId(String(valor));
        if (tipo === "date" && linha[campo] && valor) return Date.parse(String(linha[campo])) !== Date.parse(String(valor));
        return linha[campo] !== valor;
    }));
}
function alterarLinha(tabela: string, linha: RegistroEstoque, dados: Record<string, unknown>, escritas: Escrita[]) {
    const alterados = camposAlterados(tabela, linha, dados);
    if (Object.keys(alterados).length) {
        escritas.push({ tabela, id: linha.id, depois: { properties: jsonParaProperties(recursoPorTabela(tabela), alterados, "alterar") } });
    }
}
async function prepararItens(antigos: RegistroEstoque[], novos: Item[], escritas: Escrita[], buscarPagina: typeof paginaDaClinica) {
    const anteriores = new Map(antigos.map((item) => [normalizarId(item.id), item]));
    const posteriores = new Map(novos.filter((item) => item.id).map((item) => [normalizarId(item.id!), item]));
    for (const item of novos) {
        const anterior = item.id ? anteriores.get(normalizarId(item.id)) : undefined;
        if (item.id && !anterior) throw new ErroValidacao("Item não pertence à compra.");
        const dados = { material: item.material, fornecedor: item.fornecedor, quantidade: item.quantidade, custo: item.custo };
        if (!anterior || Object.keys(camposAlterados("itens_compra", anterior, dados)).length) {
            await buscarPagina("materiais", item.material);
            await buscarPagina("fornecedores", item.fornecedor);
        }
    }
    // Fornecedor isoladamente não afeta consumo. Quantidade, custo, material e remoção afetam.
    const afetados = antigos.filter((antigo) => {
        const novo = posteriores.get(normalizarId(antigo.id));
        return !novo || Object.keys(camposAlterados("itens_compra", antigo, {
            material: novo.material, quantidade: novo.quantidade, custo: novo.custo,
        })).length > 0;
    });
    const consumosPorItem = new Map<string, RegistroEstoque[]>();
    for (const consumo of await listarPorRelacoes("materiais_registro", "item_compra", afetados.map((item) => item.id))) {
        const chave = normalizarId(String(consumo.item_compra));
        const grupo = consumosPorItem.get(chave) ?? [];
        grupo.push(consumo);
        consumosPorItem.set(chave, grupo);
    }
    for (const antigo of antigos) {
        const novo = posteriores.get(normalizarId(antigo.id));
        const consumos = consumosPorItem.get(normalizarId(antigo.id)) ?? [];
        if (consumos.some((c) => !Number.isSafeInteger(c.quantidade) || Number(c.quantidade) < 0)) throw new ErroValidacao("Consumo inconsistente.");
        const consumido = consumos.reduce((soma, c) => soma + Number(c.quantidade), 0);
        if (consumos.length && (!novo || novo.material !== normalizarId(String(antigo.material)) || novo.quantidade < consumido)) {
            throw new ErroValidacao("O item possui consumo vinculado; preserve o material e a quantidade já consumida.");
        }
        if (!novo) escritas.push({ tabela: "itens_compra", id: antigo.id, depois: { archived: true } });
        else {
            alterarLinha("itens_compra", antigo, { material: novo.material, fornecedor: novo.fornecedor, quantidade: novo.quantidade, custo: novo.custo }, escritas);
            for (const consumo of consumos) alterarLinha("materiais_registro", consumo, { custo: custoProporcional(novo.custo, novo.quantidade, Number(consumo.quantidade)) }, escritas);
        }
    }
}
async function prepararSaldos(antigos: RegistroEstoque[], novos: Item[], escritas: Escrita[], buscarPagina: typeof paginaDaClinica) {
    const deltas = new Map<string, number>();
    for (const [itens, sinal] of [[antigos, -1], [novos, 1]] as const) {
        for (const item of itens) {
            if (!Number.isSafeInteger(item.quantidade) || Number(item.quantidade) < 0) throw new ErroValidacao("Quantidade anterior inconsistente.");
            const material = normalizarId(String(item.material));
            deltas.set(material, (deltas.get(material) ?? 0) + sinal * Number(item.quantidade));
        }
    }
    const criar: { material: string; quantidade: number; nome: string }[] = [];
    const alterados = [...deltas].filter(([, delta]) => delta !== 0);
    const saldosPorMaterial = new Map<string, RegistroEstoque[]>();
    for (const linha of await listarPorRelacoes("estoque", "material", alterados.map(([material]) => material))) {
        const chave = normalizarId(String(linha.material));
        const grupo = saldosPorMaterial.get(chave) ?? [];
        grupo.push(linha);
        saldosPorMaterial.set(chave, grupo);
    }
    for (const [material, delta] of alterados) {
        const linhas = saldosPorMaterial.get(material) ?? [];
        const saldo = linhas[0];
        const quantidade = Number(saldo?.quantidade ?? 0) + delta;
        if (linhas.length > 1 || (saldo && (!Number.isSafeInteger(saldo.quantidade) || Number(saldo.quantidade) < 0)) || !Number.isSafeInteger(quantidade) || quantidade < 0) {
            throw new ErroValidacao("A alteração deixaria saldo negativo ou o estoque está inconsistente.");
        }
        if (saldo) alterarLinha("estoque", saldo, { quantidade }, escritas);
        else {
            const pagina = await buscarPagina("materiais", material);
            const nome = String(paginaParaJson(recursoPorTabela("materiais"), pagina).nome ?? "");
            if (!nome) throw new ErroValidacao("Material sem nome.");
            criar.push({ material, quantidade, nome });
        }
    }
    return criar;
}
async function executar(id: string, body: Record<string, unknown>, remover = false) {
    validarId(id);
    // Cache restrito à operação: não reutiliza saldos ou validações entre edições.
    const paginas = new Map<string, Promise<any>>();
    const buscarPagina: typeof paginaDaClinica = (tabela, id, permitirArquivada = false) => {
        const chave = `${tabela}:${normalizarId(id)}:${permitirArquivada}`;
        if (!paginas.has(chave)) paginas.set(chave, paginaDaClinica(tabela, id, permitirArquivada));
        return paginas.get(chave)!;
    };
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
        await prepararItens(antigos, novos, escritas, buscarPagina);
        const saldos = await prepararSaldos(antigos, novos, escritas, buscarPagina);
        for (const item of novos.filter((item) => !item.id)) criacoes.push({ tabela: "itens_compra", dados: { material: item.material, fornecedor: item.fornecedor, quantidade: item.quantidade, custo: item.custo, compra: id } });
        for (const saldo of saldos) criacoes.push({ tabela: "estoque", dados: saldo });
    }
    if (remover) escritas.push({ tabela: "compras", id: compra.id, depois: { archived: true } });
    else alterarLinha("compras", compra, dados, escritas);
    for (const criacao of criacoes) {
        const databaseId = await idTabela(criacao.tabela);
        const properties = jsonParaProperties(recursoPorTabela(criacao.tabela), criacao.dados, "criar");
        const criada = await dependenciasEstoque.chamarNotionAPI("pages", "POST", { parent: { database_id: databaseId }, properties });
        if (!criada?.id) throw new Error("Criação sem identificador.");
    }
    for (const escrita of escritas) {
        await dependenciasEstoque.chamarNotionAPI(`pages/${escrita.id}`, "PATCH", escrita.depois);
    }
    return remover ? { id, removido: true } : { ...compra, ...dados };
}

export async function alterarCompra(id: string, body: Record<string, unknown>) {
    return executar(id, body);
}

export async function removerCompra(id: string) {
    return executar(id, {}, true);
}
