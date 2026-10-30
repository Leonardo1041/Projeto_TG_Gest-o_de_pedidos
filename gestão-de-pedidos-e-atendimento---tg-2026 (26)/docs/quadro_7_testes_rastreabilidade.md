# Documento 7 — Rastreabilidade e Execução dos Testes de Aceitação

**Trabalho de Graduação (TG) — FATEC Franca 2026**  
**Autor:** Leonardo Tavares Pavan  
**Orientador:** Prof. Me. Fausto Gonçalves Cintra  
**Curso:** Tecnologia em Análise e Desenvolvimento de Sistemas (TADS)  
**Sistema:** Sistema Web para Gerenciamento de Pedidos para Restaurantes  

---

## 1. Identificação do Ambiente e Versão Testada

| Parâmetro | Valor Registrado na Execução Oficial |
|:---|:---|
| **Data e Hora da Execução** | 29/10/2026, 18:27:39 |
| **Versão Oficial do Sistema** | 3.1.0 (Release Tag: `v3.1.0-tg-fatec`) |
| **Ambiente de Execução** | Linux x86_64, Node.js v22.23.4 |
| **Banco de Dados** | SQLite 3 Relacional (`data/database.sqlite`), WAL Mode (`PRAGMA journal_mode = WAL;`), Foreign Keys Ativas |
| **Servidor de Aplicação** | Express 4 + Vite 6 + React 19 SPA |
| **Endpoint Testado** | http://localhost:3000 |
| **Comando Executado** | `npx tsx scripts/run_quadro7_acceptance_tests.ts` |
| **Status Geral da Bateria** | **8 cenários aprovados e 0 reprovados** (100% de sucesso) |
| **Ocorrência de Falhas** | **Nenhuma falha ocorreu** durante a execução dos testes |

---

## 2. Validação das Credenciais de Acesso (RBAC)

Todos os três perfis de acesso foram autenticados com sucesso utilizando credenciais protegidas por hashes bcrypt e validadas pela API:

| Perfil | E-mail de Homologação | Mecanismo de Autenticação | Retorno HTTP | Perfil Retornado | Token JWT |
|:---|:---|:---|:---:|:---:|:---:|
| **Garçom** | `garcom@saborbrasa.com` | Hash bcrypt homologado | **200 OK** | `garcom` | Gerado com sucesso |
| **Cozinha** | `cozinha@saborbrasa.com` | Hash bcrypt homologado | **200 OK** | `kitchen` | Gerado com sucesso |
| **Gerente** | `gerente@saborbrasa.com` | Hash bcrypt homologado | **200 OK** | `manager` | Gerado com sucesso |

*Nota de Segurança da Informação:* Por conformidade com boas práticas de segurança, senhas em texto claro não constam na documentação acadêmica nem são armazenadas no banco de dados. As credenciais utilizam hashes seguros `bcrypt` gerados no procedimento de inicialização (*seed*). Tentativas de autenticação com senhas incorretas são rejeitadas pelo servidor com `HTTP 401 Unauthorized`.

---

## 3. Quadro 7 — Roteiro de Testes de Aceitação (Resultados Reais)

**Comando de Execução:** `npx tsx scripts/run_quadro7_acceptance_tests.ts`  
**Resultado Consolidado:** **8 cenários aprovados e 0 reprovados** | **Nenhuma falha ocorreu**.

