const NOTION_API_TOKEN = process.env.NOTION_API_TOKEN || "";
const NOTION_DATABASE_PAGE_ID = process.env.NOTION_DATABASE_PAGE_ID || "";

// Função auxiliar para fazer chamadas HTTP seguras para o Notion
export async function chamarNotionAPI(endpoint: string, método: string = "GET", corpo?: any) {
    const url = `https://api.notion.com/v1/${endpoint}`;
    
    const resposta = await fetch(url, {
        method: método,
        headers: {
            "Authorization": `Bearer ${NOTION_API_TOKEN}`,
            "Notion-Version": "2022-06-28", // Versão estável da API pública do Notion
            "Content-Type": "application/json"
        },
        body: corpo ? JSON.stringify(corpo) : null
    });

    if (!resposta.ok) {
        const erroTexto = await resposta.text();
        throw new Error(`Falha na API do Notion [${resposta.status}]: ${erroTexto}`);
    }

    return resposta.json();
}

export async function buscarTabelasBanco() {
    // Lista os blocos filhos da página mãe para mapear os bancos inline
    const dados = await chamarNotionAPI(`blocks/${NOTION_DATABASE_PAGE_ID}/children`);

    const tabelas = (dados.results || [])
        .filter((block: any) => block.type === "child_database")
        .map((block: any) => ({
            id: block.id,
            nome: block.child_database?.title?.toLowerCase().trim() || ""
        }));

    return tabelas;
}
