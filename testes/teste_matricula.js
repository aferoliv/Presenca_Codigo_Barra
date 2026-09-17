/**
 * Matricula com prefixo, zeros a esquerda e digito verificador.
 * O numero e procurado e registrado SEM o hifen e SEM o digito verificador.
 *
 *   node testes/teste_matricula.js
 */
const { criarManager, relogio, resumoDe, verificar, secao, resumo } = require("./harness");

// Amostra real de "QUI112 - 04set25-matriculas.csv"
const LISTA = [
  { nome: "MARIA", sobrenome: "SILVA SANTOS", nmerodeidentificao: "ES100001" },
  { nome: "PAULO", sobrenome: "RIBEIRO SOUZA", nmerodeidentificao: "1234-5" },
  { nome: "CARLOS", sobrenome: "ALMEIDA LIMA", nmerodeidentificao: "4321-2" },
  { nome: "LUCIA", sobrenome: "SERVIDORA EXEMPLO", nmerodeidentificao: "5678-X" },
];

// ---------------------------------------------------------------------------
secao("Forma canonica da matricula");
{
  const m = criarManager();
  const casos = [
    ["ES100001", "100001"],
    ["0100001", "100001"],
    ["100001", "100001"],
    ["1234-5", "1234"],
    ["01234-5", "1234"],
    ["5678-X", "5678"],
    ["4321-2", "4321"],
    ["", ""],
  ];
  casos.forEach(([entrada, esperado]) => {
    verificar(`_normalizeMatricula(${JSON.stringify(entrada)})`, m._normalizeMatricula(entrada), esperado);
  });
}

// ---------------------------------------------------------------------------
secao("Import da lista e apelidos");
{
  const m = criarManager();
  m.loadStudentNamesFromJson(JSON.stringify([LISTA]));

  verificar("4 alunos carregados", m.studentNames.size, 4);
  verificar("aluno pela canonica", m.getStudentName("100001"), "MARIA SILVA SANTOS");
  verificar("servidor pela canonica", m.getStudentName("1234"), "PAULO RIBEIRO SOUZA");
  verificar("servidor com digito verificador", m.getStudentName("12345"), "PAULO RIBEIRO SOUZA");
  verificar("servidor com hifen", m.getStudentName("1234-5"), "PAULO RIBEIRO SOUZA");
  verificar("servidor com zeros a esquerda", m.getStudentName("01234"), "PAULO RIBEIRO SOUZA");
  verificar("digito verificador X", m.getStudentName("5678"), "LUCIA SERVIDORA EXEMPLO");
  verificar("digito verificador X lido junto", m.getStudentName("5678X"), "LUCIA SERVIDORA EXEMPLO");
  verificar("matricula de 4 digitos", m.getStudentName("4321"), "CARLOS ALMEIDA LIMA");
  verificar("matricula de 4 digitos com verificador", m.getStudentName("43212"), "CARLOS ALMEIDA LIMA");
  verificar("matricula inexistente", m.getStudentName("999999"), null);
}

// ---------------------------------------------------------------------------
secao("Leitura registra sempre a forma canonica");
{
  relogio.definir("2026-04-12T08:00:00");
  const m = criarManager();
  m.loadStudentNamesFromJson(JSON.stringify([LISTA]));

  // Entrada lida com o digito verificador, saida lida sem ele
  const entrada = m.registerEvent("12345");
  verificar("entrada: encontra o servidor", entrada.primeiroNome, "PAULO");
  verificar("entrada: status", entrada.status, "Entrada");
  verificar("entrada: gravada como 1234", m.currentSession.eventLog[0].matricula, "1234");

  relogio.avancar(50);
  const saida = m.registerEvent("1234");
  verificar("saida: reconhecida como o mesmo aluno", saida.status, "Saída");
  verificar("saida: permanencia", Math.round(saida.permanencia), 50);
  verificar("saida: gravada como 1234", m.currentSession.eventLog[1].matricula, "1234");
  verificar("nao criou aluno duplicado", m.currentSession.eventLog.length, 2);
  verificar("sala vazia", m.currentSession.currentOccupancy, 0);

  // Releitura pela forma com hifen
  relogio.avancar(15);
  const rele = m.registerEvent("1234-5");
  verificar("releitura com hifen: permanencia corrigida", Math.round(rele.permanencia), 65);
  verificar("releitura com hifen: ocupacao inalterada", m.currentSession.currentOccupancy, 0);

  const resumoSessao = resumoDe(m);
  verificar("resumo: uma linha so", resumoSessao.length, 1);
  verificar("resumo: matricula canonica", resumoSessao[0].matricula, "1234");
  verificar("resumo: permanencia", Math.round(resumoSessao[0].permanenciaTotal), 65);
}

