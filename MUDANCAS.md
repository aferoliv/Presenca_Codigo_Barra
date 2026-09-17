# Mudanças no Sistema de Presenças — QUI 112

Registro das alterações feitas em `app.js` e `index.html` nesta cópia do projeto,
com o motivo de cada uma. Serve para reaplicar as mesmas correções em outra
versão do código.

> **Atenção:** os números de linha são desta cópia (`app.js` com 1895 linhas).
> Em outra versão do projeto, localize os trechos pelo nome do método, não pela
> linha.

**Situação nesta cópia — 16/set/2026**

| # | Mudança | Situação |
|---|---------|----------|
| 1 | Matrícula com hífen e dígito verificador | **aplicada** |
| 2 | Ciclo entrada → saída → releitura | **aplicada** |
| 3 | Coluna "Observação" fora da tela | **aplicada** |
| 4 | Código 900112 — anular a entrada anterior | **aplicada** |
| 5 | Estrutura do `index.html` (`</div>` sobrando) | **aplicada** |
| 6 | Código 900260 — corrigir o tempo para o mínimo + 1 | **aplicada** |
| 7 | Código 900250 — ajustar o tempo mínimo da sessão | **aplicada** |
| 8 | Etiqueta da disciplina no nome dos arquivos | **aplicada** |
| 9 | Carregar a lista de alunos em `.csv` | **aplicada** |
| 10 | Sessões arquivadas: descarte, acesso e gravação | **aplicada** |
| 11 | Trocar a lista no meio da sessão realinha os nomes | **aplicada** |
| 12 | Apagar as listas de alunos, e botão sem contagem | **aplicada** |

---

## 1. Matrícula com hífen e dígito verificador

**Problema.** A lista de alunos (export do Moodle) traz matrículas em formatos
diferentes: `ES100001` (aluno) e `1234-5`, `4321-2`, `5678-X` (servidores).
O import só removia prefixo de duas letras e zeros à esquerda, então `1234-5`
nunca era encontrado pela leitura do código de barras, que envia apenas dígitos.

**Regra adotada.** O número é procurado na lista **sem o hífen e sem o dígito
verificador**, e é **registrado nessa forma** no log. A leitura do código de
barras vem sempre só com dígitos, sem `ES` e sem zeros à esquerda; o dígito
verificador pode ou não vir junto.

**O que foi feito.**

- `_normalizeMatricula(value)` — `app.js:712`. Forma canônica única, usada tanto
  no import quanto na leitura:

  | entrada    | canônica |
  |------------|----------|
  | `ES100001` | `100001` |
  | `0100001`  | `100001` |
  | `1234-5`  | `1234`  |
  | `01234-5` | `1234`  |
  | `5678-X`  | `5678`  |

  A ordem importa: tira o prefixo de duas letras, depois o `-` + dígito
  verificador (`/-[0-9A-Z]$/`, que cobre o `X`), depois qualquer outro separador
  que tenha sobrado, e só então os zeros à esquerda.

- `_resolveMatricula(value)` — `app.js:736`. Resolve a leitura contra um mapa de
  apelidos (`matriculaAliases`, `app.js:84`). No import, uma matrícula com hífen
  gera o apelido `12345 → 1234`, de modo que **tanto `1234` quanto `12345`
  lidos no leitor encontram o aluno**, e o registro sai sempre como `1234`.
  Para `5678-X` o apelido é `5678X → 5678`.
- `_registerMatriculaAliases(raw, matricula)` — `app.js:747`. Cria os apelidos
  durante o import (`.xlsx` e `.json`).
- `_pruneMatriculaAliases()` — `app.js:766`. Um apelido nunca sobrescreve uma
  matrícula real: ao fim de cada import há uma varredura que descarta colisões
  (se `12345` for a matrícula real de outro aluno, o apelido cai fora).
- `matriculaAliases` é persistido no `localStorage`, na chave
  `studentData_matriculaAliases` (`app.js:233`).
- Passaram a resolver a matrícula lida: `registerEvent` (`app.js:1117`),
  `removeEventByMatricula` (`app.js:1203`) e `getStudentName`.
- `index.html`: os dois campos de matrícula deixaram de ser `type="number"` e
  viraram `type="text" inputmode="numeric"` (linhas 28 e 135). Um `input`
  numérico **descarta** um valor com hífen, então `1234-5` nunca chegava ao JS.
  O teclado numérico no celular continua aparecendo.

**Efeito colateral necessário:** é preciso **recarregar a lista de alunos** uma
vez para os apelidos serem criados. Dados que já estavam no `localStorage` não os
têm.

---

## 2. Ciclo entrada → saída → releitura

**Regra pedida.**

| leitura da matrícula | status  | ocupação da sala | permanência registrada    |
|----------------------|---------|------------------|---------------------------|
| 1ª                   | Entrada | **+1**           | —                         |
| 2ª                   | Saída   | **−1**           | 2ª leitura − entrada      |
| 3ª, 4ª, …            | Saída   | **inalterada**   | última leitura − entrada  |

Ou seja, a partir da segunda saída a leitura apenas **corrige** o tempo já
registrado; não mexe na contagem de ocupação.

**O que foi feito.**

- Novo `currentSession.exitedStudents` — `app.js:143`. Guarda o registro de
  entrada de quem já saiu, para a releitura conseguir recalcular o tempo a partir
  da entrada **original**. Persistido no `localStorage`.
- `registerEvent` passou a decidir por três casos em vez de dois (`app.js:1117`):
  aluno ativo → saída com `−1`; aluno que já saiu → saída revisada sem mexer na
  ocupação (observação `Saída revisada`); nenhum dos dois → entrada.
