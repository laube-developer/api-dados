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
    if (prop.type === "formula" && prop.formula?.type === "string") {
        return String(prop.formula.string ?? "").trim();
    }
    return "";
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

export type IntegracaoDaClinica = {
    integracao: { name: string };
    chave_segura: string;
    botconversa_msg_url: string;
    /** Após o paciente confirmar a consulta. */
    callback_confirmar: string;
    /** Após o paciente remarcar. */
    callback_remarcar: string;
    /** Após o paciente cancelar. */
    callback_cancelar: string;
};

function mapearLinha(row: any): Omit<IntegracaoDaClinica, "integracao"> & {
    integracaoRelId: string;
} {
    const props = row?.properties ?? {};
    return {
        integracaoRelId: relationIds(propPorNome(props, ["integracao"]))[0] ?? "",
        chave_segura: texto(propPorNome(props, ["chave_segura"])),
        botconversa_msg_url: texto(
            propPorNome(props, ["botconversa_msg_url", "botconversa_message_url"])
        ),
        callback_confirmar: texto(
            propPorNome(props, [
                "callback_confirmar",
                "callback_cadastrar",
                "botconversa_confirmar_url",
            ])
        ),
        callback_remarcar: texto(
            propPorNome(props, [
                "callback_remarcar",
                "botconversa_reagendar_url",
                "botconversa_remarcar_url",
            ])
        ),
        callback_cancelar: texto(
            propPorNome(props, [
                "callback_cancelar",
                "botconversa_concelar_url",
                "botconversa_cancelar_url",
            ])
        ),
    };
}

function primeiroPreenchido(...valores: string[]): string {
    for (const valor of valores) {
        const t = String(valor ?? "").trim();
        if (t) return t;
    }
    return "";
}

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
            page_size: 100,
        }
    );

    const rows = Array.isArray(join?.results) ? join.results : [];
    if (rows.length === 0) {
        return null;
    }

    let integracaoRelId = "";
    let chave_segura = "";
    let botconversa_msg_url = "";
    let callback_confirmar = "";
    let callback_remarcar = "";
    let callback_cancelar = "";

    for (const row of rows) {
        if (row?.archived) continue;
        const linha = mapearLinha(row);
        integracaoRelId = primeiroPreenchido(integracaoRelId, linha.integracaoRelId);
        chave_segura = primeiroPreenchido(chave_segura, linha.chave_segura);
        botconversa_msg_url = primeiroPreenchido(
            botconversa_msg_url,
            linha.botconversa_msg_url
        );
        callback_confirmar = primeiroPreenchido(
            callback_confirmar,
            linha.callback_confirmar
        );
        callback_remarcar = primeiroPreenchido(
            callback_remarcar,
            linha.callback_remarcar
        );
        callback_cancelar = primeiroPreenchido(
            callback_cancelar,
            linha.callback_cancelar
        );
    }

    let integracaoNome = "";
    if (integracaoRelId) {
        const integPage = await chamarNotionAPI(`pages/${integracaoRelId}`, "GET", undefined, {
            permitir404: true,
        });
        if (integPage) {
            integracaoNome = titleOf(integPage);
        }
    }

    return {
        integracao: { name: integracaoNome },
        chave_segura,
        botconversa_msg_url,
        callback_confirmar,
        callback_remarcar,
        callback_cancelar,
    };
}