// ---------------------------------------------------------------------------
secao("Aluno comum: ES e zeros a esquerda");
{
  relogio.definir("2026-04-12T08:00:00");
  const m = criarManager();
  m.loadStudentNamesFromJson(JSON.stringify([LISTA]));

  const entrada = m.registerEvent("100001");
  verificar("leitura de digitos acha o aluno ES", entrada.primeiroNome, "MARIA");
  verificar("gravado sem prefixo", m.currentSession.eventLog[0].matricula, "100001");

  relogio.avancar(50);
  const saida = m.registerEvent("0100001");
  verificar("zeros a esquerda sao o mesmo aluno", saida.status, "Saída");
  verificar("nao virou entrada nova", m.currentSession.eventLog.length, 2);
}

// ---------------------------------------------------------------------------
secao("Apelido nunca sobrescreve matricula real");
{
  const m = criarManager();
  // 1234-5 geraria o apelido 12345; se 12345 for matricula real de outro
  // aluno, o apelido tem de ser descartado.
  m.loadStudentNamesFromJson(JSON.stringify([[
    { nome: "PAULO", sobrenome: "RIBEIRO SOUZA", nmerodeidentificao: "1234-5" },
    { nome: "OUTRO", sobrenome: "ALUNO QUALQUER", nmerodeidentificao: "ES12345" },
  ]]));

  verificar("apelido em conflito foi descartado", m.matriculaAliases.has("12345"), false);
  verificar("12345 continua sendo o aluno real", m.getStudentName("12345"), "OUTRO ALUNO QUALQUER");
  verificar("1234 continua sendo o servidor", m.getStudentName("1234"), "PAULO RIBEIRO SOUZA");
}

// ---------------------------------------------------------------------------
secao("Codigos especiais nao sao afetados");
{
  relogio.definir("2026-04-12T08:00:00");
  const m = criarManager();
  m.loadStudentNamesFromJson(JSON.stringify([LISTA]));

  const codigo = m.registerEvent("900150");
  verificar("900150 continua sendo codigo", codigo.status, "Código");
  verificar("codigo nao entra no log", m.currentSession.eventLog.length, 0);

  const entrada = m.registerEvent("12345");
  verificar("observacao aplicada ao aluno seguinte", m.currentSession.eventLog[0].observacao, "Não estudou");
  verificar("e com a matricula canonica", m.currentSession.eventLog[0].matricula, "1234");
  verificar("entrada normal", entrada.status, "Entrada");
}

// ---------------------------------------------------------------------------
secao("Apelidos sobrevivem ao localStorage");
{
  const m = criarManager();
  m.loadStudentNamesFromJson(JSON.stringify([LISTA]));

  const bruto = m.__store.get("studentData_matriculaAliases");
  verificar("apelidos foram salvos", bruto !== undefined && bruto !== null, true);
  const salvo = new Map(JSON.parse(bruto));
  verificar("apelido 12345 -> 1234", salvo.get("12345"), "1234");
  verificar("apelido 5678X -> 5678", salvo.get("5678X"), "5678");
}

// ---------------------------------------------------------------------------
secao("Remover matricula aceita as duas formas");
{
  relogio.definir("2026-04-12T08:00:00");
  const m = criarManager();
  m.loadStudentNamesFromJson(JSON.stringify([LISTA]));

  m.registerEvent("1234");
  relogio.avancar(50);
  m.registerEvent("1234");
  verificar("dois eventos no log", m.currentSession.eventLog.length, 2);

  verificar("remover pelo numero com verificador", m.removeEventByMatricula("12345"), true);
  verificar("log limpo", m.currentSession.eventLog.length, 0);
}

resumo();
