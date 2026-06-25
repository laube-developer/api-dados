import type * as interfaces from "../../utils/interfaces.js";
import { buscarTabelasBanco, chamarNotionAPI } from "../notion.js";

export class ErroValidacao extends Error {
    constructor(mensagem: string) {
        super(mensagem);
        this.name = "ErroValidacao";
    }
}

function validarListaMedicos(medicos: unknown): interfaces.Medico[] {
    if (!Array.isArray(medicos)) {
        throw new ErroValidacao("O campo 'medicos' deve ser um array.");
    }

    if (medicos.length === 0) {
        throw new ErroValidacao("O campo 'medicos' não pode estar vazio.");
    }

    const erros: string[] = [];

    medicos.forEach((medico, indice) => {
        const item = medico as interfaces.Medico;

        if (typeof item?.id_unico !== "string" || !item.id_unico.trim()) {
            erros.push(`O campo 'id_unico' é obrigatório no item ${indice + 1}.`);
        }

        if (typeof item?.nome !== "string" || !item.nome.trim()) {
            erros.push(`O campo 'nome' é obrigatório no item ${indice + 1}.`);
        }
    });

    if (erros.length > 0) {
        throw new ErroValidacao(erros.join(" "));
    }

    return medicos.map((medico) => {
        const item = medico as interfaces.Medico;
        return {
            id_unico: item.id_unico.trim(),
            nome: item.nome.trim()
        };
    });
}

function mapearPaginaParaMedico(page: any): interfaces.Medico {
    const props = page.properties;
    return {
        id_unico: props.id_unico?.rich_text?.[0]?.text?.content || "",
        nome: props.nome?.title?.[0]?.text?.content || ""
    };
}

export async function adicionarMedicos(medicos: unknown): Promise<interfaces.Medico[]> {
    const medicosValidados = validarListaMedicos(medicos);

    const tabelas = await buscarTabelasBanco();
    const tabelaMedicos = tabelas.find(tabela => tabela.nome === "medicos");

    if (!tabelaMedicos) {
        throw new Error("Tabela de médicos não encontrada na página base do Notion.");
    }

    const medicosCriados: interfaces.Medico[] = [];

    for (const medico of medicosValidados) {
        const resultado = await chamarNotionAPI("pages", "POST", {
            parent: { database_id: tabelaMedicos.id },
            properties: {
                nome: {
                    title: [{ text: { content: medico.nome } }]
                },
                id_unico: {
                    rich_text: [{ text: { content: medico.id_unico } }]
                }
            }
        });

        medicosCriados.push(mapearPaginaParaMedico(resultado));
    }

    return medicosCriados;
}