
import type * as interfaces from "../../../utils/interfaces.js";
import { chamarNotionAPI } from "../../notion.js";
import { mapearClinica } from "../clinicas/buscarClinica.js";

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

const INTEGRACOES_CLINICAS_ID = "3ca46144576980d9a217c1ef041fe47c";

export async function buscarTableCron(): Promise<interfaces.CronTable[]> {
  const tabelas = await chamarNotionAPI(
    "databases/3ca46144576980ae9ec4e4d6451e04ef/query",
    "POST"
  );

  const cronTables = await Promise.all(
    (tabelas.results || []).map(async (page: any) => {
      const props = page.properties;
      const clinicaId = relationIds(props.clinica)[0] ?? "";
      const integracaoId = relationIds(props.integracao)[0] ?? "";

      let chave_segura = "";
      let botconversa_msg_url = "";
      let integracaoNome = "";
      const clinica: interfaces.CronClinica = {
        id: clinicaId,
        name: "",
        base_de_dados_id: "",
      };

      if (clinicaId) {
        const clinicaPage = await chamarNotionAPI(`pages/${clinicaId}`, "GET", undefined, {
          permitir404: true,
        });
        if (clinicaPage) {
          const mapped = mapearClinica(clinicaPage);
          clinica.id = mapped.id || clinicaId;
          clinica.name = mapped.nome;
          clinica.base_de_dados_id = mapped.base_de_dados_id;
        }
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
          botconversa_msg_url = texto(row.properties?.botconversa_msg_url);

          const integRelId = relationIds(row.properties?.integracao)[0] ?? integracaoId;
          if (integRelId) {
            const integPage = await chamarNotionAPI(`pages/${integRelId}`, "GET", undefined, {
              permitir404: true,
            });
            if (integPage) {
              integracaoNome = titleOf(integPage);
            }
          }
        }
      }

      const item: interfaces.CronTable = {
        name: props.name?.title?.[0]?.plain_text ?? "",
        clinica,
        metadata: texto(props.metadata),
        cron_rule: texto(props.cron_rule),
        integracao: { name: integracaoNome },
        chave_segura,
        botconversa_msg_url,
      };

      return item;
    })
  );

  return cronTables;
}
