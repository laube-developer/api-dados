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
function pagina(id: string, tabela: string, properties = {}) { return { id, parent: { database_id: `${banco}-${tabela}` }, archived: false, properties }; }
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
        [consumo, pagina(consumo, 'materiais_registro', { item_compra: relation(item), material: relation(material), quantidade: { number: 30 }, custo: { number: 60 } })],
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
    await assert.rejects(removerCompra(compra), /consumo/);
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
test('exclusão retorna erro original sem reverter gravações', async () => {
    prepararExclusao();
    falhar = (id, body) => id === compra && body.archived === true;
    await assert.rejects(removerCompra(compra), /Resposta perdida/);
    assert.equal(qtd(saldo), 70);
    assert.equal(paginas.get(item).archived, true);
    assert.equal(paginas.get(compra).archived, true);
});
test('falha de exclusão não bloqueia operações posteriores na base', async () => {
    prepararExclusao();
    falhar = id => id === compra;
    await assert.rejects(removerCompra(compra), /Resposta perdida/);
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

test('edição não aguarda outra operação da mesma base', async () => {
    const chamar = dependenciasEstoque.chamarNotionAPI;
    let liberar!: () => void;
    let sinalizar!: () => void;
    const suspensa = new Promise<void>(resolve => { sinalizar = resolve; });
    const continuar = new Promise<void>(resolve => { liberar = resolve; });
    let primeira = true;
    dependenciasEstoque.chamarNotionAPI = async (...args) => {
        if (primeira && args[0] === `pages/${compra}` && args[1] === 'GET') {
            primeira = false;
            sinalizar();
            await continuar;
        }
        return chamar(...args);
    };
    const inicial = alterarCompra(compra, { obs: 'Primeira' });
    await suspensa;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        await Promise.race([
            alterarCompra(compra, { obs: 'Segunda' }),
            new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Edição ficou na fila')), 1000); }),
        ]);
        assert.deepEqual(escritas, [compra]);
    } finally {
        clearTimeout(timer);
        liberar();
        await inicial;
    }
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
