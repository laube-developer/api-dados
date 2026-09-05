# Plano 001 — Rotas de API do Controle de Estoque Salus

**Arquivo de persistência (única entrega desta etapa):** `plans/plan_001_estoque_salus.md`

**Escopo desta aprovação:** gravar este plano no caminho acima. **Não implementar código, não criar rotas, não alterar `.env.local` e não executar comandos nesta etapa.** A implementação descrita abaixo fica para um passo futuro, depois que o plano estiver salvo e for explicitamente autorizado.

**Revisão desta versão:** (1) extrair as rotas de produção `/*` para um router próprio, montado no `index` com `app.use`, sem mudar contrato nem tenant; (2) módulo `salus/estoque` em pasta separada; (3) operações compostas (compra/registro + saldo) com retry e compensação, porque o Notion não tem transação.

---

## 1. Objetivo

Dois movimentos na mesma entrega futura, nesta ordem:

1. **Extrair as rotas de produção** hoje em `src/index.ts` para um arquivo/pasta de rotas. URLs, métodos, bodies, status e o isolamento por tenant (`x-base-de-dados-id`) permanecem iguais. `src/index.ts` só faz bootstrap e `app.use(...)`.
2. **Criar o namespace `/salus/estoque/*`** para o app de gestão de estoque da clínica Salus, em pasta separada, lendo/escrevendo as tabelas da página Notion de estoque.

Autenticação: o mesmo `AUTH_TOKEN` já usado por `bearerAuth` (`Authorization: Bearer …`). Sem login de usuário/senha neste projeto.

### Dentro do escopo

- Mover as rotas clínicas/totem atuais para `src/routes/dados/` **sem alterar comportamento**
- CRUD (Listar, Buscar, Adicionar, Alterar) das tabelas de estoque — **sem excluir na API pública**
- Ativar / desativar nas tabelas que têm `ativo`
- Tabela `estoque` (saldo por material) e atualização automática de saldo em compras e registros
- Retry + compensação quando uma operação composta gravar só uma parte (ex.: criou a compra e falhou o saldo)
- Documentação de contratos em `docs/api.md`
- Testes automatizados da camada Salus/estoque (incluindo compensação)

### Fora do escopo

- App de interface
- Autenticação de usuário e senha da UI
- **Agendamentos** no namespace Salus (não entram neste namespace nem neste plano)
- Mudança de contrato das rotas atuais (`/pacientes`, `/medicos`, `/agendamentos`, …) — só mudam de arquivo
- Refatorar `src/database/pacientes|medicos|agendamentos|…` — a extração HTTP não mexe nessa camada
- `DELETE` público / arquivar como operação de API
- Relatórios além do saldo na tabela `estoque`

Arquivar página Notion **é permitido internamente** só como compensação de falha (reuso de `arquivarPagina` em `src/database/notionHelpers.ts`). Isso não vira rota.

---

## 2. Fonte do modelo e correções em relação ao `.drawio`

Arquivo no repositório: `tmp/Controle Estoque Salus v1.drawio` (há cópia também em `plans/`).

Na leitura desta revisão, o arquivo em disco **ainda contém os nomes antigos** (`id_material`, `id_kit`, `id_quantidade`, sem tabela `estoque` e sem `quantidade` em `itens_compra`). O plano **não copia esses nomes**. Vale o que está no Notion e o que você descreveu:

1. Colunas que no diagrama aparecem como `id_*` são **relations** no Notion. O nome da propriedade é o alvo, sem prefixo `id_`: `material`, `kit`, `compra`, `fornecedor`, `tipo_procedimento`, `paciente`, `medico`, `registro`.
2. `kits_materiais`: campo de quantidade chama-se `quantidade` (não `id_quantidade`).
3. `itens_compra` inclui **`quantidade`**.
4. Nova tabela **`estoque`**: `material`, `quantidade`, `nome`.
5. `medicos` e `pacientes` são **linked views** na página de estoque. A API trata como tabelas locais desse namespace (`/salus/estoque/medicos`, `/salus/estoque/pacientes`), sem chamar as rotas clínicas e sem lógica extra de “integração”. O Notion já resolve o vínculo.
6. Agendamentos não fazem parte desta base / deste escopo.

Se o `.drawio` for atualizado depois, a implementação deve conferir os rótulos finais com esta tabela canônica.

