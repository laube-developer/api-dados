import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { alterarCompra, removerCompra } from '../../src/database/estoque/alterarCompra';
import { dependenciasEstoque } from '../../src/database/estoque/deps';
import { transacaoConfig } from '../../src/database/estoque/transacao';
import { registrarCompras } from '../../src/routes/estoque/compras';
import { criarRotasRecurso } from '../../src/routes/estoque/criarRotasRecurso';
import { recursoPorTabela } from '../../src/database/estoque/schema';

const originais = { ...dependenciasEstoque }, config = { ...transacaoConfig };
const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const compra = uuid(1), item = uuid(2), material = uuid(3), fornecedor = uuid(4), saldo = uuid(5), consumo = uuid(6);
const normalizar = (id: string) => id.replaceAll('-', '');
const relation = (id: string) => ({ relation: [{ id }] });
const body = (quantidade: number) => ({ itens: [{ id: item, material, fornecedor, quantidade, custo: 300 }] });
let paginas: Map<string, any>, escritas: string[], banco: string;
let chamadas: { endpoint: string; method: string; body: any }[];
let sequencia = 0, falhar: (id: string, body: any) => boolean;
let fetchOriginal: typeof fetch;
function pagina(id: string, tabela: string, properties = {}) { return { id, parent: { database_id: `${banco}-${tabela}` }, archived: false, properties: { ...(tabela === "compras" ? { data_hora: { date: { start: "2026-01-01T12:00:00Z" } } } : {}), ...properties } }; }
beforeEach(() => {
    banco = `base${++sequencia}`; escritas = []; chamadas = []; falhar = () => false;
    fetchOriginal = globalThis.fetch;
    globalThis.fetch = async () => { throw Error('Rede proibida neste teste isolado'); };
    paginas = new Map([
        [compra, pagina(compra, 'compras')],
        [item, pagina(item, 'itens_compra', { compra: relation(compra), material: relation(material), fornecedor: relation(fornecedor), quantidade: { number: 100 }, custo: { number: 200 } })],
        [material, pagina(material, 'materiais', { nome: { title: [{ text: { content: 'Gaze' } }] } })],
        [fornecedor, pagina(fornecedor, 'fornecedores')],
        [saldo, pagina(saldo, 'estoque', { material: relation(material), quantidade: { number: 70 } })],
        [consumo, pagina(consumo, 'materiais_registro', { registro: relation(uuid(7)), item_compra: relation(item), material: relation(material), quantidade: { number: 30 }, custo: { number: 60 } })],
    ]);
    dependenciasEstoque.buscarTabelasBanco = async () => ['compras', 'itens_compra', 'materiais', 'fornecedores', 'estoque', 'materiais_registro'].map(nome => ({ nome, id: `${banco}-${nome}` }));
    dependenciasEstoque.arquivarPagina = async () => { throw Error('Dependência não simulada'); };
    dependenciasEstoque.buscarConfigEstoquePorDominio = async () => { throw Error('Dependência não simulada'); };
    transacaoConfig.delaysMs = [0, 0];
    dependenciasEstoque.chamarNotionAPI = async (endpoint, method, body) => {
        chamadas.push({ endpoint, method: method ?? 'GET', body: structuredClone(body) });
        if (endpoint.startsWith('databases/')) {
            const db = endpoint.split('/')[1];
            const corresponde = (p: any, filtro: any): boolean => !filtro || (filtro.or
                ? filtro.or.some((f: any) => corresponde(p, f))
                : p.properties[filtro.property]?.relation?.some((r: any) => normalizar(r.id) === normalizar(filtro.relation.contains)));
            const rows = [...paginas.values()].filter(p => p.parent.database_id === db && !p.archived && corresponde(p, body.filter));
            const inicio = Number(body.start_cursor ?? 0), fim = inicio + 100;
            return { results: structuredClone(rows.slice(inicio, fim)), has_more: rows.length > fim, next_cursor: rows.length > fim ? String(fim) : null };
        }
        if (method === 'POST') {
            const id = uuid(1000 + paginas.size);
            const p = { id, ...body, archived: false }; paginas.set(id, p); escritas.push(id);
            if (falhar(id, body)) throw Error('Resposta perdida');
            return structuredClone(p);
        }
        const id = endpoint.slice(6);
        const p = [...paginas.values()].find(p => normalizar(p.id) === normalizar(id));
        if (method === 'GET') return structuredClone(p);
        assert.ok(p, `Página simulada ausente: ${id}`);
        escritas.push(p.id);
        if ('archived' in body) p.archived = body.archived;
        if (body.properties) Object.assign(p.properties, body.properties);
        if (falhar(p.id, body)) throw Error('Resposta perdida');
        return structuredClone(p);
    };
});
afterEach(() => { Object.assign(dependenciasEstoque, originais); Object.assign(transacaoConfig, config); globalThis.fetch = fetchOriginal; });
const qtd = (id: string) => paginas.get(id).properties.quantidade.number;
test('100 → 150 acrescenta 50 ao saldo, preserva consumo e não duplica em reenvio', async () => {
    await alterarCompra(compra, body(150));
    assert.equal(qtd(saldo), 120); assert.equal(qtd(item), 150); assert.equal(qtd(consumo), 30);
    assert.equal(paginas.get(consumo).properties.custo.number, 60);
    await alterarCompra(compra, body(150)); assert.equal(qtd(saldo), 120);
});
test('redução preserva consumo e recalcula custo proporcional', async () => {
    await alterarCompra(compra, body(50)); assert.equal(qtd(saldo), 20);
    assert.equal(paginas.get(consumo).properties.custo.number, 180);
});
test('recusa quantidade abaixo do consumo e item de outra compra antes de gravar', async () => {
    await assert.rejects(alterarCompra(compra, body(20)), /consumo/);
    await assert.rejects(alterarCompra(compra, { itens: [{ ...body(150).itens[0], id: uuid(99) }] }), /pertence/);
    assert.equal(escritas.length, 0);
});
test('recusa compra ou material de outra clínica', async () => {
    paginas.get(compra).parent.database_id = 'outra';
    await assert.rejects(alterarCompra(compra, body(150)), /clínica/);
    paginas.get(compra).parent.database_id = `${banco}-compras`;
    paginas.get(material).parent.database_id = 'outra';
    await assert.rejects(alterarCompra(compra, body(150)), /clínica/);
    assert.equal(escritas.length, 0);
});
test('falha de escrita retorna erro original sem restaurar alterações', async () => {
    falhar = (id, body) => id === saldo && body.properties?.quantidade?.number === 120;
    await assert.rejects(alterarCompra(compra, body(150)), /Resposta perdida/);
    assert.equal(qtd(saldo), 120); assert.equal(qtd(item), 150);
    assert.equal(paginas.get(consumo).properties.custo.number, 60);
});
test('edições sequenciais usam a quantidade mais recente', async () => {
    await alterarCompra(compra, body(150));
    await alterarCompra(compra, body(200));
    assert.equal(qtd(saldo), 170); assert.equal(qtd(item), 200);
});
test('adicionar e remover itens aplica a diferença agregada por material', async () => {
    paginas.delete(consumo);
    await alterarCompra(compra, { itens: [{ material, fornecedor, quantidade: 150, custo: 300 }] });
    assert.equal(qtd(saldo), 120); assert.equal(paginas.get(item).archived, true);
    assert.equal([...paginas.values()].filter(p => p.parent.database_id.endsWith('-itens_compra') && !p.archived).length, 1);
});
test('nova entrada cria saldo ausente', async () => {
    paginas.delete(consumo); paginas.delete(item); paginas.delete(saldo);
    await alterarCompra(compra, { itens: [{ material, fornecedor, quantidade: 150, custo: 300 }] });
    assert.equal([...paginas.values()].find(p => p.parent.database_id.endsWith('-estoque')).properties.quantidade.number, 150);
});
test('falha não bloqueia edições posteriores na mesma base', async () => {
    falhar = id => id === saldo;
    await assert.rejects(alterarCompra(compra, body(150)), /Resposta perdida/);
    const total = escritas.length;
    falhar = () => false;
    await alterarCompra(compra, body(150));
    assert.equal(escritas.length, total); // Reenvio idêntico não precisa gravar novamente.
});
test('rota PATCH específica substitui a genérica e atualiza saldo sem servidor HTTP', async () => {
    const handlers: any[] = [];
    const router: any = { get() {}, post() {}, delete() {}, patch(path: string, handler: any) { if (path === '/compras/:id') handlers.push(handler); } };
    criarRotasRecurso(router, recursoPorTabela('compras')); registrarCompras(router);
    assert.equal(handlers.length, 1);
    let resposta: any;
    const res: any = { status(code: number) { assert.equal(code, 200); return this; }, json(body: any) { resposta = body; return this; } };
    await handlers[0]({ params: { id: compra }, body: body(150) }, res, (error: any) => { throw error; });
    assert.equal(resposta.sucesso, true); assert.equal(qtd(saldo), 120);
});
test('validação recusa itens vazios, repetidos, quantidade fracionária e saldo negativo', async () => {
    for (const itens of [[], [body(150).itens[0], body(150).itens[0]], body(1.5).itens]) {
        await assert.rejects(alterarCompra(compra, { itens }));
    }
    paginas.delete(consumo);
    await assert.rejects(alterarCompra(compra, body(20)), /negativo/);
    assert.equal(escritas.length, 0);
});
test('troca de material sem consumo estorna o antigo e credita o novo', async () => {
    paginas.delete(consumo); paginas.get(saldo).properties.quantidade.number = 100;
    const outro = uuid(20);
    paginas.set(outro, pagina(outro, 'materiais', { nome: { title: [{ text: { content: 'Luva' } }] } }));
    await alterarCompra(compra, { itens: [{ ...body(150).itens[0], material: outro }] });
    assert.equal(qtd(saldo), 0);
    const novoSaldo = [...paginas.values()].find(p => p.parent.database_id.endsWith('-estoque') && p.id !== saldo);
    assert.equal(novoSaldo.properties.quantidade.number, 150);
});
test('POST com resposta perdida retorna erro original sem repetir ou bloquear', async () => {
    falhar = (_id, body) => Boolean(body.parent);
    await assert.rejects(alterarCompra(compra, { itens: [...body(150).itens, { material, fornecedor, quantidade: 5, custo: 10 }] }), /Resposta perdida/);
    assert.equal(escritas.length, 1);
    assert.equal(qtd(saldo), 70); assert.equal(qtd(item), 100);
    falhar = () => false;
    await alterarCompra(compra, { obs: 'Correção posterior' });
    assert.equal(escritas.length, 2);
});
test('falha após criação preserva página nova e alterações já gravadas', async () => {
    falhar = (id, body) => id === saldo && body.properties?.quantidade?.number === 125;
    await assert.rejects(alterarCompra(compra, { itens: [...body(150).itens, { material, fornecedor, quantidade: 5, custo: 10 }] }), /Resposta perdida/);
    assert.equal(qtd(saldo), 125); assert.equal(qtd(item), 150);
    assert.equal([...paginas.values()].filter(p => p.parent.database_id.endsWith('-itens_compra') && !p.archived).length, 2);
});
test('considera todos os itens da compra além da primeira página', async () => {
    const itens = [...body(150).itens];
    for (let i = 0; i < 105; i++) {
        const id = uuid(100 + i);
        paginas.set(id, pagina(id, 'itens_compra', { compra: relation(compra), material: relation(material), fornecedor: relation(fornecedor), quantidade: { number: 1 }, custo: { number: 1 } }));
        itens.push({ id, material, fornecedor, quantidade: 2, custo: 1 });
    }
    await alterarCompra(compra, { itens }); assert.equal(qtd(saldo), 225);
});

