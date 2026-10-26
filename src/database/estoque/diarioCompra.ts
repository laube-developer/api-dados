import { ErroCompensacaoPendente, ErroOperacaoNaoConcluida, ErroSaldoInsuficiente, ErroValidacao } from "./erros";
import type { RegistroEstoque } from "./mapear";
import { recursoPorTabela } from "./schema";

type Servicos = {
    listar: (tabela: string, query: Record<string, unknown>) => Promise<RegistroEstoque[]>;
    adicionar: (tabela: string, dados: Record<string, unknown>) => Promise<RegistroEstoque>;
    alterar: (tabela: string, id: string, dados: Record<string, unknown>) => Promise<RegistroEstoque>;
    compensarPaginas: (ids: string[]) => Promise<void>;
    comRetry: <T>(fn: () => Promise<T>) => Promise<T>;
};
type Operacao = {
    tabela: string;
    id: string;
    estado: "tentada" | "concluida" | "revertida";
    antes?: Record<string, unknown>;
    reverter: () => Promise<unknown>;
};

/** Diário em memória exclusivo desta chamada; descartado ao terminar a operação. */
export class DiarioCompra {
    private readonly operacoes: Operacao[] = [];
    private readonly saldos = new Map<string, RegistroEstoque | null>();
    private criacaoIncerta: { tabela: string; id: string } | undefined;

    constructor(private readonly servicos: Servicos) {}

    async criar(tabela: string, dados: Record<string, unknown>): Promise<RegistroEstoque> {
        // Uma criação sem resposta não tem ID conhecido para compensação segura.
        this.criacaoIncerta = { tabela, id: String(dados.material ?? dados.compra ?? "criação sem resposta") };
        let linha: RegistroEstoque;
        try { linha = await this.servicos.adicionar(tabela, dados); }
        catch (error) {
            if (error instanceof ErroValidacao) this.criacaoIncerta = undefined;
            throw error;
        }
        if (!linha.id) throw new Error("Criação sem identificador na resposta.");
        this.operacoes.push({ tabela, id: linha.id, estado: "concluida",
            reverter: () => this.servicos.compensarPaginas([linha.id]) });
        this.criacaoIncerta = undefined;
        return linha;
    }

    async alterar(tabela: string, atual: RegistroEstoque, patch: Record<string, unknown>): Promise<RegistroEstoque> {
        const campos = new Set(recursoPorTabela(tabela).campos.map(campo => campo.nome));
        const chaves = Object.keys(patch).filter(chave => campos.has(chave));
        const depois = structuredClone(Object.fromEntries(chaves.map(chave => [chave, patch[chave]])));
        const antes = structuredClone(Object.fromEntries(chaves.map(chave => [chave, atual[chave]])));
        const operacao: Operacao = { tabela, id: atual.id, antes, estado: "tentada",
            reverter: () => this.servicos.alterar(tabela, atual.id, antes) };
        // Registrar antes de enviar: a escrita pode ocorrer mesmo se a resposta se perder.
        this.operacoes.push(operacao);
        const resultado = await this.servicos.comRetry(() => this.servicos.alterar(tabela, atual.id, depois));
        operacao.estado = "concluida";
        return resultado;
    }

    async aplicarDeltaSaldo(material: string, delta: number): Promise<void> {
        if (!Number.isSafeInteger(delta)) throw new ErroValidacao("Quantidade fora do limite permitido.");
        if (!delta) return;
        const chave = material.replaceAll("-", "").toLowerCase();
        if (!this.saldos.has(chave)) {
            const linhas = await this.servicos.listar("estoque", { material });
            if (linhas.length > 1) throw new ErroValidacao("Saldo duplicado. Regularize o estoque antes de alterar a compra.");
            this.saldos.set(chave, linhas[0] ? structuredClone(linhas[0]) : null);
        }
        const atual = this.saldos.get(chave);
        const quantidade = atual?.quantidade ?? 0;
        if (typeof quantidade !== "number" || !Number.isSafeInteger(quantidade) || quantidade < 0) throw new ErroValidacao("Saldo inválido.");
        const final = quantidade + delta;
        if (!Number.isSafeInteger(final)) throw new ErroValidacao("Saldo fora do limite permitido.");
        if (final < 0) throw new ErroSaldoInsuficiente([{ material, necessario: -delta, disponivel: quantidade }]);
        if (atual) {
            // Todas as tentativas escrevem o mesmo valor final, sem somar novamente.
            await this.alterar("estoque", atual, { quantidade: final });
            this.saldos.set(chave, { ...atual, quantidade: final });
        } else {
            this.saldos.set(chave, await this.criar("estoque", { material, quantidade: final }));
        }
    }

    async executar<T>(executar: () => Promise<T>): Promise<T> {
        try { return await executar(); }
        catch (error) {
            const falhas: { tabela: string; id: string }[] = this.criacaoIncerta ? [this.criacaoIncerta] : [];
            for (const operacao of [...this.operacoes].reverse()) {
                try {
                    await this.servicos.comRetry(operacao.reverter);
                    operacao.estado = "revertida";
                } catch { falhas.push({ tabela: operacao.tabela, id: operacao.id }); }
            }
            if (falhas.length) throw new ErroCompensacaoPendente(falhas, "A operação falhou e existem alterações que precisam de revisão do estoque.");
            if (error instanceof ErroValidacao || error instanceof ErroSaldoInsuficiente) throw error;
            throw new ErroOperacaoNaoConcluida("Não foi possível concluir a operação. As alterações foram revertidas.");
        } finally {
            this.operacoes.length = 0;
            this.saldos.clear();
            this.criacaoIncerta = undefined;
        }
    }
}
