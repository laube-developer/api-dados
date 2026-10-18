# Contrato da API de Dados

Documento canônico das rotas HTTP. Autenticação, envelope e paths abaixo são a fonte de verdade; o `README.md` aponta para este arquivo.

## Autenticação

Header obrigatório em todas as rotas:

```
Authorization: Bearer <AUTH_TOKEN>
```

| Status | Quando |
|---|---|
| 401 | Header ausente ou não começa com `Bearer ` |
| 403 | Token diferente de `AUTH_TOKEN` |

Não há login de usuário/senha nesta API.

## Envelope

### Sucesso

```json
{ "sucesso": true, "dados": {} }
```

`dados` é objeto ou array, conforme a rota. `POST` de criação responde **201**; demais sucessos **200**.

### Erro

```json
{ "sucesso": false, "erro": "Mensagem descritiva" }
```

| Status | Quando |
|---|---|
| 400 | Validação, quantidade inválida, saldo insuficiente |
| 401 / 403 | Token |
| 404 | Recurso não encontrado |
| 500 | Falha Notion / erro interno / saga não concluída |

Em falha de compensação do estoque o JSON pode incluir `compensacao_pendente: true` e `pendencias: [{ "tabela", "id" }]`.

Não há `DELETE` público. Páginas Notion só são arquivadas internamente como compensação de falha.

## Ambiente

| Variável | Uso |
|---|---|
| `PORT` | Porta do servidor |
| `AUTH_TOKEN` | Bearer |
| `NOTION_API_TOKEN` | Integração Notion |
| `NOTION_API_URL` | Base da API Notion |
| `NOTION_DATABASE_PAGE_ID` | Página-mãe das rotas clínicas `/*` (fallback se o header de tenant não vier) |

Rotas `/*` aceitam `x-base-de-dados-id` (tenant/clínica). Rotas `/estoque/*` usam a tabela Notion `gestao > estoque` (`3db4614457698097ba8ef1c82e5ddee9`) quando o domínio vem em `?dominio=`, `x-estoque-dominio` ou Host `estoque.*`. Sem domínio → 400. Domínio não cadastrado → 404. Sem fallback de env.

---

## Rotas clínicas (`/*`)

Paths e contratos iguais aos de produção. Tenant: `x-base-de-dados-id`.

| Método | Path | Ação |
|---|---|---|
| GET | `/tabelas` | Lista tabelas inline da página-mãe |
| GET | `/pacientes` | Lista pacientes |
| GET | `/paciente` | Busca por `cpf_or_name` |
| POST | `/patients_exists` | Quais `id_unico` de pacientes já existem |
| POST | `/adicionarPaciente` | Cria paciente (201) |
| PATCH | `/atualizarPacientes` | Atualiza pacientes |
| GET | `/medicos` | Lista médicos |
| POST | `/doctors_exists` | Quais `id_unico` de médicos já existem |
| POST | `/adicionarMedico` | Cria médico (201) |
| POST | `/adicionarMedicos` | Cria vários (201) |
| PATCH | `/atualizarMedicos` | Atualiza médicos |
| GET | `/agendamentos` | Lista por `start_date` e `end_date` |
| GET | `/agendamento` | Por `id_paciente` (e período) |
| GET | `/agendamentoPorId` | Por `id_unico` |
| POST | `/adicionarAgendamento` | Cria (201) |
| POST | `/adicionarAgendamentos` | Cria vários (201) |
| PATCH | `/atualizarAgendamentos` | Atualiza |
| PATCH | `/atualizarStatusAgendamento` | Atualiza `status` |
| GET | `/agendas` | Lista agendas |
| POST | `/adicionarAgenda` | Cria agenda (201) |
| PATCH | `/atualizarAgendas` | Atualiza agendas |
| POST | `/reverterSincronizacao` | Reverte sincronização |
| GET | `/buscarTableCron` | Jobs de confirmação (todas as páginas Notion; uma linha com erro é ignorada). Cada linha: `name`, `clinica`, `integracao`, `chave_segura`, `botconversa_msg_url`, `cron` (expressão), `tipo_antecedencia`, `antecedencia`, `tipo_dia`, `unidades`, `medicos` e `pacientes` (texto com ids separados por vírgula), `ativo`. `pacientes` vazio ou ausente no Notion retorna `""` e representa todos os pacientes elegíveis. Sem `metadata` / `cron_rule`. Leitura sem cache para refletir alterações na recarga. |
| GET | `/buscarTableCronConsultasFinalizadas` | Configuração global de consultas finalizadas; leitura paginada sem cache. Retorna registros ativos e inativos. |
| GET | `/clinicas` | Lista clínicas |
| GET | `/clinica` | Por `id` |
| GET | `/clinicaPorDominio` | Por `dominio` (tabela Notion `dominios_confirmacao`, id `3dc461445769809785f3c86883371f58`). `dados`: `{ dominio, clinica: { id, nome, base_de_dados_id } }`. 400 se `dominio` vazio; 404 se não houver linha |
| GET | `/integracaoClinica` | Por `clinicaId` / `clinica_id` (opcional `integracao` = nome). Cada linha Notion é um objeto completo; não mistura campos entre linhas nem quando o nome da integração é o mesmo. 1 linha → objeto; 2+ → array. Headers de tenant: `X-Base-De-Dados-Id` ou `X-Clinica-Id`. |
| GET | `/estoquePorDominio` | Por `dominio` (tabela Notion `gestao > estoque`, id `3db4614457698097ba8ef1c82e5ddee9`). `dados`: `{ dominio, clinica, estoque_database_page_id, medicos_database_id, pacientes_database_id }` |