- **A saída agora sempre libera a vaga**, qualquer que seja o tempo. Antes, saída
  com menos de 45 min não descontava da ocupação **e deixava o aluno em
  `activeStudents` para sempre** — toda leitura seguinte dele era outra "saída"
  e a sala nunca esvaziava. O tempo mínimo continua valendo para a cor do display
  (vermelho abaixo de 45, verde acima).
- A ocupação passou a ser sempre `activeStudents.size`, em vez de um contador
  incrementado à parte que podia divergir do estado real.
- Removido o bloco do código 900250 que fazia um segundo `currentOccupancy--` —
  com a nova regra ele levaria a ocupação a ficar negativa.
- `_rebuildStateFromLog()` — `app.js:1084`. Centraliza a reconstrução do estado a
  partir do `eventLog`. `undoLastAction` e `removeEventByMatricula` passaram a
  usá-la; antes cada um tinha sua própria lógica, e ambas divergiam de
  `registerEvent` (tratavam toda `saida` como saída efetiva, o que apagava da sala
  alunos cuja saída tinha sido recusada por tempo insuficiente).
- `removeEventByMatricula` também deixou de dar falso positivo: o retorno
  comparava `activeStudents.size` depois de uma reconstrução que já divergia.
- **Resumo de permanência** (`_generateSessionSummary`, `app.js:425`): passou a
  contar `última saída − primeira entrada`. Antes somava pares entrada/saída e
  descartava a 2ª saída em diante — justamente a correção que a releitura faz.
  Com isso também sumiu um **duplo cômputo**: um aluno cuja saída tinha sido
  recusada continuava em `activeStudents`, então ganhava o par entrada/saída
  *mais* o tempo até o fim da sessão. A matrícula do resumo passou a vir da chave
  do Map (antes saía `undefined` quando o log do aluno começava por uma saída).

**Consequência a ter em mente:** não há reentrada na mesma sessão. Depois que o
aluno sai, toda leitura dele é saída revisada. Se ele sair e voltar de fato, o
tempo passa a incluir o intervalo fora da sala — nesse caso, **logo depois** da
leitura do retorno, use o código 900112 (item 4).

---

## 3. Coluna "Observação" fora da tela

A observação é registrada **apenas no arquivo de log**, não na tabela da tela.

- `app.js:1871` — `fields` sem `"Observacao"`.
- `index.html` — `<th>Observação</th>` removido e o `colspan` do cabeçalho
  "Informações do Aluno" baixado de `7` para `6` (`index.html:110`).

A observação continua saindo na coluna *Observação* do CSV de log:
`Entrada anterior anulada`, `Entrada (sem registro anterior para anular)`,
`Não estudou`, `Saída revisada` e
`Tempo ajustado para 46 min (saída lida às HH:MM:SS)`.

---

## 4. Código 900112 — anular a entrada anterior

**Para que serve.** O aluno marcou entrada, saiu da sala sem registrar e só voltou
depois. A leitura do retorno vira "saída" e creditaria a ele todo o tempo em que
esteve **fora**. O 900112 descarta os registros anteriores daquele aluno e faz da
leitura recém-realizada a **nova entrada**, para o tempo começar a contar do
retorno.

**Ordem de uso — o 900112 é lido DEPOIS do crachá.** Ao contrário dos outros
códigos especiais, ele não arma nada para a próxima leitura: ele **conserta a
leitura que acabou de acontecer**. O operador vê o erro na tela e corrige.

```
Aluno entrou 08:00, saiu sem registrar, volta 08:40.

  1. aluno lê     100001   ->  grava SAÍDA (40 min)   [errado]
  2. operador lê  900112   ->  apaga a entrada das 08:00
                               converte a leitura das 08:40 em ENTRADA

Saindo às 09:30  ->  permanência 50 min, não 90.
```

**O que foi feito.**

- `convertLastReadingToEntry()` — `app.js:1024`. Pega o **último** evento do
  `eventLog`, descarta todos os eventos anteriores daquela matrícula e converte
  esse último em `tipo: "entrada"`, com `permanencia` zerada, sem
  `entradaOriginal` e com a observação `Entrada anterior anulada` no CSV.
- A ocupação é recalculada por `_rebuildStateFromLog()`: quem já estava na sala
  **continua contando 1** (sai a entrada velha, entra a nova, saldo zero). Se o
  aluno **já tinha saído** de verdade, ele volta a ocupar vaga e o cronômetro
  zera.
- O 900112 deixou de ser uma ação pendente: na tabela de códigos a ação mudou de
  `cancelEntry` para `newEntry` (`app.js:88`) e o `handleSpecialCode` chama o
  método direto (`app.js:921`), em vez de setar `this.pendingAction`.
- O ramo `cancelEntry` de `registerEvent` foi removido — ele era morto de duas
  maneiras: setava `shouldUpdateOccupancy = false` mas seguia para o ramo de
  entrada contando a vaga; e o `false` nem escondia o número, porque
  `_updateUIForCurrentSession()` reescreve o display de ocupação logo em seguida,
  incondicionalmente.
- Se **não houver registro anterior** daquele aluno, a leitura continua sendo uma
  entrada, com a observação `Entrada (sem registro anterior para anular)` no
  arquivo, para ficar registrado que o código foi usado à toa. Ler o 900112 duas
  vezes seguidas cai nesse caso e é inofensivo.
