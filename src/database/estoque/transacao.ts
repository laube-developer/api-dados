import { dependenciasEstoque } from "./deps";
import {
    ErroCompensacaoPendente,
    ErroNaoEncontrado,
    ErroOperacaoNaoConcluida,
    ErroSaldoInsuficiente,
    ErroValidacao,
} from "./erros";

export const transacaoConfig = {
    tentativas: 3,
    delaysMs: [200, 400],
    dormir: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};

export function ehErroTransitorio(error: unknown): boolean {
    if (
        error instanceof ErroValidacao
        || error instanceof ErroNaoEncontrado
        || error instanceof ErroSaldoInsuficiente
        || error instanceof ErroOperacaoNaoConcluida
        || error instanceof ErroCompensacaoPendente
    ) {
        return false;
    }
    if (!(error instanceof Error)) {
        return true;
    }
    const match = error.message.match(/Falha na API do Notion \[(\d+)\]/);
    if (match?.[1]) {
        const status = Number(match[1]);
        return status >= 500 || status === 429;
    }
    return true;
}

export async function comRetry<T>(fn: () => Promise<T>): Promise<T> {
    const tentativas = transacaoConfig.tentativas;
    let ultimo: unknown;
    for (let i = 1; i <= tentativas; i++) {
        try {
            return await fn();
        } catch (error) {
            ultimo = error;
            if (!ehErroTransitorio(error) || i === tentativas) {
                throw error;
            }
            const delay = transacaoConfig.delaysMs[i - 1] ?? transacaoConfig.delaysMs[transacaoConfig.delaysMs.length - 1] ?? 0;
            if (delay > 0) {
                await transacaoConfig.dormir(delay);
            }
        }
    }
    throw ultimo;
}

export async function compensarPaginas(ids: string[]): Promise<void> {
    for (const id of ids) {
        if (!id) continue;
        await dependenciasEstoque.arquivarPagina(id);
    }
}

export async function executarComCompensacao<T>(opcoes: {
    executar: () => Promise<T>;
    compensar: () => Promise<void>;
    pendencias?: () => { tabela: string; id: string }[];
}): Promise<T> {
    try {
        return await opcoes.executar();
    } catch (error) {
        if (error instanceof ErroValidacao) {
            throw error;
        }
        try {
            await comRetry(() => opcoes.compensar());
        } catch (compErr) {
            console.error(compErr);
            throw new ErroCompensacaoPendente(opcoes.pendencias?.() ?? []);
        }
        throw new ErroOperacaoNaoConcluida();
    }
}
