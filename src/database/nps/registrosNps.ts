import { buscarTabelasBanco, chamarNotionAPI } from "../notion.js";
import { ErroValidacao } from "../pacientes/atualizarPacientes.js";
import type { RegistroNps, VerificacaoNpsPaciente } from "../../utils/interfaces.js";

function pacienteId(valor: unknown): string {
    if (typeof valor === "string" && valor.trim()) return valor.trim();
    if (typeof valor === "number" && Number.isSafeInteger(valor)) return String(valor);
    throw new ErroValidacao("Informe paciente_id.");
}

async function tabelaNps() {
    const tabelas = await buscarTabelasBanco();
    const tabela = tabelas.find(item => item.nome === "nps");
    if (!tabela) throw new Error("Tabela nps não encontrada na base da clínica.");
    const schema = await chamarNotionAPI(`databases/${tabela.id}`, "GET");
    const props = schema.properties;
    const data = ["data do registro", "data_registro", "data"].find(nome => props?.[nome]?.type === "date");
    const tipoId = props?.paciente_id?.type;
    if (!data || !["title", "rich_text"].includes(tipoId)
        || props?.nps?.type !== "number") {
        throw new Error("Tabela nps deve conter paciente_id textual, nps Number e data do registro Date.");
    }
    return { id: tabela.id, data, tipoId };
}

function mapear(page: any, data: string): RegistroNps {
    const props = page.properties;
    return {
        id: page.id,
        paciente_id: props.paciente_id?.title?.[0]?.text?.content ?? props.paciente_id?.rich_text?.[0]?.text?.content ?? "",
        nps: props.nps?.number ?? null,
        data_registro: props[data]?.date?.start ?? "",
    };
}

export async function criarNps(body: unknown): Promise<RegistroNps> {
    const item = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const id = pacienteId(item.paciente_id);
    if (typeof item.nps !== "number" || !Number.isInteger(item.nps) || item.nps < 0 || item.nps > 10) {
        throw new ErroValidacao("Informe nps inteiro entre 0 e 10.");
    }
    const tabela = await tabelaNps();
    const page = await chamarNotionAPI("pages", "POST", {
        parent: { database_id: tabela.id },
        properties: {
            paciente_id: { [tabela.tipoId]: [{ text: { content: id } }] },
            nps: { number: item.nps },
            [tabela.data]: { date: { start: new Date().toISOString() } },
        },
    });
    return mapear(page, tabela.data);
}

export async function buscarUltimoNps(valor: unknown): Promise<RegistroNps | null> {
    const id = pacienteId(valor);
    const tabela = await tabelaNps();
    const result = await chamarNotionAPI(`databases/${tabela.id}/query`, "POST", {
        filter: { property: "paciente_id", [tabela.tipoId]: { equals: id } },
        sorts: [{ property: tabela.data, direction: "descending" }, { timestamp: "created_time", direction: "descending" }],
        page_size: 1,
    });
    return result.results?.[0] ? mapear(result.results[0], tabela.data) : null;
}

function avaliacaoValida(registro: RegistroNps, agora: Date): boolean {
    const data = new Date(registro.data_registro);
    if (!Number.isFinite(data.getTime()) || data > agora
        || !Number.isInteger(registro.nps) || registro.nps < 0 || registro.nps > 10) return false;
    const validade = new Date(data);
    const dia = validade.getUTCDate();
    validade.setUTCDate(1);
    validade.setUTCMonth(validade.getUTCMonth() + 3);
    const ultimoDia = new Date(Date.UTC(validade.getUTCFullYear(), validade.getUTCMonth() + 1, 0)).getUTCDate();
    validade.setUTCDate(Math.min(dia, ultimoDia));
    return agora < validade;
}

export async function verificarNpsEmLote(body: unknown): Promise<VerificacaoNpsPaciente[]> {
    const idsRecebidos = (body as { paciente_ids?: unknown } | null)?.paciente_ids;
    if (!Array.isArray(idsRecebidos)) throw new ErroValidacao("Informe paciente_ids como lista.");
    const ids = [...new Set(idsRecebidos.map(pacienteId))];
    if (!ids.length) return [];
    const tabela = await tabelaNps();
    const agora = new Date();
    const ultimos = new Map<string, RegistroNps>();
    // O Notion limita filtros compostos; cada grupo consulta vários pacientes juntos.
    for (let inicio = 0; inicio < ids.length; inicio += 100) {
        const grupo = ids.slice(inicio, inicio + 100);
        let cursor: string | undefined;
        do {
            const result = await chamarNotionAPI(`databases/${tabela.id}/query`, "POST", {
                filter: { or: grupo.map(id => ({ property: "paciente_id", [tabela.tipoId]: { equals: id } })) },
                sorts: [{ property: tabela.data, direction: "descending" }, { timestamp: "created_time", direction: "descending" }],
                page_size: 100,
                ...(cursor ? { start_cursor: cursor } : {}),
            });
            for (const page of result.results ?? []) {
                const registro = mapear(page, tabela.data);
                if (!ultimos.has(registro.paciente_id)) ultimos.set(registro.paciente_id, registro);
            }
            if (result.has_more && !result.next_cursor) throw new Error("Paginação NPS incompleta.");
            cursor = result.has_more ? result.next_cursor : undefined;
        } while (cursor);
    }
    return ids.map(paciente_id => {
        const registro = ultimos.get(paciente_id);
        return { paciente_id, avaliacao_valida: registro ? avaliacaoValida(registro, agora) : false };
    });
}