- Com a **sessão vazia** o código devolve `status: 'Erro'` e não altera nada.
- Feedback na tela (`app.js:1561`): novo status `Nova Entrada`, em verde, com o
  primeiro nome do aluno — o operador confirma na hora que a correção pegou o
  aluno certo. Também ganhou um ramo para `status: 'Erro'`, em vermelho, que
  antes não existia (a mensagem de erro do 900300 não aparecia na tela).

---

## 5. Estrutura do `index.html` — `</div>` sobrando

**Problema.** Havia um `</div>` a mais (28 aberturas, 29 fechamentos). Ele fechava
`.presence-layout` logo depois da primeira linha, e o `</div>` seguinte acabava
fechando o `container-fluid` cedo demais. Na prática:

- relógio, botões, tabela, campo "Remover 1ª entrada" e o aviso de tempo mínimo
  ficavam **fora** do `container-fluid`, sem o padding lateral do Bootstrap;
- as regras `.presence-layout .row`, `.presence-layout .alert` e
  `.presence-layout .mb-2` do `style.css` só pegavam a primeira linha;
- o `@media (min-width: 992px)` que faz o `.presence-layout` virar um flex de três
  faixas (`presence-info-section` flex 2, `presence-clock-section` flex 1,
  `presence-table-section` flex 1) só tinha **um** filho para distribuir.

**O que foi feito.** Removido o `</div>` sobrando (era a linha 47). Agora:

- `.presence-layout` abre na linha 22 e fecha na **linha 128**, envolvendo as três
  faixas que o CSS espera;
- `container-fluid` fecha na **linha 153**, logo antes do `<footer>`;
- a contagem fecha em 28/28.

> **Confira na tela da sala.** Esta é a única mudança com efeito visual. As regras
> de espaçamento e o flex de três faixas passam a valer de fato — o relógio e o
> bloco de informações da sessão ficam com padding menor, e as alturas das faixas
> passam a ser distribuídas. Se algo ficar apertado, o ajuste agora é no
> `style.css`, não na estrutura.

Aproveitado o mesmo passe: `colspan="7"` → `colspan="6"` (item 3).

---

## 6. Código 900260 — corrigir o tempo para o mínimo + 1

**Para que serve.** Subir a permanência de um aluno que ficou abaixo do tempo
mínimo para **45 + 1 = 46 min**, deixando o registro válido.

**Regra.** Vale **somente para quem ficou abaixo do tempo mínimo**. Quem já estava
em 45 ou mais é preservado — o código nunca **baixa** um tempo.

| permanência real | depois do 900260 |
|------------------|------------------|
| 30 min           | **46 min**       |
| 44 min           | **46 min**       |
| 45 min           | 45 min (preservado) |
| 50 min           | 50 min (preservado) |

**Ordem de uso — o 900260 é lido DEPOIS do crachá**, igual ao 900112: ele corrige
a leitura que acabou de acontecer.

**O que estava errado antes.**

1. **A ordem era invertida.** Ele armava uma ação pendente e corrigia o aluno
   **seguinte** — a tela dizia "Próximo aluno terá tempo estendido". Lido depois
   do crachá, não fazia nada.
2. **Não chegava ao resumo.** O código mexia só no campo `permanencia` do evento,
   mas o `_generateSessionSummary` calcula tudo a partir dos **timestamps** e
   nunca lê esse campo. Resultado medido: log e tela diziam 46, e o
   `resumo_permanencia_*.csv` — que é o que vale para a nota — continuava
   dizendo 30.
3. **Não fazia nada sobre uma entrada**, mas gravava a observação assim mesmo,
   deixando no CSV o registro de um ajuste que não aconteceu.
4. A fronteira era `permanencia < 46`, não `< 45`: um aluno com 45,5 min era
   "corrigido" para 46, ou seja, **baixava** o tempo dele.

**O que foi feito.**

- `adjustLastReadingTime()` — `app.js:956`. Pega o **último** evento do
  `eventLog`, localiza a entrada correspondente e compara com `minStayTime`.
- **O ajuste é feito no `timestamp` da saída** (entrada + 46 min), e não só no
  campo `permanencia`. Assim log, tela e resumo contam a mesma coisa, sem
  exceção nenhuma no cálculo do resumo. O campo `hora` acompanha o novo
  timestamp.
- **Em troca, a hora de saída gravada deixa de ser a hora real do bipe** — e a
  hora real fica registrada na observação do CSV:
  `Tempo ajustado para 46 min (saída lida às 08:30:00)`.
- Observação preexistente é **preservada e concatenada**, não sobrescrita:
  `Não estudou; Tempo ajustado para 46 min (saída lida às 08:30:00)`.
- `_findEntryEventFor(saidaEvent)` — `app.js:1001`. Varre o log de trás para
  frente procurando a última entrada daquele aluno.
- Na tabela de códigos a ação mudou de `extendTime` para `adjustTime`
  (`app.js:89`), e o ramo `extendTime` de `registerEvent` — que fazia o
  `Math.max` — foi removido.
- Feedback na tela (`app.js:1557`): `Ajustado: 46.00 min` + primeiro nome, em
  verde. Quando não há o que ajustar, `Sem ajuste: 50.00 min` + nome, em
  **laranja** (status `Aviso`), para o operador ver que o código foi lido e por
  que não surtiu efeito.
- Usos inválidos devolvem `Erro` em vermelho e não alteram nada: sessão vazia, ou
  última leitura sendo uma entrada.

**Consequência a ter em mente — se o aluno bipar de novo depois do ajuste.** A
releitura grava uma saída revisada com o tempo real do relógio (regra do item 2),
e a tela mostra esse tempo real. O **resumo**, porém, fica com o maior timestamp
entre as duas saídas — e a saída ajustada está "no futuro", às 08:46. Medido:

