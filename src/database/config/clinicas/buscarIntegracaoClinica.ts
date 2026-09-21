import { chamarNotionAPI, queryNotionTodasPaginas } from "../../notion.js";
import { comCache } from "../../redisCache.js";
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
    unidades_exibidas: string
    medicos_agendamentos_exibidos: string;
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
        unidades_exibidas: texto(
            propPorNome(props, [
                "unidades_exibidas",
            ])
        ),
        medicos_agendamentos_exibidos: texto(
            propPorNome(props, [
                "medicos",
            ])
        )
    };
}

function normalizarNomeIntegracao(nome: string): string {
    return String(nome ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

async function montarIntegracao(row: any): Promise<IntegracaoDaClinica> {
    const linha = mapearLinha(row);
    let integracaoNome = "";
    if (linha.integracaoRelId) {
        const integPage = await chamarNotionAPI(`pages/${linha.integracaoRelId}`, "GET", undefined, {
            permitir404: true,
        });
        if (integPage) {
            integracaoNome = titleOf(integPage);
        }
    }

    return {
        integracao: { name: integracaoNome },
        chave_segura: linha.chave_segura,
        botconversa_msg_url: linha.botconversa_msg_url,
        callback_confirmar: linha.callback_confirmar,
        callback_remarcar: linha.callback_remarcar,
        callback_cancelar: linha.callback_cancelar,
        unidades_exibidas: linha.unidades_exibidas,
        medicos_agendamentos_exibidos: linha.medicos_agendamentos_exibidos,
    };
}

export async function buscarIntegracoesClinica(
    clinicaId: string
): Promise<IntegracaoDaClinica[]> {
    const id = String(clinicaId ?? "").trim();
    if (!id) {
        throw new ErroValidacaoClinica("Parâmetro clinicaId é obrigatório.");
    }

    return comCache(`api-dados:integracao-clinica:${id}`, async () => {
        const rows = await queryNotionTodasPaginas(INTEGRACOES_CLINICAS_ID, {
            filter: {
                property: "clinica",
                relation: { contains: id },
            },
        });

        const lista: IntegracaoDaClinica[] = [];
        for (const row of rows) {
            if (row?.archived) continue;
            lista.push(await montarIntegracao(row));
        }
        return lista;
    });
}

/** Uma linha inteira. Nome igual não mistura campos de outra linha. */
export async function buscarIntegracaoClinica(
    clinicaId: string,
    integracaoNome = ""
): Promise<IntegracaoDaClinica | IntegracaoDaClinica[] | null> {
    const lista = await buscarIntegracoesClinica(clinicaId);
    if (lista.length === 0) {
        return null;
    }

    const filtro = normalizarNomeIntegracao(integracaoNome);
    const escolhidas = filtro
        ? lista.filter((item) => normalizarNomeIntegracao(item.integracao.name) === filtro)
        : lista;

    if (escolhidas.length === 0) {
        return null;
    }
    if (escolhidas.length === 1) {
        return escolhidas[0] ?? null;
    }
    return escolhidas;
}
