import { buscarTabelasBanco, chamarNotionAPI } from "../notion.js";
export class ErroValidacao extends Error {
    constructor(mensagem) {
        super(mensagem);
        this.name = "ErroValidacao";
    }
}
function validarDadosMedico(dados) {
    const erros = [];
    if (typeof dados.id_unico !== "string" || !dados.id_unico.trim()) {
        erros.push("O campo 'id_unico' é obrigatório.");
    }
    if (typeof dados.nome !== "string" || !dados.nome.trim()) {
        erros.push("O campo 'nome' é obrigatório.");
    }
    if (erros.length > 0) {
        throw new ErroValidacao(erros.join(" "));
    }
}
function mapearPaginaParaMedico(page) {
    const props = page.properties;
    return {
        id_unico: props.id_unico?.rich_text?.[0]?.text?.content || "",
        nome: props.nome?.title?.[0]?.text?.content || ""
    };
}
export async function adicionarMedico(dados) {
    validarDadosMedico(dados);
    const tabelas = await buscarTabelasBanco();
    const tabelaMedicos = tabelas.find(tabela => tabela.nome === "medicos");
    if (!tabelaMedicos) {
        throw new Error("Tabela de médicos não encontrada na página base do Notion.");
    }
    const resultado = await chamarNotionAPI("pages", "POST", {
        parent: { database_id: tabelaMedicos.id },
        properties: {
            nome: {
                title: [{ text: { content: dados.nome.trim() } }]
            },
            id_unico: {
                rich_text: [{ text: { content: dados.id_unico.trim() } }]
            }
        }
    });
    return mapearPaginaParaMedico(resultado);
}
//# sourceMappingURL=adicionarMedico.js.map