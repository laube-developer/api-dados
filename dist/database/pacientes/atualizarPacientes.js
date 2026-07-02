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
function normalizarCpf(cpf) {
    return cpf.replace(/\D/g, "");
}
function mapearPaginaParaPaciente(page) {
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
function validarListaPacientes(pacientes) {
    if (!Array.isArray(pacientes)) {
        throw new ErroValidacao("O campo 'pacientes' deve ser um array.");
    }
    if (pacientes.length === 0) {
        throw new ErroValidacao("O campo 'pacientes' não pode estar vazio.");
    }
    const erros = [];
    const pacientesValidados = pacientes.map((paciente, indice) => {
        const item = paciente;
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
        return {
            cpf: cpfNormalizado,
            ...(item.nome !== undefined ? { nome: item.nome.trim() } : {}),
            ...(item.id_unico !== undefined ? { id_unico: item.id_unico.trim() } : {}),
            ...(item.data_nascimento !== undefined ? { data_nascimento: item.data_nascimento } : {}),
            ...(item.email !== undefined ? { email: item.email } : {}),
            ...(item.telefone !== undefined ? { telefone: item.telefone } : {})
        };
    });
    if (erros.length > 0) {
        throw new ErroValidacao(erros.join(" "));
    }
    return pacientesValidados;
}
async function buscarPaginaPaciente(tabelaId, cpf) {
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
export async function atualizarPacientes(pacientes) {
    const pacientesValidados = validarListaPacientes(pacientes);
    const tabelas = await buscarTabelasBanco();
    const tabelaPacientes = tabelas.find(tabela => tabela.nome === "pacientes");
    if (!tabelaPacientes) {
        throw new Error("Tabela de pacientes não encontrada na página base do Notion.");
    }
    const pacientesAtualizados = [];
    for (const paciente of pacientesValidados) {
        const pagina = await buscarPaginaPaciente(tabelaPacientes.id, paciente.cpf);
        if (!pagina) {
            throw new ErroNaoEncontrado(`Paciente não encontrado: ${paciente.cpf}.`);
        }
        const properties = {};
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
            properties.data_nascimento = {
                date: { start: paciente.data_nascimento }
            };
        }
        if (paciente.email !== undefined) {
            properties.email = {
                email: paciente.email
            };
        }
        if (paciente.telefone !== undefined) {
            properties.telefone = {
                phone_number: paciente.telefone
            };
        }
        const resultado = await chamarNotionAPI(`pages/${pagina.id}`, "PATCH", { properties });
        pacientesAtualizados.push(mapearPaginaParaPaciente(resultado));
    }
    return pacientesAtualizados;
}
//# sourceMappingURL=atualizarPacientes.js.map