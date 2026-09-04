import { buscarTabelasBanco, chamarNotionAPI } from "../../notion";
import { arquivarPagina } from "../../notionHelpers";

export const dependenciasEstoque = {
    buscarTabelasBanco,
    chamarNotionAPI,
    arquivarPagina,
};
