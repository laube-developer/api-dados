# API de Dados — Notion Integration

API Gateway em Node.js + Express que lê, filtra, adiciona e altera dados em tabelas do Notion.

**Contrato HTTP canônico:** [`docs/api.md`](docs/api.md) (rotas clínicas `/*` e `/salus/estoque/*`).

## Execução

```bash
npm run dev
```

Variáveis de ambiente necessárias (arquivo `.env.local`):

| Variável | Descrição |
|---|---|
| `PORT` | Porta do servidor |
| `NOTION_API_TOKEN` | Token de integração do Notion |
| `NOTION_DATABASE_PAGE_ID` | ID da página mãe "Base de dados" (rotas clínicas `/*`) |
| `NOTION_SALUS_DATABASE_PAGE_ID` | ID da página mãe do estoque Salus (`/salus/estoque/*`) |
| `NOTION_SALUS_MEDICOS_DATABASE_ID` | ID da database-fonte `medicos` (não a linked view) |
| `NOTION_SALUS_PACIENTES_DATABASE_ID` | ID da database-fonte `pacientes` (não a linked view) |
| `AUTH_TOKEN` | Token Bearer |
| `NOTION_API_URL` | URL base da API Notion |

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

Contrato também em [`docs/api.md`](docs/api.md). Abaixo: rotas clínicas `/*` e estoque Salus `/salus/estoque/*`.

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
| `cpf` | `string` | Sim | CPF do paciente |
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
GET /agendamento?cpf=12345678900&start_date=2026-06-01&end_date=2026-06-30
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

## Rotas Salus estoque (`/salus/estoque/*`)

Namespace do app de estoque da clínica Salus. Sempre usa `NOTION_SALUS_DATABASE_PAGE_ID` e **ignora** `x-base-de-dados-id`.

`id` no JSON e nas URLs: UUID da page Notion. Relations também são esse UUID. Sem `DELETE` público.

### Recursos

| URL | Tabela Notion | Campos da API |
|---|---|---|
| `/salus/estoque/tipos-procedimentos` | `tipos_procedimentos` | `id`, `nome` |
| `/salus/estoque/materiais` | `materiais` | `id`, `nome`, `codigo` |
| `/salus/estoque/fornecedores` | `fornecedores` | `id`, `nome`, `contato`, `whatsapp`, `email`, `obs`, `ativo` |
| `/salus/estoque/compras` | `compras` | `id`, `data_hora`, `obs` |
| `/salus/estoque/itens-compra` | `itens_compra` | `id`, `compra`, `material`, `fornecedor`, `quantidade` |
| `/salus/estoque/kits` | `kits` | `id`, `nome`, `tipo_procedimento` |
| `/salus/estoque/kits-materiais` | `kits_materiais` | `id`, `material`, `kit`, `quantidade` |
| `/salus/estoque/medicos` | `medicos` | `id`, `nome`, `especialidade` |
| `/salus/estoque/pacientes` | `pacientes` | `id`, `nome`, `contato` |
| `/salus/estoque/registros` | `registros` | `id`, `data_hora`, `tipo_procedimento`, `paciente`, `medico`, `quantidade`, `obs` |
| `/salus/estoque/kits-registro` | `kits_registro` | `id`, `registro`, `kit`, `quantidade` |
| `/salus/estoque/materiais-registro` | `materiais_registro` | `id`, `registro`, `material`, `quantidade` |
| `/salus/estoque/estoque` | `estoque` | `id`, `material`, `quantidade`, `nome` (saldo) |

O path `/salus/estoque/estoque` é a tabela de saldo; `/salus/estoque` é o prefixo do módulo.

`nome` é obrigatório no POST quando é Title de negócio (`tipos-procedimentos`, `materiais`, `fornecedores`, `kits`, `medicos`, `pacientes`). Nas demais o backend preenche o Title sozinho.

### CRUD padrão (recurso `R`)

| Método | Caminho | Status | Ação |
|---|---|---|---|
| `GET` | `/salus/estoque/R` | 200 | Lista. Query: `id`, `codigo` (equals), `ativo` (equals), relations (equals), textos (contains). |
| `GET` | `/salus/estoque/R/:id` | 200 / 404 | Busca pelo UUID da page |
| `POST` | `/salus/estoque/R` | 201 | Cria |
| `PATCH` | `/salus/estoque/R/:id` | 200 | Alteração parcial |

**Exemplo** — listar e criar tipo de procedimento:

```
GET /salus/estoque/tipos-procedimentos
POST /salus/estoque/tipos-procedimentos
```

```json
{
  "sucesso": true,
  "dados": { "id": "<uuid>", "nome": "Consulta" }
}
```

Validação POST: relations obrigatórias; `quantidade` inteiro ≥ 0; `data_hora` ISO 8601; `ativo` boolean (default `true` se omitido).

### `POST /salus/estoque/fornecedores/:id/ativar` e `/desativar`

Só em tabelas com `ativo` (hoje: `fornecedores`). 200 com o registro atualizado; 404 se não existir.

### `POST /salus/estoque/compras`

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

`POST /salus/estoque/itens-compra` avulso também incrementa o saldo. `PATCH` em `itens-compra` que altere `quantidade` aplica o delta; delta negativo que deixe saldo < 0 → **400**, sem gravar.

### `POST /salus/estoque/registros`

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

`POST /salus/estoque/kits-registro` e `POST /salus/estoque/materiais-registro` avulsos seguem a mesma baixa. PATCH de `quantidade` nessas linhas aplica delta.

### `GET/POST/PATCH /salus/estoque/estoque`

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

**Página clínica (`NOTION_DATABASE_PAGE_ID` / `x-base-de-dados-id`):**

| Tabela | Colunas principais |
|---|---|
| `pacientes` | `nome` (Title), `cpf`, `id_unico`, `data_nascimento`, `email`, `telefone` |
| `agendamentos` | `id_agenda`, `id_unico`, `data_hora_inicio`, `data_hora_fim`, `id_medico`, `cpf_paciente`, `id_tipo_procedimento`, `status`, `guia_assinada`, `insurance_id` |
| `medicos` | `nome` (Title), `id_unico` (Rich Text) |
| `agendas` | `nome` (Title), `id_unico` (Rich Text) |

**Página estoque Salus (`NOTION_SALUS_DATABASE_PAGE_ID`):**

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
| `pacientes` | `nome` (Title), `contato` (linked view) |
| `registros` | `data_hora`, `tipo_procedimento`, `paciente`, `medico`, `quantidade`, `obs` |
| `kits_registro` | `registro`, `kit`, `quantidade` |
| `materiais_registro` | `registro`, `material`, `quantidade` |
| `estoque` | `material`, `quantidade`, `nome` |