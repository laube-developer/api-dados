import { buscarTabelasBanco, chamarNotionAPI } from "../notion.js";
export class ErroValidacao extends Error {
    constructor(mensagem) {
        super(mensagem);
        this.name = "ErroValidacao";
    }
}
export class ErroNaoEncontrado extends Error {
    constructor(mensagem) {
        super(mensagem);
        this.name = "ErroNaoEncontrado";
    }
}
function mapearPaginaParaAgenda(page) {
    const props = page.properties;
    return {
        id_unico: props.id_unico?.rich_text?.[0]?.text?.content || "",
        nome: props.nome?.title?.[0]?.text?.content || ""
    };
}
function validarListaAgendas(agendas) {
    if (!Array.isArray(agendas)) {
        throw new ErroValidacao("O campo 'agendas' deve ser um array.");
    }
    if (agendas.length === 0) {
        throw new ErroValidacao("O campo 'agendas' não pode estar vazio.");
    }
    const erros = [];
    const agendasValidadas = agendas.map((agenda, indice) => {
        const item = agenda;
        if (typeof item?.id_unico !== "string" || !item.id_unico.trim()) {
            erros.push(`O campo 'id_unico' é obrigatório no item ${indice + 1}.`);
        }
        const camposAtualizacao = Object.keys(item || {}).filter((campo) => campo !== "id_unico");
        if (camposAtualizacao.length === 0) {
            erros.push(`O item ${indice + 1} deve conter ao menos um campo para atualizar.`);
        }
        if (item.nome !== undefined && (typeof item.nome !== "string" || !item.nome.trim())) {
            erros.push(`O campo 'nome' não pode estar vazio no item ${indice + 1}.`);
        }
        return {
            id_unico: item.id_unico?.trim() || "",
            ...(item.nome !== undefined ? { nome: item.nome.trim() } : {})
        };
    });
    if (erros.length > 0) {
        throw new ErroValidacao(erros.join(" "));
    }
    return agendasValidadas;
}
async function buscarPaginaAgenda(tabelaId, id_unico) {
    const resultadoQuery = await chamarNotionAPI(`databases/${tabelaId}/query`, "POST", {
        filter: {
            property: "id_unico",
            rich_text: {
                equals: id_unico
            }
        },
        page_size: 1
    });
    return resultadoQuery.results?.[0];
}
export async function atualizarAgendas(agendas) {
    const agendasValidadas = validarListaAgendas(agendas);
    const tabelas = await buscarTabelasBanco();
    const tabelaAgendas = tabelas.find(tabela => tabela.nome === "agendas");
    if (!tabelaAgendas) {
        throw new Error("Tabela de agendas não encontrada na página base do Notion.");
    }
    const agendasAtualizadas = [];
    for (const agenda of agendasValidadas) {
        const pagina = await buscarPaginaAgenda(tabelaAgendas.id, agenda.id_unico);
        if (!pagina) {
            throw new ErroNaoEncontrado(`Agenda não encontrada: ${agenda.id_unico}.`);
        }
        const properties = {};
        if (agenda.nome !== undefined) {
            properties.nome = {
                title: [{ text: { content: agenda.nome } }]
            };
        }
        const resultado = await chamarNotionAPI(`pages/${pagina.id}`, "PATCH", { properties });
        agendasAtualizadas.push(mapearPaginaParaAgenda(resultado));
    }
    return agendasAtualizadas;
}
//# sourceMappingURL=atualizarAgendas.js.map