---

## 3. Tabelas canônicas (API ↔ Notion)

Identificador de todo recurso na API (`id` no JSON e nas URLs): **ID da page Notion (UUID)**. Relations no JSON também usam o UUID da page relacionada. Isso casa com o formato nativo da API Notion (`relation: [{ id }]`) e evita `id` inteiro paralelo.

`nome` na API:

- **Obrigatório** quando `nome` é a propriedade Title de negócio (primeira coluna útil da tabela).
- **Não obrigatório** quando `nome` existe só porque o Notion exige Title e está no fim da tabela. Nesse caso o backend preenche o Title sozinho (nome do material relacionado, ou o próprio UUID).

| Tabela Notion | Campos da API | Title Notion | `nome` obrigatório? | `ativo` |
|---|---|---|---|---|
| `tipos_procedimentos` | `id`, `nome` | `nome` | sim | não |
| `materiais` | `id`, `nome`, `codigo` | `nome` | sim | não |
| `fornecedores` | `id`, `nome`, `contato`, `whatsapp`, `email`, `obs`, `ativo` | `nome` | sim | **sim** |
| `compras` | `id`, `data_hora`, `obs` | `nome` dummy (preenchido pelo backend) | não | não |
| `itens_compra` | `id`, `compra`, `material`, `fornecedor`, `quantidade` | `nome` dummy | não | não |
| `kits` | `id`, `nome`, `tipo_procedimento` | `nome` | sim | não |
| `kits_materiais` | `id`, `material`, `kit`, `quantidade` | `nome` dummy | não | não |
| `medicos` | `id`, `nome`, `especialidade` | `nome` | sim | não |
| `pacientes` | `id`, `nome`, `contato` | `nome` | sim | não |
| `registros` | `id`, `data_hora`, `tipo_procedimento`, `paciente`, `medico`, `quantidade`, `obs` | `nome` dummy | não | não |
| `kits_registro` | `id`, `registro`, `kit`, `quantidade` | `nome` dummy | não | não |
| `materiais_registro` | `id`, `registro`, `material`, `quantidade` | `nome` dummy | não | não |
| `estoque` | `id`, `material`, `quantidade`, `nome` | `nome` (última coluna, dummy) | **não** | não |

Tipos Notion:

| Campo | Tipo Notion | Leitura | Escrita |
|---|---|---|---|
| `nome` (Title) | `title` | `props.nome?.title?.[0]?.text?.content` | `{ title: [{ text: { content } }] }` |
| textos (`codigo`, `contato`, `whatsapp`, `obs`, `especialidade`, `contato`) | `rich_text` | `props.X?.rich_text?.[0]?.text?.content` | `{ rich_text: [{ text: { content } }] }` |
| `email` | `email` | `props.email?.email` | `{ email }` |
| `quantidade` | `number` | `props.quantidade?.number` | `{ number }` |
| `ativo` | `checkbox` | `props.ativo?.checkbox` | `{ checkbox }` |
| `data_hora` | `date` | `props.data_hora?.date?.start` | `{ date: { start: iso } }` |
| relations (`material`, `kit`, `compra`, …) | `relation` | `props.X?.relation?.[0]?.id` | `{ relation: [{ id: pageId }] }` |

Sem `@notionhq/client`. Só `fetch` via `chamarNotionAPI`.

---

## 4. Página Notion e ambiente

Nova variável:

```
NOTION_SALUS_DATABASE_PAGE_ID=
```

Reuso: `AUTH_TOKEN`, `NOTION_API_TOKEN`, `NOTION_API_URL`.

Dois modos de página-mãe:

| Rotas | Página Notion | Como escolhe |
|---|---|---|
| `/*` (produção atual) | tenant/clínica | header `x-base-de-dados-id` via `runWithBaseDeDadosId`; se ausente, `NOTION_DATABASE_PAGE_ID` |
| `/salus/estoque/*` | página de estoque Salus | **sempre** `runWithBaseDeDadosId(NOTION_SALUS_DATABASE_PAGE_ID)`, **ignora** `x-base-de-dados-id` |

O middleware de tenant continua global no `index` (comportamento atual). O router de estoque **reentra** no ALS com o page id Salus, então um header de clínica não vaza para as tabelas de estoque.

