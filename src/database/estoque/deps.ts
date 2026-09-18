import { buscarTabelasBanco, chamarNotionAPI } from "../notion";
import { arquivarPagina } from "../notionHelpers";
import { buscarConfigEstoquePorDominio } from "../config/estoque/buscarEstoquePorDominio";

export const dependenciasEstoque = {
    buscarTabelasBanco,
    chamarNotionAPI,
    arquivarPagina,
    buscarConfigEstoquePorDominio,
};
