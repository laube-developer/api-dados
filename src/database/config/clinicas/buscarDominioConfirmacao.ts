import type * as interfaces from "../../../utils/interfaces.js";
import { queryNotionTodasPaginas } from "../../notion.js";
import { comCache } from "../../redisCache.js";
import {
    buscarClinicaPorId,
    ErroValidacaoClinica,
} from "./buscarClinica.js";

/** Tabela Notion `dominios_confirmacao`: dominio → relação `clinica`. */
const DOMINIOS_CONFIRMACAO_ID = "3dc461445769809785f3c86883371f58";

function relationIds(prop: any): string[] {
    if (prop?.type !== "relation" || !Array.isArray(prop.relation)) return [];
    return prop.relation.map((r: { id: string }) => r.id).filter(Boolean);
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

export function normalizarDominio(valor: string): string {
    const bruto = String(valor ?? "").trim();
    const semProtocolo = bruto.replace(/^https?:\/\//i, "");
    const host = (semProtocolo.split("/")[0] ?? "").split(",")[0] ?? "";
    return (host.split(":")[0] ?? "").trim().toLowerCase();
}

function mapearLinhaDominio(page: any): { dominio: string; clinicaId: string } | null {
    const props = page?.properties ?? {};
    const dominio = normalizarDominio(texto(propPorNome(props, ["dominio"])));
    const clinicaId = relationIds(propPorNome(props, ["clinica"]))[0] ?? "";
    if (!dominio || !clinicaId) return null;
    return { dominio, clinicaId };
}

async function listarDominiosConfirmacao(): Promise<interfaces.DominioConfirmacao[]> {
    return comCache("api-dados:dominios-confirmacao", async () => {
        const paginas = await queryNotionTodasPaginas(DOMINIOS_CONFIRMACAO_ID);
        const rows: interfaces.DominioConfirmacao[] = [];

        for (const page of paginas) {
            if (page?.archived) continue;
            const linha = mapearLinhaDominio(page);
            if (!linha) continue;
            const clinica = await buscarClinicaPorId(linha.clinicaId);
            if (!clinica) continue;
            rows.push({ dominio: linha.dominio, clinica });
        }

        return rows;
    });
}

export async function buscarClinicaPorDominio(
    dominioInformado: string
): Promise<interfaces.DominioConfirmacao | null> {
    const dominio = normalizarDominio(dominioInformado);
    if (!dominio) {
        throw new ErroValidacaoClinica("Parâmetro dominio é obrigatório.");
    }

    const rows = await listarDominiosConfirmacao();
    return rows.find((row) => row.dominio === dominio) ?? null;
}