`buscarTabelasBanco()` descobre as inline databases **e** linked views da página pelo `child_database.title` (já normalizado em minúsculas). `medicos` e `pacientes` precisam aparecer com esses nomes nessa página.

---

## 5. Arquitetura

Hoje todas as rotas HTTP vivem em `src/index.ts` e o acesso Notion das clínicas em `src/database/{pacientes,medicos,…}`. O plano **não mistura** as duas bases: rotas de produção e rotas Salus ficam em pastas irmãs sob `src/routes/`. A camada `database` clínica **não é movida**.

```
src/
  index.ts                              # json, auth, tenant, app.use, error handler, listen
  routes/
    dados/
      index.ts                          # router das rotas de produção /* (move 1:1 de index.ts)
    salus/
      estoque/
        index.ts                        # page id Salus + registro dos recursos
        criarRotasRecurso.ts            # GET lista, GET :id, POST, PATCH
        ativo.ts                        # POST :id/ativar e :id/desativar
        compras.ts                      # POST compras com itens + efeito no saldo
        registros.ts                    # POST registro com kits/materiais + baixa
  database/
    pacientes/ | medicos/ | …           # inalterado (rotas de dados continuam importando daqui)
    notion.ts / notionHelpers.ts        # reuso (inclui arquivarPagina)
    salus/
      estoque/
        schema.ts                       # metadados das 13 tabelas
        crud.ts                         # listar / buscarPorId / adicionar / alterar
        mapear.ts                       # properties Notion ↔ JSON
        saldo.ts                        # incrementa / decrementa tabela estoque
        consumo.ts                      # explosão de kit + soma de materiais do registro
        transacao.ts                    # retry + compensação (arquivar / desfazer saldo)
  utils/
    interfaces.ts                       # interfaces SalusEstoque* (as atuais permanecem)
docs/
  api.md
tests/
  salus/
    estoque/
      mapear.test.ts
      consumo.test.ts
      saldo.test.ts
      rotas.test.ts
      ativo.test.ts
      transacao.test.ts
plans/
  plan_001_estoque_salus.md
```

### 5.1 `src/index.ts` depois da extração

Só bootstrap. Nenhuma handler de negócio.

```ts
app.use(express.json());
app.use(bearerAuth);
app.use(middlewareTenant);              # x-base-de-dados-id → runWithBaseDeDadosId (já existe)
app.use(rotasDados);                    # /* produção, SEM prefixo
app.use("/salus/estoque", estoqueRouter);
app.use(errorHandler);                  # o handler 4-args que já existe
app.listen(port);
```

### 5.2 Rotas de produção — `src/routes/dados/index.ts`

Mover **literalmente** os handlers atuais. Sem REST-ificar, sem mudar path, sem mudar status.

Rotas que saem de `index.ts` e entram nesse router:

| Método | Path |
|---|---|
| GET | `/tabelas` |
| GET | `/pacientes` |
| GET | `/paciente` |
| POST | `/patients_exists` |
| POST | `/doctors_exists` |
| POST | `/adicionarPaciente` |
| PATCH | `/atualizarPacientes` |
| GET | `/agendamentoPorId` |
| GET | `/agendamentos` |
| GET | `/agendamento` |
| PATCH | `/atualizarStatusAgendamento` |
| POST | `/adicionarAgendamentos` |
| POST | `/adicionarAgendamento` |
| PATCH | `/atualizarAgendamentos` |
| POST | `/adicionarMedico` |
| POST | `/adicionarMedicos` |
| PATCH | `/atualizarMedicos` |
| GET | `/medicos` |
| POST | `/adicionarAgenda` |
| GET | `/agendas` |
| PATCH | `/atualizarAgendas` |
| POST | `/reverterSincronizacao` |
| GET | `/buscarTableCron` |
| GET | `/clinicas` |
| GET | `/clinica` |
| GET | `/integracaoClinica` |

Critério de pronto dessa extração: o cliente de produção continua batendo nos mesmos paths. Tenant continua sendo o header `x-base-de-dados-id`.

Um arquivo só (`dados/index.ts`) nesta etapa. Não fatiar por recurso agora — o objetivo é tirar o HTTP do `index.ts` sem risco.

### 5.3 Módulo Salus — `src/routes/salus/estoque` + `src/database/salus/estoque`

