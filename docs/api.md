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
| `NOTION_SALUS_DATABASE_PAGE_ID` | Página-mãe das rotas `/salus/estoque/*` |
| `NOTION_SALUS_MEDICOS_DATABASE_ID` | Database-id da tabela-fonte `medicos` (linked view na página Salus não é consultável pela API) |
| `NOTION_SALUS_PACIENTES_DATABASE_ID` | Database-id da tabela-fonte `pacientes` |

Rotas `/*` aceitam `x-base-de-dados-id` (tenant/clínica). Rotas `/salus/estoque/*` **ignoram** esse header e usam sempre `NOTION_SALUS_DATABASE_PAGE_ID`.

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
| GET | `/buscarTableCron` | Tabelas de cron |
| GET | `/clinicas` | Lista clínicas |
| GET | `/clinica` | Por `id` |
| GET | `/integracaoClinica` | Por `clinicaId` |

---

## Rotas Salus estoque (`/salus/estoque/*`)

Identificador de todo recurso: **UUID da page Notion**. Relations no JSON usam o mesmo UUID.

### Recursos

| URL | Tabela Notion |
|---|---|
| `/salus/estoque/tipos-procedimentos` | `tipos_procedimentos` |
| `/salus/estoque/materiais` | `materiais` |
| `/salus/estoque/fornecedores` | `fornecedores` |
| `/salus/estoque/compras` | `compras` |
| `/salus/estoque/itens-compra` | `itens_compra` |
| `/salus/estoque/kits` | `kits` |
| `/salus/estoque/kits-materiais` | `kits_materiais` |
| `/salus/estoque/medicos` | `medicos` |
| `/salus/estoque/pacientes` | `pacientes` |
| `/salus/estoque/registros` | `registros` |
| `/salus/estoque/kits-registro` | `kits_registro` |
| `/salus/estoque/materiais-registro` | `materiais_registro` |
| `/salus/estoque/estoque` | `estoque` (saldo) |

O slug final `/estoque` é a tabela de saldo; o prefixo `/salus/estoque` é o módulo.

### CRUD padrão (recurso `R`)

| Método | Caminho | Status |
|---|---|---|
| GET | `/salus/estoque/R` | 200 lista. Query: `id`, `codigo` (equals), `ativo` (equals), relations (`contains`; vários IDs separados por vírgula viram `OR`), textos (contains), `q` (contains em title/rich_text com `OR`), `data_hora_de` / `data_hora_ate` (intervalo no campo date), `limit` (1–100) e `page` (≥ 1). Sem `limit`, percorre todas as páginas Notion. Com `limit`, o envelope inclui `paginacao: { page, limit, has_more }`. |
| GET | `/salus/estoque/R/:id` | 200 ou 404 |
| POST | `/salus/estoque/R` | 201 |
| PATCH | `/salus/estoque/R/:id` | 200 parcial. Sem DELETE. |

Validação POST: `nome` obrigatório só quando é Title de negócio; relations obrigatórias; `quantidade` inteiro ≥ 0; `data_hora` ISO 8601; `ativo` boolean (default `true` na criação).

Campos por tabela: ver plano / interfaces `SalusEstoque*` em `src/utils/interfaces.ts`.

`medicos` e `pacientes` **não** são descobertos nos filhos da página Salus (linked view / `Untitled` não é um `child_database` consultável). O CRUD usa o `database_id` da tabela-fonte (`NOTION_SALUS_MEDICOS_DATABASE_ID` / `NOTION_SALUS_PACIENTES_DATABASE_ID`). Pacientes expõe `telefone` (property Notion `phone_number`).

### Ativar / desativar

Só em tabelas com `ativo` (hoje: `fornecedores`).

| Método | Caminho |
|---|---|
| POST | `/salus/estoque/{R}/:id/ativar` |
| POST | `/salus/estoque/{R}/:id/desativar` |

404 se o registro não existir.

### Compras (entrada de saldo)

`POST /salus/estoque/compras` aceita itens aninhados. O saldo **sobe** em cada item, não no cabeçalho.

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
- `POST /salus/estoque/itens-compra` avulso também incrementa saldo.
- `PATCH` em `itens-compra` que altere `quantidade` aplica o delta. Delta negativo que deixe saldo < 0 → 400, sem gravar.

Só responde **201** se entidades **e** saldo tiverem sido gravados.

### Registros (saída / baixa)

`POST /salus/estoque/registros`:

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

### Tabela `/salus/estoque/estoque`

CRUD direto do saldo (ajuste manual). Caminho normal: compra (entrada) e registro (saída). Uma linha por `material`.

### Saga (retry + compensação)

O Notion não tem transação. Operações compostas:

1. Validar (incluindo saldo na saída) antes de gravar.
2. Gravar entidades.
3. Aplicar saldo com até **3** tentativas (só rede / 5xx / 429).
4. Se ainda falhar: desfazer saldo e **arquivar** páginas criadas (`arquivarPagina`).
5. Compensação ok → **500** (estado consistente; o cliente pode repetir o POST). Compensação falha → **500** com `compensacao_pendente`.

Não há 201 se a compra ficou gravada e o saldo não.