---

## `GET /buscarTableCronConsultasFinalizadas`

Sem parâmetros obrigatórios ou headers de tenant. Exige o Bearer existente.
Consulta diretamente a tabela global `3df46144576980f6b498cd7a75b7bbb7`, sem
cache, usando as credenciais Notion do ambiente. Pagina em lotes de 100.

**Resposta 200:**

```json
{
  "sucesso": true,
  "dados": [{
    "id": "<UUID da página do cron>",
    "nome": "Consultas finalizadas",
    "clinicaId": "<UUID da clínica relacionada>",
    "cron": "30 14 * * *",
    "ativo": true,
    "unidades": "10, 20",
    "webhookurl": "https://example.invalid/webhook"
  }]
}
```

Colunas Notion: `nome` (title; também aceita `Nome`), `clinica` (relação com uma
única clínica), `cron` (rich text), `ativo` (checkbox), `unidades` (rich text
com IDs separados por vírgulas) e `webhookurl` (URL ou rich text).

Somente checkbox booleano `true` mapeia para `ativo: true`. Registros inativos
são retornados; páginas arquivadas ou na lixeira são excluídas. Campos ausentes
ficam vazios, e clínica ausente, múltipla ou com relação incompleta retorna
`clinicaId: ""` para validação no super-app. O ID da clínica não é o ID de sua
base de pacientes. Uma tabela vazia responde `dados: []`.

Falha do Notion, resposta malformada ou paginação sem cursor válido retorna
**500**, com `{ "sucesso": false, "erro": "Erro ao buscar cron de consultas finalizadas" }`.
Nenhuma lista parcial é devolvida. A rota apenas lê configuração; não cria
jobs, busca consultas ou dispara webhooks.

O ID foi corrigido com base no link de consultas finalizadas fornecido pelo usuário.
Agendas médicas mantém `3e8461445769803f952efb86c3403bec`. O parâmetro `v` identifica
a visualização e não é usado como ID da tabela. Nenhuma chamada ao Notion foi feita.

---

## Rotas de estoque (`/estoque/*`)

Identificador de todo recurso: **UUID da page Notion**. Relations no JSON usam o mesmo UUID.

### Recursos

| URL | Tabela Notion |
|---|---|
| `/estoque/tipos-procedimentos` | `tipos_procedimentos` |
| `/estoque/materiais` | `materiais` |
| `/estoque/fornecedores` | `fornecedores` |
| `/estoque/compras` | `compras` |
| `/estoque/itens-compra` | `itens_compra` |
| `/estoque/kits` | `kits` |
| `/estoque/kits-materiais` | `kits_materiais` |
| `/estoque/medicos` | `medicos` |
| `/estoque/pacientes` | `pacientes` |
| `/estoque/registros` | `registros` |
| `/estoque/kits-registro` | `kits_registro` |
| `/estoque/materiais-registro` | `materiais_registro` |
| `/estoque/estoque` | `estoque` (saldo) |

