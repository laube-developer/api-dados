import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { dependenciasEstoque } from '../../src/database/estoque/deps';
import { carregarDetalhesRegistro } from '../../src/database/estoque/detalhesRegistro';

const originais = { ...dependenciasEstoque };
const id = '00000000-0000-0000-0000-000000000001';
let registro: any;
let tabelas: Record<string, any[]>;
let calls: { endpoint: string; body: any }[];
let falha: string;
let quebrarCursor: boolean;
const rel = (id: string) => ({ relation: [{ id }] });
const titulo = (nome: string) => ({ title: [{ text: { content: nome } }] });
const item = (id: string, material: string) => ({ id, properties: { registro: rel('00000000-0000-0000-0000-000000000001'), material: rel(material), quantidade: { number: 3 } } });
beforeEach(() => {
    registro = { id, parent: { database_id: 'db-registros' }, properties: { obs: { rich_text: [{ text: { content: 'Observação' } }] } } };
    tabelas = { materiais_registro: [], kits_registro: [], materiais: [], kits: [] };
    calls = []; falha = ''; quebrarCursor = false;
    dependenciasEstoque.buscarTabelasBanco = async () => ['registros', ...Object.keys(tabelas)].map(nome => ({ nome, id: `db-${nome}` }));
    dependenciasEstoque.chamarNotionAPI = async (endpoint, method, body) => {
        calls.push({ endpoint, body });
        if (endpoint === `pages/${id}`) { assert.equal(method, 'GET'); return registro; }
        assert.equal(method, 'POST', 'detalhes só podem ler dados');
        assert.ok(!endpoint.startsWith('pages/'), 'não pode consultar nomes individualmente');
        const tabela = endpoint.split('/')[1]!.slice(3);
        if (tabela === falha) throw Error('Indisponível');
        if (tabela.endsWith('_registro')) assert.deepEqual(body.filter, { property: 'registro', relation: { contains: id } });
        const inicio = Number(body.start_cursor ?? 0);
        const resultados = tabelas[tabela]!;
        const fim = inicio + body.page_size;
        return { results: resultados.slice(inicio, fim), has_more: fim < resultados.length, next_cursor: quebrarCursor ? null : fim < resultados.length ? String(fim) : null };
    };
});
afterEach(() => Object.assign(dependenciasEstoque, originais));

test('11 materiais aparecem com quatro chamadas ao Notion e sem GET por nome', async () => {
    tabelas.materiais_registro = Array.from({ length: 11 }, (_, i) => item(`item${i}`, `m${i}`));
    tabelas.materiais = Array.from({ length: 11 }, (_, i) => ({ id: `m${i}`, properties: { nome: titulo(`Material ${i}`) } }));
    const resultado = await carregarDetalhesRegistro(id);
    assert.equal(resultado.materiais.length, 11);
    assert.equal(resultado.materiais[10]?.nome, 'Material 10');
    assert.equal(resultado.materiais[10]?.quantidade, 3);
    assert.equal(resultado.obs, 'Observação');
    assert.equal(calls.length, 4);
});
test('materiais e kits retornam juntos, nomes repetidos não geram consultas extras', async () => {
    tabelas.materiais_registro = [item('a', 'm'), item('b', 'm')];
    tabelas.materiais = [{ id: 'm', properties: { nome: titulo('Gaze') } }];
    tabelas.kits_registro = [{ id: 'kitem', properties: { registro: rel(id), kit: rel('k'), quantidade: { number: 2 } } }];
    tabelas.kits = [{ id: 'k', properties: { nome: titulo('Kit') } }];
    const r = await carregarDetalhesRegistro(id);
    assert.deepEqual(r.materiais.map(i => i.nome), ['Gaze', 'Gaze']);
    assert.deepEqual(r.kits, [{ id: 'kitem', nome: 'Kit', quantidade: 2 }]);
    assert.equal(calls.length, 5);
});
test('paginação acima de 100 preserva todos os itens e resolve nomes da segunda página', async () => {
    tabelas.materiais_registro = Array.from({ length: 125 }, (_, i) => item(`item${i}`, `m${i}`));
    tabelas.materiais = Array.from({ length: 125 }, (_, i) => ({ id: `m${i}`, properties: { nome: titulo(`Material ${i}`) } }));
    const r = await carregarDetalhesRegistro(id);
    assert.equal(r.materiais.length, 125); assert.equal(r.materiais[124]?.nome, 'Material 124');
    assert.equal(calls.filter(c => c.body?.start_cursor === '100').length, 2);
});
test('para de ler catálogo assim que encontra todos os nomes necessários', async () => {
    tabelas.materiais_registro = [item('item', 'm0')];
    tabelas.materiais = Array.from({ length: 500 }, (_, i) => ({ id: `m${i}`, properties: { nome: titulo(`Material ${i}`) } }));
    await carregarDetalhesRegistro(id);
    assert.equal(calls.filter(c => c.endpoint.includes('db-materiais/')).length, 1);
});
test('registro de outra clínica é recusado antes de consultar itens ou nomes', async () => {
    registro.parent.database_id = 'outra-clinica';
    await assert.rejects(carregarDetalhesRegistro(id), /nesta clínica/);
    assert.equal(calls.length, 1);
});
test('registro arquivado e UUID inválido são recusados', async () => {
    await assert.rejects(carregarDetalhesRegistro('inválido'), /inválido/); assert.equal(calls.length, 0);
    registro.archived = true;
    await assert.rejects(carregarDetalhesRegistro(id), /não encontrado/);
});
test('registro vazio não consulta catálogos', async () => {
    const r = await carregarDetalhesRegistro(id);
    assert.deepEqual(r, { obs: 'Observação', materiais: [], kits: [] });
    assert.equal(calls.length, 3);
});
test('material e kit excluídos mantêm os itens e suas quantidades', async () => {
    tabelas.materiais_registro = [item('item', 'excluido')];
    tabelas.kits_registro = [{ id: 'ki', properties: { registro: rel(id), kit: rel('excluido'), quantidade: { number: 2 } } }];
    const r = await carregarDetalhesRegistro(id);
    assert.equal(r.materiais[0]?.nome, 'Material excluído'); assert.equal(r.materiais[0]?.quantidade, 3);
    assert.equal(r.kits[0]?.nome, 'Kit excluído'); assert.equal(r.kits[0]?.quantidade, 2);
});
test('falha no catálogo não é tratada como material excluído', async () => {
    tabelas.materiais_registro = [item('item', 'm')]; falha = 'materiais';
    await assert.rejects(carregarDetalhesRegistro(id), /Indisponível/);
});
test('cursor ausente não permite devolver lista parcial como sucesso', async () => {
    tabelas.materiais_registro = Array.from({ length: 125 }, (_, i) => item(`item${i}`, 'm'));
    quebrarCursor = true;
    await assert.rejects(carregarDetalhesRegistro(id), /Paginação incompleta/);
});