| rebipa às | tela mostra | resumo fica com |
|-----------|-------------|-----------------|
| 08:35     | 35 min      | **46 min**      |
| 08:45     | 45 min      | **46 min**      |
| 08:46     | 46 min      | 46 min          |
| 09:00     | 60 min      | **60 min**      |

Ou seja: o ajuste **resiste** a uma releitura feita antes das 08:46 (o resumo
mantém 46, mesmo com a tela mostrando 35 em vermelho), e é **substituído** por uma
releitura feita depois disso, que é o comportamento desejável — o aluno de fato
ficou mais tempo. O ponto de atenção é só o susto na tela: ela mostra o tempo
real, não o ajustado. Na dúvida, o 900260 pode ser lido de novo.

---

## 7. Código 900250 — ajustar o tempo mínimo da sessão

**Para que serve.** Mudar o tempo mínimo de permanência **da sessão em curso**,
com confirmação. A próxima sessão volta ao padrão de 45 min.

**O que estava errado antes.** O código não ajustava nada. `minStayTime` era um
campo fixo em 45 que nunca era reatribuído; o 900250 apenas armava uma ação
pendente que marcava a saída seguinte como válida, e o display "Tempo Mínimo: 45"
nunca mudava. (Esse bloco já tinha sido removido no item 2, porque com a nova
regra de ocupação ele causaria contagem negativa.)

**Fluxo na sala.**

```
  operador lê  900250
     ↓
  [caixa 1] "Digite o novo tempo mínimo, em minutos:"   (já preenchida com o atual)
     ↓
  [caixa 2] "Tempo mínimo: 45 → 60 minutos. Confirma?"
     ↓
  display "Mínimo: 60 min / AJUSTADO"  e o rodapé da tela passa a mostrar 60
```

Cancelar em qualquer uma das caixas não muda nada, e a tela avisa
(`CANCELADO`, em laranja). Valor inválido gera um alerta explicando o formato e
o display mostra `INVÁLIDO`, em vermelho. Digitar o valor que já está em uso
avisa e mostra `SEM MUDANÇA`.

**O que foi feito.**

- `minStayTime` deixou de ser um campo solto e virou um **getter**
  (`app.js:156`) que lê `currentSession.minStayTime`. Não há duas cópias podendo
  divergir, e o valor é persistido junto com a sessão, sobrevivendo a um F5.
- `this.defaultMinStayTime = 45` (`app.js:94`) é o padrão de cada sessão nova.
  Sessão salva por uma versão antiga, sem o campo, cai no padrão.
- `setMinStayTime(valor)` — `app.js:165`. **A validação ficou aqui, no
  `StudentDataManager`, e não na caixa de diálogo**, para poder ser testada sem
  navegador. Aceita inteiro de 1 a 600; recusa 0, negativo, fracionário, texto e
  vazio, devolvendo `false` sem alterar nada.
- `handleSpecialCode` (`app.js:931`) devolve `status: 'Ajustar Mínimo'` — um
  pedido para a camada de tela, não uma ação executada. Assim o
  `StudentDataManager` continua sem depender de `prompt`/`confirm`.
- `App._promptNovoTempoMinimo()` — `app.js:1586`. É quem pergunta, confirma e
  avisa. O `handleMatriculaChange` desvia para ele (`app.js:1537`) antes do fluxo
  normal de exibição, porque este código abre caixa de diálogo em vez de
  registrar evento.
- A caixa de confirmação diz o que a mudança afeta: vale só para esta sessão;
  muda a cor do display nas próximas saídas; muda o alvo do 900260 (passa a
  ajustar para `novo + 1`); e **os registros já feitos não são recalculados**.
- O rodapé do CSV — tanto do log quanto do resumo — passou a trazer
  `<data> - Tempo mínimo: 60 min`, para o arquivo dizer sob qual critério aquela
  sessão foi avaliada.

**Consequência a ter em mente:** mudar o mínimo no meio da sessão deixa os
registros anteriores com o critério antigo. Quem saiu com 50 min antes da mudança
para 60 continua gravado com 50, e o arquivo não distingue quem foi avaliado por
qual critério — só registra o valor final no rodapé. O ideal é ajustar o mínimo
**no começo da sessão**.

---

## 8. Etiqueta da disciplina no nome dos arquivos

**Para que serve.** A mesma instalação atende **duas disciplinas**. Sem nada que
as distinga, os arquivos de log e de resumo saíam com nomes intercambiáveis e só
o `session_<timestamp>` separava um do outro.

**Regra.** As **7 primeiras letras do arquivo usado para subir a lista de alunos**
viram uma etiqueta, colocada **na frente** do nome do arquivo — assim os arquivos
das duas disciplinas ficam agrupados quando a pasta é ordenada por nome.

| arquivo da lista carregado | etiqueta |
|----------------------------|----------|
| `QUI112 - 04set25-matriculas.csv` | `QUI112` |
| `BIO231-turma A.xlsx`             | `BIO231` |
| `courseid_28451_11abr26.json`     | `coursei` |
| `Química Geral.xlsx`              | `Quimica` |

```
QUI112_log_eventos_sessao_session_1789567147000_2026-09-16_11-49-07.csv
QUI112_resumo_permanencia_sessao_session_1789567147000_2026-09-16_11-49-07.csv
```

Sem lista carregada, o nome sai como antes, sem etiqueta e sem `_` solto na
frente.

**O que foi feito.**

