import { adicionar, alterar, buscarPorId, listar } from "./crud";
import { ErroSaldoInsuficiente, ErroValidacao } from "./erros";
import type { RegistroEstoque } from "./mapear";

async function linhaDeMaterial(material: string): Promise<RegistroEstoque | null> {
    const linhas = await listar("estoque", { material });
    return linhas[0] ?? null;
}

export async function obterSaldo(material: string): Promise<number> {
    const linha = await linhaDeMaterial(material);
    const qtd = linha?.quantidade;
    return typeof qtd === "number" ? qtd : 0;
}

async function nomeDoMaterial(material: string): Promise<string> {
    try {
        const registro = await buscarPorId("materiais", material);
        const nome = typeof registro.nome === "string" ? registro.nome.trim() : "";
        return nome || material;
    } catch {
        return material;
    }
}

export async function incrementarSaldo(material: string, quantidade: number): Promise<RegistroEstoque> {
    if (!Number.isInteger(quantidade) || quantidade < 0) {
        throw new ErroValidacao("O campo 'quantidade' deve ser um inteiro ≥ 0.");
    }
    const linha = await linhaDeMaterial(material);
    if (!linha) {
        const nome = await nomeDoMaterial(material);
        return adicionar("estoque", { material, quantidade, nome });
    }
    const atual = typeof linha.quantidade === "number" ? linha.quantidade : 0;
    return alterar("estoque", String(linha.id), { quantidade: atual + quantidade });
}

export async function decrementarSaldo(material: string, quantidade: number): Promise<RegistroEstoque> {
    if (!Number.isInteger(quantidade) || quantidade < 0) {
        throw new ErroValidacao("O campo 'quantidade' deve ser um inteiro ≥ 0.");
    }
    const linha = await linhaDeMaterial(material);
    const atual = typeof linha?.quantidade === "number" ? linha.quantidade : 0;
    if (!linha || atual < quantidade) {
        throw new ErroSaldoInsuficiente([{ material, necessario: quantidade, disponivel: atual }]);
    }
    return alterar("estoque", String(linha.id), { quantidade: atual - quantidade });
}

export async function aplicarDeltaSaldo(material: string, delta: number): Promise<RegistroEstoque | null> {
    if (delta === 0) {
        return linhaDeMaterial(material);
    }
    if (delta > 0) {
        return incrementarSaldo(material, delta);
    }
    return decrementarSaldo(material, -delta);
}

export async function garantirSaldos(consumo: { material: string; quantidade: number }[]): Promise<void> {
    const faltas: { material: string; necessario: number; disponivel: number }[] = [];
    for (const item of consumo) {
        const disponivel = await obterSaldo(item.material);
        if (disponivel < item.quantidade) {
            faltas.push({ material: item.material, necessario: item.quantidade, disponivel });
        }
    }
    if (faltas.length > 0) {
        throw new ErroSaldoInsuficiente(faltas);
    }
}
