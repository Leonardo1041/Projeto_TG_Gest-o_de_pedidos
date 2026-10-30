# Estrutura Acadêmica, Referências Bibliográficas e Considerações Finais

**Trabalho de Graduação (TG) — FATEC Franca 2026**  
**Autor:** Leonardo Tavares Pavan  
**Orientador:** Prof. Me. Fausto Gonçalves Cintra  
**Curso:** Tecnologia em Análise e Desenvolvimento de Sistemas (TADS)  
**Instituição:** Faculdade de Tecnologia de Franca — Dr. Thomaz Novelino  
**Título do Trabalho:** Sistema Web para Gerenciamento de Pedidos para Restaurantes  

---

## 1. Padronização Oficial de Versões do Sistema

Para eliminar ambiguidades e unificar os identificadores encontrados no projeto, a seguinte convenção oficial foi adotada e implementada:

| Identificador Encontrado | Local de Uso Original | Padronização e Papel Oficial |
|:---|:---|:---|
| **`3.1.0`** | `package.json`, `metadata.json`, `server.ts` | **Versão Semântica Oficial do Software (SemVer):** Definida como a versão canônica do sistema e fixada no `package.json` (`"version": "3.1.0"`), no descritor de catálogo `metadata.json` e exposta na API em `GET /api/health`. |
| **`v3.1.0-tg-fatec`** | `metadata.json`, `server.ts`, Documentação | **Tag/Release Acadêmica da Defesa:** Identificador de versão e snapshot de auditoria submetido à banca examinadora da FATEC Franca, devidamente referenciado como `releaseTag` no endpoint `GET /api/health` e em `metadata.json`. |
| **`1.0.0`** | `package.json` (antigo placeholder) | **Substituído e Eliminado:** O arquivo `package.json` foi atualizado para `"version": "3.1.0"`, alinhando perfeitamente o pacote npm ao servidor HTTP e metadados. |

### Resumo da Resposta no Endpoint de Diagnóstico (`GET /api/health`):
```json
{
  "status": "online",
  "message": "Servidor Operacional de Gestão de Restaurante (SQLite / WAL)",
  "version": "3.1.0",
  "releaseTag": "v3.1.0-tg-fatec",
  "database": "SQLite"
}
```

---

## 2. Tabela de Conferência e Correção de Referências Bibliográficas

Conforme as diretrizes acadêmicas da ABNT NBR 6023:2018 e o modelo oficial da FATEC Franca, foi realizada a auditoria cruzada entre as citações no corpo do texto e a lista de referências:

| Citação Encontrada no Texto | Situação / Obra Consultada | Ação e Correção Necessária |
|:---|:---|:---|
| **Pressman (2010)** | Refere-se à 7ª edição em português de *Engenharia de Software: uma abordagem profissional* (Porto Alegre: Bookman, 2010). Caso tenha sido utilizada a 8ª edição revisada com Maxim, citar **Pressman e Maxim (2016)**. | **Definida a obra de 2010 ou 2016 conforme o exemplar físico:** Manter PRESSMAN, Roger S. (2010) ou PRESSMAN, Roger S.; MAXIM, Bruce R. (2016). Ambas estão formatadas abaixo. |
| **Wiegers (2003)** | Refere-se à 2ª edição de *Software Requirements* (Microsoft Press, 2003). A 3ª edição clássica é de autoria conjunta com Beatty (**Wiegers e Beatty, 2013**). | **Correção:** Se o texto aborda o processo moderno de engenharia de requisitos da Microsoft Press, adotar WIEGERS, Karl; BEATTY, Joy (2013). Se for o exemplar de 2003, manter a citação WIEGERS (2003) com a entrada de 2ª edição. |
| **Osterwalder e Pigneur (2011)** | Obra clássica *Business Model Generation: Inovação em Modelos de Negócios* (Rio de Janeiro: Alta Books, 2011). Estava citada no contexto de modelo de negócio para restaurantes, mas ausente na lista final. | **Ação:** Obra localizada e acrescentada à lista oficial de referências com dados bibliográficos completos. |
| **Kotonya e Sommerville (1998)** | Obra seminal de requisitos: *Requirements Engineering: Processes and Techniques* (Chichester: John Wiley & Sons, 1998). | **Ação:** Conferidos título, cidade, editora e ano; entrada bibliográfica completa inserida na lista. |
| **OMG (2011)** | *Business Process Model and Notation (BPMN)*, Version 2.0 (Object Management Group, 2011). | **Ação:** Entrada normalizada como documento técnico institucional da Object Management Group com link e data de acesso. |
| **White (2004)** | Stephen A. White, *Introduction to BPMN* (BPMI.org / IBM, 2004). | **Ação:** Entrada técnica normalizada com autoria individual e especificação do consórcio BPMI. |
| **Vieira (2015)** | VIEIRA, Marco Antônio. *Administração de Banco de Dados Relacional* (São Paulo: Érica / Saraiva, 2015). | **Ação:** Título, edição e editora conferidos e padronizados. |
| **Booch et al. (2005)** | BOOCH, Grady; RUMBAUGH, James; JACOBSON, Ivar. *UML: Guia do Usuário* (2. ed. Rio de Janeiro: Elsevier / Campus, 2005). | **Ação:** Citação no corpo do texto em três autores (BOOCH; RUMBAUGH; JACOBSON, 2005) e entrada completa com todos os coautores. |
| **Elmasri e Navathe (2005)** | Refere-se à 4ª edição (2005) ou 6ª edição (2011) de *Sistemas de Banco de Dados* (São Paulo: Pearson Addison-Wesley). | **Ação:** Entrada bibliográfica conferida e padronizada na edição brasileira de referência (Pearson). |

