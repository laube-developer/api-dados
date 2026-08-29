
import type * as interfaces from "../../../utils/interfaces.js";
import { buscarTabelasBanco, chamarNotionAPI } from "../../notion.js";

export async function buscarTableCron(): Promise<interfaces.CronTable[]> {
    const tabelas = await chamarNotionAPI("databases/53946144-5769-825f-9d14-072f95ff4899/query", "POST");
    
    const cronTables: interfaces.CronTable[] = (tabelas.results || []).map((page: any) => {
        const props = page.properties;
        return {
            name: props.name?.title?.[0]?.text?.content || "",
            clinica: props.clinica?.rich_text?.[0]?.text?.content || "",
            metadata: props.metadata?.rich_text?.[0]?.text?.content || "",
            cron_rule: props.cron_rule?.rich_text?.[0]?.text?.content || "",
            integracao: props.integracao?.rich_text?.[0]?.text?.content || ""
        };
    });

    console.log("Fetch: buscarTableCron -> " + JSON.stringify(cronTables));

    return new Promise((resolve) => resolve(cronTables));
}