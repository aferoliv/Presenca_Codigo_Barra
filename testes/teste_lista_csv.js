/**
 * Carregar a lista de alunos a partir do .csv exportado do Moodle.
 *
 *   node testes/teste_lista_csv.js
 */
const fs = require("fs");
const path = require("path");
const { criarManager, verificar, secao, resumo } = require("./harness");

// O arquivo de matrículas circula entre a pasta do projeto e a de cima;
// o teste procura nos dois lugares e se pula se não achar.
const CSV_REAL = [
  path.join(__dirname, "..", "QUI112 - 04set25-matriculas.csv"),
  path.join(__dirname, "..", "..", "QUI112 - 04set25-matriculas.csv"),
].find(p => fs.existsSync(p));

// ---------------------------------------------------------------------------
secao("Separador");
{
  const m = criarManager();
  verificar("virgula (Moodle)", m._detectCsvSeparator("Nome,Sobrenome,Numero\nA,B,C"), ",");
  verificar("ponto e virgula (Excel pt-BR)", m._detectCsvSeparator("Nome;Sobrenome;Numero\nA;B;C"), ";");
  verificar("ignora virgula dentro de aspas", m._detectCsvSeparator('Nome;"Sobre,nome";Numero'), ";");
  verificar("com BOM", m._detectCsvSeparator("﻿Nome,Sobrenome,Numero"), ",");
}

// ---------------------------------------------------------------------------
secao("Parser");
{
  const m = criarManager();

  verificar("linha simples", m._parseCsv("a,b,c", ","), [["a", "b", "c"]]);
  verificar("duas linhas", m._parseCsv("a,b\nc,d", ","), [["a", "b"], ["c", "d"]]);
  verificar("CRLF", m._parseCsv("a,b\r\nc,d", ","), [["a", "b"], ["c", "d"]]);
  verificar("BOM removido", m._parseCsv("﻿a,b", ","), [["a", "b"]]);
  verificar("campo entre aspas", m._parseCsv('a,"b c",d', ","), [["a", "b c", "d"]]);
  verificar("virgula dentro de aspas", m._parseCsv('a,"b,c",d', ","), [["a", "b,c", "d"]]);
  verificar("aspas escapadas", m._parseCsv('a,"diz ""oi""",c', ","), [["a", 'diz "oi"', "c"]]);
  verificar("campo vazio", m._parseCsv("a,,c", ","), [["a", "", "c"]]);
  verificar("linha em branco descartada", m._parseCsv("a,b\n\nc,d", ","), [["a", "b"], ["c", "d"]]);
  verificar("termina com quebra de linha", m._parseCsv("a,b\n", ","), [["a", "b"]]);
  verificar("ponto e virgula", m._parseCsv("a;b;c", ";"), [["a", "b", "c"]]);
}

// ---------------------------------------------------------------------------
secao("Colunas pelo cabecalho");
{
  const m = criarManager();

  const moodle = m._mapCsvColumns(["Nome", "Sobrenome", "Número de identificação", "Endereço de email", "Grupos"]);
  verificar("Moodle: nome", moodle.nome, 0);
  verificar("Moodle: sobrenome (nao confunde com 'nome')", moodle.sobrenome, 1);
  verificar("Moodle: matricula", moodle.matricula, 2);

  const trocado = m._mapCsvColumns(["Matrícula", "Nome", "Sobrenome"]);
  verificar("ordem trocada: matricula", trocado.matricula, 0);
  verificar("ordem trocada: nome", trocado.nome, 1);
  verificar("ordem trocada: sobrenome", trocado.sobrenome, 2);

  const desconhecido = m._mapCsvColumns(["col1", "col2", "col3"]);
  verificar("cabecalho nao reconhecido cai em 0/1/2",
    [desconhecido.nome, desconhecido.sobrenome, desconhecido.matricula], [0, 1, 2]);
}