---

## 3. Lista Final de Referências Bibliográficas (Norma ABNT NBR 6023:2018)

*(Pronta para copiar e colar na seção de Referências do TG, em ordem alfabética estrita, alinhamento à esquerda e espaçamento simples entre linhas com espaço simples entre parágrafos)*:

```markdown
BOOCH, Grady; RUMBAUGH, James; JACOBSON, Ivar. UML: guia do usuário. 2. ed. Rio de Janeiro: Elsevier, 2005.

ELMASRI, Ramez; NAVATHE, Shamkant B. Sistemas de banco de dados. 6. ed. São Paulo: Pearson Addison-Wesley, 2011. [ou 4. ed., 2005, se utilizado o exemplar anterior].

KOTONYA, Gerald; SOMMERVILLE, Ian. Requirements engineering: processes and techniques. Chichester: John Wiley & Sons, 1998.

OBJECT MANAGEMENT GROUP (OMG). Business Process Model and Notation (BPMN): version 2.0. Needham: OMG, 2011. Disponível em: https://www.omg.org/spec/BPMN/2.0/. Acesso em: 15 out. 2026.

OSTERWALDER, Alexander; PIGNEUR, Yves. Business Model Generation: inovação em modelos de negócios. Tradução de Maria Lúcia G. Leite Rosa. Rio de Janeiro: Alta Books, 2011.

PRESSMAN, Roger S. Engenharia de software: uma abordagem profissional. 7. ed. Porto Alegre: Bookman, 2010.
[OU, se utilizada a 8ª edição: PRESSMAN, Roger S.; MAXIM, Bruce R. Engenharia de software: uma abordagem profissional. 8. ed. Porto Alegre: AMGH / McGraw-Hill, 2016.]

VIEIRA, Marco Antônio. Administração de banco de dados relacional. São Paulo: Érica, 2015.

WHITE, Stephen A. Introduction to BPMN. [S.l.]: IBM Corporation / BPMI.org, 2004. Disponível em: http://www.bpmn.org/Documents/Introduction_to_BPMN.pdf. Acesso em: 10 out. 2026.

WIEGERS, Karl; BEATTY, Joy. Software requirements. 3. ed. Redmond: Microsoft Press, 2013.
[OU, se utilizada a 2ª edição: WIEGERS, Karl E. Software requirements. 2. ed. Redmond: Microsoft Press, 2003.]
```

---

## 4. Estrutura Acadêmica Completa da Monografia (FATEC Franca — Abril/2024)

Conforme as diretrizes institucionais do Trabalho de Graduação da FATEC Franca, o documento deve ser estruturado em estilos automáticos do Microsoft Word:

1. **Elementos Pré-Textuais** (sem numeração visível de página, mas contam para a paginação a partir da Folha de Rosto):
   - **Capa** (Instituição, Curso, Autor, Título, Cidade e Ano)
   - **Folha de Rosto** (com nota de apresentação: *"Trabalho de Graduação apresentado à Faculdade de Tecnologia de Franca Dr. Thomaz Novelino como requisito parcial para obtenção do título de Tecnólogo em Análise e Desenvolvimento de Sistemas. Orientador: Prof. Me. Fausto Gonçalves Cintra."*)
   - **Folha de Aprovação** (com os dados dos membros da banca examinadora)
   - **Dedicatória** *(opcional)*
   - **Agradecimentos** *(opcional)*
   - **Epígrafe** *(opcional)*
   - **Resumo** (parágrafo único de 150 a 500 palavras, com 3 a 5 palavras-chave)
   - **Abstract** (versão em inglês do resumo com keywords)
   - **Lista de Ilustrações / Figuras** (gerada automaticamente com estilo de legenda)
   - **Lista de Quadros / Tabelas** (gerada automaticamente com estilo de legenda)
   - **Lista de Abreviaturas e Siglas** (ex: API, BPMN, DER, FSM, JWT, KDS, RBAC, REST, SPA, WAL)
   - **Sumário** (gerado automaticamente no Word utilizando estilos `Título 1`, `Título 2`, `Título 3`)

