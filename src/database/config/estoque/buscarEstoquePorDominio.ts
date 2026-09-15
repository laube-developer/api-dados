import type * as interfaces from "../../../utils/interfaces.js";
import { chamarNotionAPI } from "../../notion.js";
import {
    buscarClinicaPorId,
    ErroValidacaoClinica,
} from "../clinicas/buscarClinica.js";
import { normalizarDominio } from "../clinicas/buscarDominioConfirmacao.js";

/** Tabela Notion `gestao > estoque`. */
const ESTOQUE_DOMINIOS_ID = "3db4614457698097ba8ef1c82e5ddee9";
const TTL_CACHE_MS = 5 * 60 * 1000;

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
    return String(prop.plain_text ?? prop.name ?? "").trim();
}

function propPorNome(props: any, candidatos: string[]): any {
    if (!props || typeof props !== "object") return undefined;
    const normalizar = (s: string) =>
        s
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, "_");
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

function idNotion(prop: any): string {
    return texto(prop).trim();
}

function mapearLinha(page: any): {
    dominio: string;
    clinicaId: string;
    estoque_database_page_id: string;
    medicos_database_id: string;
    pacientes_database_id: string;
} | null {
    const props = page?.properties ?? {};
    const dominio = normalizarDominio(texto(propPorNome(props, ["dominio"])));
    const clinicaIds = relationIds(propPorNome(props, ["clinica"]));
    const clinicaId = clinicaIds[0] ?? "";
    const estoque_database_page_id = idNotion(
        propPorNome(props, ["estoque_database_page_id"])
    );
    const medicos_database_id = idNotion(
        propPorNome(props, ["medicos_database_id"])
    );
    const pacientes_database_id = idNotion(
        propPorNome(props, ["pacientes_database_id"])
    );
    if (!dominio || !estoque_database_page_id) return null;
    return {
        dominio,
        clinicaId,
        estoque_database_page_id,
        medicos_database_id,
        pacientes_database_id,
    };
}

let cache: { expiraEm: number; rows: interfaces.ConfigEstoquePorDominio[] } | null =
    null;

async function listarConfigsEstoque(): Promise<interfaces.ConfigEstoquePorDominio[]> {
    const agora = Date.now();
    if (cache && agora < cache.expiraEm) {
        return cache.rows;
    }

    const resultado = await chamarNotionAPI(
        `databases/${ESTOQUE_DOMINIOS_ID}/query`,
        "POST",
        { page_size: 100 }
    );
    const paginas = Array.isArray(resultado?.results) ? resultado.results : [];
    const rows: interfaces.ConfigEstoquePorDominio[] = [];

    for (const page of paginas) {
        if (page?.archived) continue;
        const linha = mapearLinha(page);
        if (!linha) continue;
        let clinica: interfaces.Clinica | null = null;
        if (linha.clinicaId) {
            clinica = await buscarClinicaPorId(linha.clinicaId);
        }
        rows.push({
            dominio: linha.dominio,
            clinica,
            estoque_database_page_id: linha.estoque_database_page_id,
            medicos_database_id: linha.medicos_database_id,
            pacientes_database_id: linha.pacientes_database_id,
        });
    }

    cache = { expiraEm: agora + TTL_CACHE_MS, rows };
    return rows;
}

export async function buscarConfigEstoquePorDominio(
    dominioInformado: string
): Promise<interfaces.ConfigEstoquePorDominio | null> {
    const dominio = normalizarDominio(dominioInformado);
    if (!dominio) {
        throw new ErroValidacaoClinica("Parâmetro dominio é obrigatório.");
    }

    const rows = await listarConfigsEstoque();
    return rows.find((row) => row.dominio === dominio) ?? null;
}

export function isHostLocalEstoque(hostname: string): boolean {
    const host = hostname.trim().toLowerCase();
    if (!host) return true;
    if (
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "0.0.0.0" ||
        host === "::1"
    ) {
        return true;
    }
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
    return false;
}
