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

function normalizarCpf(cpf: string): string {
    return cpf.replace(/\D/g, "");
}

/**
 * Notion exige ISO 8601 (YYYY-MM-DD ou datetime). String vazia gera validation_error.
 * Retorna a data normalizada, null para limpar o campo, ou undefined se inválida e não vazia.
 */
function normalizarDataNascimento(valor: unknown): string | null | undefined {
    if (valor == null) {
        return null;
    }

    const texto = String(valor).trim();
    if (!texto) {
        return null;
    }

    // Aceita YYYY-MM-DD ou ISO com horário; Notion usa a parte da data no start.
    const isoDate = texto.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!isoDate) {
        return undefined;
    }

    return isoDate[1];
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

function validarListaPacientes(pacientes: unknown): interfaces.AtualizacaoPaciente[] {
    if (!Array.isArray(pacientes)) {
        throw new ErroValidacao("O campo 'pacientes' deve ser um array.");
    }

    if (pacientes.length === 0) {
        throw new ErroValidacao("O campo 'pacientes' não pode estar vazio.");
    }

    const erros: string[] = [];

    const pacientesValidados = pacientes.map((paciente, indice) => {
        const item = paciente as interfaces.AtualizacaoPaciente;
        const cpfNormalizado = normalizarCpf(item?.cpf || "");

        if (!cpfNormalizado) {
            erros.push(`O campo 'cpf' é obrigatório no item ${indice + 1}.`);
        }

        const camposAtualizacao = Object.keys(item || {}).filter((campo) => campo !== "cpf");

        if (camposAtualizacao.length === 0) {
            erros.push(`O item ${indice + 1} deve conter ao menos um campo para atualizar.`);
        }

        if (item.nome !== undefined && (typeof item.nome !== "string" || !item.nome.trim())) {
            erros.push(`O campo 'nome' não pode estar vazio no item ${indice + 1}.`);
        }

        if (item.id_unico !== undefined && (typeof item.id_unico !== "string" || !item.id_unico.trim())) {
            erros.push(`O campo 'id_unico' não pode estar vazio no item ${indice + 1}.`);
        }

        let dataNascimento: string | null | undefined;
        if (item.data_nascimento !== undefined) {
            dataNascimento = normalizarDataNascimento(item.data_nascimento);
            if (dataNascimento === undefined) {
                erros.push(
                    `O campo 'data_nascimento' do item ${indice + 1} deve ser uma data ISO 8601 válida (YYYY-MM-DD).`
                );
            }
        }

        return {
            cpf: cpfNormalizado,
            ...(item.nome !== undefined ? { nome: item.nome.trim() } : {}),
            ...(item.id_unico !== undefined ? { id_unico: item.id_unico.trim() } : {}),
            ...(dataNascimento !== undefined ? { data_nascimento: dataNascimento ?? "" } : {}),
            ...(item.email !== undefined ? { email: item.email } : {}),
            ...(item.telefone !== undefined ? { telefone: item.telefone } : {})
        };
    });

    if (erros.length > 0) {
        throw new ErroValidacao(erros.join(" "));
    }

    return pacientesValidados;
}

async function buscarPaginaPaciente(tabelaId: string, cpf: string): Promise<any> {
    const resultadoQuery = await chamarNotionAPI(`databases/${tabelaId}/query`, "POST", {
        filter: {
            property: "cpf",
            rich_text: {
                equals: cpf
            }
        },
        page_size: 1
    });

    return resultadoQuery.results?.[0];
}

export async function atualizarPacientes(pacientes: unknown): Promise<interfaces.Paciente[]> {
    const pacientesValidados = validarListaPacientes(pacientes);

    const tabelas = await buscarTabelasBanco();
    const tabelaPacientes = tabelas.find(tabela => tabela.nome === "pacientes");

    if (!tabelaPacientes) {
        throw new Error("Tabela de pacientes não encontrada na página base do Notion.");
    }

    const pacientesAtualizados: interfaces.Paciente[] = [];

    for (const paciente of pacientesValidados) {
        const pagina = await buscarPaginaPaciente(tabelaPacientes.id, paciente.cpf);

        if (!pagina) {
            throw new ErroNaoEncontrado(`Paciente não encontrado: ${paciente.cpf}.`);
        }

        const properties: Record<string, unknown> = {};

        if (paciente.nome !== undefined) {
            properties.nome = {
                title: [{ text: { content: paciente.nome } }]
            };
        }

        if (paciente.id_unico !== undefined) {
            properties.id_unico = {
                rich_text: [{ text: { content: paciente.id_unico } }]
            };
        }

        if (paciente.data_nascimento !== undefined) {
            const dataNormalizada = normalizarDataNascimento(paciente.data_nascimento);
            // String vazia/null limpa o campo; data válida grava ISO; inválida já barrada na validação.
            properties.data_nascimento = dataNormalizada
                ? { date: { start: dataNormalizada } }
                : { date: null };
        }

        if (paciente.email !== undefined) {
            // E-mail vazio limpa o campo no Notion (não aceita string vazia em alguns casos).
            properties.email = {
                email: paciente.email?.trim() ? paciente.email.trim() : null
            };
        }

        if (paciente.telefone !== undefined) {
            properties.telefone = {
                phone_number: paciente.telefone?.trim() ? paciente.telefone.trim() : null
            };
        }

        const resultado = await chamarNotionAPI(`pages/${pagina.id}`, "PATCH", { properties });
        pacientesAtualizados.push(mapearPaginaParaPaciente(resultado));
    }

    return pacientesAtualizados;
}