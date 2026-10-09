import type { CronConsultaFinalizadaTable } from "../../../utils/interfaces.js";
import { queryNotionTodasPaginas } from "../../notion.js";

const CRON_CONSULTAS_FINALIZADAS_DATABASE_ID = "3df46144576980f6b498cd7a75b7bbb7";

type PropriedadeTexto = {
    title?: { plain_text?: string; text?: { content?: string } }[];
    rich_text?: { plain_text?: string; text?: { content?: string } }[];
    url?: string | null;
};

function texto(prop: PropriedadeTexto | undefined): string {
    const primeiro = prop?.title?.[0] ?? prop?.rich_text?.[0];
    if (primeiro) {
        const restante = (prop?.title ?? prop?.rich_text ?? []).slice(1);
        return [primeiro, ...restante].map(fragmento => fragmento.text?.content ?? fragmento.plain_text ?? "").join("").trim();
    }
    return String(prop?.url ?? "").trim();
}

/** Sem cache e sem filtro ativo: o agendador precisa observar também desativações. */
export async function buscarTableCronConsultasFinalizadas(): Promise<CronConsultaFinalizadaTable[]> {
    const pages = await queryNotionTodasPaginas(CRON_CONSULTAS_FINALIZADAS_DATABASE_ID, {}, { validarPaginacao: true });
    return pages.filter(page => page && !page.archived && !page.in_trash).map(page => {
        const p = page.properties ?? {};
        const relacao = p.clinica?.relation;
        // Uma configuração deve apontar para exatamente uma clínica, sem escolher outra silenciosamente.
        const clinicaId = Array.isArray(relacao) && relacao.length === 1 && !p.clinica?.has_more
            ? String(relacao[0]?.id ?? "").trim() : "";
        return {
            id: String(page.id ?? "").trim(),
            nome: texto(p.nome ?? p.Nome),
            clinicaId,
            cron: texto(p.cron),
            ativo: p.ativo?.checkbox === true,
            unidades: texto(p.unidades),
            webhookurl: texto(p.webhookurl),
        };
    });
}
