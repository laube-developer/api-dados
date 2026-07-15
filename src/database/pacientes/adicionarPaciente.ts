import type * as interfaces from "../../utils/interfaces.js";
import { buscarTabelasBanco, chamarNotionAPI } from "../notion.js";

export class ErroValidacao extends Error {
    constructor(mensagem: string) {
        super(mensagem);
        this.name = "ErroValidacao";
    }
}

function normalizarCpf(cpf: string | null | undefined): string {
    if (cpf == null) {
        return "";
    }
    const texto = String(cpf).trim();
    if (!texto) {
        return "";
    }
    return texto.replace(/\D/g, "");
}

function validarDadosPaciente(dados: interfaces.Paciente): void {
    const erros: string[] = [];

    if (typeof dados.nome !== "string" || !dados.nome.trim()) {
        erros.push("O campo 'nome' é obrigatório.");
    }

    if (typeof dados.id_unico !== "string" || !dados.id_unico.trim()) {
        erros.push("O campo 'id_unico' é obrigatório.");
    }

    const cpfNormalizado = normalizarCpf(dados.cpf);
    // CPF é opcional: nem todo paciente possui CPF cadastrado no sistema.
    // Se informado, deve ter 11 dígitos; se undefined/vazio, é permitido.
    if (cpfNormalizado && cpfNormalizado.length !== 11) {
        erros.push("O campo 'cpf' deve conter um CPF válido com 11 dígitos.");
    }

    if (erros.length > 0) {
        throw new ErroValidacao(erros.join(" "));
    }
}

function mapearPaginaParaPaciente(page: any): interfaces.Paciente {
    const props = page.properties;
    return {
        nome: props.nome?.title?.[0]?.text?.content || "Sem Nome",
        cpf: props.cpf?.rich_text?.[0]?.text?.content || "",
        id_unico: props.id_unico?.rich_text?.[0]?.text?.content || "",
        data_nascimento: props.data_nascimento?.date?.start || "",
        email: props.email?.email || "",
        telefone: props.telefone?.phone_number || ""
    };
}

export async function adicionarPaciente(dados: interfaces.Paciente): Promise<interfaces.Paciente> {
    validarDadosPaciente(dados);

    const tabelas = await buscarTabelasBanco();
    const tabelaPacientes = tabelas.find(tabela => tabela.nome === "pacientes");

    if (!tabelaPacientes) {
        throw new Error("Tabela de pacientes não encontrada na página base do Notion.");
    }

    const cpfNormalizado = normalizarCpf(dados.cpf);

    const properties: Record<string, unknown> = {
        nome: {
            title: [{ text: { content: dados.nome.trim() } }]
        },
        cpf: {
            rich_text: [{ text: { content: cpfNormalizado } }]
        },
        id_unico: {
            rich_text: [{ text: { content: dados.id_unico.trim() } }]
        }
    };

    if (dados.data_nascimento?.trim()) {
        properties.data_nascimento = {
            date: { start: dados.data_nascimento.trim() }
        };
    }

    if (dados.email?.trim()) {
        properties.email = {
            email: dados.email.trim()
        };
    }

    if (dados.telefone?.trim()) {
        properties.telefone = {
            phone_number: dados.telefone.trim()
        };
    }

    const resultado = await chamarNotionAPI("pages", "POST", {
        parent: { database_id: tabelaPacientes.id },
        properties
    });

    return mapearPaginaParaPaciente(resultado);
}