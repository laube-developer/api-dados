import type { Router } from "express";
import { ErroValidacao } from "../../../database/salus/estoque/erros";
import type { RegistroEstoque } from "../../../database/salus/estoque/mapear";
import { servicosEstoque } from "../../../database/salus/estoque/servicos";
import { responderSucesso } from "../../../utils/respostas";
import { tratar } from "./errosHttp";

function validarKits(kits: unknown): { kit: string; quantidade: number }[] {
    if (kits === undefined) {
        return [];
    }
    if (!Array.isArray(kits)) {
        throw new ErroValidacao("O campo 'kits' deve ser um array.");
    }
    return kits.map((item, indice) => {
        const kit = String((item as any)?.kit ?? "").trim();
        const quantidade = (item as any)?.quantidade;
        if (!kit) {
            throw new ErroValidacao(`O kit na posição ${indice} precisa do campo 'kit'.`);
        }
        if (typeof quantidade !== "number" || !Number.isInteger(quantidade) || quantidade < 0) {
            throw new ErroValidacao(`O kit na posição ${indice} precisa de 'quantidade' inteiro ≥ 0.`);
        }
        return { kit, quantidade };
    });
}

function validarMateriais(materiais: unknown): { material: string; quantidade: number }[] {
    if (materiais === undefined) {
        return [];
    }
    if (!Array.isArray(materiais)) {
        throw new ErroValidacao("O campo 'materiais' deve ser um array.");
    }
    return materiais.map((item, indice) => {
        const material = String((item as any)?.material ?? "").trim();
        const quantidade = (item as any)?.quantidade;
        if (!material) {
            throw new ErroValidacao(`O material na posição ${indice} precisa do campo 'material'.`);
        }
        if (typeof quantidade !== "number" || !Number.isInteger(quantidade) || quantidade < 0) {
            throw new ErroValidacao(`O material na posição ${indice} precisa de 'quantidade' inteiro ≥ 0.`);
        }
        return { material, quantidade };
    });
}

async function baixarConsumo(consumo: { material: string; quantidade: number }[]) {
    for (const item of consumo) {
        await servicosEstoque.comRetry(() => servicosEstoque.decrementarSaldo(item.material, item.quantidade));
    }
}

async function reporConsumo(consumo: { material: string; quantidade: number }[]) {
    for (const item of [...consumo].reverse()) {
        await servicosEstoque.aplicarDeltaSaldo(item.material, item.quantidade);
    }
}