// ---------------------------------------------------------------------------
secao("Import do CSV real do projeto");
{
  // Este bloco importa a lista de verdade, que NAO vai para o repositorio (ver
  // .gitignore). Por isso ele verifica PROPRIEDADES do resultado, nunca nomes ou
  // matriculas de alunos reais -- que nao devem aparecer no codigo-fonte.
  if (!CSV_REAL) {
    console.log("  (pulado: nenhuma lista de matriculas encontrada na pasta)");
  } else {
    const m = criarManager();
    m.loadStudentNamesFromCsv(fs.readFileSync(CSV_REAL, "utf8"), path.basename(CSV_REAL));

    const matriculas = Array.from(m.studentNames.keys());
    const nomes = Array.from(m.studentNames.values());

    verificar("carregou muitos alunos", m.studentNames.size > 300, true);
    verificar("etiqueta da disciplina", m.listaTag, "QUI112");

    // Toda matricula foi para a forma canonica: so digitos, sem ES e sem hifen
    verificar("matriculas so com digitos", matriculas.every(k => /^[0-9]+$/.test(k)), true);
    verificar("nenhuma com zero a esquerda", matriculas.some(k => /^0/.test(k)), false);

    // Servidores com digito verificador geraram apelido
    verificar("criou apelidos de matricula", m.matriculaAliases.size > 0, true);
    verificar("todo apelido aponta para um aluno existente",
      Array.from(m.matriculaAliases.values()).every(canonica => m.studentNames.has(canonica)), true);
    verificar("nenhum apelido colide com matricula real",
      Array.from(m.matriculaAliases.keys()).some(a => m.studentNames.has(a)), false);

    // O sobrenome vem entre aspas no arquivo; elas nao podem entrar no nome
    verificar("aspas nao entram no nome", nomes.some(n => n.includes('"')), false);
    verificar("nenhum nome vazio", nomes.some(n => !n.trim()), false);
    verificar("nome e sobrenome juntos", nomes.every(n => n.trim().includes(" ")), true);

    // Acentos preservados (arquivo em UTF-8, sem virar lixo)
    verificar("acentos preservados", nomes.some(n => /[ÁÂÃÉÊÍÓÔÕÚÇ]/.test(n)), true);
    verificar("sem caractere de substituicao", nomes.some(n => n.includes("�")), false);

    // O cabecalho nao virou aluno
    verificar("cabecalho nao virou aluno",
      nomes.some(n => n.toLowerCase().includes("sobrenome")), false);
  }
}

// ---------------------------------------------------------------------------
secao("CSV do Excel: ponto e virgula e sem aspas");
{
  const m = criarManager();
  const csv = [
    "Nome;Sobrenome;Número de identificação;Endereço de email;Grupos",
    "MARIA;SILVA SANTOS;ES100001;maria.santos@exemplo.br;T2",
    "PAULO;RIBEIRO SOUZA;1234-5;paulo.souza@exemplo.br;",
  ].join("\r\n");

  m.loadStudentNamesFromCsv(csv, "QUI112 turma.csv");
  verificar("dois alunos", m.studentNames.size, 2);
  verificar("aluno", m.getStudentName("100001"), "MARIA SILVA SANTOS");
  verificar("servidor", m.getStudentName("12345"), "PAULO RIBEIRO SOUZA");
  verificar("etiqueta", m.listaTag, "QUI112");
}

// ---------------------------------------------------------------------------
secao("Arquivos problematicos nao quebram nem apagam a lista");
{
  const m = criarManager();
  m.loadStudentNamesFromCsv("Nome,Sobrenome,Matrícula\nMARIA,ABREU,ES100001", "QUI112.csv");
  verificar("lista inicial", m.studentNames.size, 1);

  m.loadStudentNamesFromCsv("", "vazio.csv");
  verificar("CSV vazio nao altera nada", m.studentNames.size, 1);

  m.loadStudentNamesFromCsv("Nome,Sobrenome,Matrícula", "so_cabecalho.csv");
  verificar("so cabecalho nao altera nada", m.studentNames.size, 1);

  m.loadStudentNamesFromCsv("Nome,Sobrenome,Matrícula\n,,\n,,", "sem_dados.csv");
  verificar("linhas em branco nao alteram nada", m.studentNames.size, 1);

  verificar("etiqueta nao trocou por arquivo invalido", m.listaTag, "QUI112");
}

// ---------------------------------------------------------------------------
secao("Nome com virgula dentro de aspas");
{
  const m = criarManager();
  const csv = [
    'Nome,Sobrenome,"Número de identificação"',
    'MARIA,"DA SILVA, JUNIOR",ES111111',
  ].join("\n");

  m.loadStudentNamesFromCsv(csv, "teste.csv");
  verificar("um aluno", m.studentNames.size, 1);
  verificar("virgula preservada no sobrenome", m.getStudentName("111111"), "MARIA DA SILVA, JUNIOR");
}

resumo();
