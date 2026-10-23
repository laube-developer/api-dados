import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { removerMaterial, visualizarRemocaoMaterial } from "../../src/database/estoque/removerMaterial";
import { dependenciasEstoque } from "../../src/database/estoque/deps";
import { transacaoConfig } from "../../src/database/estoque/transacao";
import { tabelasVinculos } from "../../src/database/estoque/vinculosMaterial";
const originais = { ...dependenciasEstoque }, config = { ...transacaoConfig };
const id = "00000000-0000-0000-0000-000000000001";
let seq = 0, banco: string;
let paginas: Map<string, any>;
let escritas: string[];
let falhar: (id: string, archived: boolean) => boolean;
let invalida: boolean;
function adicionar(chave: string, tabela: string, material = id) {
    paginas.set(chave, { id: chave, parent: { database_id: `${banco}-${tabela}` }, archived: false,
        properties: { material: { relation: [{ id: material }] } }, last_edited_time: "antes" });
}
beforeEach(() => {
    banco = `base-${++seq}`; paginas = new Map(); escritas = []; falhar = () => false; invalida = false;
    adicionar(id, "materiais");
    for (const tabela of tabelasVinculos) {
        adicionar(tabela, tabela);
        adicionar(`${tabela}-outro`, tabela, "outro-material");
    }
    transacaoConfig.delaysMs = [0, 0];
    dependenciasEstoque.buscarTabelasBanco = async () => ["materiais", ...tabelasVinculos].map(nome => ({ nome, id: `${banco}-${nome}` }));
    dependenciasEstoque.chamarNotionAPI = async (endpoint, method, body) => {
        if (endpoint.startsWith("databases/")) {
            if (invalida) return {};
            assert.equal(body.filter.relation.contains, id);
            const linhas = [...paginas.values()].filter(p => p.parent.database_id === endpoint.split("/")[1]
                && !p.archived && p.properties.material.relation.some((r: any) => r.id === id));
            const inicio = Number(body.start_cursor ?? 0), fim = inicio + 100;
            return { results: linhas.slice(inicio, fim), has_more: fim < linhas.length, next_cursor: String(fim) };
        }
        const chave = endpoint.slice(6), pagina = paginas.get(chave);
        if (method === "GET") return pagina;
        escritas.push(chave);
        pagina.archived = body.archived;
        if (falhar(chave, body.archived)) throw Error("Resposta perdida");
        return pagina;
    };
});
afterEach(() => { Object.assign(dependenciasEstoque, originais); Object.assign(transacaoConfig, config); });
const versao = async () => (await visualizarRemocaoMaterial(id)).versao;
test("prévia conta somente vínculos do material e não escreve", async () => {
    const resumo = await visualizarRemocaoMaterial(id);
    assert.deepEqual(resumo.contagens, { materiais_registro: 1, kits_materiais: 1, estoque: 1, itens_compra: 1 });
    assert.equal(escritas.length, 0);
});
test("remove vínculos antes do material e preserva outros materiais", async () => {
    await removerMaterial(id, await versao());
    for (const tabela of tabelasVinculos) {
        assert.equal(paginas.get(tabela).archived, true);
        assert.equal(paginas.get(`${tabela}-outro`).archived, false);
    }
    assert.equal(escritas.at(-1), id);
    assert.equal(escritas.length, 5);
});
test("pagina todos os vínculos na prévia e na exclusão", async () => {
    for (let i = 0; i < 125; i++) adicionar(`extra-${i}`, "kits_materiais");
    const resumo = await visualizarRemocaoMaterial(id);
    assert.equal(resumo.contagens.kits_materiais, 126);
    await removerMaterial(id, resumo.versao);
    assert.equal(escritas.length, 130);
});
test("exige versão confirmada antes de excluir", async () => {
    await assert.rejects(removerMaterial(id, ""), /confirme/);
    assert.equal(escritas.length, 0);
});
test("mudança de vínculos exige conferir novamente mesmo com mesma contagem", async () => {
    const anterior = await versao();
    paginas.delete("estoque"); adicionar("saldo-novo", "estoque");
    await assert.rejects(removerMaterial(id, anterior), /vínculos mudaram/);
    assert.equal(escritas.length, 0);
});
test("reenvio e exclusões simultâneas não duplicam escritas", async () => {
    const v = await versao();
    await Promise.all([removerMaterial(id, v), removerMaterial(id, v)]);
    await removerMaterial(id, v);
    assert.equal(escritas.length, 5);
});
test("falha parcial restaura inclusive a escrita cuja resposta foi perdida", async () => {
    const v = await versao();
    falhar = (chave, archived) => chave === "estoque" && archived;
    await assert.rejects(removerMaterial(id, v), /revertidas/);
    assert.ok([...paginas.values()].every(p => !p.archived));
});
test("falha ao excluir o material restaura todos os vínculos", async () => {
    const v = await versao();
    falhar = (chave, archived) => chave === id && archived;
    await assert.rejects(removerMaterial(id, v), /revertidas/);
    assert.ok([...paginas.values()].every(p => !p.archived));
});
test("falha de compensação bloqueia novas tentativas", async () => {
    const v = await versao(); falhar = chave => chave === "estoque";
    await assert.rejects(removerMaterial(id, v), /revisão/);
    const antes = escritas.length;
    await assert.rejects(removerMaterial(id, v), /revisão/);
    assert.equal(escritas.length, antes);
});
test("recusa material de outra clínica e UUID inválido", async () => {
    paginas.get(id).parent.database_id = "outra";
    await assert.rejects(visualizarRemocaoMaterial(id), /nesta clínica/);
    await assert.rejects(visualizarRemocaoMaterial("../outro"), /inválido/);
    assert.equal(escritas.length, 0);
});
test("consulta incompleta bloqueia prévia e exclusão", async () => {
    const v = await versao(); invalida = true;
    await assert.rejects(visualizarRemocaoMaterial(id), /verificar/);
    await assert.rejects(removerMaterial(id, v), /verificar/);
    assert.equal(escritas.length, 0);
});
test("material sem vínculos também pode ser excluído", async () => {
    for (const tabela of tabelasVinculos) paginas.delete(tabela);
    const resumo = await visualizarRemocaoMaterial(id);
    assert.ok(Object.values(resumo.contagens).every(n => n === 0));
    await removerMaterial(id, resumo.versao);
    assert.deepEqual(escritas, [id]);
});
