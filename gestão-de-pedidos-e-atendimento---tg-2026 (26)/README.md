# 🍽️ Sistema Web para Gerenciamento de Pedidos para Restaurantes

**Trabalho de Graduação (TG) — FATEC Franca 2026**  
**Autor:** Leonardo Tavares Pavan  
**Orientador:** Prof. Me. Fausto Gonçalves Cintra  
**Curso:** Tecnologia em Análise e Desenvolvimento de Sistemas (TADS)  

Sistema web full-stack desenvolvido especificamente para atendimento em salão em restaurantes e padarias, integrando o lançamento de pedidos e gestão de mesas pelo garçom, esteira de produção em tempo real na cozinha (KDS), gestão administrativa do cardápio e encerramento de atendimento.

---

## 🎯 Escopo do Sistema e Módulos Operacionais

O sistema elimina o uso de comandas de papel, agiliza a comunicação entre salão e cozinha e garante a consistência do fluxo operacional através de três módulos com controle estrito de acesso por perfil (RBAC):

1. **Módulo do Garçom (`waiter_orders`)**:
   - Mapa de mesas com capacidade, setor e status em tempo real (`livre` ou `ocupada`).
   - Lançamento de comandas vinculadas obrigatoriamente a uma mesa livre do salão.
   - Consulta ao cardápio oficial com separação por categorias e observações por item (ex: *sem cebola*, *ponto da carne*).
   - Numeração sequencial unívoca de comandas (`CMD-XXXX`).
   - Acompanhamento do status de preparo dos pratos em tempo real.
   - Cancelamento permitido de pedidos em andamento até a fase de preparo (liberando a mesa).
   - **Registro de Entrega**: Ao finalizar o preparo, o garçom registra a entrega (`Pronto` ➔ `Entregue`). A mesa **permanece ocupada** durante todo o consumo dos clientes no salão.
   - **Encerramento do Atendimento**: Após a entrega, o garçom aciona o botão **"Encerrar atendimento"** (`POST /api/orders/:id/close`), gravando a data/hora de encerramento (`closedAt`) e liberando a mesa para novos clientes (`livre`).

2. **Módulo da Cozinha / Esteira KDS (`kitchen_kds`)**:
   - Painel Kanban operacional para a equipe de chapa e expedição.
   - Três colunas de produção:
     1. **Novos Pedidos (`Recebido`)**: botão para iniciar o preparo na chapa.
     2. **Em Preparação (`Em Preparação`)**: cronômetro de tempo decorrido e botão para avisar que o prato está pronto.
     3. **Prontos para Servir (`Pronto`)**: aviso visual na praça para o garçom retirar na expedição e servir à mesa.
   - A equipe da cozinha atua estritamente nas fases de produção (`Em Preparação` e `Pronto`), não possuindo permissão para entrega ou cancelamento.

3. **Módulo Administrativo & Gerente (`admin`)**:
   - Cadastro e gestão da equipe de colaboradores (Garçons, Cozinha e Gerência) com senhas criptografadas em hash bcrypt. Não há cadastro aberto ao público no login (RF001).
   - Gestão de categorias e cardápio de produtos (nome, preço strictly positive > 0, descrição e tempo de preparo).
   - Gestão das mesas físicas e balcões do estabelecimento (capacidade, número e localização).
   - Acompanhamento em tempo real de todas as comandas do salão e histórico auditado de status.
   - Possibilidade de encerramento de atendimento também pela gerência.

---

## 🔒 Regras de Negócio e Requisitos Funcionais

### Requisitos Funcionais (RF001 a RF010)
- **RF001 — Cadastro de Funcionários**: O gerente cadastra contas de acesso (garçom, cozinha, gerente), informando dados obrigatórios. Sem cadastro público.
- **RF002 — Autenticação de Funcionários**: Login por e-mail e senha com JWT válido por 24 horas e direcionamento automático ao módulo da função.
- **RF003 — Gerenciamento de Cardápio**: Gerente cadastra, edita e desativa produtos e categorias.
- **RF004 — Consulta de Cardápio**: Garçom consulta categorias e produtos disponíveis ao registrar pedido.
- **RF005 — Gerenciamento de Mesas**: Gerente cadastra e edita mesas; status (`livre` / `ocupada`) sincronizado automaticamente ao abrir pedido, cancelar ou encerrar atendimento.
- **RF006 — Registro de Pedido**: Garçom registra pedido vinculado a uma mesa livre, recalculando total com preços oficiais cadastrados.
- **RF007 — Gerenciamento de Pedidos (KDS)**: Cozinha visualiza pedidos por mesa e avança status de `Recebido` para `Em Preparação` e `Pronto`.
- **RF008 — Acompanhamento do Pedido**: Garçom acompanha status, registra entrega quando `Pronto`, encerra atendimento após entrega e cancela pedidos até `Em Preparação`.
- **RF009 — Controle de Acesso**: Restrição por perfil em nível de interface e em todas as rotas da API HTTP (retornando `403 Forbidden` a perfis não autorizados).
- **RF010 — Encerramento do Atendimento**: Garçom encerra o atendimento após a entrega via `POST /api/orders/:id/close`, registrando encerramento e liberando a mesa.

