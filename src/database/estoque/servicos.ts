import { adicionar, alterar, buscarPorId, listar, listarPaginado } from "./crud";
import { calcularConsumo, somarConsumo } from "./consumo";
import { alocarConsumoPorLotes } from "./lotes";
import { aplicarDeltaSaldo, decrementarSaldo, garantirSaldos, incrementarSaldo, obterSaldo } from "./saldo";
import { compensarPaginas, comRetry, executarComCompensacao } from "./transacao";

export const servicosEstoque = {
    listar,
    listarPaginado,
    buscarPorId,
    adicionar,
    alterar,
    incrementarSaldo,
    decrementarSaldo,
    aplicarDeltaSaldo,
    obterSaldo,
    garantirSaldos,
    calcularConsumo,
    somarConsumo,
    alocarConsumoPorLotes,
    comRetry,
    executarComCompensacao,
    compensarPaginas,
};
