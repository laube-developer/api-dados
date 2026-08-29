
import type * as interfaces from "../../../utils/interfaces.js";
import { buscarTabelasBanco, chamarNotionAPI } from "../../notion.js";

function relationIds(prop: any): string[] {
  if (prop?.type !== "relation" || !Array.isArray(prop.relation)) return [];
  return prop.relation.map((r: { id: string }) => r.id);
}

function titleOf(page: any): string {
  const props = page?.properties ?? {};
  for (const p of Object.values(props) as any[]) {
    if (p?.type === "title") {
      return p.title?.[0]?.plain_text ?? p.title?.[0]?.text?.content ?? "";
    }
  }
  return "";
}

export async function buscarTableCron(): Promise<interfaces.CronTable[]> {
    const tabelas = await chamarNotionAPI("databases/3ca46144576980ae9ec4e4d6451e04ef/query", "POST");

    const cronTables = await Promise.all(
        (tabelas.results || []).map(async (page: any) => {
            const props = page.properties;

            const clinicaIds = relationIds(props.clinica);
            const integracaoIds = relationIds(props.integracao);

            const clinicaPages = await Promise.all(
                clinicaIds.map((id) => chamarNotionAPI(`pages/${id}`, "GET"))
            );
            const integracaoPages = await Promise.all(
                integracaoIds.map((id) => chamarNotionAPI(`pages/${id}`, "GET"))
            );

            return {
                name: props.name?.title?.[0]?.plain_text ?? "",
                clinica: clinicaPages.map(titleOf).filter(Boolean).join(", "),
                clinicaIds,
                metadata: props.metadata?.rich_text?.[0]?.plain_text ?? "",
                cron_rule: props.cron_rule?.rich_text?.[0]?.plain_text ?? "",
                integracao: integracaoPages.map(titleOf).filter(Boolean).join(", "),
                integracaoIds,
            };
        })
    );

    console.log("Fetch: buscarTableCron -> " + JSON.stringify(cronTables));

    return new Promise((resolve) => resolve(cronTables));
}