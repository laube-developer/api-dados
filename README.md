# API de Dados — Notion Integration

API Gateway em Node.js + Express que lê, filtra, adiciona e altera dados em tabelas do Notion.

**Contrato HTTP canônico:** [`docs/api.md`](docs/api.md) (rotas clínicas `/*` e `/estoque/*`).

## Execução

```bash
npm run dev
```

Variáveis de ambiente necessárias (arquivo `.env.local`):

| Variável | Descrição |
|---|---|
| `PORT` | Porta do servidor |
| `NOTION_API_TOKEN` | Token de integração do Notion |
| `NOTION_DATABASE_PAGE_ID` | ID da página mãe "Base de dados" (rotas clínicas `/*`; **fallback** se não vier `x-base-de-dados-id`) |
| `AUTH_TOKEN` | Token Bearer |
| `NOTION_API_URL` | URL base da API Notion |
| `REDIS_URL` | Redis do cache de config Notion (padrão `redis://127.0.0.1:6379`). Horário comercial SP (8h–18h): TTL 3 min. Fora: TTL 1 h. Só busca na Notion no request (cache miss); não há job que revalide sozinho. |
| `REDIS_PASSWORD` | Se o Redis exige senha (`--requirepass` no `docker-compose.dev.yml` do totem) e a URL não traz `:@senha@`, a api-dados inclui essa senha na conexão. |

Tenant das tabelas da clínica: `X-Base-De-Dados-Id` **ou** `X-Clinica-Id` (resolve `clinicas.base_de_dados_id`). Sem os dois, cai no `NOTION_DATABASE_PAGE_ID` do ambiente.

`GET /integracaoClinica`: cada linha da Notion é uma integração completa. Mesmo nome (ex. duas linhas “AmigoApp”) **não** mistura chave de uma com unidades da outra. Uma linha → objeto; várias → array. Query `integracao` filtra pelo nome.

Queries de database e `blocks/.../children` **paginam até `has_more` ser falso** (100 por página). `GET /buscarTableCron` percorre todas as linhas; falha numa linha **não** derruba as outras.

**Pendência (estoque):** `GET /estoquePorDominio` ainda não pagina além de 100 nem usa Redis. Fazer na leva de estoque.

---

## Formato padrão de resposta

Todas as rotas seguem o mesmo envelope JSON.

### Sucesso

```json
{
  "sucesso": true,
  "dados": { }
}
```

- `dados` pode ser um **objeto** ou um **array**, conforme a rota.
- Rotas de criação (`POST`) retornam status **201**.
- Demais rotas de sucesso retornam status **200**.

### Erro

```json
{
  "sucesso": false,
  "erro": "Mensagem descritiva do erro"
}
```

| Status | Quando ocorre |
|---|---|
| `400` | Parâmetros ou corpo da requisição inválidos |
| `401` / `403` | Token ausente ou diferente de `AUTH_TOKEN` |
| `404` | Recurso buscado não encontrado |
| `500` | Erro interno ou falha na API do Notion |

---

## Testes

```bash
npm test
```

## Rotas

Header em todas as rotas: `Authorization: Bearer <AUTH_TOKEN>`.

### Tenant (clínica)

Rotas clínicas `/*` (pacientes, agendamentos, médicos, agendas, …) usam a página-mãe Notion:

1. Header `x-base-de-dados-id: <page Notion da base da clínica>` — o Super App preenche a partir de `clinica_id`
2. Senão, `NOTION_DATABASE_PAGE_ID`

`GET /clinicas`, `GET /clinica`, `GET /clinicaPorDominio`, `GET /integracaoClinica` e `GET /estoquePorDominio` leem tabelas de **configuração** (ids fixos), não a página-mãe do tenant.

`/estoque/*` resolve tenant pela tabela Notion `gestao > estoque` (`?dominio=`, header `x-estoque-dominio` ou Host `estoque.*`). Sem domínio → **400**. Domínio ausente na tabela → **404**. Sem fallback de env.

Contrato canônico (todas as rotas clínicas, inclusive `/pacientes`, `/agendamentos`, `/agendamentoPorId`, `/patients_exists`, …): [`docs/api.md`](docs/api.md). Abaixo: envelope, tenant, rotas mais usadas e clínicas/domínio.

### `GET /tabelas`

Lista as tabelas inline disponíveis na página mãe do Notion.

**Parâmetros:** nenhum.