- `_buildListTag(fileName)` — `app.js:786`. Tira a extensão, corta em 7
  caracteres e **só então** limpa: acentos são removidos (`Química` → `Quimica`)
  e o que não for letra ou número vira `_`, que é aparado das pontas. A ordem
  importa: cortar depois de limpar daria `QUI1120` para
  `QUI112 - 04set25...`, porque o `112` e o `04` se juntariam.
- `setStudentListName(fileName)` — `app.js:797`. Guarda a etiqueta em
  `this.listaTag`, carimba em `currentSession.listaTag` e persiste em
  `studentData_listaTag`. Chamada pelos dois loaders, que passaram a receber o
  nome do arquivo (`app.js:478` e `app.js:517`); quem passa é o `App._openFile`,
  a partir de `file.name`.
- `_buildFileName(prefixo, session)` — `app.js:816`. Centraliza a montagem dos
  três nomes de arquivo, que antes eram três blocos repetidos de `pad`/`now`.
- **A etiqueta vive na sessão**, não só no manager. Uma sessão arquivada
  exportada mais tarde sai com a etiqueta **dela**, mesmo que a instalação já
  esteja em outra disciplina.

**Defeito encontrado pelos testes e corrigido junto.** O `endCurrentSession`
montava o objeto arquivado com apenas 5 campos, descartando `minStayTime` e
`listaTag`. Uma sessão arquivada da QUI112 exportada depois de carregar a lista
de BIO231 sairia com a etiqueta e o tempo mínimo errados. Os dois campos passaram
a ser copiados (`app.js:405`).

**Meia pendência resolvida de lambuja (era a nº 6).** `saveEventLog` passou a
receber a sessão (`app.js:1250`, com `this.currentSession` como padrão), e
`exportArchivedSessionLog` passa a sessão arquivada. Antes, o nome do arquivo, a
data do rodapé e o tempo mínimo vinham todos da sessão **atual**, enquanto o
conteúdo era de outra. O `exportArchivedSessionSummary` também passou a trazer o
tempo mínimo daquela sessão no rodapé.

**Atenção operacional:** a etiqueta é gravada quando a **lista é carregada**. Ao
trocar de disciplina, carregue a lista nova **antes** de começar a sessão — do
contrário os arquivos sairão com a etiqueta da disciplina anterior.

---

## 9. Carregar a lista de alunos em `.csv`

**Problema.** O botão aceitava só `.xlsx/.xls/.json`, mas o Moodle exporta em
`.csv` — e é justamente de lá que vêm as matrículas com hífen dos servidores
(item 1). Era preciso abrir no Excel e salvar como `.xlsx` antes de cada uso.

**O que foi feito.**

- `input.accept` passou a `.xlsx,.xls,.json,.csv`, e o rótulo do botão no
  `index.html` virou "Carregar Lista Alunos (.csv/.xlsx/.json)".
- `_parseCsv(text, separador)` — `app.js:574`. Parser próprio, em vez de passar o
  texto pelo SheetJS: o SheetJS faz inferência de tipo e `1234-5` correria o
  risco de virar data. Trata BOM, aspas, `""` escapado, CRLF e **vírgula dentro
  de campo entre aspas** — o export traz `"SILVA SANTOS"` entre aspas, e há
  sobrenomes com vírgula.
- `_detectCsvSeparator(text)` — `app.js:564`. O Moodle usa vírgula, mas o Excel
  em pt-BR salva com ponto e vírgula. Decide pela primeira linha, ignorando o que
  está entre aspas. Sem isso, um arquivo com `;` viraria uma coluna só e a lista
  carregaria vazia, em silêncio.
- `_mapCsvColumns(cabecalho)` — `app.js:627`. Acha as colunas pelo **cabeçalho**
  (`Nome`, `Sobrenome`, `Número de identificação`), tolerando acento e ordem
  trocada; cabeçalho não reconhecido cai nas três primeiras colunas, como no
  `.xlsx`. Detalhe: `nome` é buscado por **igualdade**, porque `sobrenome`
  também contém "nome".
- `loadStudentNamesFromCsv(csvContent, fileName)` — `app.js:657`. Daí para a
  frente é o mesmo caminho dos outros dois formatos: normalização da matrícula,
  apelidos do dígito verificador, varredura de colisões e etiqueta da disciplina.

**Acentos: o CSV do Excel não é UTF-8.** O export do Moodle vem em UTF-8 com BOM,
mas um arquivo reaberto e salvo pelo Excel como "CSV separado por vírgulas" sai em
ANSI (windows-1252). Lido como UTF-8, `JOÃO` viraria `JO�O` — e esse lixo iria
parar no log. O `_openFile` (`app.js:1453`) detecta o caractere de substituição
`�` no texto decodificado e **relê o arquivo em windows-1252**.

**Botão mais informativo.** `_marcarListaCarregada()` (`app.js:1517`) substituiu o
texto fixo "Lista de Alunos Carregada" por `Lista Carregada: 412 alunos (QUI112)`
— confirma de uma vez que o arquivo foi entendido, quantos alunos entraram e qual
disciplina será usada no nome dos arquivos. Se nada for reconhecido, o botão fica
vermelho com "Lista não reconhecida — tente outro arquivo", em vez de ficar verde
mentindo.

Arquivo vazio, só com cabeçalho ou só com linhas em branco **não apaga a lista já
carregada** nem troca a etiqueta: o loader sai sem alterar nada.

---

## 10. Sessões arquivadas: descarte, acesso e gravação