function prepararExclusao() {
    paginas.delete(consumo);
    paginas.get(saldo).properties.quantidade.number = 170;
}
test('exclusão arquiva compra e itens e não repete estorno em reenvio sequencial', async () => {
    prepararExclusao();
    await removerCompra(compra);
    await removerCompra(compra);
    assert.equal(qtd(saldo), 70);
    assert.equal(paginas.get(item).archived, true);
    assert.equal(paginas.get(compra).archived, true);
    assert.equal(escritas.filter(id => id === saldo).length, 1);
    assert.equal(escritas.at(-1), compra);
});
test('exclusão recusa consumo vinculado e saldo insuficiente sem escritas', async () => {
    await assert.rejects(removerCompra(compra), /consumida/);
    paginas.delete(consumo);
    await assert.rejects(removerCompra(compra), /negativo/);
    assert.equal(escritas.length, 0);
});
test('exclusão recusa identificador inválido e compra de outra clínica, inclusive arquivada', async () => {
    await assert.rejects(removerCompra('../outro'), /inválido/);
    paginas.get(compra).parent.database_id = 'outra';
    paginas.get(compra).archived = true;
    await assert.rejects(removerCompra(compra), /clínica/);
    assert.equal(escritas.length, 0);
});
test('exclusão reverte gravações inclusive a página cuja resposta se perdeu', async () => {
    prepararExclusao();
    falhar = (id, body) => id === compra && body.archived === true;
    await assert.rejects(removerCompra(compra), /revertidas/);
    assert.equal(qtd(saldo), 170);
    assert.equal(paginas.get(item).archived, false);
    assert.equal(paginas.get(compra).archived, false);
});
test('falha de exclusão não bloqueia operações posteriores na base', async () => {
    prepararExclusao();
    falhar = (id, body) => id === compra && body.archived === true;
    await assert.rejects(removerCompra(compra), /revertidas/);
    falhar = () => false;
    await removerCompra(compra);
    const outra = uuid(99);
    paginas.set(outra, pagina(outra, 'compras'));
    await alterarCompra(outra, { obs: 'Sem bloqueio' });
});
test('edição seguida de exclusão estorna a quantidade atualizada', async () => {
    prepararExclusao();
    await alterarCompra(compra, body(150));
    await removerCompra(compra);
    assert.equal(qtd(saldo), 70);
    assert.equal(paginas.get(compra).archived, true);
});
test('exclusão considera todos os itens, soma mesmo material e preserva outros saldos', async () => {
    prepararExclusao();
    paginas.get(saldo).properties.quantidade.number = 300;
    for (let i = 0; i < 105; i++) {
        const id = uuid(100 + i);
        paginas.set(id, pagina(id, 'itens_compra', { compra: relation(compra), material: relation(material), quantidade: { number: 1 } }));
    }
    const outroSaldo = uuid(900);
    paginas.set(outroSaldo, pagina(outroSaldo, 'estoque', { material: relation(uuid(901)), quantidade: { number: 55 } }));
    await removerCompra(compra);
    assert.equal(qtd(saldo), 95); assert.equal(qtd(outroSaldo), 55);
    assert.equal([...paginas.values()].filter(p => p.parent.database_id.endsWith('-itens_compra') && !p.archived).length, 0);
});
test('exclusão de compra vazia não altera saldos', async () => {
    prepararExclusao(); paginas.delete(item);
    await removerCompra(compra);
    assert.deepEqual(escritas, [compra]); assert.equal(qtd(saldo), 170);
});
test('DELETE /compras/:id registrado executa estorno em memória sem servidor HTTP', async () => {
    prepararExclusao();
    const handlers: any[] = [];
    const router: any = { post() {}, patch() {}, delete(path: string, handler: any) { if (path === '/compras/:id') handlers.push(handler); } };
    registrarCompras(router);
    assert.equal(handlers.length, 1);
    let resposta: any;
    const res: any = { status(code: number) { assert.equal(code, 200); return this; }, json(body: any) { resposta = body; return this; } };
    await handlers[0]({ params: { id: compra } }, res, (error: any) => { throw error; });
    assert.equal(resposta.sucesso, true); assert.equal(resposta.dados.removido, true);
    assert.equal(qtd(saldo), 70); assert.equal(paginas.get(compra).archived, true);
});
test('fluxo pelas rotas: carregar, editar dados, adicionar item, alterar quantidade, remover item e excluir compra', async () => {
    prepararExclusao();
    const rotas: { method: string; path: string; handler: any }[] = [];
    const router: any = Object.fromEntries(['get', 'post', 'patch', 'delete'].map(method => [method, (path: string, handler: any) => rotas.push({ method, path, handler })]));
    for (const tabela of ['compras', 'itens_compra', 'materiais', 'fornecedores', 'estoque']) criarRotasRecurso(router, recursoPorTabela(tabela));
    registrarCompras(router);
    async function chamar(method: string, path: string, body?: any, query = {}) {
        const partes = path.split('/');
        const candidatas = rotas.filter(r => r.method === method && (r.path === path || (partes.length === 3 && r.path === `/${partes[1]}/:id`)));
        assert.equal(candidatas.length, 1, `Rota ausente ou duplicada: ${method} ${path}`);
        let resposta: any, status = 0;
        const res: any = { status(code: number) { status = code; return this; }, json(value: any) { resposta = value; return this; } };
        await candidatas[0]!.handler({ params: { id: partes[2] }, query, body }, res, (error: any) => { throw error; });
        assert.ok(status >= 200 && status < 300, resposta?.erro);
        assert.equal(resposta.sucesso, true);
        return resposta.dados;
    }
    const url = `/compras/${compra}`;
    assert.equal((await chamar('get', url)).id, compra);
    assert.equal((await chamar('get', '/itens-compra', undefined, { compra })).length, 1);
    assert.equal((await chamar('get', '/materiais')).length, 1);
    assert.equal((await chamar('get', '/fornecedores')).length, 1);
    const dados = { data_hora: '2026-01-01T12:47:00-03:00', obs: 'Compra revisada' };
    const original = { id: item, material, fornecedor, quantidade: 100, custo: 200 };
    await chamar('patch', url, { ...dados, itens: [original] });
    assert.equal((await chamar('get', url)).obs, dados.obs); assert.equal(qtd(saldo), 170);
    await chamar('patch', url, { ...dados, itens: [original, { material, fornecedor, quantidade: 25, custo: 50 }] });
    assert.equal(qtd(saldo), 195);
    const itens = await chamar('get', '/itens-compra', undefined, { compra });
    const adicionado = itens.find((i: any) => i.id !== item);
    assert.ok(adicionado); assert.equal(itens.length, 2);
    await chamar('patch', url, { ...dados, itens: [{ ...original, quantidade: 150 }, adicionado] });
    assert.equal(qtd(saldo), 245); assert.equal(qtd(item), 150);
    await chamar('patch', url, { ...dados, itens: [{ ...original, quantidade: 150 }] });
    assert.equal(qtd(saldo), 220); assert.equal(paginas.get(adicionado.id).archived, true);
    assert.equal((await chamar('get', '/itens-compra', undefined, { compra })).length, 1);
    await chamar('delete', url);
    assert.equal(qtd(saldo), 70);
    assert.equal((await chamar('get', '/compras')).length, 0);
    assert.equal((await chamar('get', '/itens-compra', undefined, { compra })).length, 0);
    await chamar('delete', url); assert.equal(qtd(saldo), 70);
});