**Resposta (`dados`):** array de `Tabela`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `string` | ID do banco no Notion |
| `nome` | `string` | Nome da tabela (minúsculo) |

**Exemplo de sucesso:**

```json
{
  "sucesso": true,
  "dados": [
    { "id": "abc123", "nome": "pacientes" },
    { "id": "def456", "nome": "agendamentos" }
  ]
}
```

---

### `GET /paciente`

Busca paciente(s) pelo CPF ou pelo nome.

A pesquisa usa um único parâmetro e aplica filtro **OU** no Notion: igualdade no campo `cpf` (quando o valor contém dígitos) e correspondência parcial (`contains`) no campo `nome`.

**Query params:**

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `cpf_or_name` | `string` | Sim | CPF do paciente (com ou sem formatação) **ou** nome (parcial ou completo) |

**Resposta (`dados`):** array de `Paciente`

| Campo | Tipo | Descrição |
|---|---|---|
| `nome` | `string` | Nome do paciente |
| `cpf` | `string` | CPF (apenas dígitos) |
| `id_unico` | `string` | Identificador único |
| `data_nascimento` | `string` | Data no formato `YYYY-MM-DD` |
| `email` | `string` | E-mail |
| `telefone` | `string` | Telefone |

**Exemplos:**

```
GET /paciente?cpf_or_name=12345678900
GET /paciente?cpf_or_name=Rafael
```

```json
{
  "sucesso": true,
  "dados": [
    {
      "nome": "Rafael",
      "cpf": "12345678900",
      "id_unico": "1",
      "data_nascimento": "1990-01-01",
      "email": "rafael@example.com",
      "telefone": "1234567890"
    }
  ]
}
```

**Erro 404:** nenhum paciente encontrado para o CPF ou nome informado.

---

### `GET /agendamento`

Busca agendamentos de um paciente dentro de um intervalo de datas.

**Query params:**

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `id_paciente` | `string` | Sim | `id_unico` do paciente (id Amigo). `cpf` só por compatibilidade legado |
| `start_date` | `string` | Sim | Data inicial (`YYYY-MM-DD`) |
| `end_date` | `string` | Sim | Data final (`YYYY-MM-DD`) |

**Resposta (`dados`):** array de `Agendamento`

| Campo | Tipo | Descrição |
|---|---|---|
| `id_agenda` | `string` | ID da agenda vinculada |
| `id_unico` | `string` | Identificador único do agendamento |
| `data_hora_inicio` | `string` | Início (ISO 8601) |
| `data_hora_fim` | `string` | Fim (ISO 8601) |
| `id_medico` | `string` | ID do médico |
| `cpf_paciente` | `string` | CPF do paciente |
| `id_tipo_procedimento` | `string` | ID do tipo de procedimento |
| `status` | `string` | Status atual (ver valores abaixo) |
| `guia_assinada` | `boolean` | Se a guia foi assinada |
| `insurance_id` | `string` | ID do convênio |

**Valores aceitos para `status`:**

`CONFIRMED` · `SCHEDULED` · `IN_ATTENDANCE` · `ARRIVED` · `MISSED` · `DONE` · `CANCELED`

**Exemplo:**

```
GET /agendamento?id_paciente=99815694&start_date=2026-06-01&end_date=2026-06-30
```

**Erro 400:** parâmetros ausentes, formato de data inválido ou `start_date` posterior a `end_date`.

**Erro 404:** nenhum agendamento encontrado no período.

---

### `POST /adicionarAgendamento`

Cria um novo agendamento no Notion.

**Body (JSON):** objeto `Agendamento` (todos os campos obrigatórios)

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `id_agenda` | `string` | Sim | ID da agenda |
| `id_unico` | `string` | Sim | Identificador único |
| `data_hora_inicio` | `string` | Sim | Data/hora de início |
| `data_hora_fim` | `string` | Sim | Data/hora de fim (deve ser posterior ao início) |
| `id_medico` | `string` | Sim | ID do médico |
| `cpf_paciente` | `string` | Sim | CPF com 11 dígitos |
| `id_tipo_procedimento` | `string` | Sim | ID do procedimento |
| `status` | `string` | Sim | Um dos status válidos |
| `guia_assinada` | `boolean` | Sim | `true` ou `false` |
| `insurance_id` | `string` | Sim | ID do convênio |

**Resposta (`dados`):** objeto `Agendamento` criado.

