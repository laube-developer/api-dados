
import type * as interfaces from "../../../utils/interfaces.js";
import { chamarNotionAPI, queryNotionTodasPaginas } from "../../notion.js";
import { comCache } from "../../redisCache.js";
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
  if (prop.type === "select") {
    return String(prop.select?.name ?? "").trim();
  }
  if (prop.type === "multi_select") {
    return (prop.multi_select ?? [])
      .map((item: { name?: string }) => String(item?.name ?? "").trim())
      .filter(Boolean)
      .join(",");
  }
  if (prop.type === "number" && prop.number != null) {
    return String(prop.number);
  }
  if (prop.type === "formula") {
    if (prop.formula?.type === "string") {
      return String(prop.formula.string ?? "").trim();
    }
    if (prop.formula?.type === "number" && prop.formula.number != null) {
      return String(prop.formula.number);
    }
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

function numero(prop: any): number {
  if (prop?.type === "number" && typeof prop.number === "number") {
    return prop.number;
  }
  const n = Number(texto(prop));
  return Number.isFinite(n) ? n : 0;
}

function checkbox(prop: any, padrao: boolean): boolean {
  if (!prop) return padrao;
  if (prop.type === "checkbox") return Boolean(prop.checkbox);
  const t = texto(prop).toLowerCase();
  if (!t) return padrao;
  return t !== "false" && t !== "0";
}

const INTEGRACOES_CLINICAS_ID = "3ca46144576980d9a217c1ef041fe47c";
const CRON_DATABASE_ID = "3ca46144576980ae9ec4e4d6451e04ef";

async function mapearUmaLinhaCron(page: any): Promise<interfaces.CronTable | null> {
  const props = page.properties;
  const clinicaId = relationIds(props.clinica)[0] ?? "";
  const integracaoId = relationIds(props.integracao)[0] ?? "";

  let chave_segura = "";
  let botconversa_msg_url = "";
  let integracaoNome = "";
  let integracaoRelId = "";
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
    const joinRows = await queryNotionTodasPaginas(INTEGRACOES_CLINICAS_ID, {
      filter: {
        and: [
          { property: "clinica", relation: { contains: clinicaId } },
          { property: "integracao", relation: { contains: integracaoId } },
        ],
      },
    });

    const row = joinRows.find((item) => !item?.archived);
    if (row) {
      chave_segura = texto(row.properties?.chave_segura);
      botconversa_msg_url = texto(row.properties?.botconversa_msg_url);
      integracaoRelId = relationIds(row.properties?.integracao)[0] ?? "";
    }

    const relId = integracaoRelId || integracaoId;
    if (relId) {
      const integPage = await chamarNotionAPI(`pages/${relId}`, "GET", undefined, {
        permitir404: true,
      });
      if (integPage) {
        integracaoNome = titleOf(integPage);
      }
    }
  }

  return {
    name: props.name?.title?.[0]?.plain_text ?? "",
    clinica,
    integracao: { name: integracaoNome },
    chave_segura,
    botconversa_msg_url,
    cron: texto(propPorNome(props, ["cron"])),
    tipo_antecedencia: texto(propPorNome(props, ["tipo_antecedencia"])),
    antecedencia: numero(propPorNome(props, ["antecedencia"])),
    tipo_dia: texto(propPorNome(props, ["tipo_dia"])),
    unidades: texto(propPorNome(props, ["unidades"])),
    medicos: texto(propPorNome(props, ["medicos"])),
    ativo: checkbox(propPorNome(props, ["ativo"]), true),
  };
}

async function carregarTableCron(): Promise<interfaces.CronTable[]> {
  const pages = await queryNotionTodasPaginas(CRON_DATABASE_ID);
  const cronTables: interfaces.CronTable[] = [];

  for (const page of pages) {
    try {
      const item = await mapearUmaLinhaCron(page);
      if (item) {
        cronTables.push(item);
      }
    } catch (erro) {
      const nome = String(page?.properties?.name?.title?.[0]?.plain_text ?? page?.id ?? "?");
      console.error(
        `[${new Date().toISOString()}] Linha cron ignorada (${nome}):`,
        erro
      );
    }
  }

  return cronTables;
}

export async function buscarTableCron(): Promise<interfaces.CronTable[]> {
  return comCache("api-dados:cron-table", carregarTableCron);
}