Duas pastas do **mesmo domínio**, camadas diferentes:

| Pasta | Papel |
|---|---|
| `routes/salus/estoque` | HTTP: URL, status, body |
| `database/salus/estoque` | Notion: properties, CRUD, saldo, saga |

CRUD genérico dirigido por `schema.ts`. Compras, registros, saldo e transação têm módulos próprios porque têm efeito colateral e compensação.

`salus` no path antecipa outros módulos do produto (não misturar com `/pacientes` clínico). `estoque` é o módulo. A tabela de saldo fica em `/salus/estoque/estoque` de propósito, para não colidir com o prefixo.

---

## 6. Contrato HTTP — `/salus/estoque`

Envelope padrão (`responderSucesso` / `responderErro`).

| Status | Quando |
|---|---|
| 200 | Listar, buscar, alterar, ativar/desativar |
| 201 | Adicionar (operação composta **completa**: entidades + saldo) |
| 400 | Validação, saldo insuficiente, quantidade inválida |
| 401/403 | Token ausente ou ≠ `AUTH_TOKEN` |
| 404 | Recurso ou registro não encontrado |
| 500 | Falha Notion / erro interno / falha depois de retry e compensação |

Header: `Authorization: Bearer <AUTH_TOKEN>`

### 6.1 Recursos

| URL | Tabela |
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

Slug `estoque` no final evita ambiguidade com o prefixo `/salus/estoque`.

### 6.2 CRUD padrão (todo recurso `R`)

| Método | Caminho | Ação |
|---|---|---|
| `GET` | `/salus/estoque/R` | Listar (paginação interna Notion). Query params: `equals` em relations, `id`, `codigo`, `ativo`; `contains` em textos. |
| `GET` | `/salus/estoque/R/:id` | Buscar pelo UUID da page. 404 se não existir. |
| `POST` | `/salus/estoque/R` | Adicionar. 201. |
| `PATCH` | `/salus/estoque/R/:id` | Alteração parcial. Sem DELETE. |

### 6.3 Ativar / desativar

Só nas tabelas cujo schema tem `ativo` (hoje: **`fornecedores`**; o registro das rotas é dirigido pelo schema, então qualquer tabela futura com `ativo` ganha o mesmo par).

| Método | Caminho | Efeito |
|---|---|---|
| `POST` | `/salus/estoque/{R}/:id/ativar` | `ativo = true` |
| `POST` | `/salus/estoque/{R}/:id/desativar` | `ativo = false` |

Resposta: o registro atualizado. 404 se não existir. Equivale a um PATCH só do checkbox, com intenção explícita para a UI.

POST de criação nessas tabelas: `ativo` default `true` se omitido.

---

## 7. Regras de saldo (tabela `estoque`)

Uma linha de `estoque` por `material` (relation). `quantidade` é o saldo atual. `nome` é Title dummy — o backend copia o `nome` do material quando cria a linha.

O Notion **não** oferece transação entre páginas. Toda operação que grava entidade **e** saldo segue a saga da seção 7.4.

### 7.1 Entrada — compras

Saldo sobe quando entra quantidade de material, não quando se cria só o cabeçalho da compra.

1. **`POST /salus/estoque/compras`** aceita itens aninhados:

```json
{
  "data_hora": "2026-09-03T10:00:00",
  "obs": "",
  "itens": [
    { "material": "<uuid>", "fornecedor": "<uuid>", "quantidade": 10 }
  ]
}
```

Cria a compra, cria cada `itens_compra` e, para cada item, **soma** `quantidade` no saldo daquele `material` (cria a linha de `estoque` se não existir). Só responde **201** se entidades **e** saldo tiverem sido gravados.

2. **`POST /salus/estoque/itens-compra`** (item avulso numa compra já existente) também incrementa o saldo.

3. **`PATCH` em `itens_compra` que altere `quantidade`:** aplica o delta (`novo - antigo`) no saldo. Delta negativo que deixe saldo < 0 → 400, sem gravar o PATCH.

### 7.2 Saída — registros

Ao criar um registro de consumo, a API calcula os materiais e dá baixa.

**`POST /salus/estoque/registros`** aceita kits e/ou materiais:

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

Cálculo de consumo por material:

