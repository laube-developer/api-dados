import { after, afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { criarApp } from "../../src/app";
import { dependenciasEstoque } from "../../src/database/estoque/deps";
import { servicosEstoque } from "../../src/database/estoque/servicos";
import { ErroValidacao } from "../../src/database/estoque/erros";
import { TOKEN_TESTE, CONFIG_ESTOQUE_TESTE, comDominioEstoque, subirServidor, chamar } from "../helpers/http";

const deps = { ...dependenciasEstoque }, servicos = { ...servicosEstoque };
const id = "00000000-0000-0000-0000-000000000001";
let url: string, fechar: () => Promise<void>;
let chamadas: unknown[];
process.env.AUTH_TOKEN = TOKEN_TESTE;
before(async () => { const servidor = await subirServidor(criarApp()); url = servidor.url; fechar = servidor.fechar; });
after(async () => { await fechar(); });
beforeEach(() => {
    chamadas = [];
    dependenciasEstoque.buscarConfigEstoquePorDominio = async () => CONFIG_ESTOQUE_TESTE;
    servicosEstoque.editarCompra = async (id, body) => { chamadas.push({ id, body }); return { id, atualizado: true }; };
    servicosEstoque.removerCompra = async id => { chamadas.push(id); return { id, removido: true }; };
});
afterEach(() => { Object.assign(dependenciasEstoque, deps); Object.assign(servicosEstoque, servicos); });
test("PATCH usa o serviço completo de compra e preserva os itens recebidos", async () => {
    const body = { obs: "Corrigida", itens: [{ material: id, fornecedor: id, quantidade: 5, custo: 20 }] };
    const result = await chamar(url, "PATCH", comDominioEstoque(`/estoque/compras/${id}`), { body });
    assert.equal(result.status, 200);
    assert.equal(result.json.sucesso, true);
    assert.deepEqual(chamadas, [{ id, body }]);
});
test("DELETE encaminha exclusão ao serviço e responde com envelope", async () => {
    const result = await chamar(url, "DELETE", comDominioEstoque(`/estoque/compras/${id}`));
    assert.equal(result.status, 200);
    assert.deepEqual(result.json, { sucesso: true, dados: { id, removido: true } });
    assert.deepEqual(chamadas, [id]);
});
test("rotas exigem autenticação antes de chamar os serviços", async () => {
    for (const method of ["PATCH", "DELETE"]) {
        const result = await chamar(url, method, comDominioEstoque(`/estoque/compras/${id}`), { token: null });
        assert.equal(result.status, 401);
    }
    assert.equal(chamadas.length, 0);
});
test("rejeição de compra com consumo vinculado retorna 400", async () => {
    servicosEstoque.removerCompra = async () => { throw new ErroValidacao("Esta compra possui consumo vinculado."); };
    const result = await chamar(url, "DELETE", comDominioEstoque(`/estoque/compras/${id}`));
    assert.equal(result.status, 400);
    assert.match(result.json.erro, /consumo vinculado/);
});
test("edição e exclusão da mesma base não executam simultaneamente", async () => {
    let liberar!: () => void, iniciou!: () => void;
    const espera = new Promise<void>(resolve => { liberar = resolve; });
    const inicio = new Promise<void>(resolve => { iniciou = resolve; });
    servicosEstoque.editarCompra = async () => { chamadas.push("editar"); iniciou(); await espera; chamadas.push("fim-editar"); return { id, atualizado: true }; };
    const patch = chamar(url, "PATCH", comDominioEstoque(`/estoque/compras/${id}`), { body: {} });
    await inicio;
    const exclusao = chamar(url, "DELETE", comDominioEstoque(`/estoque/compras/${id}`));
    liberar();
    await Promise.all([patch, exclusao]);
    assert.deepEqual(chamadas, ["editar", "fim-editar", id]);
});