**Contexto.** "Finalizar Sessão" **arquiva**, não apaga: a sessão continua no
`localStorage` por 60 dias (`logRetentionPeriod`). Isso é proposital — se o
navegador fechar ou faltar luz no meio da aula, a sessão em andamento é
recuperada, inclusive quem está na sala e há quanto tempo. Mas três coisas em
volta disso estavam ruins.

### 10.1 Sessão vazia não vira arquivo

Toda vez que uma sessão era aberta e fechada sem nenhuma leitura, ela era
arquivada assim mesmo. Abrir o sistema para testar já deixava lixo no histórico.

`endCurrentSession` (`app.js:383`) agora, com `eventLog` vazio, **descarta**: tira
a chave do `localStorage` e não empurra para `archivedSessions`.

### 10.2 Botão "Sessões Anteriores"

Os métodos `exportArchivedSessionLog` e `exportArchivedSessionSummary` existiam e
funcionavam, mas **nenhum botão os chamava** — o arquivo guardado só era
alcançável pelo console do navegador. Na prática, inacessível.

- Botão novo no `index.html` (`archived-sessions-button`), abrindo um modal do
  Bootstrap (`archived-sessions-modal`) — não ocupa espaço na tela da sala.
- `getArchivedSessionsList()` (`app.js:1337`) foi reescrito para alimentar a
  tabela: disciplina, data, início, duração, **alunos distintos**, eventos e o
  tempo mínimo daquela sessão, da mais recente para a mais antiga.
- `renderArchivedSessions()` (`app.js:1708`) monta a tabela na abertura do modal,
  para a lista nunca estar desatualizada; `handleArchivedSessionAction()`
  (`app.js:1760`) trata os cliques por delegação, já que as linhas são recriadas.
- Cada linha tem **Log**, **Resumo** e **Apagar**. O apagar (`deleteArchivedSession`,
  `app.js:1364`) pede confirmação nomeando a aula (disciplina, data, hora, número
  de alunos) e avisando que não há volta e que convém baixar antes.
- `_escaparHtml()` (`app.js:1840`) escapa o que vai para `innerHTML` nessa tabela.

### 10.3 Gravação deixou de ser O(n)

`_saveToLocalStorage` reserializava **todas** as sessões arquivadas a cada leitura
do código de barras. Como elas não mudam mais depois de arquivadas, isso era puro
desperdício, crescendo ao longo dos 60 dias de retenção.

- O laço saiu. Cada sessão arquivada é gravada **uma vez**, em `endCurrentSession`.
- `_saveCurrentSession()` (`app.js:208`) grava só a sessão atual, e passou a ser o
  caminho de `registerEvent`, `adjustLastReadingTime`, `convertLastReadingToEntry`,
  `undoLastAction`, `removeEventByMatricula` e `setMinStayTime`. Lista de alunos,
  apelidos e histórico não mudam a cada bipe.
- Medido com 20 sessões arquivadas: um bipe grava **1 chave, 462 bytes**. Antes,
  as 21 sessões inteiras mais a lista de alunos.
- A migração do formato legado grava as arquivadas uma vez, já que não conta mais
  com o laço.

### Dois ajustes que vieram junto

**`_criarSessao(id, startTime)`** (`app.js:137`) — havia **três literais de sessão
idênticos** (construtor, `startNewSession`, `endCurrentSession`). Cada campo novo
(`exitedStudents`, `minStayTime`, `listaTag`) teve de ser acrescentado nos três, e
bastava esquecer um para o estado divergir. Agora é um molde só.

**`_gerarIdDeSessao(now)`** (`app.js:115`) — o id vem do relógio, então uma sessão
aberta e fechada no mesmo milissegundo receberia o id da anterior. Na prática isso
só acontece com sessão vazia, que agora é descartada, mas o id passa a ser
empurrado para a frente até ser inédito, para dois arquivos nunca citarem a mesma
sessão.

---

## 11. Trocar a lista no meio da sessão realinha os nomes

**Problema.** O nome é copiado para **dentro do evento** no instante do bipe
(`registerEvent`), e tabela, resumo e CSV leem esse campo copiado, não a lista.
Um aluno que bipasse antes da lista certa estar carregada ficava gravado como
`null` para sempre — carregar a lista um minuto depois não consertava nada. No
CSV saía a linha `1,999999,"null",...`.

**Regra adotada (modo completo).** Ao carregar uma lista, a **sessão em
andamento** é realinhada: cada evento recebe o melhor nome que a lista atual
conhece. O histórico arquivado não é reescrito — ele guarda o nome da época.

```
com a lista A:                  depois de subir a lista B:
   100001 -> MARIA SILVA          100001 -> MARIA SILVA CORRIGIDO
   999999 -> Sem nome              999999 -> JOAO DA SILVA
```

**O que foi feito.**

- `_refreshSessionNames()` — `app.js:870`. Percorre o `eventLog` da sessão atual
  e atualiza os nomes; acerta também os registros de `activeStudents` e
  `exitedStudents`. Chamado ao fim dos três loaders (`.csv`, `.xlsx`, `.json`).
- **A matrícula também é reresolvida.** Os apelidos do dígito verificador só
  passam a existir depois do import: um servidor que bipou `12345` **antes** da
  lista ficava gravado assim, e o bipe seguinte de `1234` seria tratado como
  outra pessoa — uma entrada nova em vez da saída. Agora a matrícula vira a
  canônica e, se alguma mudar de forma, o estado é reconstruído por
  `_rebuildStateFromLog()`, então a ocupação não duplica.
- **Nunca apaga um nome que já existe.** Se a lista nova não tiver aquele aluno,
  o nome anterior é mantido.