```
consumo[material] =
  soma(materiais[].quantidade)
  + soma( kits[].quantidade * kits_materiais(kit, material).quantidade )
```

`registros.quantidade` é campo do atendimento; **não** multiplica o BOM. Quem define o consumo são as linhas de `kits` e `materiais`.

Fluxo:

1. Explodir kits via `kits_materiais` e somar materiais avulsos.
2. Ler saldo de cada material envolvido.
3. Se algum saldo < consumo → **400** com a lista de faltas; **não cria** registro nem linhas filhas.
4. Criar `registros`, `kits_registro`, `materiais_registro`.
5. Decrementar `estoque.quantidade` de cada material.
6. Só responde **201** se 4 e 5 tiverem sucesso (com retry/compensação da 7.4 se algo falhar no meio).

O mesmo cálculo de baixa vale para **`POST /salus/estoque/kits-registro`** e **`POST /salus/estoque/materiais-registro`** avulsos (consumo extra num registro já criado). PATCH de `quantidade` nessas linhas aplica delta (com a mesma regra de saldo insuficiente).

### 7.3 CRUD direto em `/salus/estoque/estoque`

Listar/buscar/alterar saldo (ajuste manual). POST avulso permitido para correção. Não é o caminho normal: o caminho normal é compra (entrada) e registro (saída). Sem saga — é uma única página.

### 7.4 Consistência — retry e depois compensar

Não existe `BEGIN/COMMIT` no Notion. A API trata cada operação composta como saga:

1. Validar o que der **antes** de gravar (body, relations obrigatórias, quantidade ≥ 0, saldo suficiente na saída). Falha aqui → 400/404, zero writes.
2. Gravar entidades e ir acumulando os `pageId` criados (e, se o saldo já tiver sido alterado, o delta aplicado por material).
3. Aplicar efeito no saldo com **retry**.
4. Se o saldo (ou um passo seguinte) falhar depois dos retries → **compensar** o que já foi gravado.
5. Se a compensação também falhar → 500 com os ids órfãos, para correção manual. Logar o erro completo.

#### Retry

- Até **3 tentativas** no passo que falhou (saldo ou a própria compensação).
- Só em falha transitória: rede, timeout, HTTP 5xx do Notion.
- **Não** retentar 4xx (validação, página não encontrada, property inexistente).
- Sem dependência nova: loop + `setTimeout` curto (ex.: 200 ms, 400 ms).

#### Compensação (reuso de `arquivarPagina`)

A API pública continua sem DELETE. Por baixo, `PATCH pages/{id}` com `{ archived: true }`.

| Operação | Se falhar depois de… | Retry primeiro | Se o retry não resolver |
|---|---|---|---|
| `POST /compras` com `itens` | criou `compras` e/ou `itens_compra`, falhou o incremento de saldo | incrementa o saldo de novo | reverte incrementos já aplicados; arquiva itens criados; arquiva a compra |
| `POST /itens-compra` avulso | criou o item, falhou o incremento | incrementa de novo | reverte incremento se chegou a aplicar; arquiva o item |
| `PATCH /itens-compra/:id` (delta de `quantidade`) | aplicou saldo, falhou o PATCH da linha **ou** o inverso | retenta o passo que falhou | desfaz o saldo (delta invertido) e/ou restaura a quantidade antiga da linha |
| `POST /registros` com kits/materiais | criou registro/filhos, falhou a baixa | baixa de novo | reverte baixas já aplicadas; arquiva `kits_registro` / `materiais_registro`; arquiva o registro |
| `POST /kits-registro` ou `/materiais-registro` avulso | criou a linha, falhou a baixa | baixa de novo | reverte baixa; arquiva a linha |
| `PATCH` de `quantidade` em linha de consumo | idem delta | retenta o passo | inverte saldo e/ou restaura quantidade antiga |

Ordem da compensação: **desfazer saldo primeiro** (o número precisa voltar), **depois arquivar** filhos, **depois arquivar** o cabeçalho. Assim não fica compra visível com saldo errado.

Compra criada **sem** `itens` (só cabeçalho) não mexe em saldo — se o POST do cabeçalho falhar, não há o que compensar.

#### Resposta HTTP depois da saga