| Nº | Cenário | Requisitos | Resultado Esperado | Resultado Obtido Real | Status |
|:---:|:---|:---:|:---|:---|:---:|
| **1** | **Cadastro de funcionários e produtos**<br>_O gerente cadastra um garçom, um funcionário da cozinha e produtos com categorias._ | RF001, RF002, RF003, RN001, RN005 | Funcionários e produtos cadastrados e disponíveis para uso. | Garçom (garcom.homologacao@saborbrasa.com) e cozinheiro (cozinha.homologacao@saborbrasa.com) cadastrados com HTTP 201 e login efetuado com sucesso (HTTP 200). Categoria "Especiais" (HTTP 201) e produto "Burger Gourmet" (R$ 42,50, HTTP 201) criados e confirmados no cardápio ativo. | **Aprovado** |
| **2** | **Registro de pedido pelo garçom**<br>_O garçom faz login, escolhe uma mesa livre e registra um pedido com vários itens._ | RF005, RF006, RN002, RN004 | Pedido gravado com status Recebido, total calculado pelo sistema e mesa ocupada. | Comanda CMD-1084 aberta com HTTP 201. Status: "Recebido". Total recalculado pelo servidor: R$ 46.90 (oficial: 1x R$ 32,90 + 2x R$ 7,00). Mesa 03 vinculada e marcada como "ocupada" com currentOrderId=CMD-1084. | **Aprovado** |
| **3** | **Validação de operações inválidas e integridade de mesas**<br>_O garçom tenta registrar um pedido sem mesa e outro em mesa já ocupada; o gerente tenta cadastrar produto com preço zero, tenta liberar mesa com atendimento ativo e tenta burlar status de mesa ocupada via edição cadastral._ | RN001, RN004, RN005 | O servidor recusa as operações inválidas com códigos HTTP apropriados e preserva o status ocupada e a comanda ativa mesmo após atualização cadastral da mesa. | Operações rejeitadas com erro estrito e integridade preservada: 1) Pedido sem mesa recusado com HTTP 400 ("A seleção da mesa é obrigatória para abertura de comanda no salão."); 2) Pedido em mesa já ocupada recusado com HTTP 409 Conflict ("A Mesa 03 já está ocupada com uma comanda ativa em atendimento. Encerre ou libere a mesa antes de abrir um novo pedido."); 3) Produto com preço zero recusado com HTTP 400 ("RN005: O preço do produto deve ser estritamente maior que zero (R$ > 0.00)."); 4) Liberação manual de mesa com pedido ativo recusada com HTTP 409 Conflict ("Não é permitido liberar manualmente uma mesa com atendimento ativo (comanda CMD-1084). A mesa deve ser liberada pelo encerramento (/api/orders/:id/close) ou cancelamento da comanda."); 5) Tentativa de forçar status "livre" via rota cadastral PUT /api/tables/mesa-03 sanitizada com sucesso: Mesa 03 permaneceu "ocupada" com currentOrderId=CMD-1084 (antes: status="ocupada", currentOrderId="CMD-1084"; depois: status="ocupada", currentOrderId="CMD-1084"). | **Aprovado** |
| **4** | **Atualização do status do pedido pela cozinha e restrição de entrega**<br>_O funcionário da cozinha avança o status do pedido até Pronto, tenta marcar como Entregue e tenta redefinir status Entregue em pedido já entregue._ | RF007, RN006 | Avanço até Pronto aceito; tentativas da cozinha de marcar Entregue (inclusive em pedido já entregue) recusadas com erro de permissão (HTTP 403 Forbidden). | Pedido CMD-1084 aceito com HTTP 200 e movido para "Em Preparação" (acceptedBy="Chef Marcos"). Em seguida, atualizado para "Pronto" com HTTP 200. Tentativa da cozinha de avançar para "Entregue" bloqueada com HTTP 403 Forbidden ("Perfil Cozinha só pode alterar pedidos para: "Em Preparação" ou "Pronto". Entrega é de responsabilidade do Garçom."). Tentativa da cozinha em pedido já entregue (CMD-1079) também bloqueada com HTTP 403 Forbidden ("Perfil Cozinha só pode alterar pedidos para: "Em Preparação" ou "Pronto". Entrega é de responsabilidade do Garçom."), comprovando precedência da autorização sobre a idempotência. Histórico de status auditado na tabela HistoricoStatus (3 registros). | **Aprovado** |
| **5** | **Registro da entrega e encerramento do atendimento**<br>_O garçom registra a entrega e encerra o atendimento, validando as recusas de encerramento prematuro e perfil sem permissão._ | RF008, RF010, RN004, RN006 | Encerramento de pedido não entregue recusado (HTTP 400); perfil cozinha sem permissão recusado (HTTP 403); após entrega, pedido Entregue e mesa ocupada; após encerramento, mesa livre; reencerramento recusado (HTTP 409). | Validações estritas cumpridas: 1) Encerramento de pedido com status "Pronto" recusado com HTTP 400 ("O atendimento só pode ser encerrado para pedidos com status "Entregue". Status atual do pedido: "Pronto"."); 2) Tentativa de encerramento pelo perfil Cozinha recusada com HTTP 403 Forbidden; 3) Entrega registrada com status "Entregue" (HTTP 200) mantendo a Mesa 03 "ocupada" durante o consumo; 4) Encerramento executado via POST /api/orders/CMD-1084/close por Garçom (HTTP 200), registrando closedAt e liberando a Mesa 03 para status "livre"; 5) Tentativa de reencerramento retornou HTTP 409 Conflict. | **Aprovado** |
| **6** | **Cancelamento de pedidos**<br>_O garçom cancela um pedido Recebido e tenta cancelar um pedido Pronto._ | RF008, RN004, RN006 | O primeiro é cancelado e a mesa é liberada; o segundo é recusado. | Cancelamento do pedido "Recebido" (CMD-1085) aceito com HTTP 200 e Mesa 01 liberada para status "livre". Cancelamento do pedido "Pronto" (CMD-1086) recusado com HTTP 400 ("Transição inválida: Não é permitido alterar o pedido de "Pronto" para "Cancelado". Transições permitidas: Entregue."). | **Aprovado** |
| **7** | **Controle de acesso ao cadastro de cardápio e gestão de mesas**<br>_O garçom tenta acessar o cadastro de cardápio e alterar status de mesas por chamada direta à API._ | RF009, RN003 | Acesso bloqueado com erro de permissão (HTTP 403 Forbidden). | Chamadas diretas do Garçom bloqueadas com HTTP 403 Forbidden: POST /api/products retornou "Acesso negado: Perfil "garcom" não possui permissão para este recurso. Permitidos: manager, admin", POST /api/categories retornou "Acesso negado: Perfil "garcom" não possui permissão para este recurso. Permitidos: manager, admin" e PUT /api/tables/mesa-01/status retornou "Acesso negado: Perfil "garcom" não possui permissão para este recurso. Permitidos: manager, admin, owner". Operações restritas a gerentes. | **Aprovado** |
| **8** | **Persistência física dos dados no banco relacional SQLite**<br>_Verificação da gravação física dos registros no arquivo de banco de dados SQLite em disco._ | RF001 a RF010, DER Relacional, Persistência SQLite | Cadastros e pedidos gravados permanentemente no arquivo em disco, confirmados por conexão independente sem depender de estado volátil em memória. | Persistência relacional SQLite confirmada no arquivo /app/applet/data/database.sqlite: 6 colaboradores, 7 mesas, 6 categorias, 6 produtos, 8 pedidos e 14 itens gravados permanentemente em disco. O pedido CMD-1084 com closed_at permaneceu íntegro e verificado por conexão SQLite independente e chamadas subsequentes à API. | **Aprovado** |

