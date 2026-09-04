export type TipoCampo =
    | "title"
    | "rich_text"
    | "email"
    | "number"
    | "checkbox"
    | "date"
    | "relation";

export interface CampoSchema {
    nome: string;
    tipo: TipoCampo;
    obrigatorioNoPost?: boolean;
}

export interface RecursoSchema {
    tabela: string;
    slug: string;
    campos: CampoSchema[];
    nomeObrigatorio: boolean;
    titleDummy: boolean;
    temAtivo: boolean;
    postEspecial?: boolean;
    patchEspecial?: boolean;
}

function campo(nome: string, tipo: TipoCampo, obrigatorioNoPost = false): CampoSchema {
    return { nome, tipo, obrigatorioNoPost };
}

export const RECURSOS: RecursoSchema[] = [
    {
        tabela: "tipos_procedimentos",
        slug: "tipos-procedimentos",
        nomeObrigatorio: true,
        titleDummy: false,
        temAtivo: false,
        campos: [campo("nome", "title", true)],
    },
    {
        tabela: "materiais",
        slug: "materiais",
        nomeObrigatorio: true,
        titleDummy: false,
        temAtivo: false,
        campos: [campo("nome", "title", true), campo("codigo", "rich_text")],
    },
    {
        tabela: "fornecedores",
        slug: "fornecedores",
        nomeObrigatorio: true,
        titleDummy: false,
        temAtivo: true,
        campos: [
            campo("nome", "title", true),
            campo("contato", "rich_text"),
            campo("whatsapp", "rich_text"),
            campo("email", "email"),
            campo("obs", "rich_text"),
            campo("ativo", "checkbox"),
        ],
    },
    {
        tabela: "compras",
        slug: "compras",
        nomeObrigatorio: false,
        titleDummy: true,
        temAtivo: false,
        postEspecial: true,
        campos: [campo("nome", "title"), campo("data_hora", "date", true), campo("obs", "rich_text")],
    },
    {
        tabela: "itens_compra",
        slug: "itens-compra",
        nomeObrigatorio: false,
        titleDummy: true,
        temAtivo: false,
        postEspecial: true,
        patchEspecial: true,
        campos: [
            campo("nome", "title"),
            campo("compra", "relation", true),
            campo("material", "relation", true),
            campo("fornecedor", "relation", true),
            campo("quantidade", "number", true),
        ],
    },
    {
        tabela: "kits",
        slug: "kits",
        nomeObrigatorio: true,
        titleDummy: false,
        temAtivo: false,
        campos: [campo("nome", "title", true), campo("tipo_procedimento", "relation", true)],
    },
    {
        tabela: "kits_materiais",
        slug: "kits-materiais",
        nomeObrigatorio: false,
        titleDummy: true,
        temAtivo: false,
        campos: [
            campo("nome", "title"),
            campo("material", "relation", true),
            campo("kit", "relation", true),
            campo("quantidade", "number", true),
        ],
    },
    {
        tabela: "medicos",
        slug: "medicos",
        nomeObrigatorio: true,
        titleDummy: false,
        temAtivo: false,
        campos: [campo("nome", "title", true), campo("especialidade", "rich_text")],
    },
    {
        tabela: "pacientes",
        slug: "pacientes",
        nomeObrigatorio: true,
        titleDummy: false,
        temAtivo: false,
        campos: [campo("nome", "title", true), campo("contato", "rich_text")],
    },
    {
        tabela: "registros",
        slug: "registros",
        nomeObrigatorio: false,
        titleDummy: true,
        temAtivo: false,
        postEspecial: true,
        campos: [
            campo("nome", "title"),
            campo("data_hora", "date", true),
            campo("tipo_procedimento", "relation", true),
            campo("paciente", "relation", true),
            campo("medico", "relation", true),
            campo("quantidade", "number", true),
            campo("obs", "rich_text"),
        ],
    },
    {
        tabela: "kits_registro",
        slug: "kits-registro",
        nomeObrigatorio: false,
        titleDummy: true,
        temAtivo: false,
        postEspecial: true,
        patchEspecial: true,
        campos: [
            campo("nome", "title"),
            campo("registro", "relation", true),
            campo("kit", "relation", true),
            campo("quantidade", "number", true),
        ],
    },
    {
        tabela: "materiais_registro",
        slug: "materiais-registro",
        nomeObrigatorio: false,
        titleDummy: true,
        temAtivo: false,
        postEspecial: true,
        patchEspecial: true,
        campos: [
            campo("nome", "title"),
            campo("registro", "relation", true),
            campo("material", "relation", true),
            campo("quantidade", "number", true),
        ],
    },
    {
        tabela: "estoque",
        slug: "estoque",
        nomeObrigatorio: false,
        titleDummy: true,
        temAtivo: false,
        campos: [
            campo("material", "relation", true),
            campo("quantidade", "number", true),
            campo("nome", "title"),
        ],
    },
];

export const RECURSOS_POR_SLUG = new Map(RECURSOS.map((r) => [r.slug, r]));
export const RECURSOS_POR_TABELA = new Map(RECURSOS.map((r) => [r.tabela, r]));

export function recursoPorSlug(slug: string): RecursoSchema | undefined {
    return RECURSOS_POR_SLUG.get(slug);
}

export function recursoPorTabela(tabela: string): RecursoSchema {
    const recurso = RECURSOS_POR_TABELA.get(tabela);
    if (!recurso) {
        throw new Error(`Recurso de estoque desconhecido: ${tabela}`);
    }
    return recurso;
}