| Desfecho | Status | Corpo |
|---|---|---|
| Tudo gravou (saldo ok no 1º try ou no retry) | 201 / 200 | recurso criado/atualizado, como nas outras rotas |
| Validação / saldo insuficiente **antes** de gravar | 400 | mensagem; nada persistido |
| Falhou no meio, retry do saldo **funcionou** | 201 / 200 | igual ao sucesso normal |
| Falhou no meio, compensação **funcionou** (ex.: compra arquivada, saldo restaurado) | **500** | operação não concluída; estado consistente (como se o POST não tivesse ocorrido). Cliente pode repetir o POST. |
| Falhou no meio **e** a compensação falhou | **500** | `compensacao_pendente: true` + lista `{ tabela, id }` das páginas criadas/deltas de saldo não desfeitos. Log obrigatório. |

Não devolver 201 se a compra ficou gravada mas o saldo não. Isso era o buraco desta revisão.

#### Módulo `database/salus/estoque/transacao.ts`

API interna (não é rota):

- `comRetry(fn)` — 3 tentativas em erro transitório
- `executarComCompensacao({ executar, compensar })` — roda `executar`; se lançar, chama `compensar` (também com retry) e relança
- `compensarPaginas(ids)` — `arquivarPagina` em cada id (ordem reversa da criação)

`compras.ts` / `registros.ts` / efeito colateral de POST/PATCH avulso de itens de consumo **obrigam** passar por aqui. CRUD simples de uma tabela (materiais, kits, …) não precisa.

---

## 8. Interfaces (`src/utils/interfaces.ts`)

Prefixo `SalusEstoque` para não colidir com `Paciente` / `Medico` clínicos.

```ts
export interface SalusEstoqueTipoProcedimento { id: string; nome: string; }
export interface SalusEstoqueMaterial { id: string; nome: string; codigo: string; }
export interface SalusEstoqueFornecedor {
  id: string; nome: string; contato: string; whatsapp: string;
  email: string; obs: string; ativo: boolean;
}
export interface SalusEstoqueCompra { id: string; data_hora: string; obs: string; }
export interface SalusEstoqueItemCompra {
  id: string; compra: string; material: string; fornecedor: string; quantidade: number;
}
export interface SalusEstoqueKit { id: string; nome: string; tipo_procedimento: string; }
export interface SalusEstoqueKitMaterial {
  id: string; kit: string; material: string; quantidade: number;
}
export interface SalusEstoqueMedico { id: string; nome: string; especialidade: string; }
export interface SalusEstoquePaciente { id: string; nome: string; contato: string; }
export interface SalusEstoqueRegistro {
  id: string; data_hora: string; tipo_procedimento: string;
  paciente: string; medico: string; quantidade: number; obs: string;
}
export interface SalusEstoqueKitRegistro {
  id: string; registro: string; kit: string; quantidade: number;
}
export interface SalusEstoqueMaterialRegistro {
  id: string; registro: string; material: string; quantidade: number;
}
export interface SalusEstoqueSaldo {
  id: string; material: string; quantidade: number; nome: string;
}
```

Validação POST:

- `nome` obrigatório só nas tabelas marcadas na seção 3
- Relations obrigatórias nos recursos que as possuem
- `quantidade` inteiro ≥ 0
- `ativo` boolean (default `true` na criação)
- `data_hora` ISO 8601

Não resolver “o UUID existe na tabela alvo” além do que o Notion já recusar. Saldo insuficiente é validação da API.

---

## 9. Documentação

Pasta `docs/` com **`docs/api.md`**: contratos de **todas** as rotas (clínicas atuais + `/salus/estoque/*`).

Seções: autenticação, envelope, env (`NOTION_SALUS_DATABASE_PAGE_ID`), rotas clínicas (paths iguais aos de produção), rotas de estoque (CRUD, ativar/desativar, compras com itens, registros com baixa, tabela `estoque`, saga de retry/compensação), nota de que não há exclusão pública.

`README.md` aponta para `docs/api.md` como contrato canônico.

---

## 10. Testes automatizados

O projeto ainda não tem runner. Incluir neste escopo (a diretriz antiga de “não testar” vale para não bater no Notion real / não subir o servidor na mão; **não** vale para esta suíte, que o usuário pediu).

