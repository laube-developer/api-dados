import { buscarTabelasBanco, chamarNotionAPI } from "../notion.js";
import { ErroValidacao, ErroNaoEncontrado } from "./atualizarPacientes.js";

export async function atualizarNpsPaciente(pacienteId: unknown, nps: unknown) {
    if (!["string", "number"].includes(typeof pacienteId)
        || !String(pacienteId).trim()
        || (typeof pacienteId === "number" && !Number.isSafeInteger(pacienteId))
        || typeof nps !== "number" || !Number.isInteger(nps) || nps < 0 || nps > 10) {
        throw new ErroValidacao("Informe paciente_id e nps inteiro entre 0 e 10.");
    }
    const id = String(pacienteId).trim();
    const tabelas = await buscarTabelasBanco();
    const tabela = tabelas.find(item => item.nome === "pacientes");
    if (!tabela) throw new Error("Tabela de pacientes não encontrada na página base do Notion.");
    const resultado = await chamarNotionAPI(`databases/${tabela.id}/query`, "POST", {
        filter: { property: "id_unico", rich_text: { equals: id } }, page_size: 2,
    });
    const pagina = resultado.results?.[0];
    if (!pagina) throw new ErroNaoEncontrado("Paciente não encontrado.");
    if (resultado.results.length > 1 || resultado.has_more) {
        throw new Error("Mais de um paciente encontrado com o mesmo id_unico.");
    }
    const last_update_nps = new Date().toISOString();
    const atualizado = await chamarNotionAPI(`pages/${pagina.id}`, "PATCH", {
        properties: { nps: { number: nps }, last_update_nps: { date: { start: last_update_nps } } },
    });
    return {
        id_unico: atualizado.properties.id_unico?.rich_text?.[0]?.text?.content ?? id,
        nps: atualizado.properties.nps?.number ?? nps,
        last_update_nps: atualizado.properties.last_update_nps?.date?.start ?? last_update_nps,
    };
}