test('edição aguarda outra operação da mesma base para não disputar saldos ou lotes', async () => {
    const chamar = dependenciasEstoque.chamarNotionAPI;
    let liberar!: () => void, sinalizar!: () => void;
    const suspensa = new Promise<void>(resolve => { sinalizar = resolve; });
    const continuar = new Promise<void>(resolve => { liberar = resolve; });
    let primeira = true;
    dependenciasEstoque.chamarNotionAPI = async (...args) => {
        if (primeira && args[0] === `pages/${compra}` && args[1] === 'GET') {
            primeira = false; sinalizar(); await continuar;
        }
        return chamar(...args);
    };
    const inicial = alterarCompra(compra, { obs: 'Primeira' });
    await suspensa;
    const seguinte = alterarCompra(compra, { obs: 'Segunda' });
    try { await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(escritas, []); }
    finally { liberar(); await Promise.all([inicial, seguinte]); }
    assert.equal(paginas.get(compra).properties.obs.rich_text[0].text.content, 'Segunda');
});

const original = () => ({ id: item, material, fornecedor, quantidade: 100, custo: 200 });
test('alterar só observação com todos os itens faz duas leituras e uma gravação', async () => {
    await alterarCompra(compra, { obs: 'Revisada', itens: [original()] });
    assert.equal(chamadas.length, 3);
    assert.deepEqual(escritas, [compra]);
    assert.deepEqual(chamadas.at(-1)?.body.properties, { obs: { rich_text: [{ text: { content: 'Revisada' } }] } });
});
test('reenvio sem alterações e UUID sem hífen não consulta relações nem grava', async () => {
    await alterarCompra(compra, { itens: [{ ...original(), material: normalizar(material), fornecedor: normalizar(fornecedor) }] });
    assert.equal(chamadas.length, 2);
    assert.equal(escritas.length, 0);
});
test('mudança de fornecedor não consulta consumos ou saldo e grava só fornecedor', async () => {
    const outro = uuid(90);
    paginas.set(outro, pagina(outro, 'fornecedores'));
    await alterarCompra(compra, { itens: [{ ...original(), fornecedor: outro }] });
    assert.deepEqual(escritas, [item]);
    assert.deepEqual(Object.keys(chamadas.at(-1)?.body.properties), ['fornecedor']);
    assert.equal(chamadas.filter(c => /-(estoque|materiais_registro)\/query/.test(c.endpoint)).length, 0);
});
test('agrupa consumos e saldos, valida referências únicas e não regrava custo igual', async () => {
    const outroMaterial = uuid(91), outroItem = uuid(92), outroSaldo = uuid(93);
    paginas.set(outroMaterial, pagina(outroMaterial, 'materiais'));
    paginas.set(outroItem, pagina(outroItem, 'itens_compra', { compra: relation(compra), material: relation(outroMaterial), fornecedor: relation(fornecedor), quantidade: { number: 10 }, custo: { number: 20 } }));
    paginas.set(outroSaldo, pagina(outroSaldo, 'estoque', { material: relation(outroMaterial), quantidade: { number: 10 } }));
    await alterarCompra(compra, { itens: [body(150).itens[0], { id: outroItem, material: outroMaterial, fornecedor, quantidade: 20, custo: 40 }] });
    assert.equal(qtd(saldo), 120); assert.equal(qtd(outroSaldo), 20);
    assert.ok(!escritas.includes(consumo)); // Custo unitário continua 2.
    assert.ok(!escritas.includes(compra));
    assert.equal(chamadas.filter(c => c.endpoint.includes('-materiais_registro/query')).length, 1);
    assert.equal(chamadas.filter(c => c.endpoint.includes('-estoque/query')).length, 1);
    assert.equal(chamadas.filter(c => c.method === 'GET' && normalizar(c.endpoint) === normalizar(`pages/${fornecedor}`)).length, 1);
});
test('consumos em lote paginam até o fim e validam o total antes de gravar', async () => {
    for (let i = 0; i < 105; i++) {
        const id = uuid(500 + i);
        paginas.set(id, pagina(id, 'materiais_registro', { item_compra: relation(item), quantidade: { number: 1 } }));
    }
    await assert.rejects(alterarCompra(compra, body(134)), /consumo/);
    assert.equal(chamadas.filter(c => c.endpoint.includes('-materiais_registro/query')).length, 2);
    assert.equal(escritas.length, 0);
});
test('data equivalente com outro fuso não gera gravação', async () => {
    paginas.get(compra).properties.data_hora = { date: { start: '2026-10-26T12:00:00Z' } };
    await alterarCompra(compra, { data_hora: '2026-10-26T09:00:00-03:00' });
    assert.equal(escritas.length, 0);
});

