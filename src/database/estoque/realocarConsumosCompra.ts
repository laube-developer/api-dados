import { listarPorRelacoes } from "./consultasEmLote";
import { ErroValidacao } from "./erros";
import { custoProporcional } from "./lotes";
import { paginaParaJson, validarCorpo, type RegistroEstoque } from "./mapear";
import { recursoPorTabela } from "./schema";

const normalizar = (id: unknown) => String(id ?? "").replaceAll("-", "").toLowerCase();
const insuficiente = () => new ErroValidacao("Não é possível remover o item: a quantidade consumida supera a quantidade disponível nas compras seguintes após a exclusão. O estoque ficaria negativo ou sem lote válido para esses consumos.");
function quantidade(valor: unknown): number {
    if (!Number.isSafeInteger(valor) || Number(valor) < 0) throw new ErroValidacao("Quantidade de lote ou consumo inconsistente.");
    return Number(valor);
}
function somar(a: number, b: number): number { return quantidade(a + b); }

/** Planeja todas as transferências juntas, reservando capacidade sem escrever no Notion. */
export async function planejarRealocacao(opcoes: {
    compra: RegistroEstoque;
    removidos: RegistroEstoque[];
    consumosPorItem: Map<string, RegistroEstoque[]>;
    buscarCompra: (id: string) => Promise<any>;
}) {
    const alteracoes: { atual: RegistroEstoque; dados: Record<string, unknown> }[] = [];
    const criacoes: Record<string, unknown>[] = [];
    const fontes = opcoes.removidos.filter(item => (opcoes.consumosPorItem.get(normalizar(item.id)) ?? []).length);
    if (!fontes.length) return { alteracoes, criacoes };
    const positivos = fontes.filter(item => (opcoes.consumosPorItem.get(normalizar(item.id)) ?? []).some(c => quantidade(c.quantidade) > 0));
    const materiais = [...new Set(positivos.map(item => normalizar(item.material)))];
    const candidatos = await listarPorRelacoes("itens_compra", "material", materiais);
    const dataOrigem = Date.parse(String(opcoes.compra.data_hora));
    if (positivos.length && !Number.isFinite(dataOrigem)) throw new ErroValidacao("Compra sem data válida para ordenar os lotes seguintes.");
    const compras = new Map<string, RegistroEstoque | null>();
    const lotes: { item: RegistroEstoque; data: number; restante: number }[] = [];
    for (const item of candidatos) {
        const compraId = normalizar(item.compra);
        if (compraId === normalizar(opcoes.compra.id)) continue;
        if (!compras.has(compraId)) {
            const pagina = await opcoes.buscarCompra(String(item.compra));
            compras.set(compraId, pagina.archived || pagina.in_trash ? null : paginaParaJson(recursoPorTabela("compras"), pagina));
        }
        const compra = compras.get(compraId);
        if (!compra) continue;
        const data = Date.parse(String(compra.data_hora));
        if (!Number.isFinite(data)) throw new ErroValidacao("Compra de destino sem data válida.");
        if (data < dataOrigem) continue;
        const total = quantidade(item.quantidade);
        if (typeof item.custo !== "number" || !Number.isFinite(item.custo) || item.custo < 0) throw new ErroValidacao("Custo do lote de destino inconsistente.");
        lotes.push({ item, data, restante: total });
    }
    const porId = new Map(lotes.map(l => [normalizar(l.item.id), l]));
    for (const consumo of await listarPorRelacoes("materiais_registro", "item_compra", lotes.map(l => l.item.id))) {
        const lote = porId.get(normalizar(consumo.item_compra));
        if (!lote || normalizar(consumo.material) !== normalizar(lote.item.material)) throw new ErroValidacao("Vínculo de consumo inconsistente.");
        lote.restante -= quantidade(consumo.quantidade);
        if (lote.restante < 0) throw new ErroValidacao("O lote de destino já possui consumo superior à quantidade comprada.");
    }
    lotes.sort((a, b) => a.data - b.data || normalizar(a.item.compra).localeCompare(normalizar(b.item.compra)) || normalizar(a.item.id).localeCompare(normalizar(b.item.id)));
    // A capacidade é compartilhada por todos os itens removidos nesta operação.
    for (const fonte of fontes) {
        for (const consumo of [...opcoes.consumosPorItem.get(normalizar(fonte.id))!].sort((a, b) => a.id.localeCompare(b.id))) {
            if (normalizar(consumo.material) !== normalizar(fonte.material)) throw new ErroValidacao("Vínculo de consumo inconsistente.");
            let falta = quantidade(consumo.quantidade);
            if (!falta) { alteracoes.push({ atual: consumo, dados: { item_compra: "", custo: 0 } }); continue; }
            const destinos = lotes.filter(l => normalizar(l.item.material) === normalizar(fonte.material) && l.restante > 0);
            if (destinos.reduce((s, l) => somar(s, l.restante), 0) < falta) throw insuficiente();
            let primeira = true;
            for (const lote of destinos) {
                const qtd = Math.min(falta, lote.restante);
                const dados = { item_compra: lote.item.id, quantidade: qtd, custo: custoProporcional(Number(lote.item.custo), Number(lote.item.quantidade), qtd) };
                if (primeira) { alteracoes.push({ atual: consumo, dados }); primeira = false; }
                else {
                    const parcela = { registro: consumo.registro, material: consumo.material, ...dados };
                    validarCorpo(recursoPorTabela("materiais_registro"), parcela, "criar");
                    criacoes.push(parcela);
                }
                lote.restante -= qtd;
                falta -= qtd;
                if (!falta) break;
            }
        }
    }
    return { alteracoes, criacoes };
}
