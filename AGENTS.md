# 🛠️ CONTEXTO DO PROJETO: API DE DADOS (NOTION INTEGRATION)

Você é um desenvolvedor especialista que está me ajudando a construir e manter uma API Gateway. O objetivo principal deste projeto é servir como uma camada intermediária de back-end para ler, filtrar, adicionar e alterar dados diretamente em tabelas hospedadas dentro do Notion.

---

## 📌 1. ARQUITETURA DO PROJETO
* **Runtime:** Node.js (v24+)
* **Linguagem:** TypeScript (Sintaxe moderna ESM, `"type": "module"`)
* **Framework:** Express (Gerenciamento de rotas HTTP)
* **Executor:** `tsx watch` (Para recarregamento automático em tempo real)
* **Gerenciador de Variáveis:** Nativo do Node (`--env-file=.env.local`)

---

## 💾 2. ESTRUTURA DO BANCO DE DADOS (NOTION)
Temos uma página mãe no Notion chamada **"Base de dados"** cujo ID está na variável `NOTION_DATABASE_PAGE_ID`.
Dentro desta página mãe, existem múltiplas tabelas Inline (bancos de dados do Notion). A API lê dinamicamente esses blocos filhos para descobrir os IDs reais das tabelas usando seus nomes de exibição.

### Tabelas Principais Atuais:
1. **`pacientes`**
   * Propriedades/Colunas:
     * `nome` (Tipo: Title / Texto Principal)
     * `cpf` (Tipo: Rich Text / Texto Comum)
     * `id_unico` (Tipo: Rich Text / Texto Comum)
     * `data_nascimento` (Tipo: Date / Data)
     * `email` (Tipo: Email)
     * `telefone` (Tipo: Phone Number / Telefone)

2. **`agendamentos`** (A ser expandida nas próximas etapas)

---

## ⚠️ 3. DIRETRIZES OBRIGATÓRIAS DE CÓDIGO (LEIA ANTES DE ESCREVER)

### 🔴 NÃO UTILIZE O SDK OFICIAL DO NOTION (`@notionhq/client`)
O SDK oficial possui inconsistências conhecidas de runtime com métodos de busca (como o `.query`). **Toda comunicação com o Notion deve ser feita exclusivamente por requisições HTTP nativas usando o `fetch` global do Node.js**, batendo direto nos endpoints da API oficial do Notion (`https://notion.com`).

### 🔴 REGRAS DE MAPEAMENTO DE PROPRIEDADES DO NOTION
O Notion envelopa dados textuais dentro de coleções de arrays. Ao extrair ou injetar dados de texto (`title` ou `rich_text`), use sempre encadeamento opcional e acesse a primeira posição do array:
* Certo: `props.nome?.title?.[0]?.text?.content`
* Errado: `props.nome?.title?.text?.content`

### 🔴 ENTRADAS E SAÍDAS (INPUT/OUTPUT)
* Toda resposta de rota que devolva registros do banco deve seguir rigidamente a tipagem de interfaces definida em `@utils/interfaces.ts`.
* Variáveis sensíveis (`NOTION_API_TOKEN` e `NOTION_DATABASE_PAGE_ID`) devem vir de `process.env`.

---

## 🚀 4. REQUISITOS ATUAIS E PRÓXIMOS PASSOS
Atualmente, o projeto possui rotas para **Listar Tabelas** e **Buscar Paciente por CPF**. 
Quando eu solicitar novas funcionalidades, você deve criar ou expandir funções seguindo este padrão de requisição via `fetch` para endpoints do Notion, focando em:
1. **Adição de Dados (POST):** Enviar requisições para `https://notion.compages` mapeando o corpo de propriedades no formato exigido pela API do Notion.
2. **Alteração de Dados (PATCH):** Atualizar propriedades de páginas existentes usando o ID da linha encontrada.