**Status:** `201`

**Erro 400:** validação de campos.

---

### `PATCH /atualizarStatusAgendamento`

Atualiza o status de um agendamento existente.

**Body (JSON):**

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `id_unico` | `string` | Sim | Identificador único do agendamento |
| `status` | `string` | Sim | Novo status (valores válidos acima) |

**Resposta (`dados`):** objeto `Agendamento` atualizado.

**Erro 400:** campos inválidos.

**Erro 404:** agendamento não encontrado.

---

### `GET /medicos`

Lista todos os médicos cadastrados.

**Parâmetros:** nenhum.

**Resposta (`dados`):** array de `Medico` (pode ser array vazio)

| Campo | Tipo | Descrição |
|---|---|---|
| `id_unico` | `string` | Identificador único |
| `nome` | `string` | Nome do médico |

**Exemplo:**

```json
{
  "sucesso": true,
  "dados": [
    { "id_unico": "MED001", "nome": "Dr. João Silva" }
  ]
}
```

---

### `POST /adicionarMedico`

Cadastra um novo médico.

**Body (JSON):**

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `id_unico` | `string` | Sim | Identificador único |
| `nome` | `string` | Sim | Nome do médico |

**Resposta (`dados`):** objeto `Medico` criado.

**Status:** `201`

**Erro 400:** campos ausentes ou vazios.

---

### `GET /agendas`

Lista todas as agendas cadastradas.

**Parâmetros:** nenhum.

**Resposta (`dados`):** array de `Agenda` (pode ser array vazio)

| Campo | Tipo | Descrição |
|---|---|---|
| `id_unico` | `string` | Identificador único |
| `nome` | `string` | Nome da agenda |

---

### `POST /adicionarAgenda`

Cadastra uma nova agenda.

**Body (JSON):**

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `id_unico` | `string` | Sim | Identificador único |
| `nome` | `string` | Sim | Nome da agenda |

**Resposta (`dados`):** objeto `Agenda` criado.

**Status:** `201`

**Erro 400:** campos ausentes ou vazios.

---

### `GET /clinicas`

Lista páginas da tabela Notion `clinicas` (configuração, sem tenant).

**Resposta (`dados`):** array de `{ id, nome, base_de_dados_id }`

`id` = page Notion da clínica. `base_de_dados_id` = página-mãe das tabelas clínicas (vai em `x-base-de-dados-id`).

---

### `GET /clinica`

Uma clínica por `id` (page Notion).

**Query:** `id` obrigatório. **404** se não existir. **400** se `id` vazio.

---

### `GET /clinicaPorDominio`

Hostname de confirmação → clínica. Tabela Notion `dominios_confirmacao` (`3dc461445769809785f3c86883371f58`): propriedade `dominio` + relação `clinica`.

**Query:** `dominio` — hostname puro (`confirmar.ortopediaceilandia.com.br`). **400** se vazio. **404** se não houver linha.

**Resposta (`dados`):**

```json
{
  "dominio": "confirmar.orthosmed.com.br",
  "clinica": {
    "id": "<page clinicas>",
    "nome": "Orthos",
    "base_de_dados_id": "<page-mãe da base>"
  }
}
```

---

### `GET /integracaoClinica`

Linha(s) de **Integrações Clínicas** da clínica. Query: `clinicaId` ou `clinica_id` (page Notion). **404** se não houver linha. **400** se o id vier vazio.

**Resposta (`dados`):**

| Campo | Descrição |
|---|---|
| `integracao.name` | Nome da integração relacionada |
| `chave_segura` | Chave Amigo |
| `callback_confirmar` | Após o paciente confirmar (Notion `callback_confirmar` / `callback_cadastrar`) |
| `callback_remarcar` | Após o paciente remarcar |
| `callback_cancelar` | Após o paciente cancelar |

---

### `GET /estoquePorDominio`

Config de estoque por hostname. Tabela Notion `gestao > estoque` (`3db4614457698097ba8ef1c82e5ddee9`).

**Query:** `dominio` — ex. `estoque.orthosmed.com.br`. **400** se vazio. **404** se não houver linha.

**Resposta (`dados`):** `{ dominio, clinica, estoque_database_page_id, medicos_database_id, pacientes_database_id }`

---

## Rotas de estoque (`/estoque/*`)

