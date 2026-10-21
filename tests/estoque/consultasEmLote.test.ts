import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { dependenciasEstoque } from '../../src/database/estoque/deps';
import { listarPorRelacoes } from '../../src/database/estoque/consultasEmLote';
import { alocarConsumoPorLotes } from '../../src/database/estoque/lotes';
import { garantirSaldos } from '../../src/database/estoque/saldo';
import { calcularConsumo } from '../../src/database/estoque/consumo';
import { ErroSaldoInsuficiente } from '../../src/database/estoque/erros';

const originais = { ...dependenciasEstoque };
const tabelas = ['estoque', 'itens_compra', 'materiais_registro', 'kits_materiais', 'compras'];
let dados: Record<string, any[]>;
let consultas: { tabela: string; filtro: any; cursor: unknown }[];
let comprasLidas: string[];
let falhaTabela: string;
const rel = (id: string) => ({ relation: [{ id }] });
const num = (number: number) => ({ number });
const pagina = (id: string, properties: Record<string, any>) => ({ id, properties });

beforeEach(() => {
    dados = Object.fromEntries(tabelas.map(t => [t, []]));
    consultas = []; comprasLidas = []; falhaTabela = '';
    dependenciasEstoque.buscarTabelasBanco = async () => tabelas.map(nome => ({ id: nome, nome }));
    dependenciasEstoque.chamarNotionAPI = async (endpoint, method, body) => {
        if (endpoint.startsWith('databases/')) {
            const tabela = endpoint.split('/')[1]!;
            if (tabela === falhaTabela) throw Error('Falha simulada');
            assert.equal(method, 'POST');
            assert.ok(body.filter, 'não deve consultar tabela sem filtro');
            consultas.push({ tabela, filtro: body.filter, cursor: body.start_cursor });
            const filtros = body.filter.or ?? [body.filter];
            const linhas = dados[tabela]!.filter(p => filtros.some((f: any) =>
                p.properties[f.property]?.relation?.some((r: any) => r.id === f.relation.contains)));
            const inicio = Number(body.start_cursor ?? 0);
            const fim = inicio + body.page_size;
            return { results: linhas.slice(inicio, fim), has_more: fim < linhas.length, next_cursor: fim < linhas.length ? String(fim) : null };
        }
        assert.equal(method, 'GET', 'buscas em lote não devem escrever dados');
        const id = endpoint.slice('pages/'.length);
        comprasLidas.push(id);
        return dados.compras!.find(p => p.id === id) ?? null;
    };
});
afterEach(() => Object.assign(dependenciasEstoque, originais));

test('agrupa dez materiais em três consultas e deduplica compra compartilhada', async () => {
    const consumo = Array.from({ length: 10 }, (_, i) => ({ material: `m${i}`, quantidade: 2 }));
    dados.compras = [pagina('compra', { data_hora: { date: { start: '2026-01-01' } } })];
    for (const { material } of consumo) {
        dados.estoque!.push(pagina(`e-${material}`, { material: rel(material), quantidade: num(10) }));
        dados.itens_compra!.push(pagina(`l-${material}`, { material: rel(material), compra: rel('compra'), quantidade: num(10), custo: num(100) }));
        dados.materiais_registro!.push(pagina(`r-${material}`, { material: rel(material), item_compra: rel(`l-${material}`), quantidade: num(1) }));
    }
    await garantirSaldos(consumo);
    const alocacoes = await alocarConsumoPorLotes(consumo);
    assert.equal(consultas.length, 3);
    assert.deepEqual(comprasLidas, ['compra']);
    assert.deepEqual(alocacoes, consumo.map(({ material, quantidade }) => ({ material, quantidade, item_compra: `l-${material}`, custo: 20 })));
});

