import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { DiarioCompra } from "../../src/database/estoque/diarioCompra";
import { comRetry, transacaoConfig } from "../../src/database/estoque/transacao";
import { ErroValidacao } from "../../src/database/estoque/erros";
import type { RegistroEstoque } from "../../src/database/estoque/mapear";

const config = { ...transacaoConfig };
afterEach(() => Object.assign(transacaoConfig, config));

function preparar() {
    transacaoConfig.delaysMs = [0, 0];
    const paginas = new Map<string, RegistroEstoque>([
        ["saldo", { id: "saldo", material: "material", quantidade: 20 }],
        ["item", { id: "item", material: "material", quantidade: 20, custo: 100, fornecedor: "fornecedor" }],
    ]);
    const tentativas: { id: string; dados: Record<string, unknown> }[] = [];
    const arquivados: string[] = [];
    let seq = 0;
    let falhar: (id: string, dados: Record<string, unknown>) => boolean = () => false;
    const servicos = {
        comRetry,
        listar: async (_tabela: string, query: Record<string, unknown>) => [...paginas.values()].filter(p => p.id.startsWith("saldo") && p.material === query.material),
        adicionar: async (tabela: string, dados: Record<string, unknown>) => {
            const linha = { id: `${tabela}-${++seq}`, ...dados };
            paginas.set(linha.id, structuredClone(linha));
            if (falhar("POST", dados)) throw new Error("Resposta de criação perdida");
            return linha;
        },
        alterar: async (_tabela: string, id: string, dados: Record<string, unknown>) => {
            tentativas.push({ id, dados: structuredClone(dados) });
            const linha = paginas.get(id)!;
            Object.assign(linha, dados);
            if (falhar(id, dados)) throw new Error("Resposta perdida depois de gravar");
            return structuredClone(linha);
        },
        compensarPaginas: async (ids: string[]) => {
            for (const id of ids) {
                if (falhar("arquivar", { id })) throw Error("Falha ao arquivar");
                arquivados.push(id); paginas.delete(id);
            }
        },
    };
    return { paginas, tentativas, arquivados, servicos, falha: (fn: typeof falhar) => { falhar = fn; }, diario: new DiarioCompra(servicos) };
}

test("resposta perdida três vezes restaura saldo 20, sem transformar 20 em 35", async () => {
    const h = preparar();
    h.falha((id, dados) => id === "saldo" && dados.quantidade === 25);
    await assert.rejects(h.diario.executar(() => h.diario.aplicarDeltaSaldo("material", 5)), /revertidas/);
    assert.equal(h.paginas.get("saldo")!.quantidade, 20);
    assert.deepEqual(h.tentativas.map(t => t.dados.quantidade), [25, 25, 25, 20]);
});
test("resposta perdida uma vez repete o mesmo valor e termina em 25", async () => {
    const h = preparar(); let n = 0;
    h.falha((id) => id === "saldo" && ++n === 1);
    await h.diario.executar(() => h.diario.aplicarDeltaSaldo("material", 5));
    assert.equal(h.paginas.get("saldo")!.quantidade, 25);
    assert.deepEqual(h.tentativas.map(t => t.dados.quantidade), [25, 25]);
});
test("falha ao gravar item restaura inclusive item, custo, fornecedor e saldo", async () => {
    const h = preparar();
    h.falha((id, dados) => id === "item" && dados.quantidade === 25);
    await assert.rejects(h.diario.executar(async () => {
        await h.diario.aplicarDeltaSaldo("material", 5);
        await h.diario.alterar("itens_compra", structuredClone(h.paginas.get("item")!), { quantidade: 25, custo: 200, fornecedor: "outro" });
    }), /revertidas/);
    assert.equal(h.paginas.get("saldo")!.quantidade, 20);
    assert.equal(h.paginas.get("item")!.quantidade, 20);
    assert.equal(h.paginas.get("item")!.custo, 100);
    assert.equal(h.paginas.get("item")!.fornecedor, "fornecedor");
    assert.equal(h.tentativas.at(-1)!.id, "saldo");
});
test("múltiplos itens do mesmo material revertem em ordem inversa", async () => {
    const h = preparar();
    await assert.rejects(h.diario.executar(async () => {
        await h.diario.aplicarDeltaSaldo("material", 5);
        await h.diario.aplicarDeltaSaldo("material", 3);
        throw Error("Falha posterior");
    }), /revertidas/);
    assert.deepEqual(h.tentativas.map(t => t.dados.quantidade), [25, 28, 25, 20]);
});
test("falha de validação após criar páginas e alterar saldo também reverte tudo", async () => {
    const h = preparar();
    await assert.rejects(h.diario.executar(async () => {
        await h.diario.criar("compras", { obs: "Nova compra" });
        await h.diario.aplicarDeltaSaldo("material", 5);
        throw new ErroValidacao("Item inválido");
    }), /Item inválido/);
    assert.equal(h.paginas.get("saldo")!.quantidade, 20);
    assert.deepEqual(h.arquivados, ["compras-1"]);
});
test("falha numa reversão não impede tentar as outras", async () => {
    const h = preparar();
    h.falha((id, dados) => id === "saldo" && dados.quantidade === 20);
    await assert.rejects(h.diario.executar(async () => {
        await h.diario.criar("compras", {});
        await h.diario.aplicarDeltaSaldo("material", 5);
        throw Error("Falha posterior");
    }), (error: any) => error.pendencias?.some((p: any) => p.id === "saldo"));
    assert.deepEqual(h.arquivados, ["compras-1"]);
});
test("criação sem resposta não é repetida nem declarada revertida", async () => {
    const h = preparar(); h.falha(id => id === "POST");
    await assert.rejects(h.diario.executar(() => h.diario.criar("itens_compra", { material: "material" })), (error: any) => error.pendencias?.[0]?.tabela === "itens_compra");
    assert.equal([...h.paginas.keys()].filter(id => id.startsWith("itens_compra-")).length, 1);
});
test("operações concluídas descartam o diário; falha de outra chamada não desfaz saldo anterior", async () => {
    const h = preparar();
    await h.diario.executar(() => h.diario.aplicarDeltaSaldo("material", 5));
    const outro = new DiarioCompra(h.servicos);
    await assert.rejects(outro.executar(async () => { throw Error("Falha"); }), /revertidas/);
    assert.equal(h.paginas.get("saldo")!.quantidade, 25);
});

test("saldo criado para material sem estoque é arquivado se a operação falhar depois", async () => {
    const h = preparar(); h.paginas.delete("saldo");
    await assert.rejects(h.diario.executar(async () => {
        await h.diario.aplicarDeltaSaldo("material", 5);
        throw Error("Falha posterior");
    }), /revertidas/);
    assert.deepEqual(h.arquivados, ["estoque-1"]);
    assert.equal(h.paginas.has("estoque-1"), false);
});

test("troca de material restaura ambos os saldos quando o segundo falha", async () => {
    const h = preparar();
    h.paginas.set("saldo2", { id: "saldo2", material: "outro", quantidade: 10 });
    h.falha((id, dados) => id === "saldo2" && dados.quantidade === 15);
    await assert.rejects(h.diario.executar(async () => {
        await h.diario.aplicarDeltaSaldo("material", -5);
        await h.diario.aplicarDeltaSaldo("outro", 5);
    }), /revertidas/);
    assert.equal(h.paginas.get("saldo")!.quantidade, 20);
    assert.equal(h.paginas.get("saldo2")!.quantidade, 10);
});