Namespace do app de estoque. Exige domínio (`?dominio=`, `x-estoque-dominio` ou Host `estoque.*`) e usa os IDs da tabela `gestao > estoque`. Sem domínio → 400. Domínio desconhecido → 404.

`id` no JSON e nas URLs: UUID da page Notion. Relations também são esse UUID. Sem `DELETE` público.

### Recursos

| URL | Tabela Notion | Campos da API |
|---|---|---|
| `/estoque/tipos-procedimentos` | `tipos_procedimentos` | `id`, `nome` |
| `/estoque/materiais` | `materiais` | `id`, `nome`, `codigo` |
| `/estoque/fornecedores` | `fornecedores` | `id`, `nome`, `contato`, `whatsapp`, `email`, `obs`, `ativo` |
| `/estoque/compras` | `compras` | `id`, `data_hora`, `obs` |
| `/estoque/itens-compra` | `itens_compra` | `id`, `compra`, `material`, `fornecedor`, `quantidade` |
| `/estoque/kits` | `kits` | `id`, `nome`, `tipo_procedimento` |
| `/estoque/kits-materiais` | `kits_materiais` | `id`, `material`, `kit`, `quantidade` |
| `/estoque/medicos` | `medicos` | `id`, `nome`, `especialidade` |
| `/estoque/pacientes` | `pacientes` | `id`, `nome`, `cpf`, `id_unico`, `telefone` |
| `/estoque/registros` | `registros` | `id`, `data_hora`, `paciente`, `medico`. Tipo/obs/quantidade do atendimento **não** existem nessa tabela; consumo vai em `kits_registro` e `materiais_registro`. |
| `/estoque/kits-registro` | `kits_registro` | `id`, `registro`, `kit`, `quantidade` |
| `/estoque/materiais-registro` | `materiais_registro` | `id`, `registro`, `material`, `quantidade` |
| `/estoque/estoque` | `estoque` | `id`, `material`, `quantidade`, `nome` (saldo) |

O path `/estoque/estoque` é a tabela de saldo; `/estoque` é o prefixo do módulo.

`nome` é obrigatório no POST quando é Title de negócio (`tipos-procedimentos`, `materiais`, `fornecedores`, `kits`, `medicos`, `pacientes`). Nas demais o backend preenche o Title sozinho.

### CRUD padrão (recurso `R`)

| Método | Caminho | Status | Ação |
|---|---|---|---|
| `GET` | `/estoque/R` | 200 | Lista. Query: `id`, `codigo` / `cpf` / `id_unico` (equals), `ativo` (equals), relations (equals), textos (contains). |
| `GET` | `/estoque/R/:id` | 200 / 404 | Busca pelo UUID da page |
| `POST` | `/estoque/R` | 201 | Cria |
| `PATCH` | `/estoque/R/:id` | 200 | Alteração parcial |

**Exemplo** — listar e criar tipo de procedimento:

```
GET /estoque/tipos-procedimentos
POST /estoque/tipos-procedimentos
```

```json
{
  "sucesso": true,
  "dados": { "id": "<uuid>", "nome": "Consulta" }
}
```

Validação POST: relations obrigatórias; `quantidade` inteiro ≥ 0; `data_hora` ISO 8601; `ativo` boolean (default `true` se omitido).

### `POST /estoque/fornecedores/:id/ativar` e `/desativar`

Só em tabelas com `ativo` (hoje: `fornecedores`). 200 com o registro atualizado; 404 se não existir.

### `POST /estoque/compras`

Cria a compra e, se vierem `itens`, cada item incrementa o saldo do material. Sem `itens` (ou array vazio): só o cabeçalho, sem mexer no saldo. Só responde **201** se entidades e saldo tiverem sido gravados.

**Body (JSON):**

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `data_hora` | `string` | Sim | ISO 8601 |
| `obs` | `string` | Não | Observação |
| `itens` | `array` | Não | Itens da compra |

Cada item: `material` (uuid), `fornecedor` (uuid), `quantidade` (inteiro ≥ 0).

```json
{
  "data_hora": "2026-09-03T10:00:00",
  "obs": "",
  "itens": [
    { "material": "<uuid>", "fornecedor": "<uuid>", "quantidade": 10 }
  ]
}
```

`POST /estoque/itens-compra` avulso também incrementa o saldo. `PATCH` em `itens-compra` que altere `quantidade` aplica o delta; delta negativo que deixe saldo < 0 → **400**, sem gravar.

### `POST /estoque/registros`

