import type * as interfaces from "../../utils/interfaces.js";
import { buscarTabelasBanco, chamarNotionAPI } from "../notion.js";

export class ErroValidacao extends Error {
    constructor(mensagem: string) {
        super(mensagem);
        this.name = "ErroValidacao";
    }
}

export class ErroNaoEncontrado extends Error {
    constructor(mensagem: string) {
        super(mensagem);
        this.name = "ErroNaoEncontrado";
    }
}

function mapearPaginaParaMedico(page: any): interfaces.Medico {
    const props = page.properties;
    return {
        id_unico: props.id_unico?.rich_text?.[0]?.text?.content || "",
        nome: props.nome?.title?.[0]?.text?.content || ""
    };
}

function validarListaMedicos(medicos: unknown): interfaces.AtualizacaoMedico[] {
    if (!Array.isArray(medicos)) {
        throw new ErroValidacao("O campo 'medicos' deve ser um array.");
    }

    if (medicos.length === 0) {
        throw new ErroValidacao("O campo 'medicos' não pode estar vazio.");
    }

    const erros: string[] = [];

    const medicosValidados = medicos.map((medico, indice) => {
        const item = medico as interfaces.AtualizacaoMedico;

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

    return medicosValidados;
}

async function buscarPaginaMedico(tabelaId: string, id_unico: string): Promise<any> {
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

export async function atualizarMedicos(medicos: unknown): Promise<interfaces.Medico[]> {
    const medicosValidados = validarListaMedicos(medicos);

    const tabelas = await buscarTabelasBanco();
    const tabelaMedicos = tabelas.find(tabela => tabela.nome === "medicos");

    if (!tabelaMedicos) {
        throw new Error("Tabela de médicos não encontrada na página base do Notion.");
    }

    const medicosAtualizados: interfaces.Medico[] = [];

    for (const medico of medicosValidados) {
        const pagina = await buscarPaginaMedico(tabelaMedicos.id, medico.id_unico);

        if (!pagina) {
            throw new ErroNaoEncontrado(`Médico não encontrado: ${medico.id_unico}.`);
        }

        const properties: Record<string, unknown> = {};

        if (medico.nome !== undefined) {
            properties.nome = {
                title: [{ text: { content: medico.nome } }]
            };
        }

        const resultado = await chamarNotionAPI(`pages/${pagina.id}`, "PATCH", { properties });
        medicosAtualizados.push(mapearPaginaParaMedico(resultado));
    }

    return medicosAtualizados;
}