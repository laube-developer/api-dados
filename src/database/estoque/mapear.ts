import { ErroValidacao } from "./erros";
import type { CampoSchema, RecursoSchema, TipoCampo } from "./schema";

export type RegistroEstoque = Record<string, unknown> & { id: string };

export function lerCampo(prop: any, tipo: TipoCampo): unknown {
    switch (tipo) {
        case "title":
            return prop?.title?.[0]?.text?.content ?? "";
        case "rich_text":
            return prop?.rich_text?.[0]?.text?.content ?? "";
        case "email":
            return prop?.email ?? "";
        case "phone_number":
            return prop?.phone_number ?? "";
        case "number":
            return typeof prop?.number === "number" ? prop.number : 0;
        case "checkbox":
            return Boolean(prop?.checkbox);
        case "date":
            return prop?.date?.start ?? "";
        case "relation":
            return prop?.relation?.[0]?.id ?? "";
        default:
            return "";
    }
}

export function escreverCampo(tipo: TipoCampo, valor: unknown): Record<string, unknown> {
    switch (tipo) {
        case "title":
            return { title: [{ text: { content: String(valor ?? "") } }] };
        case "rich_text":
            return { rich_text: [{ text: { content: String(valor ?? "") } }] };
        case "email": {
            const email = String(valor ?? "").trim();
            return { email: email || null };
        }
        case "phone_number": {
            const telefone = String(valor ?? "").trim();
            return { phone_number: telefone || null };
        }
        case "number":
            return { number: valor as number };
        case "checkbox":
            return { checkbox: Boolean(valor) };
        case "date":
            return { date: { start: String(valor) } };
        case "relation": {
            const id = String(valor ?? "").trim();
            return { relation: id ? [{ id }] : [] };
        }
        default:
            return {};
    }
}

export function paginaParaJson(recurso: RecursoSchema, page: any): RegistroEstoque {
    const props = page?.properties ?? {};
    const json: RegistroEstoque = { id: String(page?.id ?? "") };
    for (const campo of recurso.campos) {
        json[campo.nome] = lerCampo(props[campo.nome], campo.tipo);
    }
    return json;
}

export function tituloDummy(recurso: RecursoSchema, dados: Record<string, unknown>): string {
    const nome = typeof dados.nome === "string" ? dados.nome.trim() : "";
    if (nome) {
        return nome;
    }
    if (typeof dados.data_hora === "string" && dados.data_hora.trim()) {
        return `${recurso.tabela} ${dados.data_hora.trim()}`;
    }
    if (typeof dados.material === "string" && dados.material.trim()) {
        return dados.material.trim();
    }
    if (typeof dados.kit === "string" && dados.kit.trim()) {
        return dados.kit.trim();
    }
    return recurso.tabela;
}

export function jsonParaProperties(
    recurso: RecursoSchema,
    dados: Record<string, unknown>,
    modo: "criar" | "alterar"
): Record<string, unknown> {
    const properties: Record<string, unknown> = {};
    const copia = { ...dados };

    if (modo === "criar" && recurso.titleDummy && (typeof copia.nome !== "string" || !copia.nome.trim())) {
        copia.nome = tituloDummy(recurso, copia);
    }

    if (modo === "criar" && recurso.temAtivo && copia.ativo === undefined) {
        copia.ativo = true;
    }

    for (const campo of recurso.campos) {
        if (campo.nome === "id") {
            continue;
        }
        if (modo === "alterar" && !(campo.nome in dados) && campo.nome !== "nome") {
            continue;
        }
        if (modo === "alterar" && !(campo.nome in copia)) {
            continue;
        }
        if (modo === "criar" && !(campo.nome in copia) && campo.tipo !== "title" && campo.tipo !== "checkbox") {
            continue;
        }
        if (campo.nome in copia || (modo === "criar" && (campo.tipo === "title" || campo.nome === "ativo"))) {
            properties[campo.nome] = escreverCampo(campo.tipo, copia[campo.nome]);
        }
    }

    return properties;
}

function ehIso8601(valor: string): boolean {
    if (!valor.trim()) {
        return false;
    }
    const tempo = Date.parse(valor);
    return !Number.isNaN(tempo);
}

function validarCampo(campo: CampoSchema, valor: unknown, presente: boolean): string | null {
    if (!presente || valor === undefined) {
        return campo.obrigatorioNoPost ? `O campo '${campo.nome}' é obrigatório.` : null;
    }

    switch (campo.tipo) {
        case "title":
        case "rich_text":
        case "email":
        case "phone_number":
            if (typeof valor !== "string") {
                return `O campo '${campo.nome}' deve ser texto.`;
            }
            if (campo.obrigatorioNoPost && !valor.trim()) {
                return `O campo '${campo.nome}' é obrigatório.`;
            }
            return null;
        case "relation":
            if (typeof valor !== "string" || !valor.trim()) {
                return `O campo '${campo.nome}' é obrigatório.`;
            }
            return null;
        case "number":
            if (typeof valor !== "number" || !Number.isInteger(valor) || valor < 0) {
                return `O campo '${campo.nome}' deve ser um inteiro ≥ 0.`;
            }
            return null;
        case "checkbox":
            if (typeof valor !== "boolean") {
                return `O campo '${campo.nome}' deve ser boolean.`;
            }
            return null;
        case "date":
            if (typeof valor !== "string" || !ehIso8601(valor)) {
                return `O campo '${campo.nome}' deve ser uma data ISO 8601.`;
            }
            return null;
        default:
            return null;
    }
}

export function validarCorpo(
    recurso: RecursoSchema,
    dados: Record<string, unknown>,
    modo: "criar" | "alterar"
): void {
    if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
        throw new ErroValidacao("O corpo da requisição deve ser um objeto.");
    }

    const erros: string[] = [];

    if (modo === "criar") {
        for (const campo of recurso.campos) {
            if (campo.nome === "nome" && recurso.titleDummy) {
                continue;
            }
            if (campo.nome === "ativo" && recurso.temAtivo) {
                if (campo.nome in dados) {
                    const erro = validarCampo(campo, dados[campo.nome], true);
                    if (erro) erros.push(erro);
                }
                continue;
            }
            const presente = campo.nome in dados;
            if (campo.obrigatorioNoPost || presente) {
                const erro = validarCampo(campo, dados[campo.nome], presente || Boolean(campo.obrigatorioNoPost));
                if (erro) erros.push(erro);
            }
        }
    } else {
        const conhecidos = new Set(recurso.campos.map((c) => c.nome));
        for (const chave of Object.keys(dados)) {
            if (chave === "id" || chave === "itens" || chave === "kits" || chave === "materiais") {
                continue;
            }
            if (!conhecidos.has(chave)) {
                continue;
            }
            const campo = recurso.campos.find((c) => c.nome === chave);
            if (!campo) continue;
            const erro = validarCampo(campo, dados[chave], true);
            if (erro) erros.push(erro);
        }
    }

    if (erros.length > 0) {
        throw new ErroValidacao(erros.join(" "));
    }
}