---

## 4. Auditoria de Código: Autorização do Garçom e Proteção contra Duplicidade

Foi realizada a conferência estrita no código-fonte dos dois mecanismos essenciais do encerramento de atendimento:

### 4.1 Autorização do Perfil Garçom (`server.ts`, Linha 845)
A rota `POST /api/orders/:id/close` possui o seguinte cabeçalho de controle de acesso:
```typescript
app.post('/api/orders/:id/close', authenticateToken, requireRole(['garcom', 'manager', 'admin', 'owner']), (req, res) => {
  const authUser = (req as any).user as AuthenticatedUser;
  // ...
```
- **Evidência no Código**: O perfil `'garcom'` está explicitamente autorizado na lista de permissões do middleware `requireRole`, permitindo que os garçons encerrem o atendimento diretamente pelo seu módulo operacional, sem depender de intervenção gerencial. Perfis não autorizados (como `'kitchen'`) recebem `HTTP 403 Forbidden`.

### 4.2 Proteção contra Requisições Duplicadas (Idempotência e Bloqueio Sequencial)
A proteção contra requisições repetidas e duplicidade sequencial é aplicada em duas camadas independentes:
1. **Camada de Aplicação (`server.ts`, linhas 855-860)**:
```typescript
if (order.closedAt) {
  return res.status(409).json({
    error: 'O atendimento deste pedido já foi encerrado anteriormente.',
    closedAt: order.closedAt,
  });
}
```
2. **Camada de Banco de Dados Relacional (`src/db/sqlite.ts`, linhas 1205-1248)**:
```typescript
if (order.closedAt) {
  throw new Error('ALREADY_CLOSED');
}
if (order.status !== 'Entregue') {
  throw new Error('NOT_DELIVERED');
}
db.exec('BEGIN TRANSACTION;');
// Executa UPDATE atômico com gravação de closed_at e liberação da mesa
db.exec('COMMIT;');
```
- **Evidência no Código e nos Testes**: A segunda chamada sequencial para o encerramento do mesmo pedido retorna **HTTP 409 Conflict** imediato, impedindo inconsistência operacional ou reprocessamento indevido.

---

## 5. Teste de Persistência Relacional em SQLite (Cenário 8)

O teste de persistência confirmou que as operações não dependem de estado volátil em memória. Uma leitura física direta no banco relacional SQLite (`data/database.sqlite`) após as operações registrou:

- **Tabela Restaurante**: 1 registro
- **Tabela Funcionario**: 6 colaboradores
- **Tabela Mesa**: 7 mesas
- **Tabela Categoria**: 6 categorias
- **Tabela Produto**: 6 produtos
- **Tabela Pedido**: 8 pedidos gravados
- **Tabela ItemPedido**: 14 itens
- **Tabela HistoricoStatus**: 23 transições auditadas

Todas as comandas, incluindo a comanda encerrada com carimbo de data/hora (`closed_at`), permanecem gravadas permanentemente no arquivo em disco, confirmando que a persistência física relacional no SQLite independe de estado transitório em memória.

---

## 6. Procedimento e Esclarecimento dos Ambientes de Dados (Desenvolvimento vs. Pós-Testes)

- **Base de Desenvolvimento Original (`data/backups/database_original_dev.sqlite`)**:
  Contém o estado semente inicial do sistema: 4 colaboradores cadastrados (`admin@admin.com`, `cozinha@saborbrasa.com`, `garcom@saborbrasa.com`, `gerente@saborbrasa.com`), 7 mesas operacionais, 5 categorias, 5 produtos no cardápio e 5 pedidos de demonstração para a esteira KDS (`CMD-1079` a `CMD-1083`).
- **Base de Homologação / Pós-Testes (`data/database.sqlite` e cópia em `data/backups/database_pos_testes_quadro7.sqlite`)**:
  Contém o acréscimo das operações formais de teste do Quadro 7 (+2 colaboradores no Cenário 1, +1 categoria, +1 produto, +1 comanda encerrada `CMD-1084`, +2 comandas de cancelamento/avanço no Cenário 6). Total: 6 colaboradores, 7 mesas, 6 categorias, 6 produtos, 8 pedidos.
- Ambas as bases estão preservadas na pasta `data/backups/` com integridade e hashes SHA-256 distintos comprovados.

---

## 7. Matriz de Rastreabilidade de Requisitos

| Requisito | Descrição | Cenário do Quadro 7 | Evidência Técnica | Status |
|:---|:---|:---:|:---|:---:|
| **RF001** | Cadastro de Funcionários | Cenário 1 | HTTP 201 no cadastro de Garçom e Cozinha | Aprovado |
| **RF002** | Autenticação por E-mail e Senha | Fase 0 & Cenário 1 | HTTP 200 com JWT nos 3 perfis + novos usuários | Aprovado |
| **RF003** | Gerenciamento de Cardápio | Cenário 1 | HTTP 201 no cadastro de categoria e produto | Aprovado |
| **RF004** | Consulta de Cardápio | Cenário 2 | Garçom consulta itens e categorias ao lançar pedido | Aprovado |
| **RF005** | Gerenciamento de Mesas | Cenários 2, 5 e 6 | Mesa ocupada na abertura, liberada no encerramento/cancelamento | Aprovado |
| **RF006** | Registro de Pedido pelo Garçom | Cenário 2 | HTTP 201, cálculo oficial de total no servidor | Aprovado |
| **RF007** | Gerenciamento de Pedidos (KDS) | Cenário 4 | HTTP 200 no aceite e avanço para Pronto | Aprovado |
| **RF008** | Acompanhamento do Pedido | Cenários 5 e 6 | Entrega registrada; cancelamento de Pronto recusado (HTTP 400) | Aprovado |
| **RF009** | Controle de Acesso (RBAC) | Cenário 7 | Garçom bloqueado com HTTP 403 em rotas administrativas | Aprovado |
| **RF010** | Encerramento do Atendimento | Cenário 5 | POST /api/orders/:id/close registra closedAt e libera a mesa | Aprovado |
| **RN001** | Unicidade de Cadastro e Mesa | Cenário 3 | Pedido em mesa já ocupada rejeitado com HTTP 409 | Aprovado |
| **RN002** | Consistência e Recálculo de Preço | Cenário 2 | Total recalculado pelo backend com preços do banco | Aprovado |
| **RN003** | Acesso Administrativo Restrito | Cenário 7 | Rotas de cardápio bloqueadas para garçom (HTTP 403) | Aprovado |
| **RN004** | Um Atendimento Ativo por Mesa | Cenário 5 | Mesa mantida ocupada na entrega e liberada apenas no /close | Aprovado |
| **RN005** | Validação de Preços (> R$ 0,00) | Cenário 3 | Produto com preço zero rejeitado com HTTP 400 | Aprovado |
| **RN006** | Máquina de Estados Finita | Cenários 4, 5 e 6 | Fluxo Recebido -> Preparação -> Pronto -> Entregue -> Close | Aprovado |
