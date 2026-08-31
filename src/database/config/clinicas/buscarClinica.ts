import type * as interfaces from "../../../utils/interfaces.js";
import { chamarNotionAPI } from "../../notion.js";

export class ErroValidacaoClinica extends Error {
    constructor(mensagem: string) {
        super(mensagem);
        this.name = "ErroValidacaoClinica";
    }
}

function relationIds(prop: any): string[] {
    if (prop?.type !== "relation" || !Array.isArray(prop.relation)) return [];
    return prop.relation.map((r: { id: string }) => r.id).filter(Boolean);
}

function titleOf(page: any): string {
    for (const p of Object.values(page?.properties ?? {}) as any[]) {
        if (p?.type === "title") {
            return (p.title ?? [])
                .map((t: any) => t.plain_text ?? t.text?.content ?? "")
                .join("");
        }
    }
    return "";
}

function texto(prop: any): string {
    if (!prop) return "";
    if (prop.type === "rich_text") {
        return (prop.rich_text ?? [])
            .map((t: any) => t.plain_text ?? t.text?.content ?? "")
            .join("");
    }
    if (prop.type === "title") {
        return (prop.title ?? [])
            .map((t: any) => t.plain_text ?? t.text?.content ?? "")
            .join("");
    }
    if (prop.type === "url") {
        return String(prop.url ?? "").trim();
    }
    if (prop.type === "formula" && prop.formula?.type === "string") {
        return String(prop.formula.string ?? "").trim();
    }
    if (prop.type === "unique_id") {
        return String(prop.unique_id?.number ?? "").trim();
    }
    return "";
}

function propPorNome(props: any, candidatos: string[]): any {
    if (!props || typeof props !== "object") return undefined;

    const normalizar = (s: string) =>
        s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_");

    const mapa = new Map<string, any>();
    for (const [chave, valor] of Object.entries(props)) {
        mapa.set(normalizar(chave), valor);
    }

    for (const nome of candidatos) {
        const encontrado = mapa.get(normalizar(nome));
        if (encontrado) return encontrado;
    }
    return undefined;
}

function valorTextoOuRelacao(prop: any): string {
    if (!prop) return "";
    const ids = relationIds(prop);
    if (ids[0]) return ids[0];
    return texto(prop).trim();
}

export function mapearClinica(page: any): interfaces.Clinica {
    const props = page?.properties ?? {};
    const baseProp = propPorNome(props, [
        "base_de_dados_id",
        "base de dados",
        "base_de_dados",
        "baseDeDadosId",
    ]);

    return {
        id: String(page?.id ?? "").trim(),
        nome: titleOf(page).trim(),
        base_de_dados_id: valorTextoOuRelacao(baseProp),
    };
}

export async function buscarClinicaPorId(id: string): Promise<interfaces.Clinica | null> {
    const clinicaId = String(id ?? "").trim();
    if (!clinicaId) {
        throw new ErroValidacaoClinica("Parâmetro id é obrigatório.");
    }

    const page = await chamarNotionAPI(`pages/${clinicaId}`, "GET", undefined, {
        permitir404: true,
    });

    if (!page || page.archived) {
        return null;
    }

    return mapearClinica(page);
}

const CRON_DATABASE_ID = "3ca46144576980ae9ec4e4d6451e04ef";
let cacheIdTabelaClinicas: string | null = null;

async function idTabelaClinicas(): Promise<string> {
    if (cacheIdTabelaClinicas) {
        return cacheIdTabelaClinicas;
    }
    const cronDb = await chamarNotionAPI(`databases/${CRON_DATABASE_ID}`, "GET");
    const related = cronDb?.properties?.clinica?.relation?.database_id;
    if (!related) {
        throw new Error("Não foi possível resolver a tabela de clínicas.");
    }
    cacheIdTabelaClinicas = String(related);
    return cacheIdTabelaClinicas;
}

export async function listarClinicas(): Promise<interfaces.Clinica[]> {
    const dbId = await idTabelaClinicas();
    const resultado = await chamarNotionAPI(`databases/${dbId}/query`, "POST", {
        page_size: 100,
    });
    const paginas = Array.isArray(resultado?.results) ? resultado.results : [];
    const clinicas: interfaces.Clinica[] = [];
    for (const page of paginas) {
        if (page?.archived) continue;
        const mapped = mapearClinica(page);
        if (mapped.id) {
            clinicas.push(mapped);
        }
    }
    return clinicas;
}