- Runner: **`node:test`** (Node 24+) executado com `tsx`
- Script: `"test": "tsx --test tests/**/*.test.ts"`
- Sem hit na API Notion: mock de `chamarNotionAPI` / `buscarTabelasBanco` / `arquivarPagina`
- Sem dependência nova obrigatória (evitar Jest/Vitest só para isso)

Casos mínimos:

| Arquivo | O que cobre |
|---|---|
| `mapear.test.ts` | Title/`rich_text`/`[0]`, relation → uuid, checkbox `ativo`, date ISO |
| `consumo.test.ts` | Explosão de kit, soma com materiais avulsos, `registros.quantidade` não multiplica o BOM, vários kits do mesmo material |
| `saldo.test.ts` | Cria linha de estoque na primeira compra; incrementa; decrementa; recusa saldo negativo; delta de PATCH |
| `ativo.test.ts` | Ativar/desativar só em recurso com `ativo`; 404; default `true` no POST |
| `rotas.test.ts` | CRUD de um recurso simples (`materiais`); POST compras com itens chama incremento; POST registro com kit chama baixa; 401 sem token; 400 saldo insuficiente |
| `transacao.test.ts` | Saldo falha 2x e passa na 3ª → 201 e compra **não** arquivada; saldo falha 3x → arquiva compra+itens, reverte saldo, responde 500; compensação também falha → 500 com `compensacao_pendente`; registro com baixa falha → arquiva registro/filhos |

A extração `routes/dados` **não** ganha suíte nova nesta etapa: é move 1:1. Regressão é contrato HTTP idêntico.

---

## 11. Passos de implementação (futuro — não executar agora)

1. Persistir este plano em `plans/plan_001_estoque_salus.md`.
2. Extrair handlers de `src/index.ts` para `src/routes/dados/index.ts` e montar com `app.use(rotasDados)`. Conferir a lista da seção 5.2. **Zero mudança de path/status.**
3. Interfaces em `src/utils/interfaces.ts`.
4. `schema.ts` + `mapear.ts` + `crud.ts`.
5. `saldo.ts` + `consumo.ts` + `transacao.ts`.
6. Router `/salus/estoque` (CRUD genérico, ativar/desativar, compras, registros — todos os compostos via `transacao.ts`).
7. Montar em `src/index.ts`: `app.use("/salus/estoque", estoqueRouter)` com `NOTION_SALUS_DATABASE_PAGE_ID`.
8. `docs/api.md` + link no README.
9. Suíte em `tests/salus/estoque/` e script `npm test`.
10. Na implementação, **rodar `npm test`** (pedido explícito de testes). Não subir o servidor nem chamar Notion real. Avisar o que falta no ambiente: preencher `NOTION_SALUS_DATABASE_PAGE_ID` e conferir nomes das 13 tabelas/views na página.

---

## 12. Riscos

- **Extração das rotas de produção:** move mecânico. Risco é path ou import quebrado. Mitigação: não reescrever handlers; copiar; `app.use` sem prefixo.
- **`.drawio` desatualizado em disco:** a implementação segue a tabela canônica da seção 3. Se uma property no Notion tiver outro rótulo, o schema aponta para o nome real.
- **Linked views `medicos` / `pacientes`:** `blocks/{page}/children` precisa devolvê-las como `child_database` com esses títulos. Se a view não aparecer, a descoberta falha — validar na página. Properties reais podem ser as da base clínica (`id_unico`, `cpf`, …); se isso ocorrer, o mapper dessas duas tabelas é ajustado para as properties de fato, sem misturar com as rotas clínicas.
- **Title dummy:** tabelas sem `nome` de negócio ainda precisam de Title no Notion. Convenção: property `nome` preenchida pelo backend.
- **Sem transação Notion:** a saga (retry → arquivar / reverter saldo) é o substituto. Duas falhas seguidas (saldo **e** archive) deixam órfão — daí o 500 com `compensacao_pendente`.
- **Corrida em saldo:** dois POSTs simultâneos no mesmo material podem sobrescrever quantidade (read-then-write no Notion). Aceitável nesta escala; documentar. A saga não resolve corrida, só falha parcial da mesma request.
- **Uma linha de estoque por material:** se já existirem duplicatas, o código usa a primeira encontrada e não mescla.
- **Arquivar vs excluir:** página arquivada some das queries padrão do Notion, mas continua recuperável no trash. Suficiente para “remover a compra” desta etapa.
