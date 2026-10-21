import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { removerRegistro } from '../../src/database/estoque/removerRegistro';
import { dependenciasEstoque } from '../../src/database/estoque/deps';
import { transacaoConfig } from '../../src/database/estoque/transacao';

const deps = { ...dependenciasEstoque };
const config = { ...transacaoConfig };
const id = '00000000-0000-0000-0000-000000000001';
let paginas: Map<string, any>;
let escritas: string[];
let falhar: (id: string, body: any) => boolean;
let seq = 0;
let banco: string;
const relation = (id: string) => ({ relation: [{ id }] });
function pagina(id: string, tabela: string, properties = {}) {
    return { id, parent: { database_id: `${banco}-${tabela}` }, archived: false, properties };
}
beforeEach(() => {
    banco = `base-${++seq}`;
    escritas = []; falhar = () => false;
    paginas = new Map([
        [id, pagina(id, 'registros')],
        ['m1', pagina('m1', 'materiais_registro', { registro: relation(id), material: relation('material'), quantidade: { number: 2 } })],
        ['m2', pagina('m2', 'materiais_registro', { registro: relation(id), material: relation('material'), quantidade: { number: 3 } })],
        ['k1', pagina('k1', 'kits_registro', { registro: relation(id), kit: relation('kit'), quantidade: { number: 1 } })],
        ['saldo', pagina('saldo', 'estoque', { material: relation('material'), quantidade: { number: 10 } })],
    ]);
    dependenciasEstoque.buscarTabelasBanco = async () => ['registros', 'materiais_registro', 'kits_registro', 'estoque'].map(nome => ({ nome, id: `${banco}-${nome}` }));
    transacaoConfig.delaysMs = [0, 0];
    dependenciasEstoque.chamarNotionAPI = async (endpoint, method, body) => {
        if (endpoint.startsWith('databases/')) {
            const db = endpoint.split('/')[1];
            const rows = [...paginas.values()].filter(p => p.parent.database_id === db && !p.archived
                && (!body.filter || p.properties[body.filter.property]?.relation?.some((r: any) => r.id === body.filter.relation.contains)));
            const inicio = Number(body.start_cursor ?? 0);
            const fim = inicio + 100;
            return { results: rows.slice(inicio, fim), has_more: rows.length > fim, next_cursor: rows.length > fim ? String(fim) : null };
        }
        const pageId = endpoint.slice(6);
        const p = paginas.get(pageId);
        if (method === 'GET') return p;
        escritas.push(pageId);
        // Simula resposta perdida depois de o Notion já ter gravado.
        if ('archived' in body) p.archived = body.archived;
        if (body.properties) Object.assign(p.properties, body.properties);
        if (falhar(pageId, body)) throw Error('Falha simulada');
        return p;
    };
});
afterEach(() => { Object.assign(dependenciasEstoque, deps); Object.assign(transacaoConfig, config); });

test('remove pai e todos os itens; repõe materiais uma vez sem recalcular kits', async () => {
    await removerRegistro(id);
    for (const key of [id, 'm1', 'm2', 'k1']) assert.equal(paginas.get(key).archived, true);
    assert.equal(paginas.get('saldo').properties.quantidade.number, 15);
    assert.equal(escritas.at(-1), id);
});
test('duas exclusões simultâneas e reenvio após sucesso não duplicam reposição', async () => {
    await Promise.all([removerRegistro(id), removerRegistro(id)]);
    await removerRegistro(id);
    assert.equal(paginas.get('saldo').properties.quantidade.number, 15);
    assert.equal(escritas.filter(x => x === 'saldo').length, 1);
});
test('recusa registro de outra clínica antes de qualquer escrita', async () => {
    paginas.get(id).parent.database_id = 'outra-base';
    await assert.rejects(removerRegistro(id), /nesta clínica/);
    assert.equal(escritas.length, 0);
});
test('recusa UUID inválido', async () => { await assert.rejects(removerRegistro('../outro'), /inválido/); assert.equal(escritas.length, 0); });
test('recusa saldo ausente sem remover nenhum item', async () => {
    paginas.delete('saldo');
    await assert.rejects(removerRegistro(id), /Saldo ausente/);
    assert.equal(escritas.length, 0);
});
test('resposta perdida em exclusão restaura inclusive a chamada que falhou', async () => {
    falhar = (key, body) => key === 'm2' && body.archived === true;
    await assert.rejects(removerRegistro(id), /revertidas/);
    for (const key of [id, 'm1', 'm2', 'k1']) assert.equal(paginas.get(key).archived, false);
    assert.equal(paginas.get('saldo').properties.quantidade.number, 10);
});
test('falha de compensação é sinalizada e bloqueia nova remoção nesta instância', async () => {
    falhar = key => key === 'm2';
    await assert.rejects(removerRegistro(id), /revisão/);
    const antes = escritas.length;
    await assert.rejects(removerRegistro(id), /pendente/);
    assert.equal(escritas.length, antes);
});
test('remove itens de todas as páginas', async () => {
    for (let i = 0; i < 125; i++) paginas.set(`extra-${i}`, pagina(`extra-${i}`, 'materiais_registro', { registro: relation(id), material: relation('material'), quantidade: { number: 1 } }));
    await removerRegistro(id);
    assert.equal([...paginas.values()].filter(p => p.parent.database_id.endsWith('materiais_registro') && !p.archived).length, 0);
    assert.equal(paginas.get('saldo').properties.quantidade.number, 140);
});
test('registro sem itens pode ser removido', async () => {
    for (const key of ['m1', 'm2', 'k1']) paginas.delete(key);
    await removerRegistro(id);
    assert.deepEqual(escritas, [id]);
});
