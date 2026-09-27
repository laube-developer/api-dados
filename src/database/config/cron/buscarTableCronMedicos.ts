import type { CronMedicoTable } from "../../../utils/interfaces.js";
import { queryNotionTodasPaginas } from "../../notion.js";

function texto(prop: any): string {
    const fragments = prop?.title ?? prop?.rich_text;
    if (Array.isArray(fragments)) return fragments.map((t: any) => t.plain_text ?? t.text?.content ?? "").join("").trim();
    if (prop?.multi_select) return prop.multi_select.map((v: any) => v.name).join(",");
    return String(prop?.select?.name ?? prop?.phone_number ?? prop?.url ?? prop?.number ?? "").trim();
}

/** Sem cache: cada sincronização precisa refletir inclusive desativações. */
export async function buscarTableCronMedicos(): Promise<CronMedicoTable[]> {
    const pages = await queryNotionTodasPaginas("3e8461445769803f952efb86c3403bec");
    return pages.filter(page => !page.archived && !page.in_trash).map(page => {
        const p = page.properties ?? {};
        const antecedencia = texto(p.antecedencia);
        return {
            id: page.id,
            nome: texto(p.Nome ?? p.nome),
            id_unico: texto(p.id_unico),
            clinicaId: p.clinica?.relation?.[0]?.id ?? "",
            telefone: texto(p.telefone),
            cron: texto(p.cron),
            ativo: p.ativo?.checkbox === true,
            tipo_antecedencia: texto(p.tipo_antecedencia).replace(/\s+/g, "_"),
            antecedencia: antecedencia === "" ? null : Number(antecedencia),
            unidades: texto(p.unidades),
            botconversa_webhook: texto(p.botconversa_webhook),
        };
    });
}