**`"Sem nome"` em vez de `null`** (era a pendência nº 8). Por dentro o campo
continua `null` — é assim que se distingue "aluno desconhecido" de alguém
chamado "Sem nome", e é o que permite o realinhamento saber o que preencher. A
troca acontece na saída: tabela da tela, resumo e CSV de log.

**Duas coisas que continuam valendo a pena saber:**

- **A lista nova se soma à anterior**, não a substitui. Depois de subir a lista da
  BIO231, os alunos da QUI112 continuam sendo reconhecidos. É uma rede de
  segurança, mas significa que uma disciplina **aceita** o crachá da outra.
  Matrícula repetida nas duas listas fica com a grafia da mais recente.
- **A etiqueta do arquivo troca na hora.** Carregar outra lista no meio da sessão
  faz o log inteiro — inclusive os bipes anteriores — sair com a etiqueta nova.

---

## 12. Apagar as listas de alunos, e botão sem contagem

**Por que as duas coisas andam juntas.** Os carregamentos de lista **se somam**
num mapa único (`studentNames`), que nunca era esvaziado e não tem prazo de
validade — ao contrário das sessões, que expiram em 60 dias. Numa instalação que
atende duas disciplinas, isso significa que um crachá da QUI112 é reconhecido
numa sessão da QUI318. Enquanto essa mistura for aceita na prática, faltavam duas
coisas: poder zerar quando se quiser, e não exibir um número que engana.

### 12.1 "Apagar listas de alunos"

Seção nova no rodapé do modal **Sessões Anteriores**, separada por uma linha. Ela
mostra o estado antes de agir:

```
412 aluno(s) reconhecidos · 2 apelido(s) de matrícula · última lista: QUI318.
As listas carregadas se somam, de todas as disciplinas — apagar remove todas de
uma vez.
```

- `getStudentListInfo()` (`app.js:826`) devolve total, apelidos e etiqueta;
  `renderStudentListInfo()` (`app.js:1739`) escreve a linha, junto com a tabela.
- `clearStudentNames()` (`app.js:843`) limpa `studentNames`, `matriculaAliases` e
  `listaTag`, e devolve quantos foram removidos.
- `handleClearStudentList()` (`app.js:1804`) confirma antes, dizendo quantos
  alunos de **todas** as disciplinas serão removidos, e devolve o botão de
  carregar ao estado inicial (vermelho) depois.

**O que a limpeza NÃO afeta** — e é o ponto que importa:

| | |
|---|---|
| Nomes já gravados nos eventos | **preservados** (foram copiados no bipe) |
| Tabela e resumo da sessão atual | **preservados** |
| Etiqueta da sessão em andamento | **preservada** — o arquivo dela continua saindo `QUI112_...` |
| Histórico arquivado | **intacto**, com nomes e etiqueta da época |

Depois de apagar, os próximos bipes saem como `Sem nome` — e recarregar a lista
recupera os nomes, pelo realinhamento do item 11.

### 12.2 Botão sem a contagem

`_marcarListaCarregada()` (`app.js:1517`) mostrava `Lista Carregada: 412 alunos
(QUI112)`. Como `studentNames` é a soma de todas as listas já carregadas, esse
número não diz quantos alunos tem a disciplina que acabou de ser aberta — dizia
quantos o sistema conhece ao todo, o que confunde mais do que informa.

Agora o botão mostra só **`Lista Carregada: QUI112`**. A contagem continua
disponível, no lugar certo: a seção de lista dentro do modal, onde vem com a
explicação de que é uma soma.

---

## Testes

Em `testes/`, o `harness.js` roda o `StudentDataManager` em Node com relógio
simulado e `localStorage` de mentira, sem precisar de navegador:

```
node testes/teste_fluxo.js           # 47 verificações
node testes/teste_matricula.js       # 50 verificações
node testes/teste_codigo_900112.js   # 58 verificações
node testes/teste_codigo_900260.js   # 52 verificações
node testes/teste_codigo_900250.js   # 38 verificações
node testes/teste_nome_arquivo.js    # 32 verificações
node testes/teste_lista_csv.js       # 44 verificações
node testes/teste_sessoes_arquivadas.js  # 46 verificações
node testes/teste_troca_lista.js     # 35 verificações
node testes/teste_limpar_lista.js    # 35 verificações
```

- `teste_fluxo.js` — entrada → saída → releituras com tempos 50/70/85 min;
  permanência curta de 10 min liberando a vaga; dois alunos simultâneos
  (releitura de um não mexe no outro); desfazer (900300); remover matrícula;
  resumo batendo 85 min; round-trip do `localStorage`.
- `teste_matricula.js` — a tabela de formas canônicas; import da amostra real do
  `QUI112 - 04set25-matriculas.csv` (`ES100001`, `1234-5`, `4321-2`, `5678-X`);
  leitura pelo apelido `12345` registrando `1234`; apelido em conflito sendo
  descartado; códigos especiais não afetados pela normalização.
- `teste_codigo_900112.js` — o cenário do item 4 (50 min, não 90); isolamento dos
  outros alunos na sala; uso depois que o aluno já tinha saído de verdade; uso sem
  registro anterior; uso com a sessão vazia; 900112 duas vezes seguidas; correção
  em matrícula de servidor lida com dígito verificador; 900150, 900260 e 900300
  sem regressão.
