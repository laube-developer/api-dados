
import type * as interfaces from "../../../utils/interfaces.js";
import { chamarNotionAPI } from "../../notion.js";

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
  return "";
}

const INTEGRACOES_CLINICAS_ID = "COLE_O_ID_DA_DATABASE_INTEGRACOES_CLINICAS";

export async function buscarTableCron(): Promise<interfaces.CronTable[]> {
  const tabelas = await chamarNotionAPI(
    "databases/3ca46144576980ae9ec4e4d6451e04ef/query",
    "POST"
  );

  const cronTables = await Promise.all(
    (tabelas.results || []).map(async (page: any) => {
      const props = page.properties;
      const clinicaId = relationIds(props.clinica)[0];
      const integracaoId = relationIds(props.integracao)[0];

      let chave_segura = "";
      let integracao = "";
      let clinica = "";

      if (clinicaId) {
        const clinicaPage = await chamarNotionAPI(`pages/${clinicaId}`, "GET");
        clinica = titleOf(clinicaPage);
      }

      if (clinicaId && integracaoId) {
        const join = await chamarNotionAPI(
          `databases/${INTEGRACOES_CLINICAS_ID}/query`,
          "POST",
          {
            filter: {
              and: [
                { property: "clinica", relation: { contains: clinicaId } },
                { property: "integracao", relation: { contains: integracaoId } },
              ],
            },
          }
        );

        const row = join.results?.[0];
        if (row) {
          chave_segura = texto(row.properties?.chave_segura);

          const integRelId = relationIds(row.properties?.integracao)[0];
          if (integRelId) {
            const integPage = await chamarNotionAPI(`pages/${integRelId}`, "GET");
            integracao = titleOf(integPage);
          }
        }
      }

      return {
        name: props.name?.title?.[0]?.plain_text ?? "",
        clinica,
        clinicaIds: clinicaId ? [clinicaId] : [],
        metadata: texto(props.metadata),
        cron_rule: texto(props.cron_rule),
        integracao,
        chave_segura,
        integracaoIds: integracaoId ? [integracaoId] : [],
      };
    })
  );

  return cronTables;
}