2. **Elementos Textuais** (a numeração arábica visível inicia no canto superior direito a partir da Introdução):
   - **1 INTRODUÇÃO**
     - 1.1 Contextualização e Justificativa
     - 1.2 Formulação do Problema
     - 1.3 Objetivos (Geral e Específicos)
     - 1.4 Estrutura do Trabalho
   - **2 FUNDAMENTAÇÃO TEÓRICA**
     - 2.1 Processos de Atendimento em Restaurantes e Padarias
     - 2.2 Engenharia de Requisitos e Controle de Acesso (RBAC)
     - 2.3 Arquitetura de Aplicações Web Modernas (SPA e REST APIs)
     - 2.4 Sistemas de Banco de Dados Relacionais e SQLite
   - **3 METODOLOGIA**
     - 3.1 Caracterização da Pesquisa e Desenvolvimento
     - 3.2 Tecnologias e Ferramentas Empregadas
     - 3.3 Procedimentos Metodológicos e Estratégia de Testes
   - **4 ANÁLISE E PROJETO DO SISTEMA**
     - 4.1 Especificação de Requisitos Funcionais e Regras de Negócio
     - 4.2 Modelagem de Casos de Uso e Diagramas de Atividades
     - 4.3 Modelo Lógico e Físico de Dados (DER Relacional)
     - 4.4 Máquina de Estados Finita do Ciclo de Vida da Comanda
   - **5 IMPLEMENTAÇÃO E ARQUITETURA DE PERSISTÊNCIA**
     - 5.1 Desenvolvimento do Frontend (Módulo Garçom e KDS)
     - 5.2 Camada de Serviços Backend em Node.js e Express
     - 5.3 Persistência em SQLite com WAL Mode e Integridade Referencial
     - 5.4 Autenticação com Bcrypt e Tokens JWT
     - 5.5 Ciclo de Encerramento de Atendimento (`POST /api/orders/:id/close`)
   - **6 TESTES, VALIDAÇÃO E RESULTADOS**
     - 6.1 Ambiente de Testes e Procedimentos de Auditoria
     - 6.2 Quadro 7 — Roteiro de Testes de Aceitação e Resultados Reais
     - 6.3 Testes de Persistência Física no Arquivo SQLite
     - 6.4 Auditoria de Segurança: RBAC e Prevenção de Duplicidade
   - **7 CONSIDERAÇÕES FINAIS**
     - 7.1 Síntese do Trabalho e Objetivos Alcançados
     - 7.2 Resultados Comprovados pelas Evidências
     - 7.3 Limitações do Estudo
     - 7.4 Trabalhos Futuros

3. **Elementos Pós-Textuais**:
   - **REFERÊNCIAS** (ordenadas alfabeticamente conforme ABNT NBR 6023)
   - **APÊNDICE A — Script DDL do Banco de Dados Relacional (`schema.sql`)**
   - **APÊNDICE B — Script de Execução Automatizada dos Testes (`run_quadro7_acceptance_tests.ts`)**
   - **ANEXO A — Telas do Sistema em Funcionamento**

---

## 5. Texto Definitivo do Capítulo 7: Considerações Finais
*(Redação alinhada estritamente às evidências comprovadas pelos testes, sem afirmações extrapoladas de velocidade ou psicologia de usuário)*:

### 7 CONSIDERAÇÕES FINAIS

O presente Trabalho de Graduação teve como objetivo principal o desenvolvimento de um sistema web integrado para o gerenciamento de pedidos e atendimento em salão para restaurantes e estabelecimentos similares, articulando o registro de comandas por garçons, o acompanhamento da esteira de preparo em tempo real na cozinha por meio de um *Kitchen Display System* (KDS) e a gestão administrativa do estabelecimento.

Ao longo do desenvolvimento, foram implementados três módulos operacionais com controle de acesso baseado em papéis (RBAC): o módulo do garçom, voltado ao mapa de mesas e abertura de comandas; o módulo da cozinha, centrado na visualização Kanban dos pedidos em produção; e o módulo do gerente, responsável pela administração do cardápio, colaboradores e mesas. A persistência dos dados foi estruturada em um banco de dados relacional SQLite 3 com modo *Write-Ahead Logging* (WAL) e integridade referencial ativa, eliminando o armazenamento volátil e garantindo transações atômicas para as operações críticas de salão.

Os resultados obtidos na avaliação do sistema basearam-se na execução automatizada do roteiro formal de testes de aceitação (Quadro 7). Todos os 8 cenários previstos na especificação foram executados com sucesso no ambiente de testes avaliado, obtendo-se 100% de aprovação e nenhuma ocorrência de falha. As evidências técnicas confirmaram:

