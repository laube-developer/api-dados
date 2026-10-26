# Pendências para futuras alterações

## Rate limit do Notion em exclusões grandes de compras

Registrado em 26/10/2026. Manter a regra de negócio atual; esta pendência não altera seu funcionamento.

### Comportamento atual

Excluir um item de compra transfere seus consumos para os próximos lotes disponíveis do mesmo material. Excluir uma compra aplica essa regra a todos os seus itens, compartilhando a capacidade dos destinos para não reservar as mesmas unidades mais de uma vez. Se faltar capacidade ou o saldo final ficar negativo, a operação é recusada antes de gravar.

As consultas de consumos, lotes e saldos são agrupadas em até 20 relações, com paginação completa. Cada compra de destino distinta é consultada uma vez por operação. Campos sem alteração não são regravados.

As gravações continuam individuais: atualizar consumos transferidos, criar parcelas quando um consumo ocupa vários lotes, arquivar itens, ajustar os saldos afetados e arquivar a compra. Portanto, compras com muitos itens ou consumos ainda podem gerar muitas chamadas ao Notion. Agrupar consultas não elimina esse volume de gravações.

### Problema pendente

O cliente HTTP da `api-dados` ainda não possui controle global de ritmo nem tratamento automático de HTTP 429 respeitando `Retry-After`. O erro observado anteriormente foi `rate_limited`, com motivo `public_api_request_rate_limit` e espera indicada de 16 segundos.

Uma exclusão grande pode atingir esse limite durante as gravações. A operação tenta compensar as alterações em caso de falha, mas a compensação também exige chamadas e pode ser afetada pelo mesmo limite. Se a reversão falhar ou uma criação ficar sem resposta, a API sinaliza `compensacao_pendente` para revisão.

A fila de edição e exclusão de compras é local ao processo e não controla a taxa de chamadas ao Notion. Ela também não coordena outras rotas de estoque, alterações manuais ou múltiplas instâncias. O diário de reversão é mantido em memória e não garante recuperação após interrupção do processo.

### Melhorias a avaliar

- Centralizar o tratamento de 429 no cliente HTTP da `api-dados`: respeitar `Retry-After`, pausar novas chamadas da conexão e repetir a requisição rejeitada com limite de tentativas e espera progressiva quando necessário.
- Controlar o ritmo de leituras, gravações e compensações por conexão do Notion; compartilhar esse controle entre instâncias, por exemplo via Redis.
- Para operações longas, avaliar fila persistente de tarefas, acompanhamento de progresso e recuperação após reinício.
- Não repetir a exclusão inteira automaticamente. Proteger criações e reenvios contra duplicação; reconciliar gravações cujo resultado seja incerto.
- Registrar etapa, endpoint, `request_id`, quantidade de chamadas, tentativas e tempo de espera, sem expor credenciais ou dados sensíveis.

### Validação esperada

Usar testes isolados com Notion simulado para verificar exclusões com muitos itens e consumos, paginação, divisão entre lotes, 429 durante gravação e compensação, reenvios e falhas com resposta perdida. Confirmar preservação das quantidades totais consumidas, dos registros de uso, dos custos proporcionais e do saldo correto.

Referência: [limites oficiais do Notion](https://developers.notion.com/reference/request-limits).