Cria o atendimento e dá baixa no saldo a partir de `kits` e/ou `materiais`. Se o saldo não cobrir o consumo → **400** e nada é criado. `registros.quantidade` é o campo do atendimento; **não** multiplica o BOM.

**Body (JSON):**

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `data_hora` | `string` | Sim | ISO 8601 |
| `tipo_procedimento` | `string` | Sim | UUID |
| `paciente` | `string` | Sim | UUID |
| `medico` | `string` | Sim | UUID |
| `quantidade` | `number` | Sim | Quantidade do atendimento |
| `obs` | `string` | Não | Observação |
| `kits` | `array` | Não | `{ "kit", "quantidade" }` |
| `materiais` | `array` | Não | `{ "material", "quantidade" }` |

```
consumo[material] = soma(materiais[].quantidade)
  + soma(kits[].quantidade * kits_materiais(kit, material).quantidade)
```

`POST /estoque/kits-registro` e `POST /estoque/materiais-registro` avulsos seguem a mesma baixa. PATCH de `quantidade` nessas linhas aplica delta.

### `GET/POST/PATCH /estoque/estoque`

CRUD direto do saldo (ajuste manual). Uma linha por `material`. Caminho normal: compra (entrada) e registro (saída).

### Falha no meio (compra/registro + saldo)

O Notion não tem transação. A API tenta o saldo até 3 vezes; se falhar, desfaz o saldo e arquiva o que criou. **500** se a operação não concluiu (estado consistente; pode repetir o POST). Se a compensação também falhar:

```json
{
  "sucesso": false,
  "erro": "Falha ao concluir a operação e a compensação ficou pendente.",
  "compensacao_pendente": true,
  "pendencias": [{ "tabela": "compras", "id": "<uuid>" }]
}
```

---

## Tabelas do Notion

A API descobre as tabelas dinamicamente pelo nome na página mãe. Nomes esperados:

**Configuração (ids fixos, sem tenant):**

| Tabela | Colunas principais |
|---|---|
| `clinicas` | `nome` (Title), `base_de_dados_id`, `whatsapp` |
| `dominios_confirmacao` | `dominio`, `clinica` (relação → `clinicas`). Database id `3dc461445769809785f3c86883371f58` |
| `gestao > estoque` | `dominio`, `clinica`, `estoque_database_page_id`, `medicos_database_id`, `pacientes_database_id`. Database id `3db4614457698097ba8ef1c82e5ddee9` |

**Página clínica (`NOTION_DATABASE_PAGE_ID` / `x-base-de-dados-id`):**

| Tabela | Colunas principais |
|---|---|
| `pacientes` | `nome` (Title), `cpf`, `id_unico`, `data_nascimento`, `email`, `telefone` |
| `agendamentos` | `id_agenda`, `id_unico`, `data_hora_inicio`, `data_hora_fim`, `id_medico`, `cpf_paciente`, `id_tipo_procedimento`, `status`, `guia_assinada`, `insurance_id` |
| `medicos` | `nome` (Title), `id_unico` (Rich Text) |
| `agendas` | `nome` (Title), `id_unico` (Rich Text) |

**Página estoque (`estoque_database_page_id` da linha em `gestao > estoque`):**

| Tabela | Colunas principais |
|---|---|
| `tipos_procedimentos` | `nome` (Title) |
| `materiais` | `nome` (Title), `codigo` |
| `fornecedores` | `nome` (Title), `contato`, `whatsapp`, `email`, `obs`, `ativo` |
| `compras` | `data_hora`, `obs` |
| `itens_compra` | `compra`, `material`, `fornecedor`, `quantidade` |
| `kits` | `nome` (Title), `tipo_procedimento` |
| `kits_materiais` | `material`, `kit`, `quantidade` |
| `medicos` | `nome` (Title), `especialidade` (linked view) |
| `pacientes` | `nome` (Title), `cpf`, `id_unico`, `telefone` (tabela-fonte; linked view na página de estoque) |
| `registros` | `data_hora`, `paciente`, `medico` (`nome` dummy). Consumo: `kits_registro` (`registro`, `kit`, `quantidade`, `nome`) e `materiais_registro` (`registro`, `material`, `quantidade`, `nome`) |
| `kits_registro` | `registro`, `kit`, `quantidade` |
| `materiais_registro` | `registro`, `material`, `quantidade` |
| `estoque` | `material`, `quantidade`, `nome` |