O slug final `/estoque` é a tabela de saldo; o prefixo `/estoque` é o módulo.

### CRUD padrão (recurso `R`)

| Método | Caminho | Status |
|---|---|---|
| GET | `/estoque/R` | 200 lista. Query: `id`, `codigo` / `cpf` / `id_unico` (equals), `ativo` (equals), relations (`contains`; vários IDs separados por vírgula viram `OR`), textos (contains), `q` (contains em title/rich_text com `OR`), `data_hora_de` / `data_hora_ate` (intervalo no campo date), `limit` (1–100) e `page` (≥ 1). Sem `limit`, percorre todas as páginas Notion. Com `limit`, o envelope inclui `paginacao: { page, limit, has_more }`. |
| GET | `/estoque/R/:id` | 200 ou 404 |
| POST | `/estoque/R` | 201 |
| PATCH | `/estoque/R/:id` | 200 parcial. Sem DELETE. |

Validação POST: `nome` obrigatório só quando é Title de negócio; relations obrigatórias; `quantidade` inteiro ≥ 0; `data_hora` ISO 8601; `ativo` boolean (default `true` na criação).

Campos por tabela: ver plano / interfaces `Estoque*` em `src/utils/interfaces.ts`.

`medicos` e `pacientes` **não** são descobertos nos filhos da página de estoque (linked view / `Untitled` não é um `child_database` consultável). O CRUD usa `medicos_database_id` e `pacientes_database_id` da linha em `gestao > estoque`. Pacientes expõe `nome`, `cpf`, `id_unico` e `telefone` (property Notion `phone_number`). Query `?cpf=` e `?id_unico=` usam `equals`.

### Ativar / desativar

Só em tabelas com `ativo` (hoje: `fornecedores`).

| Método | Caminho |
|---|---|
| POST | `/estoque/{R}/:id/ativar` |
| POST | `/estoque/{R}/:id/desativar` |

404 se o registro não existir.

### Compras (entrada de saldo)

`POST /estoque/compras` aceita itens aninhados. O saldo **sobe** em cada item, não no cabeçalho.

```json
{
  "data_hora": "2026-09-03T10:00:00",
  "obs": "",
  "itens": [
    { "material": "<uuid>", "fornecedor": "<uuid>", "quantidade": 10 }
  ]
}
```

- Sem `itens` (ou array vazio): só cria a compra; não mexe em saldo.
- `POST /estoque/itens-compra` avulso também incrementa saldo.
- `PATCH` em `itens-compra` que altere `quantidade` aplica o delta. Delta negativo que deixe saldo < 0 → 400, sem gravar.

Só responde **201** se entidades **e** saldo tiverem sido gravados.

### Registros (saída / baixa)

`POST /estoque/registros`:

```json
{
  "data_hora": "2026-09-03T11:00:00",
  "tipo_procedimento": "<uuid>",
  "paciente": "<uuid>",
  "medico": "<uuid>",
  "quantidade": 1,
  "obs": "",
  "kits": [{ "kit": "<uuid>", "quantidade": 1 }],
  "materiais": [{ "material": "<uuid>", "quantidade": 2 }]
}
```

```
consumo[material] = soma(materiais[].quantidade)
  + soma(kits[].quantidade * kits_materiais(kit, material).quantidade)
```

`registros.quantidade` **não** multiplica o BOM.

Se algum saldo < consumo → **400** com a lista de faltas; não cria registro. `POST /kits-registro` e `POST /materiais-registro` avulsos seguem a mesma baixa. PATCH de `quantidade` nessas linhas aplica delta.

### Tabela `/estoque/estoque`

CRUD direto do saldo (ajuste manual). Caminho normal: compra (entrada) e registro (saída). Uma linha por `material`.

### Saga (retry + compensação)

O Notion não tem transação. Operações compostas:

1. Validar (incluindo saldo na saída) antes de gravar.
2. Gravar entidades.
3. Aplicar saldo com até **3** tentativas (só rede / 5xx / 429).
4. Se ainda falhar: desfazer saldo e **arquivar** páginas criadas (`arquivarPagina`).
5. Compensação ok → **500** (estado consistente; o cliente pode repetir o POST). Compensação falha → **500** com `compensacao_pendente`.

Não há 201 se a compra ficou gravada e o saldo não.
