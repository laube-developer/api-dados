import { buscarPorId, listar } from "./crud";
import type { ConsumoMaterial } from "./consumo";

export type LoteMaterial = {
    id: string;
    material: string;
    quantidade: number;
    custo: number;
    restante: number;
    data_hora: string;
};

export type AlocacaoLote = {
    material: string;
    quantidade: number;
    item_compra: string;
    custo: number;
};

export function custoProporcional(
    custoLote: number,
    quantidadeLote: number,
    quantidade: number
): number {
    if (quantidadeLote <= 0 || quantidade <= 0) {
        return 0;
    }
    return Math.round((custoLote / quantidadeLote) * quantidade * 100) / 100;
}

/** FIFO: estoque mais antigo primeiro. Sobra sem lote fica com item_compra vazio. */
export function alocarFifo(
    lotes: LoteMaterial[],
    quantidade: number
): Omit<AlocacaoLote, "material">[] {
    const fatias: Omit<AlocacaoLote, "material">[] = [];
    let falta = quantidade;
    const ordenados = [...lotes].sort((a, b) => {
        const porData = a.data_hora.localeCompare(b.data_hora);
        if (porData !== 0) return porData;
        return a.id.localeCompare(b.id);
    });

    for (const lote of ordenados) {
        if (falta <= 0) break;
        if (lote.restante <= 0) continue;
        const qtd = Math.min(lote.restante, falta);
        fatias.push({
            item_compra: lote.id,
            quantidade: qtd,
            custo: custoProporcional(lote.custo, lote.quantidade, qtd),
        });
        falta -= qtd;
    }

    if (falta > 0) {
        fatias.push({ item_compra: "", quantidade: falta, custo: 0 });
    }

    return fatias;
}

function numero(valor: unknown): number {
    return typeof valor === "number" && Number.isFinite(valor) ? valor : 0;
}

export async function carregarLotesDisponiveis(
    material: string
): Promise<LoteMaterial[]> {
    const itens = await listar("itens_compra", { material });
    const baixas = await listar("materiais_registro", { material });
    const consumido = new Map<string, number>();
    for (const baixa of baixas) {
        const loteId = String(baixa.item_compra ?? "").trim();
        if (!loteId) continue;
        consumido.set(loteId, (consumido.get(loteId) ?? 0) + numero(baixa.quantidade));
    }

    const compraIds = [
        ...new Set(
            itens.map((item) => String(item.compra ?? "").trim()).filter(Boolean)
        ),
    ];
    const dataPorCompra = new Map<string, string>();
    for (const compraId of compraIds) {
        try {
            const compra = await buscarPorId("compras", compraId);
            dataPorCompra.set(compraId, String(compra.data_hora ?? ""));
        } catch {
            dataPorCompra.set(compraId, "");
        }
    }

    return itens.map((item) => {
        const quantidade = Math.max(0, Math.trunc(numero(item.quantidade)));
        const id = String(item.id ?? "");
        return {
            id,
            material: String(item.material ?? material),
            quantidade,
            custo: numero(item.custo),
            restante: Math.max(0, quantidade - (consumido.get(id) ?? 0)),
            data_hora: dataPorCompra.get(String(item.compra ?? "").trim()) ?? "",
        };
    });
}

export async function alocarConsumoPorLotes(
    consumo: ConsumoMaterial[]
): Promise<AlocacaoLote[]> {
    const alocacoes: AlocacaoLote[] = [];
    for (const item of consumo) {
        if (item.quantidade <= 0) continue;
        const lotes = await carregarLotesDisponiveis(item.material);
        const fatias = alocarFifo(lotes, item.quantidade);
        for (const fatia of fatias) {
            alocacoes.push({ material: item.material, ...fatia });
        }
    }
    return alocacoes;
}