### Regras de Negócio (RN001 a RN006)
- **RN001 — Unicidade de Cadastro**: E-mails únicos por colaborador; mesas ocupadas não recebem nova comanda ativa (retorno HTTP `409 Conflict`).
- **RN002 — Consistência de Pedidos**: Apenas produtos cadastrados e disponíveis; valor total recalculado no servidor impedindo manipulação de preços.
- **RN003 — Controle Administrativo**: Apenas gerente tem acesso a colaboradores, produtos, categorias e mesas.
- **RN004 — Um Atendimento Ativo por Mesa**: A mesa fica ocupada ao abrir pedido e só é liberada no encerramento (`/close`) ou cancelamento (`Cancelado`). Na entrega (`Entregue`), a mesa permanece ocupada.
- **RN005 — Validação de Preços**: Todo produto cadastrado deve possuir preço estritamente maior que zero (`R$ > 0.00`).
- **RN006 — Fluxo de Status do Pedido**: Máquina de estados finita:
  - `Recebido` ➔ `Em Preparação` ou `Cancelado`
  - `Em Preparação` ➔ `Pronto` ou `Cancelado`
  - `Pronto` ➔ `Entregue`
  - `Entregue` ➔ `Encerramento` (libera a mesa)

---

## 💾 Banco de Dados Relacional SQLite (`data/database.sqlite`)

A persistência de dados oficial do sistema utiliza o banco de dados relacional **SQLite 3** com:
- **Integridade Referencial Ativa**: `PRAGMA foreign_keys = ON;`
- **Concorrência e Performance**: `PRAGMA journal_mode = WAL;` (Write-Ahead Logging)
- **Tabelas do Modelo Entidade-Relacionamento (DER)**:
  1. `Restaurante` (`id_restaurante`, `nome`, `descricao`, `telefone`, `culinaria`, ...)
  2. `Funcionario` (`id_funcionario`, `id_restaurante`, `nome`, `email`, `senha_hash`, `cargo`, `ativo`)
  3. `Mesa` (`id_mesa`, `id_restaurante`, `numero`, `nome`, `capacidade`, `localizacao`, `status`, `id_pedido_atual`)
  4. `Categoria` (`id_categoria`, `id_restaurante`, `nome`, `ordem_exibicao`)
  5. `Produto` (`id_produto`, `id_restaurante`, `id_categoria`, `nome`, `descricao`, `preco`, `disponibilidade`, ...)
  6. `Pedido` (`id_pedido`, `id_mesa`, `numero_mesa`, `identificacao_cliente`, `status`, `valor_total`, `closed_at`, `closed_by`, `data_encerramento`)
  7. `ItemPedido` (`id_item_pedido`, `id_pedido`, `id_produto`, `nome_produto`, `quantidade`, `preco_unitario`, `subtotal`, `observacao`)
  8. `HistoricoStatus` (`id_historico`, `id_pedido`, `status`, `timestamp`, `nota_observacao`, `registrado_por`)
- **Script DDL Oficial**: `schema.sql`
- **Script de Migração**: `scripts/migrate_to_sqlite.ts`

---

## 👥 Credenciais de Demonstração e Testes

| Perfil | E-mail | Senha Padrão | Módulo Padrão |
| :--- | :--- | :--- | :--- |
| **Garçom** | `garcom@saborbrasa.com` | `Garcom@2026` ou `123` | `waiter_orders` (Comandas e Mesas) |
| **Cozinha** | `cozinha@saborbrasa.com` | `Cozinha@2026` ou `123` | `kitchen_kds` (Esteira KDS) |
| **Gerente** | `gerente@saborbrasa.com` | `Gerente@2026` ou `123` | `admin` (Gestão Geral do Salão) |
| **Administrador** | `admin@admin.com` | `admin123` | `admin` (Gestão Administrativa) |

> ⚠️ **Aviso de Segurança — Ambiente de Homologação e Demonstração:**  
> As credenciais acima são **estritamente destinadas ao ambiente de demonstração acadêmica e testes locais**. Em ambientes de produção real, é mandatório alterar as senhas iniciais através de rotinas administrativas, utilizar segredos JWT randômicos de alta entropia configurados em variáveis de ambiente (`.env`), e habilitar políticas de complexidade de senha e expiração de sessão.

---

## 🚀 Instalação e Execução Local

Para instalar as dependências e iniciar o projeto:

```bash
# Instalação das dependências (resiliente com .npmrc configurado)
npm install
# ou para instalação estrita a partir do lockfile:
npm ci

# Caso seu ambiente de rede/sandbox corporativo tenha latência elevada ou restrições de proxy:
npm ci --prefer-offline --fetch-timeout=120000

# Iniciar o servidor completo (Backend Express + Frontend Vite)
npm run dev

# Executar verificação de tipos e build de produção
npm run build
```

---

## 🧪 Suíte de Testes Automatizados

Para executar os testes automatizados da aplicação:

```bash
# Executa todos os testes de integração da API e regras de negócio
npm run test

# Executa os 8 cenários de aceitação do Quadro 7 com registro real
npm run test:acceptance
# ou diretamente via tsx:
npx tsx scripts/run_quadro7_acceptance_tests.ts
```

O relatório completo com a rastreabilidade dos testes de aceitação e evidências de execução está disponível em:  
📄 [`docs/documento_7_testes_rastreabilidade.md`](docs/documento_7_testes_rastreabilidade.md) e [`docs/quadro_7_testes_rastreabilidade.md`](docs/quadro_7_testes_rastreabilidade.md)
