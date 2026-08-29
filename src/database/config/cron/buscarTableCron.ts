function relationIds(prop: any): string[] {
  if (prop?.type !== "relation" || !Array.isArray(prop.relation)) return [];
  return prop.relation.map((r: { id: string }) => r.id);
}

function plain(prop: any): string {
  if (!prop) return "";
  switch (prop.type) {
    case "title":
      return prop.title?.[0]?.plain_text ?? "";
    case "rich_text":
      return prop.rich_text?.map((t: any) => t.plain_text ?? "").join("") ?? "";
    case "url":
      return prop.url ?? "";
    case "email":
      return prop.email ?? "";
    case "select":
      return prop.select?.name ?? "";
    case "status":
      return prop.status?.name ?? "";
    case "number":
      return prop.number != null ? String(prop.number) : "";
    default:
      return "";
  }
}

function prop(page: any, name: string): string {
  return plain(page?.properties?.[name]);
}

function titleOf(page: any): string {
  const props = page?.properties ?? {};
  for (const p of Object.values(props) as any[]) {
    if (p?.type === "title") return p.title?.[0]?.plain_text ?? "";
  }
  return "";
}

export async function buscarTableCron(): Promise<interfaces.CronTable[]> {
  const tabelas = await chamarNotionAPI(
    "databases/3ca46144576980ae9ec4e4d6451e04ef/query",
    "POST"
  );

  const cronTables = await Promise.all(
    (tabelas.results || []).map(async (page: any) => {
      const props = page.properties;

      const clinicaIds = relationIds(props.clinica);
      const integracaoIds = relationIds(props.integracao);

      const [clinicaPages, integracaoPages] = await Promise.all([
        Promise.all(clinicaIds.map((id) => chamarNotionAPI(`pages/${id}`, "GET"))),
        Promise.all(integracaoIds.map((id) => chamarNotionAPI(`pages/${id}`, "GET"))),
      ]);

      // em geral 1 integração por linha da Cron
      const integ = integracaoPages[0];

      return {
        name: props.name?.title?.[0]?.plain_text ?? "",
        clinica: clinicaPages.map(titleOf).filter(Boolean).join(", "),
        clinicaIds,
        metadata: props.metadata?.rich_text?.[0]?.plain_text ?? "",
        cron_rule: props.cron_rule?.rich_text?.[0]?.plain_text ?? "",
        integracao: integ ? prop(integ, "integracao") || titleOf(integ) : "",
        chave_segura: integ ? prop(integ, "chave_segura") : "",
        integracaoIds,
      };
    })
  );

  console.log(
    "Fetch: buscarTableCron ->",
    cronTables.map(({ chave_segura, ...rest }) => rest)
  );

  return cronTables;
}