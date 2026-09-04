import { listar } from "./crud";

export interface ItemKitConsumo {
    kit: string;
    quantidade: number;
}

export interface ItemMaterialConsumo {
    material: string;
    quantidade: number;
}

export interface LinhaComposicao {
    kit: string;
    material: string;
    quantidade: number;
}

export interface ConsumoMaterial {
    material: string;
    quantidade: number;
}

export function somarConsumo(entrada: {
    kits: ItemKitConsumo[];
    materiais: ItemMaterialConsumo[];
    composicao: LinhaComposicao[];
}): ConsumoMaterial[] {
    const totais = new Map<string, number>();

    for (const avulso of entrada.materiais) {
        if (!avulso.material) continue;
        totais.set(avulso.material, (totais.get(avulso.material) ?? 0) + avulso.quantidade);
    }

    for (const uso of entrada.kits) {
        for (const linha of entrada.composicao) {
            if (linha.kit !== uso.kit) continue;
            const qtd = uso.quantidade * linha.quantidade;
            totais.set(linha.material, (totais.get(linha.material) ?? 0) + qtd);
        }
    }

    return [...totais.entries()].map(([material, quantidade]) => ({ material, quantidade }));
}

export async function carregarComposicao(kitIds: string[]): Promise<LinhaComposicao[]> {
    const ids = [...new Set(kitIds.filter(Boolean))];
    const composicao: LinhaComposicao[] = [];
    for (const kit of ids) {
        const linhas = await listar("kits_materiais", { kit });
        for (const linha of linhas) {
            composicao.push({
                kit,
                material: String(linha.material ?? ""),
                quantidade: typeof linha.quantidade === "number" ? linha.quantidade : 0,
            });
        }
    }
    return composicao;
}

export async function calcularConsumo(
    kits: ItemKitConsumo[] = [],
    materiais: ItemMaterialConsumo[] = []
): Promise<ConsumoMaterial[]> {
    const composicao = await carregarComposicao(kits.map((k) => k.kit));
    return somarConsumo({ kits, materiais, composicao });
}