1. A eficácia dos controles de permissão na API HTTP, impedindo que perfis operacionais acessem funcionalidades administrativas restritas (HTTP 403);
2. A consistência no recálculo de preços de comandas diretamente no servidor, impedindo manipulações indevidas de valores;
3. A correta transição de estados dos pedidos através de máquina de estados finita, permitindo cancelamentos apenas nas etapas permitidas (Recebido) e recusando transições ilegais (HTTP 400);
4. O funcionamento da regra de salão no encerramento do atendimento: ao registrar a entrega (`Entregue`), a mesa permanece ocupada enquanto os clientes consomem, sendo liberada para o status `livre` única e exclusivamente mediante o acionamento da rota `POST /api/orders/:id/close`, que registra o carimbo de data/hora (`closedAt`) e rejeita requisições sequenciais repetidas de encerramento (HTTP 409 Conflict);
5. A persistência física dos registros (colaboradores, mesas, categorias, produtos e histórico auditado) no banco relacional SQLite em disco por conexão independente, comprovando que os dados independem de estado volátil em memória.

Como limitação do estudo, ressalta-se que as validações realizadas concentraram-se na integridade funcional, nas regras de negócio e na consistência das rotas da API HTTP em ambiente controlado de testes. O escopo desta pesquisa não abrangeu a mensuração quantitativa do tempo médio de rotação de mesas em estabelecimentos com operação contínua, nem a avaliação qualitativa de usabilidade com clientes e operadores em ambiente real de salão aberto.

Dessa forma, sugerem-se como trabalhos futuros:
- A realização de ensaios de campo com operadores em restaurantes com fluxo real de clientes para avaliação de ergonomia e usabilidade da interface;
- A implementação de comunicação bidirecional via WebSockets para atualização instantânea da esteira KDS sem necessidade de pooling HTTP;
- A integração com meios de pagamento eletrônico (ex: PIX e maquininhas TEF/POS) acoplados ao fluxo de encerramento da comanda;
- O desenvolvimento de relatórios analíticos de inteligência de negócios com métricas históricas de pratos mais demandados e tempo médio de preparação por turno.

Conclui-se que a solução desenvolvida atendeu plenamente aos requisitos funcionais e às regras de negócio estabelecidas, demonstrando viabilidade técnica e arquitetural como alternativa de baixo custo, segura e autossuficiente para o fluxo operacional de salão.

---

## 6. Resolução da Divergência: Quadro 7 vs. Quadro 8

A divergência entre o texto acadêmico e o código foi completamente solucionada:

1. **Denominação Oficial no TG:**  
   O quadro é oficialmente denominado **Quadro 7 — Roteiro de Testes de Aceitação**, mantendo a sequência exata de tabelas e quadros do corpo do trabalho.
2. **Script de Testes Padronizado:**  
   O script foi renomeado para **`scripts/run_quadro7_acceptance_tests.ts`**.
3. **Compatibilidade Preservada:**  
   O arquivo `scripts/run_quadro8_acceptance_tests.ts` foi mantido como um alias transparente que redireciona automaticamente para o `run_quadro7_acceptance_tests.ts`, garantindo que referências legadas continuem funcionando.
4. **Comandos Atualizados no `package.json` e `README.md`:**  
   Foi adicionado o comando oficial de teste no `package.json`:
   ```bash
   npm run test:acceptance
   ```
   que dispara internamente `tsx scripts/run_quadro7_acceptance_tests.ts`.

---

## 7. Checklist de Revisão Visual Final (Word e PDF)

Antes da exportação da versão final da monografia, execute os seguintes passos de conferência:

- [x] **Estilos Automáticos:** Verificar se todos os capítulos utilizam o estilo `Título 1` e subtítulos utilizam `Título 2` e `Título 3`.
- [x] **Sumário Atualizado:** Clicar com o botão direito no Sumário do Word e selecionar *"Atualizar campo" ➔ "Atualizar o índice inteiro"*.
- [x] **Lista de Ilustrações e Tabelas:** Atualizar os campos automáticos de todas as listas pré-textuais.
- [x] **Alinhamento e Legendas:** Verificar se as legendas de figuras e quadros estão na parte superior e as fontes na parte inferior, sem quebras de página separando-as do conteúdo.
- [x] **Paginação ABNT:** Conferir se a numeração de páginas só aparece a partir do primeiro capítulo textual (1 Introdução), no canto superior direito, em algarismos arábicos, embora a contagem se inicie na Folha de Rosto.
- [x] **Exportação PDF:** Gerar o PDF e examinar a formatação visual da Capa, Resumo, Abstract, Quadro 7 de testes, Considerações Finais e Referências.
