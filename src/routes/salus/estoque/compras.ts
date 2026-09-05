import type { Router } from "express";
import { ErroValidacao } from "../../../database/salus/estoque/erros";
import type { RegistroEstoque } from "../../../database/salus/estoque/mapear";
import { servicosEstoque } from "../../../database/salus/estoque/servicos";
import { responderSucesso } from "../../../utils/respostas";
import { tratar } from "./errosHttp";

function validarItens(itens: unknown): { material: string; fornecedor: string; quantidade: number }[] {
    if (!Array.isArray(itens)) {
        throw new ErroValidacao("O campo 'itens' deve ser um array.");
    }
    return itens.map((item, indice) => {
        if (!item || typeof item !== "object") {
            throw new ErroValidacao(`O item na posição ${indice} é inválido.`);
        }
        const material = String((item as any).material ?? "").trim();
        const fornecedor = String((item as any).fornecedor ?? "").trim();
        const quantidade = (item as any).quantidade;
        if (!material) {
            throw new ErroValidacao(`O item na posição ${indice} precisa do campo 'material'.`);
        }
        if (!fornecedor) {
            throw new ErroValidacao(`O item na posição ${indice} precisa do campo 'fornecedor'.`);
        }
        if (typeof quantidade !== "number" || !Number.isInteger(quantidade) || quantidade < 0) {
            throw new ErroValidacao(`O item na posição ${indice} precisa de 'quantidade' inteiro ≥ 0.`);
        }
        return { material, fornecedor, quantidade };
    });
}

export function registrarCompras(router: Router) {
    router.post("/compras", tratar(async (req, res) => {
        const body = req.body ?? {};
        const { itens, ...dados } = body;
        if (itens === undefined || (Array.isArray(itens) && itens.length === 0)) {
            const compra = await servicosEstoque.adicionar("compras", dados);
            return responderSucesso(res, compra, 201);
        }

        const itensValidos = validarItens(itens);
        const criados: { tabela: string; id: string }[] = [];
        const deltas: { material: string; quantidade: number }[] = [];

        const resultado = await servicosEstoque.executarComCompensacao({
            executar: async () => {
                const compra = await servicosEstoque.adicionar("compras", dados);
                criados.push({ tabela: "compras", id: String(compra.id) });
                const itensCriados: RegistroEstoque[] = [];
                for (const item of itensValidos) {
                    const linha = await servicosEstoque.adicionar("itens_compra", {
                        ...item,
                        compra: compra.id,
                    });
                    criados.push({ tabela: "itens_compra", id: String(linha.id) });
                    itensCriados.push(linha);
                    await servicosEstoque.comRetry(() =>
                        servicosEstoque.incrementarSaldo(item.material, item.quantidade)
                    );
                    deltas.push({ material: item.material, quantidade: item.quantidade });
                }
                return { ...compra, itens: itensCriados };
            },
            compensar: async () => {
                for (const delta of [...deltas].reverse()) {
                    await servicosEstoque.aplicarDeltaSaldo(delta.material, -delta.quantidade);
                }
                await servicosEstoque.compensarPaginas([...criados].reverse().map((c) => c.id));
            },
            pendencias: () => [
                ...criados,
                ...deltas.map((d) => ({ tabela: "estoque", id: d.material })),
            ],
        });

        return responderSucesso(res, resultado, 201);
    }));

    router.post("/itens-compra", tratar(async (req, res) => {
        const dados = req.body ?? {};
        const criados: { tabela: string; id: string }[] = [];
        const deltas: { material: string; quantidade: number }[] = [];

        const resultado = await servicosEstoque.executarComCompensacao({
            executar: async () => {
                const linha = await servicosEstoque.adicionar("itens_compra", dados);
                criados.push({ tabela: "itens_compra", id: String(linha.id) });
                const material = String(linha.material ?? dados.material ?? "");
                const quantidade = typeof linha.quantidade === "number" ? linha.quantidade : Number(dados.quantidade);
                await servicosEstoque.comRetry(() => servicosEstoque.incrementarSaldo(material, quantidade));
                deltas.push({ material, quantidade });
                return linha;
            },
            compensar: async () => {
                for (const delta of [...deltas].reverse()) {
                    await servicosEstoque.aplicarDeltaSaldo(delta.material, -delta.quantidade);
                }
                await servicosEstoque.compensarPaginas([...criados].reverse().map((c) => c.id));
            },
            pendencias: () => [
                ...criados,
                ...deltas.map((d) => ({ tabela: "estoque", id: d.material })),
            ],
        });

        return responderSucesso(res, resultado, 201);
    }));

    router.patch("/itens-compra/:id", tratar(async (req, res) => {
        const id = String(req.params.id ?? "");
        const atual = await servicosEstoque.buscarPorId("itens_compra", id);
        const patch = req.body ?? {};
        const quantidadeNova = "quantidade" in patch ? patch.quantidade : atual.quantidade;
        const materialNovo = "material" in patch ? patch.material : atual.material;
        const qtdAntiga = typeof atual.quantidade === "number" ? atual.quantidade : 0;
        const qtdNova = typeof quantidadeNova === "number" ? quantidadeNova : qtdAntiga;
        const materialAntigo = String(atual.material ?? "");
        const materialFinal = String(materialNovo ?? materialAntigo);

        if (materialFinal === materialAntigo && qtdNova === qtdAntiga) {
            const linha = await servicosEstoque.alterar("itens_compra", id, patch);
            return responderSucesso(res, linha);
        }

        const deltas: { material: string; quantidade: number }[] = [];
        let alterouLinha = false;

        const resultado = await servicosEstoque.executarComCompensacao({
            executar: async () => {
                if (materialFinal === materialAntigo) {
                    const delta = qtdNova - qtdAntiga;
                    await servicosEstoque.comRetry(() => servicosEstoque.aplicarDeltaSaldo(materialFinal, delta));
                    deltas.push({ material: materialFinal, quantidade: delta });
                } else {
                    await servicosEstoque.comRetry(() => servicosEstoque.aplicarDeltaSaldo(materialAntigo, -qtdAntiga));
                    deltas.push({ material: materialAntigo, quantidade: -qtdAntiga });
                    await servicosEstoque.comRetry(() => servicosEstoque.aplicarDeltaSaldo(materialFinal, qtdNova));
                    deltas.push({ material: materialFinal, quantidade: qtdNova });
                }
                const linha = await servicosEstoque.alterar("itens_compra", id, patch);
                alterouLinha = true;
                return linha;
            },
            compensar: async () => {
                if (alterouLinha) {
                    await servicosEstoque.alterar("itens_compra", id, {
                        quantidade: qtdAntiga,
                        material: materialAntigo,
                    });
                }
                for (const delta of [...deltas].reverse()) {
                    await servicosEstoque.aplicarDeltaSaldo(delta.material, -delta.quantidade);
                }
            },
            pendencias: () => [{ tabela: "itens_compra", id }],
        });

        return responderSucesso(res, resultado);
    }));
}