test('mantém FIFO, custo por lote e separação entre materiais', async () => {
    dados.compras = [pagina('nova', { data_hora: { date: { start: '2026-02-01' } } }), pagina('antiga', { data_hora: { date: { start: '2026-01-01' } } })];
    dados.itens_compra = [
        pagina('l-novo', { material: rel('gaze'), compra: rel('nova'), quantidade: num(10), custo: num(200) }),
        pagina('l-luva', { material: rel('luva'), compra: rel('antiga'), quantidade: num(4), custo: num(20) }),
        pagina('l-antigo', { material: rel('gaze'), compra: rel('antiga'), quantidade: num(6), custo: num(60) }),
    ];
    dados.materiais_registro = [pagina('usado', { material: rel('gaze'), item_compra: rel('l-antigo'), quantidade: num(2) })];
    assert.deepEqual(await alocarConsumoPorLotes([{ material: 'gaze', quantidade: 7 }, { material: 'luva', quantidade: 6 }]), [
        { material: 'gaze', item_compra: 'l-antigo', quantidade: 4, custo: 40 },
        { material: 'gaze', item_compra: 'l-novo', quantidade: 3, custo: 60 },
        { material: 'luva', item_compra: 'l-luva', quantidade: 4, custo: 20 },
        { material: 'luva', item_compra: '', quantidade: 2, custo: 0 },
    ]);
    assert.equal(comprasLidas.filter(id => id === 'antiga').length, 1);
});

test('percorre todas as páginas e divide mais de vinte relações em grupos', async () => {
    const ids = Array.from({ length: 25 }, (_, i) => `m${i}`);
    dados.itens_compra = Array.from({ length: 225 }, (_, i) => pagina(`l${i}`, { material: rel(ids[i % ids.length]!), quantidade: num(1) }));
    const linhas = await listarPorRelacoes('itens_compra', 'material', [...ids, 'm0']);
    assert.equal(linhas.length, 225);
    assert.equal(new Set(linhas.map(l => l.id)).size, 225);
    assert.equal(consultas.length, 3);
    assert.ok(consultas.some(c => c.cursor === '100'));
    assert.ok(consultas.every(c => (c.filtro.or ?? [c.filtro]).length <= 20));
});

test('consumo paginado é contabilizado integralmente antes da alocação', async () => {
    dados.itens_compra = [pagina('lote', { material: rel('m'), compra: rel('c'), quantidade: num(130), custo: num(1300) })];
    dados.materiais_registro = Array.from({ length: 125 }, (_, i) => pagina(`r${i}`, { material: rel('m'), item_compra: rel('lote'), quantidade: num(1) }));
    assert.deepEqual(await alocarConsumoPorLotes([{ material: 'm', quantidade: 8 }]), [
        { material: 'm', item_compra: 'lote', quantidade: 5, custo: 50 },
        { material: 'm', item_compra: '', quantidade: 3, custo: 0 },
    ]);
});

test('saldo insuficiente e material sem estoque continuam recusados', async () => {
    dados.estoque = [pagina('e', { material: rel('gaze'), quantidade: num(1) })];
    await assert.rejects(garantirSaldos([{ material: 'gaze', quantidade: 3 }, { material: 'luva', quantidade: 2 }]), (error: unknown) => {
        assert.ok(error instanceof ErroSaldoInsuficiente);
        assert.deepEqual(error.faltas, [{ material: 'gaze', necessario: 3, disponivel: 1 }, { material: 'luva', necessario: 2, disponivel: 0 }]);
        return true;
    });
    assert.equal(consultas.length, 1);
});

test('composição de vários kits é carregada em conjunto preservando quantidades', async () => {
    dados.kits_materiais = [
        pagina('a', { kit: rel('k1'), material: rel('gaze'), quantidade: num(2) }),
        pagina('b', { kit: rel('k2'), material: rel('gaze'), quantidade: num(3) }),
    ];
    assert.deepEqual(await calcularConsumo([{ kit: 'k1', quantidade: 2 }, { kit: 'k2', quantidade: 1 }], [{ material: 'gaze', quantidade: 1 }]), [{ material: 'gaze', quantidade: 8 }]);
    assert.equal(consultas.length, 1);
});

test('listas vazias e consumos zerados não disparam consultas de lotes', async () => {
    assert.deepEqual(await listarPorRelacoes('estoque', 'material', []), []);
    await garantirSaldos([]);
    assert.deepEqual(await alocarConsumoPorLotes([{ material: 'm', quantidade: 0 }]), []);
    assert.equal(consultas.length, 0); assert.equal(comprasLidas.length, 0);
});

test('falha na consulta de consumo não é tratada como histórico vazio', async () => {
    falhaTabela = 'materiais_registro';
    await assert.rejects(alocarConsumoPorLotes([{ material: 'm', quantidade: 1 }]), /Falha simulada/);
});