function loteSeguinte(n: number, unidades: number, custo: number, usado = 0, data = '2026-02-01T12:00:00Z', materialLote = material) {
    const compraId = uuid(n), itemId = uuid(n + 1);
    paginas.set(compraId, pagina(compraId, 'compras', { data_hora: { date: { start: data } } }));
    paginas.set(itemId, pagina(itemId, 'itens_compra', { compra: relation(compraId), material: relation(materialLote), fornecedor: relation(fornecedor), quantidade: { number: unidades }, custo: { number: custo } }));
    if (usado) paginas.set(uuid(n + 2), pagina(uuid(n + 2), 'materiais_registro', { registro: relation(uuid(7)), item_compra: relation(itemId), material: relation(materialLote), quantidade: { number: usado }, custo: { number: usado * custo / unidades } }));
    const saldoPagina = paginas.get(saldo);
    if (materialLote === material) saldoPagina.properties.quantidade.number += unidades - usado;
    return { compraId, itemId };
}
const consumosAtivos = () => [...paginas.values()].filter(p => p.parent.database_id.endsWith('-materiais_registro') && !p.archived);
const vinculo = (id: string) => paginas.get(id).properties.item_compra.relation[0]?.id;

test('excluir compra de 20 consumidos transfere para a compra de 3000 e deixa saldo 2980', async () => {
    paginas.get(item).properties.quantidade.number = 20;
    paginas.get(consumo).properties.quantidade.number = 20;
    paginas.get(saldo).properties.quantidade.number = 0;
    const destino = loteSeguinte(100, 3000, 6000);
    await removerCompra(compra);
    assert.equal(qtd(saldo), 2980);
    assert.equal(vinculo(consumo), destino.itemId);
    assert.equal(paginas.get(consumo).properties.custo.number, 40);
    assert.equal(paginas.get(compra).archived, true);
    assert.equal(paginas.get(item).archived, true);
    assert.equal(consumosAtivos().length, 1);
    await removerCompra(compra); assert.equal(qtd(saldo), 2980);
});
test('remover item na edição preserva o outro item e transfere somente seu consumo', async () => {
    const destino = loteSeguinte(100, 100, 500);
    const mantido = uuid(90);
    paginas.set(mantido, pagina(mantido, 'itens_compra', { compra: relation(compra), material: relation(material), fornecedor: relation(fornecedor), quantidade: { number: 10 }, custo: { number: 20 } }));
    paginas.get(saldo).properties.quantidade.number += 10;
    await alterarCompra(compra, { itens: [{ id: mantido, material, fornecedor, quantidade: 10, custo: 20 }] });
    assert.equal(vinculo(consumo), destino.itemId);
    assert.equal(qtd(saldo), 80);
    assert.equal(paginas.get(mantido).archived, false);
    assert.equal(paginas.get(compra).archived, false);
});
test('divide consumo entre lotes seguintes em ordem cronológica, preservando registro e material', async () => {
    const segundo = loteSeguinte(100, 30, 150, 10, '2026-03-01T00:00:00Z');
    const primeiro = loteSeguinte(200, 10, 20, 0, '2026-02-01T00:00:00Z');
    await removerCompra(compra);
    assert.equal(qtd(saldo), 0);
    assert.equal(vinculo(consumo), primeiro.itemId);
    assert.equal(qtd(consumo), 10);
    assert.equal(paginas.get(consumo).properties.custo.number, 20);
    const parcela = consumosAtivos().find(p => p.id !== consumo && p.id !== uuid(102))!;
    assert.equal(parcela.properties.quantidade.number, 20);
    assert.equal(parcela.properties.item_compra.relation[0].id, segundo.itemId);
    assert.equal(parcela.properties.custo.number, 100);
    assert.equal(parcela.properties.registro.relation[0].id, uuid(7));
    assert.equal(parcela.properties.material.relation[0].id, material);
    assert.equal(consumosAtivos().reduce((s, p) => s + p.properties.quantidade.number, 0), 40);
});
test('capacidade insuficiente nos próximos lotes bloqueia antes de escrever', async () => {
    loteSeguinte(100, 100, 200, 80);
    await assert.rejects(removerCompra(compra), /quantidade consumida.*compras seguintes/);
    assert.equal(escritas.length, 0);
    assert.equal(vinculo(consumo), item);
    assert.equal(qtd(saldo), 90);
});
test('lotes de outro material, anteriores ou de compras arquivadas não recebem consumo', async () => {
    loteSeguinte(100, 1000, 2000, 0, '2025-12-01T00:00:00Z');
    const arquivada = loteSeguinte(200, 1000, 2000);
    paginas.get(arquivada.compraId).archived = true;
    loteSeguinte(300, 1000, 2000, 0, undefined, uuid(99));
    await assert.rejects(removerCompra(compra), /quantidade consumida/);
    assert.equal(escritas.length, 0);
});
test('dois itens removidos compartilham a capacidade do destino sem reservar duas vezes', async () => {
    loteSeguinte(100, 50, 100);
    const outro = uuid(80), outroConsumo = uuid(81);
    paginas.set(outro, pagina(outro, 'itens_compra', { compra: relation(compra), material: relation(material), fornecedor: relation(fornecedor), quantidade: { number: 30 }, custo: { number: 60 } }));
    paginas.set(outroConsumo, pagina(outroConsumo, 'materiais_registro', { registro: relation(uuid(7)), item_compra: relation(outro), material: relation(material), quantidade: { number: 30 }, custo: { number: 60 } }));
    await assert.rejects(removerCompra(compra), /quantidade consumida/);
    assert.equal(escritas.length, 0);
});
test('saldo negativo bloqueia mesmo quando existe capacidade para transferir os consumos', async () => {
    loteSeguinte(100, 100, 200);
    paginas.get(saldo).properties.quantidade.number = 99;
    await assert.rejects(removerCompra(compra), /negativo/);
    assert.equal(escritas.length, 0);
});
test('falha após transferir consumo reverte vínculo, custo, saldo e arquivamentos', async () => {
    loteSeguinte(100, 100, 500);
    falhar = (id, body) => id === compra && body.archived === true;
    await assert.rejects(removerCompra(compra), /revertidas/);
    assert.equal(vinculo(consumo), item);
    assert.equal(paginas.get(consumo).properties.custo.number, 60);
    assert.equal(qtd(saldo), 170);
    assert.equal(paginas.get(item).archived, false);
    assert.equal(paginas.get(compra).archived, false);
});
test('compensação de divisão arquiva parcelas criadas e restaura o consumo original', async () => {
    loteSeguinte(100, 20, 40); loteSeguinte(200, 20, 100);
    falhar = (id, body) => id === compra && body.archived === true;
    await assert.rejects(removerCompra(compra), /revertidas/);
    assert.equal(vinculo(consumo), item); assert.equal(qtd(consumo), 30);
    assert.equal(consumosAtivos().length, 1); assert.equal(qtd(saldo), 110);
});
test('criação de parcela com resposta perdida sinaliza compensação pendente sem repetir POST', async () => {
    loteSeguinte(100, 20, 40); loteSeguinte(200, 20, 100);
    falhar = (_id, body) => Boolean(body.parent);
    await assert.rejects(removerCompra(compra), (error: any) => error.name === 'ErroCompensacaoPendente');
    assert.equal(chamadas.filter(c => c.method === 'POST' && c.endpoint === 'pages').length, 1);
    assert.equal(vinculo(consumo), item); assert.equal(qtd(saldo), 110);
});
test('falha de reversão é comunicada como compensação pendente', async () => {
    loteSeguinte(100, 100, 200);
    falhar = (id, body) => id === compra && body.archived === true || id === consumo && body.properties?.item_compra?.relation?.[0]?.id === item;
    await assert.rejects(removerCompra(compra), (error: any) => error.name === 'ErroCompensacaoPendente' && error.pendencias.some((p: any) => p.id === consumo));
});
test('consumo já existente no destino é contabilizado além da primeira página', async () => {
    const destino = loteSeguinte(100, 130, 260);
    for (let i = 0; i < 105; i++) {
        const id = uuid(400 + i);
        paginas.set(id, pagina(id, 'materiais_registro', { registro: relation(uuid(7)), item_compra: relation(destino.itemId), material: relation(material), quantidade: { number: 1 }, custo: { number: 2 } }));
    }
    await assert.rejects(removerCompra(compra), /quantidade consumida/);
    assert.equal(escritas.length, 0);
    assert.ok(chamadas.some(c => c.endpoint.includes('-materiais_registro/query') && c.body.start_cursor));
});
