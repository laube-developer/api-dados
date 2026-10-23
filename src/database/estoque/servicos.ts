import { adicionar, alterar, buscarPorId, listar, listarPaginado } from "./crud";
import { alterarCompra, removerCompra } from "./alterarCompra";
import { calcularConsumo, somarConsumo } from "./consumo";
import { alocarConsumoPorLotes } from "./lotes";
import { removerRegistro } from "./removerRegistro";
import { removerMaterial, visualizarRemocaoMaterial } from "./removerMaterial";
import { carregarDetalhesRegistro } from "./detalhesRegistro";
import { aplicarDeltaSaldo, decrementarSaldo, garantirSaldos, incrementarSaldo, obterSaldo } from "./saldo";
import { compensarPaginas, comRetry, executarComCompensacao } from "./transacao";

export const servicosEstoque = {
    alterarCompra,
    removerCompra,
    carregarDetalhesRegistro,
    removerRegistro,
    removerMaterial,
    visualizarRemocaoMaterial,
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
