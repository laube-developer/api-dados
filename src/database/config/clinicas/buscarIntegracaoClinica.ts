import { chamarNotionAPI } from "../../notion.js";
import { ErroValidacaoClinica } from "./buscarClinica.js";

const INTEGRACOES_CLINICAS_ID = "3ca46144576980d9a217c1ef041fe47c";

function relationIds(prop: any): string[] {
    if (prop?.type !== "relation" || !Array.isArray(prop.relation)) return [];
    return prop.relation.map((r: { id: string }) => r.id);
}

function titleOf(page: any): string {
    for (const p of Object.values(page?.properties ?? {}) as any[]) {
        if (p?.type === "title") {
            return (p.title ?? []).map((t: any) => t.plain_text ?? "").join("");
        }
    }
    return "";
}

function texto(prop: any): string {
    if (!prop) return "";
    if (prop.type === "rich_text") {
        return (prop.rich_text ?? []).map((t: any) => t.plain_text ?? "").join("");
    }
    if (prop.type === "title") {
        return (prop.title ?? []).map((t: any) => t.plain_text ?? "").join("");
    }
    if (prop.type === "url") {
        return String(prop.url ?? "").trim();
    }
    return "";
}

export type IntegracaoDaClinica = {
    integracao: { name: string };
    chave_segura: string;
};

export async function buscarIntegracaoClinica(
    clinicaId: string
): Promise<IntegracaoDaClinica | null> {
    const id = String(clinicaId ?? "").trim();
    if (!id) {
        throw new ErroValidacaoClinica("Parâmetro clinicaId é obrigatório.");
    }

    const join = await chamarNotionAPI(
        `databases/${INTEGRACOES_CLINICAS_ID}/query`,
        "POST",
        {
            filter: {
                property: "clinica",
                relation: { contains: id },
            },
            page_size: 1,
        }
    );

    const row = join?.results?.[0];
    if (!row) {
        return null;
    }

    let integracaoNome = "";
    const integRelId = relationIds(row.properties?.integracao)[0] ?? "";
    if (integRelId) {
        const integPage = await chamarNotionAPI(`pages/${integRelId}`, "GET", undefined, {
            permitir404: true,
        });
        if (integPage) {
            integracaoNome = titleOf(integPage);
        }
    }

    return {
        integracao: { name: integracaoNome },
        chave_segura: texto(row.properties?.chave_segura),
    };
}