- `teste_codigo_900260.js` — 30 min virando 46; **o resumo passando a enxergar o
  ajuste** (antes 30, depois 46); preservação de quem está acima do mínimo; a
  fronteira exata dos 45 min (45 preserva, 44 ajusta); concatenação da observação
  preexistente; ajuste sobre uma saída revisada; usos inválidos; isolamento dos
  outros alunos; 900260 duas vezes seguidas; desfazer depois do ajuste.
- `teste_codigo_900250.js` — o código devolvendo o pedido em vez de agir sozinho;
  a tabela de valores aceitos e recusados; escopo por sessão (sessão nova volta a
  45); round-trip do `localStorage`, inclusive sessão antiga sem o campo; efeito
  sobre a cor do display e sobre o alvo do 900260; registros antigos não
  recalculados; o mínimo saindo no rodapé dos dois CSVs.
- `teste_nome_arquivo.js` — a tabela de etiquetas, com acento, sem extensão e com
  nome só de símbolos; o nome dos dois arquivos de saída; duas disciplinas na
  mesma instalação agrupando ao ordenar; sessão arquivada saindo com a etiqueta e
  o tempo mínimo **dela**; ausência de lista mantendo o nome antigo; round-trip do
  `localStorage`.
- `teste_lista_csv.js` — detecção de separador; o parser (aspas, vírgula dentro de
  aspas, `""` escapado, BOM, CRLF, linha em branco); mapeamento de colunas por
  cabeçalho e o fallback 0/1/2; **import do `QUI112 - 04set25-matriculas.csv`
  real**, conferindo os servidores `1234-5` e `4321-2` pelas duas formas de
  leitura, acentos e o cabeçalho não virando aluno; CSV do Excel com `;`;
  arquivos problemáticos não apagando a lista.
- `teste_sessoes_arquivadas.js` — sessão vazia sendo descartada; abrir/fechar cinco
  vezes sem acumular lixo; a listagem para a tela (ordem, alunos distintos, tempo
  mínimo da sessão); apagar, inclusive id inexistente e tentativa de apagar a
  sessão atual; **um bipe gravando uma única chave** mesmo com três sessões
  arquivadas; e o histórico continuando legível e exportável depois do F5.
- `teste_troca_lista.js` — aluno que bipou antes da lista ganhando nome; lista
  corrigida no meio da sessão (entrada, saída, resumo); **servidor que bipou
  `12345` antes da lista**, com a matrícula virando canônica e o bipe seguinte
  sendo saída em vez de entrada nova; a lista nova somando-se à anterior; aluno
  fora de qualquer lista saindo como `Sem nome` no CSV; histórico arquivado não
  sendo reescrito.
- `teste_limpar_lista.js` — o resumo mostrado antes de apagar; a limpeza de nomes,
  apelidos e etiqueta, inclusive no `localStorage`; **o que NÃO se perde** (nomes
  já registrados, etiqueta da sessão, nome do arquivo, histórico arquivado);
  bipar depois de apagar saindo como `Sem nome` e o nome voltando ao recarregar
  a lista.

Dois detalhes revelados pelos testes e que vale conhecer:

- **Desfazer uma saída (900300) devolve o aluno à sala** — a ocupação volta a
  subir e a próxima leitura conta como a primeira saída de novo.
- No `harness.js`, use sempre `resumoDe(m)` para gerar o resumo, nunca
  `new Date()` dentro do arquivo de teste: o relógio simulado existe só dentro do
  sandbox, então `new Date()` fora dele devolve a hora real da máquina. O erro
  passa despercebido enquanto todos os alunos já saíram (o fim de sessão nem é
  consultado) e explode assim que houver um aluno ativo no resumo.

---

## Pendências conhecidas

Levantadas na análise e **ainda não corrigidas**:

1. **`_loadFromLocalStorage` apaga tudo em caso de erro** (`_clearManagedLocalStorage`
   no `catch`): um JSON corrompido perde a sessão em andamento, sem backup.
2. **Permanência dos alunos ativos não atualiza sozinha** — só quando alguém
   escaneia. Não há timer.
3. **CSV não escapa aspas** em nomes/observações, nem neutraliza `=`/`+`/`-` no
   início do campo (fórmula no Excel).
4. ~~Botão de carregar lista não aceita `.csv`~~ — **resolvido no item 9**.
5. ~~`_saveToLocalStorage` é O(n) a cada bipe~~ — **resolvido no item 10.3**.
   Continua valendo, porém, que um estouro de cota é só logado no console, sem
   aviso na tela.
6. ~~`exportArchivedSessionLog` gera arquivo com nome errado~~ — **resolvido no
   item 8**: `saveEventLog` passou a receber a sessão.
7. **Rótulo "Remover 1ª entrada" mente** — `removeEventByMatricula` apaga
   **todos** os eventos da matrícula, não a primeira entrada.
8. ~~Aluno fora da lista é gravado como `"null"` no CSV~~ — **resolvido no item 11**.
9. **Dados pessoais de alunos na pasta** (`.xlsx` e `.csv` com nome, matrícula e
   e-mail). Vale um `git init` + `.gitignore` antes de versionar.
10. **IDs de DOM inexistentes** — `DOMManager` procura `permanencia-display`,
    `nome-display` e `entrada-display`, que não existem no `index.html`: três
    `console.warn` no boot e `updateDisplay` sem efeito para eles.
11. **HTML inválido no rodapé** — `<h5>` e `<h6>` dentro de um `<p>`, que o
    navegador fecha sozinho. Também há um atributo `enabled` (não existe) nos
    botões de carregar lista e salvar log.
12. Chart.js é carregado e nunca usado; `_createTableRow` injeta o nome da
    planilha sem escape de HTML.