export function registrarRegistros(router: Router) {
    router.post("/registros", tratar(async (req, res) => {
        const body = req.body ?? {};
        const { kits, materiais, ...dados } = body;
        const kitsValidos = validarKits(kits);
        const materiaisValidos = validarMateriais(materiais);

        if (kitsValidos.length === 0 && materiaisValidos.length === 0) {
            const registro = await servicosEstoque.adicionar("registros", dados);
            return responderSucesso(res, registro, 201);
        }

        const consumo = await servicosEstoque.calcularConsumo(kitsValidos, materiaisValidos);
        await servicosEstoque.garantirSaldos(consumo);

        const criados: { tabela: string; id: string }[] = [];
        const baixados: { material: string; quantidade: number }[] = [];

        const resultado = await servicosEstoque.executarComCompensacao({
            executar: async () => {
                const registro = await servicosEstoque.adicionar("registros", dados);
                criados.push({ tabela: "registros", id: String(registro.id) });
                const kitsCriados: RegistroEstoque[] = [];
                const materiaisCriados: RegistroEstoque[] = [];
                for (const kit of kitsValidos) {
                    const linha = await servicosEstoque.adicionar("kits_registro", { ...kit, registro: registro.id });
                    criados.push({ tabela: "kits_registro", id: String(linha.id) });
                    kitsCriados.push(linha);
                }
                for (const material of materiaisValidos) {
                    const linha = await servicosEstoque.adicionar("materiais_registro", {
                        ...material,
                        registro: registro.id,
                    });
                    criados.push({ tabela: "materiais_registro", id: String(linha.id) });
                    materiaisCriados.push(linha);
                }
                await baixarConsumo(consumo);
                baixados.push(...consumo);
                return { ...registro, kits: kitsCriados, materiais: materiaisCriados };
            },
            compensar: async () => {
                await reporConsumo(baixados);
                await servicosEstoque.compensarPaginas([...criados].reverse().map((c) => c.id));
            },
            pendencias: () => criados,
        });

        return responderSucesso(res, resultado, 201);
    }));

    router.post("/kits-registro", tratar(async (req, res) => {
        const dados = req.body ?? {};
        const kit = String(dados.kit ?? "").trim();
        const quantidade = dados.quantidade;
        const kits = validarKits([{ kit, quantidade }]);
        const consumo = await servicosEstoque.calcularConsumo(kits, []);
        await servicosEstoque.garantirSaldos(consumo);

        const criados: { tabela: string; id: string }[] = [];
        const baixados: { material: string; quantidade: number }[] = [];

        const resultado = await servicosEstoque.executarComCompensacao({
            executar: async () => {
                const linha = await servicosEstoque.adicionar("kits_registro", dados);
                criados.push({ tabela: "kits_registro", id: String(linha.id) });
                await baixarConsumo(consumo);
                baixados.push(...consumo);
                return linha;
            },
            compensar: async () => {
                await reporConsumo(baixados);
                await servicosEstoque.compensarPaginas([...criados].reverse().map((c) => c.id));
            },
            pendencias: () => criados,
        });

        return responderSucesso(res, resultado, 201);
    }));

    router.post("/materiais-registro", tratar(async (req, res) => {
        const dados = req.body ?? {};
        const materiais = validarMateriais([{ material: dados.material, quantidade: dados.quantidade }]);
        const consumo = await servicosEstoque.calcularConsumo([], materiais);
        await servicosEstoque.garantirSaldos(consumo);

        const criados: { tabela: string; id: string }[] = [];
        const baixados: { material: string; quantidade: number }[] = [];

        const resultado = await servicosEstoque.executarComCompensacao({
            executar: async () => {
                const linha = await servicosEstoque.adicionar("materiais_registro", dados);
                criados.push({ tabela: "materiais_registro", id: String(linha.id) });
                await baixarConsumo(consumo);
                baixados.push(...consumo);
                return linha;
            },
            compensar: async () => {
                await reporConsumo(baixados);
                await servicosEstoque.compensarPaginas([...criados].reverse().map((c) => c.id));
            },
            pendencias: () => criados,
        });

        return responderSucesso(res, resultado, 201);
    }));

    router.patch("/kits-registro/:id", tratar(async (req, res) => {
        const id = String(req.params.id ?? "");
        const atual = await servicosEstoque.buscarPorId("kits_registro", id);
        const patch = req.body ?? {};
        const qtdAntiga = typeof atual.quantidade === "number" ? atual.quantidade : 0;
        const qtdNova = "quantidade" in patch ? patch.quantidade : qtdAntiga;
        const kit = String(("kit" in patch ? patch.kit : atual.kit) ?? "");

        if (qtdNova === qtdAntiga && !("kit" in patch)) {
            const linha = await servicosEstoque.alterar("kits_registro", id, patch);
            return responderSucesso(res, linha);
        }

        const consumoAntigo = await servicosEstoque.calcularConsumo(
            [{ kit: String(atual.kit ?? ""), quantidade: qtdAntiga }],
            []
        );
        const consumoNovo = await servicosEstoque.calcularConsumo(
            [{ kit, quantidade: typeof qtdNova === "number" ? qtdNova : qtdAntiga }],
            []
        );
        const deltaPorMaterial = new Map<string, number>();
        for (const item of consumoNovo) {
            deltaPorMaterial.set(item.material, (deltaPorMaterial.get(item.material) ?? 0) + item.quantidade);
        }
        for (const item of consumoAntigo) {
            deltaPorMaterial.set(item.material, (deltaPorMaterial.get(item.material) ?? 0) - item.quantidade);
        }
        const aBaixar = [...deltaPorMaterial.entries()]
            .filter(([, qtd]) => qtd > 0)
            .map(([material, quantidade]) => ({ material, quantidade }));
        await servicosEstoque.garantirSaldos(aBaixar);

        const aplicados: { material: string; quantidade: number }[] = [];
        let alterouLinha = false;

        const resultado = await servicosEstoque.executarComCompensacao({
            executar: async () => {
                for (const [material, delta] of deltaPorMaterial) {
                    if (delta === 0) continue;
                    await servicosEstoque.comRetry(() => servicosEstoque.aplicarDeltaSaldo(material, -delta));
                    aplicados.push({ material, quantidade: delta });
                }
                const linha = await servicosEstoque.alterar("kits_registro", id, patch);
                alterouLinha = true;
                return linha;
            },
            compensar: async () => {
                if (alterouLinha) {
                    await servicosEstoque.alterar("kits_registro", id, {
                        quantidade: qtdAntiga,
                        kit: atual.kit,
                    });
                }
                for (const item of [...aplicados].reverse()) {
                    await servicosEstoque.aplicarDeltaSaldo(item.material, item.quantidade);
                }
            },
            pendencias: () => [{ tabela: "kits_registro", id }],
        });

        return responderSucesso(res, resultado);
    }));

    router.patch("/materiais-registro/:id", tratar(async (req, res) => {
        const id = String(req.params.id ?? "");
        const atual = await servicosEstoque.buscarPorId("materiais_registro", id);
        const patch = req.body ?? {};
        const qtdAntiga = typeof atual.quantidade === "number" ? atual.quantidade : 0;
        const qtdNova = "quantidade" in patch ? Number(patch.quantidade) : qtdAntiga;
        const materialAntigo = String(atual.material ?? "");
        const materialNovo = String(("material" in patch ? patch.material : materialAntigo) ?? "");

        if (materialNovo === materialAntigo && qtdNova === qtdAntiga) {
            const linha = await servicosEstoque.alterar("materiais_registro", id, patch);
            return responderSucesso(res, linha);
        }

        if (materialNovo === materialAntigo) {
            const delta = qtdNova - qtdAntiga;
            if (delta > 0) {
                await servicosEstoque.garantirSaldos([{ material: materialNovo, quantidade: delta }]);
            }
        } else {
            await servicosEstoque.garantirSaldos([{ material: materialNovo, quantidade: qtdNova }]);
        }

        const aplicados: { material: string; quantidade: number }[] = [];
        let alterouLinha = false;

        const resultado = await servicosEstoque.executarComCompensacao({
            executar: async () => {
                if (materialNovo === materialAntigo) {
                    const delta = qtdNova - qtdAntiga;
                    await servicosEstoque.comRetry(() => servicosEstoque.aplicarDeltaSaldo(materialNovo, -delta));
                    aplicados.push({ material: materialNovo, quantidade: delta });
                } else {
                    await servicosEstoque.comRetry(() => servicosEstoque.aplicarDeltaSaldo(materialAntigo, qtdAntiga));
                    aplicados.push({ material: materialAntigo, quantidade: -qtdAntiga });
                    await servicosEstoque.comRetry(() => servicosEstoque.aplicarDeltaSaldo(materialNovo, -qtdNova));
                    aplicados.push({ material: materialNovo, quantidade: qtdNova });
                }
                const linha = await servicosEstoque.alterar("materiais_registro", id, patch);
                alterouLinha = true;
                return linha;
            },
            compensar: async () => {
                if (alterouLinha) {
                    await servicosEstoque.alterar("materiais_registro", id, {
                        quantidade: qtdAntiga,
                        material: materialAntigo,
                    });
                }
                for (const item of [...aplicados].reverse()) {
                    await servicosEstoque.aplicarDeltaSaldo(item.material, item.quantidade);
                }
            },
            pendencias: () => [{ tabela: "materiais_registro", id }],
        });

        return responderSucesso(res, resultado);
    }));
}
