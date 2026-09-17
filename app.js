/**
 * @file Script para controle de acesso e permanência em sala com gerenciamento de sessões.
 * @author Manus AI / Gemini / ChatGPT
 * @version 1.0.6
 */

// Classe para gerenciar os elementos do DOM
class DOMManager {
  constructor() {
    this.elements = {
      barInput: document.getElementById("matricula"),
      barTableBody: document.getElementById("real-time-table-body"),
      situacaoDisplay: document.getElementById("situacao-display"),
      permanenciaDisplay: document.getElementById("permanencia-display"),
      nomeDisplay: document.getElementById("nome-display"),
      entradaDisplay: document.getElementById("entrada-display"),
      buttonStart: document.getElementById("start-data-button"),
      buttonSave: document.getElementById("savelistButton"),
      espacoDisplay: document.getElementById("espaco-display"),
      lineInput: document.getElementById("remove-line"),
      buttonSaveSummary: document.getElementById("save-summary-button"),
      sessionControlButton: document.getElementById("session-control-button"), // Botão único de sessão
      sessionInfoDisplay: document.getElementById("session-info-display"), // Display para informações da sessão
      minTimeDisplay: document.getElementById("min-time-display"), // Display do tempo mínimo
      clockDisplay: document.getElementById("clock-display"), // Display do relógio HH:MM
      archivedSessionsBody: document.getElementById("archived-sessions-body"), // Tabela de sessões arquivadas
      studentListInfo: document.getElementById("student-list-info"), // Resumo da lista de alunos carregada
    };

    for (const key in this.elements) {
      if (this.elements[key] === null) {
        console.warn(`Elemento DOM com ID '${key}' não encontrado. Algumas funcionalidades podem estar desabilitadas.`);
      }
    }
  }

  get(key) {
    return this.elements[key];
  }

  focusBarInput() {
    if (this.elements.barInput) {
      this.elements.barInput.focus();
    }
  }

  updateDisplay(elementKey, value, color = null, fontSize = null, textAlign = null) {
    const element = this.get(elementKey);
    if (element) {
      element.innerHTML = value;
      if (color) element.style.color = color;
      if (fontSize) element.style.fontSize = fontSize;
      if (textAlign) element.style.textAlign = textAlign;
    }
  }

  clearTable() {
    if (this.elements.barTableBody) {
      this.elements.barTableBody.innerHTML = "";
    }
  }

  clearDisplays() {
    this.updateDisplay("permanenciaDisplay", "Tempo de Permanência:");
    this.updateDisplay("entradaDisplay", "Entrada:");
    this.updateDisplay("nomeDisplay", "Nome:");
    this.updateDisplay("situacaoDisplay", "");
    this.updateDisplay("espacoDisplay", "0");
  }
}

// Classe para gerenciar os dados dos alunos e eventos, incluindo sessões
class StudentDataManager {
  constructor() {
    this.storageKeys = {
      legacy: "studentData",
      meta: "studentData_meta",
      studentNames: "studentData_studentNames",
      matriculaAliases: "studentData_matriculaAliases",
      listaTag: "studentData_listaTag",
      sessionPrefix: "studentData_session_",
    };
    this.studentNames = new Map(); // Map<matricula, nomeCompleto>
    this.matriculaAliases = new Map(); // Map<leitura alternativa, matricula canônica>
    this.listaTag = ""; // 7 primeiras letras do arquivo da lista de alunos
    this.pendingAction = null; // Ação pendente para o próximo aluno
    this.specialCodes = new Map([
      ['900112', { action: 'newEntry', description: 'Entrada anterior anulada' }],  //lido DEPOIS do crachá: a última leitura vira a entrada
      ['900260', { action: 'adjustTime', description: 'Tempo ajustado' }],  //lido DEPOIS do crachá: sobe a última saída para o mínimo + 1
      ['900150', { action: 'notStudied', description: 'Não estudou' }],
      ['900250', { action: 'newMinTime', description: 'Tempo mínimo ajustado' }],  //pede o novo tempo mínimo da sessão, com confirmação
      ['900300', { action: 'undoLast', description: 'Ação desfeita' }]
    ]);
    this.defaultMinStayTime = 45; // Padrão de cada sessão, em minutos
    this.currentSession = this._criarSessao(); // Dados da sessão atual
    this.archivedSessions = []; // [{ id, startTime, endTime, eventLog, summary }]
    this.logRetentionPeriod = 2 * 30 * 24 * 60 * 60 * 1000; // 2 meses em ms
    this.ultimoIdEmitido = 0; // último id de sessão emitido, para não repetir

    this._loadFromLocalStorage(); // Carrega dados ao inicializar
    this._cleanupOldSessions(); // Limpa sessões antigas

    // Se não houver sessão atual carregada, inicia uma nova
    if (!this.currentSession.id) {
      this.startNewSession(false); // Não arquiva nada na primeira inicialização
    }
  }

  /**
   * Id de sessão, a partir do relógio. Finalizar e abrir uma sessão nova acontece
   * no mesmo tick, e uma sessão aberta e fechada sem uso nasceria e morreria no
   * mesmo milissegundo — o id se repetiria. Aqui o id é empurrado para a frente
   * até ser inédito, para dois arquivos nunca citarem a mesma sessão.
   */
  _gerarIdDeSessao(now) {
    let base = Math.max(now.getTime(), this.ultimoIdEmitido + 1);

    while (
      this.archivedSessions.some(sessao => sessao.id === `session_${base}`) ||
      localStorage.getItem(this._getSessionStorageKey(`session_${base}`)) !== null
    ) {
      base += 1;
    }

    this.ultimoIdEmitido = base;
    return `session_${base}`;
  }

  /**
   * Molde de uma sessão. Um lugar só: antes eram três literais iguais, e cada
   * campo novo (exitedStudents, minStayTime, listaTag) precisava ser acrescentado
   * nos três, com risco de um ficar para trás.
   *
   * Uma sessão nova sempre volta ao tempo mínimo padrão e herda a etiqueta da
   * lista carregada.
   */
  _criarSessao(id = null, startTime = null) {
    return {
      id,
      startTime,
      eventLog: [], // [{ id, matricula, nome, timestamp, tipo: 'entrada'/'saida', observacao }]
      activeStudents: new Map(), // Map<matricula, { entrada, nome, horaEntrada, timestamp }>
      exitedStudents: new Map(), // Map<matricula, registro de entrada de quem já saiu>
      currentOccupancy: 0,
      minStayTime: this.defaultMinStayTime, // código 900250 muda isto, só nesta sessão
      listaTag: this.listaTag, // etiqueta da disciplina, para o nome do arquivo
      nextEventId: 1,
    };
  }

  /**
   * Tempo mínimo de permanência, em minutos. Vive na sessão, e não como campo
   * solto, para não haver duas cópias podendo divergir. Cada sessão nova volta
   * ao padrão.
   */
  get minStayTime() {
    return this.currentSession.minStayTime || this.defaultMinStayTime;
  }

  /**
   * Novo tempo mínimo, válido só para a sessão atual (código 900250).
   * A validação fica aqui, e não na caixa de diálogo, para poder ser testada
   * sem navegador. Devolve true se o valor mudou.
   */
  setMinStayTime(valor) {
    const novo = Number(String(valor).trim().replace(",", "."));

    if (!Number.isInteger(novo) || novo < 1 || novo > 600) {
      console.error(`Tempo mínimo inválido: ${valor}`);
      return false;
    }

    this.currentSession.minStayTime = novo;
    this._saveCurrentSession();
    console.log(`Tempo mínimo da sessão ajustado para ${novo} min.`);
    return true;
  }

  _saveToLocalStorage() {
    try {
      localStorage.setItem(this.storageKeys.studentNames, JSON.stringify(Array.from(this.studentNames.entries())));
      localStorage.setItem(this.storageKeys.matriculaAliases, JSON.stringify(Array.from(this.matriculaAliases.entries())));
      localStorage.setItem(this.storageKeys.listaTag, this.listaTag);

      if (this.currentSession.id) {
        this._saveSessionToLocalStorage(this.currentSession);
      }

      // As arquivadas NÃO são regravadas aqui: elas não mudam mais depois de
      // arquivadas, e regravar todas a cada bipe era O(n) sobre dois meses de
      // histórico. Cada uma é gravada uma vez, em endCurrentSession.

      const meta = {
        currentSessionId: this.currentSession.id,
        archivedSessionIds: this.archivedSessions.map(session => session.id),
      };

      localStorage.setItem(this.storageKeys.meta, JSON.stringify(meta));
    } catch (e) {
      console.error("Erro ao salvar dados no localStorage:", e);
    }
  }

  /**
   * Grava só a sessão atual. É o caminho de cada leitura do código de barras:
   * nada de lista de alunos, apelidos ou histórico, que não mudam a cada bipe.
   */
  _saveCurrentSession() {
    try {
      if (this.currentSession.id) {
        this._saveSessionToLocalStorage(this.currentSession);
      }
    } catch (e) {
      console.error("Erro ao salvar a sessão no localStorage:", e);
    }
  }

  _loadFromLocalStorage() {
    try {
      const metaRaw = localStorage.getItem(this.storageKeys.meta);

      if (!metaRaw) {
        this._migrateLegacyLocalStorage();
        return;
      }

      const meta = JSON.parse(metaRaw);
      const studentNamesRaw = localStorage.getItem(this.storageKeys.studentNames);

      const matriculaAliasesRaw = localStorage.getItem(this.storageKeys.matriculaAliases);

      this.studentNames = new Map(studentNamesRaw ? JSON.parse(studentNamesRaw) : []);
      this.matriculaAliases = new Map(matriculaAliasesRaw ? JSON.parse(matriculaAliasesRaw) : []);
      this.listaTag = localStorage.getItem(this.storageKeys.listaTag) || "";
      this.archivedSessions = (meta.archivedSessionIds || [])
        .map(sessionId => this._loadSessionFromLocalStorage(sessionId))
        .filter(Boolean);

      if (meta.currentSessionId) {
        const currentSession = this._loadSessionFromLocalStorage(meta.currentSessionId);
        if (currentSession) {
          this.currentSession = currentSession;
        } else {
          console.log("Nenhuma sessão atual válida encontrada no localStorage.");
        }
      } else {
        console.log("Nenhum dado encontrado no localStorage.");
      }

      console.log("Dados carregados do localStorage.");
    } catch (e) {
      console.error("Erro ao carregar dados do localStorage:", e);
      this._clearManagedLocalStorage();
    }
  }

  _saveSessionToLocalStorage(session) {
    if (!session || !session.id) return;

    localStorage.setItem(
      this._getSessionStorageKey(session.id),
      JSON.stringify(this._serializeSession(session))
    );
  }

  _loadSessionFromLocalStorage(sessionId) {
    if (!sessionId) return null;

    const rawSession = localStorage.getItem(this._getSessionStorageKey(sessionId));
    if (!rawSession) return null;

    return this._deserializeSession(JSON.parse(rawSession));
  }

  _serializeSession(session) {
    return {
      ...session,
      activeStudents: Array.from((session.activeStudents || new Map()).entries()),
      exitedStudents: Array.from((session.exitedStudents || new Map()).entries()),
    };
  }

  _deserializeSession(sessionData) {
    const deserializedSession = {
      ...sessionData,
      eventLog: sessionData.eventLog || [],
      activeStudents: new Map(sessionData.activeStudents || []),
      exitedStudents: new Map(sessionData.exitedStudents || []),
      minStayTime: sessionData.minStayTime || this.defaultMinStayTime,
      listaTag: sessionData.listaTag || "",
      currentOccupancy: sessionData.currentOccupancy || 0,
      nextEventId: sessionData.nextEventId || 1,
    };

    if (deserializedSession.eventLog.length > 0) {
      const maxId = Math.max(...deserializedSession.eventLog.map(event => event.id || 0));
      deserializedSession.nextEventId = Math.max(deserializedSession.nextEventId, maxId + 1);
    }

    return deserializedSession;
  }

  _getSessionStorageKey(sessionId) {
    return `${this.storageKeys.sessionPrefix}${sessionId}`;
  }

  _removeSessionFromLocalStorage(sessionId) {
    if (!sessionId) return;
    localStorage.removeItem(this._getSessionStorageKey(sessionId));
  }

  _migrateLegacyLocalStorage() {
    const legacyRaw = localStorage.getItem(this.storageKeys.legacy);
    if (!legacyRaw) {
      console.log("Nenhum dado encontrado no localStorage.");
      return;
    }

    const legacyData = JSON.parse(legacyRaw);
    this.studentNames = new Map(legacyData.studentNames || []);
    this.matriculaAliases = new Map(legacyData.matriculaAliases || []);
    this.archivedSessions = (legacyData.archivedSessions || []).map(session => this._deserializeSession(session));

    if (legacyData.currentSession && legacyData.currentSession.id) {
      this.currentSession = this._deserializeSession(legacyData.currentSession);
    }

    this.archivedSessions.forEach(session => this._saveSessionToLocalStorage(session));
    this._saveToLocalStorage();
    localStorage.removeItem(this.storageKeys.legacy);
    console.log("Dados legados migrados para o novo formato por sessão.");
  }

  _clearManagedLocalStorage() {
    const metaRaw = localStorage.getItem(this.storageKeys.meta);

    if (metaRaw) {
      try {
        const meta = JSON.parse(metaRaw);
        (meta.archivedSessionIds || []).forEach(sessionId => this._removeSessionFromLocalStorage(sessionId));
        this._removeSessionFromLocalStorage(meta.currentSessionId);
      } catch (error) {
        console.error("Erro ao limpar sessões do localStorage:", error);
      }
    }

    localStorage.removeItem(this.storageKeys.meta);
    localStorage.removeItem(this.storageKeys.studentNames);
    localStorage.removeItem(this.storageKeys.matriculaAliases);
    localStorage.removeItem(this.storageKeys.listaTag);
    localStorage.removeItem(this.storageKeys.legacy);
  }

  _cleanupOldSessions() {
    const now = new Date().getTime();
    const removedSessionIds = [];

    this.archivedSessions = this.archivedSessions.filter(session => {
      const sessionEndTime = session.endTime ? new Date(session.endTime).getTime() : new Date(session.startTime).getTime();
      const shouldKeep = (now - sessionEndTime) < this.logRetentionPeriod;
      if (!shouldKeep) {
        removedSessionIds.push(session.id);
      }
      return shouldKeep;
    });

    removedSessionIds.forEach(sessionId => this._removeSessionFromLocalStorage(sessionId));
    this._saveToLocalStorage();
    console.log("Sessões antigas limpas.");
  }

  startNewSession(archivePrevious = true) {
    if (archivePrevious && this.currentSession.id !== null) {
      this.endCurrentSession();
    }

    const now = new Date();
    this.currentSession = this._criarSessao(this._gerarIdDeSessao(now), now.toISOString());
    this._saveToLocalStorage();
    console.log(`Nova sessão iniciada: ${this.currentSession.id}`);
  }

  endCurrentSession() {
    if (this.currentSession.id === null) return;

    // Sessão sem nenhuma leitura não vira arquivo: só sujaria a lista e o
    // localStorage. Acontece a cada "Nova Sessão" aberta e não usada.
    if (this.currentSession.eventLog.length === 0) {
      const descartada = this.currentSession.id;
      this._removeSessionFromLocalStorage(descartada);
      this.currentSession = this._criarSessao();
      this._saveToLocalStorage();
      console.log(`Sessão ${descartada} descartada: nenhum evento registrado.`);
      return;
    }

    const now = new Date();
    const sessionToArchive = {
      id: this.currentSession.id,
      startTime: this.currentSession.startTime,
      endTime: now.toISOString(),
      eventLog: [...this.currentSession.eventLog],
      // O critério e a disciplina daquela sessão vão junto: uma exportação feita
      // depois precisa deles, e a sessão atual já pode estar em outra disciplina.
      minStayTime: this.currentSession.minStayTime,
      listaTag: this.currentSession.listaTag,
      summary: this._generateSessionSummary(this.currentSession.eventLog, this.currentSession.activeStudents, now.toISOString()),
    };
    this.archivedSessions.push(sessionToArchive);
    // Única gravação desta sessão arquivada: daqui em diante ela não muda mais
    this._saveSessionToLocalStorage(sessionToArchive);
    this.currentSession = this._criarSessao();

    this._cleanupOldSessions();
    this._saveToLocalStorage();
    console.log(`Sessão ${sessionToArchive.id} salva no localStorage e arquivada.`);
    console.log(`Sessão ${sessionToArchive.id} finalizada e arquivada.`);
  }

  /**
   * Resumo por aluno: ultima saida - primeira entrada.
   * Nao soma pares entrada/saida, porque da 2a saida em diante a leitura apenas
   * corrige o tempo ja registrado (ver registerEvent).
   */
  _generateSessionSummary(eventLog, activeStudents, sessionEndTimeStr) {
    const summaryMap = new Map();

    eventLog.forEach(event => {
      if (!summaryMap.has(event.matricula)) {
        summaryMap.set(event.matricula, {
          nome: event.nome,
          primeiroEvento: event.timestamp,
          primeiraEntrada: null,
          ultimaSaida: null,
        });
      }
      const studentSummary = summaryMap.get(event.matricula);

      if (!studentSummary.nome && event.nome) {
        studentSummary.nome = event.nome;
      }
      if (event.timestamp < studentSummary.primeiroEvento) {
        studentSummary.primeiroEvento = event.timestamp;
      }

      if (event.tipo === "entrada") {
        if (studentSummary.primeiraEntrada === null || event.timestamp < studentSummary.primeiraEntrada) {
          studentSummary.primeiraEntrada = event.timestamp;
        }
      } else if (event.tipo === "saida") {
        if (studentSummary.ultimaSaida === null || event.timestamp > studentSummary.ultimaSaida) {
          studentSummary.ultimaSaida = event.timestamp;
        }
      }
    });

    const sessionEndTime = new Date(sessionEndTimeStr || new Date()).getTime();
    const alunosAtivos = activeStudents || new Map();

    return Array.from(summaryMap.entries()).map(([matricula, s]) => {
      const inicio = s.primeiraEntrada !== null ? s.primeiraEntrada : s.primeiroEvento;
      // Ainda na sala: conta ate o fim da sessao. Ja saiu: ate a ultima saida.
      const fim = alunosAtivos.has(matricula)
        ? sessionEndTime
        : (s.ultimaSaida !== null ? s.ultimaSaida : inicio);
      const permanencia = Math.max(0, (fim - inicio) / (1000 * 60));

      return {
        matricula,
        nome: s.nome || "Sem nome",
        primeiraEntrada: new Date(inicio).toLocaleTimeString(),
        ultimaSaida: new Date(fim).toLocaleTimeString(),
        permanenciaTotal: parseFloat(permanencia.toFixed(2)),
      };
    });
  }

  loadStudentNamesFromExcel(arrayBuffer, fileName) {
    try {
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      // Converte a planilha para JSON
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      if (jsonData.length === 0) {
        console.warn("Arquivo Excel vazio ou sem dados.");
        return;
      }

      // Remove o cabeçalho (primeira linha)
      const dataRows = jsonData.slice(1);

      dataRows.forEach(row => {
        if (row.length >= 3) {
          const nomeCompleto = `${row[0] || ''} ${row[1] || ''}`.trim();
          const matricula = this._normalizeMatricula(row[2]);
          
          if (nomeCompleto && matricula) {
            this.studentNames.set(matricula, nomeCompleto);
            this._registerMatriculaAliases(row[2], matricula);
          }
        }
      });
      
      this._pruneMatriculaAliases();
      this.setStudentListName(fileName);
      this._refreshSessionNames();
      console.log("Nomes de alunos carregados do arquivo Excel:", this.studentNames.size);
      this._saveToLocalStorage();
    } catch (error) {
      console.error("Erro ao processar arquivo Excel:", error);
    }
  }

  loadStudentNamesFromJson(jsonContent, fileName) {
    try {
      const parsedData = typeof jsonContent === "string" ? JSON.parse(jsonContent) : jsonContent;
      const flatData = this._flattenArray(parsedData);

      if (!Array.isArray(flatData) || flatData.length === 0) {
        console.warn("Arquivo JSON vazio ou sem dados válidos.");
        return;
      }

      let loadedCount = 0;
      flatData.forEach(student => {
        if (!student || typeof student !== "object") return;

        const nome = String(student.nome || "").trim();
        const sobrenome = String(student.sobrenome || "").trim();
        const nomeCompleto = `${nome} ${sobrenome}`.trim();
        const identificacao = student.nmerodeidentificao || student.numeroIdentificacao || student.matricula;
        const matricula = this._normalizeMatricula(identificacao);

        if (nomeCompleto && matricula) {
          this.studentNames.set(matricula, nomeCompleto);
          this._registerMatriculaAliases(identificacao, matricula);
          loadedCount++;
        }
      });

      if (loadedCount === 0) {
        console.warn("Nenhum aluno válido encontrado no arquivo JSON.");
        return;
      }

      this._pruneMatriculaAliases();
      this.setStudentListName(fileName);
      this._refreshSessionNames();
      console.log("Nomes de alunos carregados do arquivo JSON:", loadedCount);
      this._saveToLocalStorage();
    } catch (error) {
      console.error("Erro ao processar arquivo JSON:", error);
    }
  }

  /**
   * Separador do CSV: o export do Moodle usa vírgula, mas o Excel em pt-BR salva
   * com ponto e vírgula. Decide pela primeira linha, ignorando o que está entre
   * aspas.
   */
  _detectCsvSeparator(text) {
    const primeira = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/)[0] || "";
    const semAspas = primeira.replace(/"[^"]*"/g, "");
    return semAspas.split(";").length > semAspas.split(",").length ? ";" : ",";
  }

  /**
   * CSV em linhas de campos. Trata BOM, aspas, "" escapado dentro de aspas,
   * CRLF e vírgula dentro de campo entre aspas (há nomes assim na lista).
   */
  _parseCsv(text, separador) {
    const conteudo = String(text || "").replace(/^\uFEFF/, "");
    const linhas = [];
    let campo = "";
    let linha = [];
    let entreAspas = false;

    for (let i = 0; i < conteudo.length; i++) {
      const c = conteudo[i];

      if (entreAspas) {
        if (c === '"') {
          if (conteudo[i + 1] === '"') {
            campo += '"';
            i++;
          } else {
            entreAspas = false;
          }
        } else {
          campo += c;
        }
        continue;
      }

      if (c === '"') {
        entreAspas = true;
      } else if (c === separador) {
        linha.push(campo);
        campo = "";
      } else if (c === "\n") {
        linha.push(campo);
        linhas.push(linha);
        linha = [];
        campo = "";
      } else if (c !== "\r") {
        campo += c;
      }
    }

    if (campo !== "" || linha.length > 0) {
      linha.push(campo);
      linhas.push(linha);
    }

    // Descarta linhas em branco (o arquivo costuma terminar com uma)
    return linhas.filter(l => l.some(v => String(v).trim() !== ""));
  }

  /**
   * Descobre as colunas pelo cabeçalho do export do Moodle
   * (Nome, Sobrenome, Número de identificação, ...).
   * Cabeçalho não reconhecido cai nas três primeiras colunas, como no .xlsx.
   */
  _mapCsvColumns(cabecalho) {
    const normaliza = v => String(v || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();

    const titulos = (cabecalho || []).map(normaliza);

    const acha = (exatos, parciais) => {
      const exato = titulos.findIndex(t => exatos.includes(t));
      if (exato >= 0) return exato;
      return titulos.findIndex(t => parciais.some(p => t.includes(p)));
    };

    // "nome" é buscado por igualdade: "sobrenome" também contém "nome"
    const nome = acha(["nome", "primeiro nome"], []);
    const sobrenome = acha(["sobrenome", "ultimo nome"], ["sobrenome"]);
    const matricula = acha(
      ["numero de identificacao", "matricula", "identificacao"],
      ["identificacao", "matricula", "numero de id"]
    );

    return {
      nome: nome >= 0 ? nome : 0,
      sobrenome: sobrenome >= 0 ? sobrenome : 1,
      matricula: matricula >= 0 ? matricula : 2,
    };
  }

  loadStudentNamesFromCsv(csvContent, fileName) {
    try {
      const linhas = this._parseCsv(csvContent, this._detectCsvSeparator(csvContent));

      if (linhas.length < 2) {
        console.warn("Arquivo CSV vazio ou sem dados.");
        return;
      }

      const colunas = this._mapCsvColumns(linhas[0]);
      let loadedCount = 0;

      linhas.slice(1).forEach(linha => {
        const nomeCompleto = `${linha[colunas.nome] || ""} ${linha[colunas.sobrenome] || ""}`.trim();
        const identificacao = linha[colunas.matricula];
        const matricula = this._normalizeMatricula(identificacao);

        if (nomeCompleto && matricula) {
          this.studentNames.set(matricula, nomeCompleto);
          this._registerMatriculaAliases(identificacao, matricula);
          loadedCount++;
        }
      });

      if (loadedCount === 0) {
        console.warn("Nenhum aluno válido encontrado no arquivo CSV.");
        return;
      }

      this._pruneMatriculaAliases();
      this.setStudentListName(fileName);
      this._refreshSessionNames();
      console.log("Nomes de alunos carregados do arquivo CSV:", loadedCount);
      this._saveToLocalStorage();
    } catch (error) {
      console.error("Erro ao processar arquivo CSV:", error);
    }
  }

  _flattenArray(value) {
    if (!Array.isArray(value)) return [value];
    return value.flat(Infinity);
  }

  /**
   * Forma canônica da matrícula, usada tanto no import quanto na leitura.
   * O número é guardado SEM prefixo, SEM zeros à esquerda e SEM o dígito
   * verificador dos servidores:
   *
   *   ES100001  ->  100001
   *   0100001   ->  100001
   *   1234-5   ->  1234
   *   01234-5  ->  1234
   *   5678-X   ->  5678
   */
  _normalizeMatricula(value) {
    let matricula = String(value || "").trim().toUpperCase();
    if (!matricula) return "";

    // Prefixo de duas letras do Moodle (ES100001)
    if (/^[A-Z]{2}/.test(matricula)) {
      matricula = matricula.substring(2);
    }

    // Hífen + dígito verificador dos servidores (1234-5, 5678-X)
    matricula = matricula.replace(/-[0-9A-Z]$/, "");

    // Sobrou qualquer outro separador: fica só o número
    matricula = matricula.replace(/[^0-9]/g, "");

    matricula = matricula.replace(/^0+/, "") || "0";
    return matricula;
  }

  /**
   * Resolve a matrícula lida contra a lista de alunos.
   * Se o leitor mandar o dígito verificador junto (12345), o apelido criado no
   * import devolve a forma canônica (1234), que é a registrada no log.
   */
  _resolveMatricula(value) {
    const matricula = this._normalizeMatricula(value);
    if (!matricula) return "";
    if (this.studentNames.has(matricula)) return matricula;
    return this.matriculaAliases.get(matricula) || matricula;
  }

  /**
   * Cria os apelidos de uma matrícula com dígito verificador:
   * "1234-5" gera 12345 -> 1234, para o leitor achar o aluno das duas formas.
   */
  _registerMatriculaAliases(raw, matricula) {
    const comDigito = String(raw || "")
      .trim()
      .toUpperCase()
      .replace(/^[A-Z]{2}/, "")
      .replace(/[^0-9A-Z]/g, "")
      .replace(/^0+/, "");

    if (!comDigito || comDigito === matricula) return;

    this.matriculaAliases.set(comDigito, matricula);

    const soDigitos = comDigito.replace(/[^0-9]/g, "");
    if (soDigitos && soDigitos !== matricula) {
      this.matriculaAliases.set(soDigitos, matricula);
    }
  }

  /** Um apelido nunca pode sobrescrever uma matrícula real da lista. */
  _pruneMatriculaAliases() {
    Array.from(this.matriculaAliases.keys()).forEach(alias => {
      if (this.studentNames.has(alias)) {
        this.matriculaAliases.delete(alias);
      }
    });
  }

  /**
   * Etiqueta da lista de alunos: as **7 primeiras letras** do nome do arquivo
   * carregado, sem a extensão. Serve para distinguir os arquivos de disciplinas
   * diferentes que usam a mesma instalação.
   *
   *   "QUI112 - 04set25-matriculas.csv"   ->  "QUI112"
   *   "courseid_28451_11abr26.json"       ->  "coursei"
   *   "BIO231-turma A.xlsx"               ->  "BIO231"
   *
   * Acentos são removidos e o que não for letra ou número vira "_", para o nome
   * do arquivo não depender do sistema de arquivos.
   */
  _buildListTag(fileName) {
    return String(fileName || "")
      .replace(/\.[^.]+$/, "")
      .slice(0, 7)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  /** Guarda a etiqueta da lista carregada, na sessão e no localStorage. */
  setStudentListName(fileName) {
    const etiqueta = this._buildListTag(fileName);
    if (!etiqueta) return "";

    this.listaTag = etiqueta;
    this.currentSession.listaTag = etiqueta;
    this._saveToLocalStorage();
    console.log(`Lista de alunos identificada como "${etiqueta}".`);
    return etiqueta;
  }

  /**
   * Nome do arquivo de saída, com a etiqueta da disciplina na FRENTE, para os
   * arquivos das duas disciplinas ficarem agrupados ao ordenar por nome.
   *
   *   QUI112_log_eventos_sessao_session_1760276883871_2026-09-16_10-59-07.csv
   *
   * Sem lista carregada, o nome sai como antes, sem etiqueta.
   */
  _buildFileName(prefixo, session) {
    const now = new Date();
    const pad = n => n.toString().padStart(2, "0");
    const carimbo = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const etiqueta = (session && session.listaTag) || this.listaTag;

    return `${etiqueta ? `${etiqueta}_` : ""}${prefixo}_${session.id}_${carimbo}.csv`;
  }

  /** O que há hoje na lista de alunos, para a tela mostrar antes de apagar. */
  getStudentListInfo() {
    return {
      total: this.studentNames.size,
      apelidos: this.matriculaAliases.size,
      listaTag: this.listaTag,
    };
  }

  /**
   * Apaga a lista de alunos e os apelidos — de **todas** as disciplinas, porque
   * os carregamentos se somam num mapa só.
   *
   * Não mexe nos nomes já gravados nos eventos: eles foram copiados no instante
   * do bipe e continuam no log e no resumo. Também não mexe na etiqueta da sessão
   * em andamento, para o arquivo dela continuar saindo com o nome da disciplina
   * sob a qual foi registrada.
   */
  clearStudentNames() {
    const removidos = this.studentNames.size;

    this.studentNames.clear();
    this.matriculaAliases.clear();
    this.listaTag = "";
    this._saveToLocalStorage();

    console.log(`Lista de alunos apagada: ${removidos} aluno(s).`);
    return removidos;
  }

  /**
   * Realinha a sessão em andamento com a lista recém-carregada.
   *
   * O nome é copiado para dentro do evento no instante do bipe. Sem isto, um
   * aluno que bipou antes da lista certa estar carregada ficaria gravado como
   * "Sem nome" para sempre, mesmo depois de a lista ser corrigida.
   *
   * A matrícula também é reresolvida: os apelidos do dígito verificador só passam
   * a existir depois do import, então um servidor que bipou `12345` antes da
   * lista ficou gravado assim, e um bipe posterior de `1234` seria tratado como
   * outra pessoa. Se alguma matrícula mudar de forma, o estado é reconstruído a
   * partir do log.
   *
   * Vale só para a sessão atual: o histórico arquivado não é reescrito.
   */
  _refreshSessionNames() {
    let nomesTrocados = 0;
    let matriculasTrocadas = 0;

    this.currentSession.eventLog.forEach(event => {
      const canonica = this._resolveMatricula(event.matricula);
      if (canonica && canonica !== event.matricula) {
        event.matricula = canonica;
        matriculasTrocadas++;
      }

      const nome = this.getStudentName(event.matricula);
      if (nome && nome !== event.nome) {
        event.nome = nome;
        nomesTrocados++;
      }
    });

    if (matriculasTrocadas > 0) {
      this._rebuildStateFromLog();
    } else {
      // Só os nomes mudaram: acerta os registros em memória sem mexer no resto
      [this.currentSession.activeStudents, this.currentSession.exitedStudents].forEach(mapa => {
        (mapa || new Map()).forEach((registro, matricula) => {
          const nome = this.getStudentName(matricula);
          if (nome && nome !== registro.nome) {
            registro.nome = nome;
          }
        });
      });
    }

    if (nomesTrocados > 0 || matriculasTrocadas > 0) {
      console.log(
        `Sessão realinhada pela lista: ${nomesTrocados} nome(s) e ` +
        `${matriculasTrocadas} matrícula(s) atualizados.`
      );
    }

    return { nomes: nomesTrocados, matriculas: matriculasTrocadas };
  }

  getStudentName(matricula) {
    return this.studentNames.get(this._resolveMatricula(matricula)) || null;
  }

  handleSpecialCode(matricula) {
    const specialCode = this.specialCodes.get(matricula);
    if (!specialCode) return null;

    switch (specialCode.action) {
      case 'newEntry':
        return this.convertLastReadingToEntry();
      
      case 'adjustTime':
        return this.adjustLastReadingTime();
      
      case 'notStudied':
        this.pendingAction = { type: 'notStudied', description: 'Não estudou' };
        return { status: 'Código', permanencia: 0, nome: 'Próximo aluno: não estudou', primeiroNome: 'OK!', horaEntrada: '', shouldUpdateOccupancy: false };
      
      case 'newMinTime':
        // Quem pergunta e confirma é a camada de tela (App._promptNovoTempoMinimo)
        return { status: 'Ajustar Mínimo', permanencia: 0, nome: 'Ajuste do tempo mínimo', primeiroNome: 'TEMPO MÍNIMO', horaEntrada: '', shouldUpdateOccupancy: false };
      
      case 'undoLast':
        return this.undoLastAction();
      
      default:
        return null;
    }
  }

  /**
   * Código 900260 — lido DEPOIS do crachá do aluno.
   *
   * Corrige a permanência da última leitura para o tempo mínimo + 1, e vale
   * **somente para quem ficou abaixo do tempo mínimo**: 30 min viram 46;
   * 50 min continuam 50.
   *
   * O ajuste é feito no *timestamp* da saída (entrada + 46 min), não só no campo
   * de permanência, para o log, a tela e o resumo contarem a mesma coisa — o
   * resumo é calculado a partir dos horários, e antes disso ele ignorava a
   * correção. Em troca, a hora de saída gravada deixa de ser a hora real do bipe,
   * que fica registrada na observação do CSV.
   */
  adjustLastReadingTime() {
    const log = this.currentSession.eventLog;

    if (log.length === 0) {
      return { status: 'Erro', permanencia: 0, nome: 'Nenhuma leitura para ajustar', primeiroNome: 'ERRO', horaEntrada: '', shouldUpdateOccupancy: false };
    }

    const ultimaLeitura = log[log.length - 1];
    const nomeCompleto = ultimaLeitura.nome;
    const primeiroNome = nomeCompleto ? nomeCompleto.split(' ')[0] : 'Sem nome';

    if (ultimaLeitura.tipo !== 'saida') {
      return { status: 'Erro', permanencia: 0, nome: 'A última leitura é uma entrada', primeiroNome: 'ERRO', horaEntrada: ultimaLeitura.hora, shouldUpdateOccupancy: false };
    }

    const entrada = this._findEntryEventFor(ultimaLeitura);
    if (!entrada) {
      return { status: 'Erro', permanencia: 0, nome: 'Sem entrada registrada para ajustar', primeiroNome: 'ERRO', horaEntrada: '', shouldUpdateOccupancy: false };
    }

    const permanenciaReal = (ultimaLeitura.timestamp - entrada.timestamp) / (1000 * 60);

    // Vale só para quem ficou abaixo do tempo mínimo; acima disso, preserva
    if (permanenciaReal >= this.minStayTime) {
      return { status: 'Aviso', permanencia: permanenciaReal, nome: nomeCompleto, primeiroNome, horaEntrada: entrada.hora, shouldUpdateOccupancy: false };
    }

    const alvo = this.minStayTime + 1;
    const horaLida = ultimaLeitura.hora;
    const novoTimestamp = entrada.timestamp + alvo * 60 * 1000;
    const novaHora = new Date(novoTimestamp);

    ultimaLeitura.timestamp = novoTimestamp;
    ultimaLeitura.hora = `${novaHora.getHours().toString().padStart(2, "0")}:${novaHora.getMinutes().toString().padStart(2, "0")}:${novaHora.getSeconds().toString().padStart(2, "0")}`;
    ultimaLeitura.permanencia = alvo;

    const ajuste = `Tempo ajustado para ${alvo} min (saída lida às ${horaLida})`;
    ultimaLeitura.observacao = ultimaLeitura.observacao ? `${ultimaLeitura.observacao}; ${ajuste}` : ajuste;

    this._saveCurrentSession();

    return { status: 'Tempo Ajustado', permanencia: alvo, nome: nomeCompleto, primeiroNome, horaEntrada: entrada.hora, shouldUpdateOccupancy: false };
  }

  /** Última entrada registrada daquele aluno antes da saída informada. */
  _findEntryEventFor(saidaEvent) {
    const log = this.currentSession.eventLog;
    for (let i = log.indexOf(saidaEvent) - 1; i >= 0; i--) {
      if (log[i].matricula === saidaEvent.matricula && log[i].tipo === 'entrada') {
        return log[i];
      }
    }
    return null;
  }

  /**
   * Código 900112 — lido DEPOIS do crachá do aluno.
   *
   * Serve para quando o aluno marcou entrada, saiu da sala sem registrar e só
   * voltou depois: a leitura do retorno vira "saída" e creditaria a ele todo o
   * tempo em que esteve FORA. O 900112 descarta os registros anteriores daquele
   * aluno e transforma a leitura recém-feita na entrada dele, para o tempo
   * começar a contar do retorno.
   *
   *   08:00 entrada  ->  sai sem registrar  ->  08:40 lê o crachá (saída, 40 min)
   *   08:40 lê 900112  ->  a entrada das 08:00 é descartada e 08:40 vira a entrada
   *   09:30 sai  ->  permanência 50 min, não 90
   */
  convertLastReadingToEntry() {
    const log = this.currentSession.eventLog;

    if (log.length === 0) {
      return { status: 'Erro', permanencia: 0, nome: 'Nenhuma leitura para converter', primeiroNome: 'ERRO', horaEntrada: '', shouldUpdateOccupancy: false };
    }

    const ultimoIndice = log.length - 1;
    const ultimaLeitura = log[ultimoIndice];
    const matricula = ultimaLeitura.matricula;
    const tinhaRegistroAnterior = log.some((event, i) => i < ultimoIndice && event.matricula === matricula);

    // Descarta o que havia daquele aluno antes desta leitura
    this.currentSession.eventLog = log.filter(
      (event, i) => i === ultimoIndice || event.matricula !== matricula
    );

    // A leitura recém-feita passa a ser a entrada
    ultimaLeitura.tipo = 'entrada';
    ultimaLeitura.permanencia = 0;
    ultimaLeitura.observacao = tinhaRegistroAnterior
      ? 'Entrada anterior anulada'
      : 'Entrada (sem registro anterior para anular)';
    delete ultimaLeitura.entradaOriginal;

    // Quem já estava na sala continua contando 1: sai a entrada velha, entra a
    // nova, saldo zero. Quem já tinha saído volta a ocupar vaga.
    this._rebuildStateFromLog();
    this._saveCurrentSession();

    const nomeCompleto = ultimaLeitura.nome;
    const primeiroNome = nomeCompleto ? nomeCompleto.split(' ')[0] : 'Sem nome';

    return {
      status: 'Nova Entrada',
      permanencia: 0,
      nome: nomeCompleto,
      primeiroNome,
      horaEntrada: ultimaLeitura.hora,
      shouldUpdateOccupancy: true,
    };
  }

  undoLastAction() {
    if (this.currentSession.eventLog.length === 0) {
      return { status: 'Erro', permanencia: 0, nome: 'Nenhuma ação para desfazer', primeiroNome: 'ERRO', horaEntrada: '', shouldUpdateOccupancy: false };
    }

    const lastEvent = this.currentSession.eventLog.pop();

    this._rebuildStateFromLog();
    this._saveCurrentSession();

    return { status: 'Desfeito', permanencia: 0, nome: `Ação desfeita: ${lastEvent.nome}`, primeiroNome: 'DESFEITO', horaEntrada: '', shouldUpdateOccupancy: true };
  }

  /**
   * Reconstroi activeStudents, exitedStudents e a ocupacao a partir do eventLog.
   * Fonte unica de verdade para desfazer e remover, para nao divergir de registerEvent.
   */
  _rebuildStateFromLog() {
    const activeStudents = new Map();
    const exitedStudents = new Map();

    this.currentSession.eventLog.forEach(event => {
      if (event.tipo === "entrada") {
        exitedStudents.delete(event.matricula);
        activeStudents.set(event.matricula, {
          entrada: event.timestamp,
          nome: event.nome,
          horaEntrada: event.hora,
          timestamp: event.timestamp,
        });
      } else if (event.tipo === "saida") {
        const entryRecord = activeStudents.get(event.matricula);
        if (entryRecord) {
          activeStudents.delete(event.matricula);
          exitedStudents.set(event.matricula, entryRecord);
        }
        // saida sem entrada ativa = saida revisada: nao altera o estado
      }
    });

    this.currentSession.activeStudents = activeStudents;
    this.currentSession.exitedStudents = exitedStudents;
    this.currentSession.currentOccupancy = activeStudents.size;
  }
  /**
   * Regra do ciclo de leituras:
   *   1a leitura ............ Entrada, ocupacao +1
   *   2a leitura ............ Saida,   ocupacao -1, permanencia = 2a - entrada
   *   3a leitura em diante .. Saida,   ocupacao inalterada, permanencia = ultima - entrada
   */
  registerEvent(matricula) {
    // Verifica se é um código especial
    if (this.specialCodes.has(matricula)) {
      return this.handleSpecialCode(matricula);
    }

    if (!this.currentSession.exitedStudents) {
      this.currentSession.exitedStudents = new Map(); // sessões salvas antes desta versão
    }

    // O leitor manda só dígitos; o número é procurado e registrado na forma canônica
    matricula = this._resolveMatricula(matricula);

    const now = new Date();
    const timestamp = now.getTime();
    const hora = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
    const nomeCompleto = this.getStudentName(matricula);
    const primeiroNome = nomeCompleto ? nomeCompleto.split(" ")[0] : "Sem nome";

    let status;
    let permanencia = 0;
    let horaEntradaEvento = hora;
    let shouldUpdateOccupancy = true;
    let observacao = '';

    // Verifica se há ação pendente
    if (this.pendingAction) {
      observacao = this.pendingAction.description;
      this.pendingAction = null; // Limpa a ação após usar
    }

    const activeEntry = this.currentSession.activeStudents.get(matricula);
    const exitedEntry = this.currentSession.exitedStudents.get(matricula);

    if (activeEntry || exitedEntry) {
      // Aluno ativo -> saída efetiva. Aluno que já saiu -> saída revisada.
      const entryEvent = activeEntry || exitedEntry;
      const isRevisedExit = !activeEntry;

      status = "Saída";
      permanencia = (timestamp - entryEvent.timestamp) / (1000 * 60);
      horaEntradaEvento = entryEvent.horaEntrada;

      if (isRevisedExit) {
        // Da 2a saída em diante só corrige o tempo; a vaga já foi liberada.
        if (!observacao) observacao = 'Saída revisada';
      } else {
        // A saída sempre libera a vaga, qualquer que seja o tempo.
        // O tempo mínimo continua valendo apenas para a cor do display.
        this.currentSession.activeStudents.delete(matricula);
        this.currentSession.exitedStudents.set(matricula, entryEvent);
        this.currentSession.currentOccupancy = this.currentSession.activeStudents.size;
      }

      this.currentSession.eventLog.push({
        id: this.currentSession.nextEventId++,
        matricula,
        nome: nomeCompleto,
        timestamp,
        hora,
        tipo: "saida",
        permanencia: parseFloat(permanencia.toFixed(2)),
        entradaOriginal: entryEvent.horaEntrada,
        observacao
      });

    } else {
      status = "Entrada";
      this.currentSession.activeStudents.set(matricula, { entrada: timestamp, nome: nomeCompleto, horaEntrada: hora, timestamp: timestamp });
      this.currentSession.currentOccupancy = this.currentSession.activeStudents.size;

      this.currentSession.eventLog.push({
        id: this.currentSession.nextEventId++,
        matricula,
        nome: nomeCompleto,
        timestamp,
        hora,
        tipo: "entrada",
        permanencia: 0,
        observacao
      });
    }
    this._saveCurrentSession();
    return { status, permanencia, nome: nomeCompleto, primeiroNome, horaEntrada: horaEntradaEvento, shouldUpdateOccupancy };
  }

  removeEventByMatricula(matriculaToRemove) {
    matriculaToRemove = this._resolveMatricula(matriculaToRemove);
    const initialEventLogLength = this.currentSession.eventLog.length;

    this.currentSession.eventLog = this.currentSession.eventLog.filter(event => event.matricula !== matriculaToRemove);
    const removeuAlgo = this.currentSession.eventLog.length < initialEventLogLength;

    this._rebuildStateFromLog();
    this._saveCurrentSession();

    if (removeuAlgo) {
      console.log(`Todos os eventos para a matrícula ${matriculaToRemove} foram removidos e o estado foi recalculado.`);
      return true;
    }

    console.error(`Matrícula ${matriculaToRemove} não encontrada no log de eventos da sessão atual.`);
    return false;
  }

  getRealTimeTableData() {
    const displayData = [];
    const tempActiveStudents = new Map(this.currentSession.activeStudents);

    this.currentSession.eventLog.forEach(event => {
      let permanenciaCalculada = event.permanencia;
      let situacaoDisplay = event.tipo === "entrada" ? "Entrada" : "Saída";

      if (event.tipo === "entrada" && tempActiveStudents.has(event.matricula) && tempActiveStudents.get(event.matricula).timestamp === event.timestamp) {
        permanenciaCalculada = (new Date().getTime() - event.timestamp) / (1000 * 60);
        situacaoDisplay = "Ativo";
      }

      displayData.push({
        id: event.id,
        Matricula: event.matricula,
        Nome: event.nome || "Sem nome",
        Entrada: event.hora,
        Permanencia: parseFloat(permanenciaCalculada.toFixed(2)),
        Situacao: situacaoDisplay,
      });
    });

    displayData.sort((a, b) => b.id - a.id);

    return displayData;
  }

  saveEventLog(dataArray, session = this.currentSession) {
    if (!dataArray || dataArray.length === 0) {
      console.warn("Nenhum dado para salvar no log de eventos da sessão atual.");
      return;
    }

    const headers = "ID,Matrícula,Nome,Timestamp,Hora,Tipo,Permanência (min),Entrada Original,Observação\n";
    const csvContent = dataArray.map(event => {
      return `${event.id},${event.matricula},"${event.nome || "Sem nome"}",${event.timestamp},${event.hora},${event.tipo},${event.permanencia || 0},${event.entradaOriginal || ""},"${event.observacao || ""}"`;
    }).join("\n");

    const minimo = (session && session.minStayTime) || this.defaultMinStayTime;
    const fullCsvContent = headers + csvContent + `\n${new Date(session.startTime).toLocaleDateString()} - Tempo mínimo: ${minimo} min`;

    this._downloadFile(fullCsvContent, this._buildFileName("log_eventos_sessao", session), "text/csv");
  }

  saveSummaryLog(triggerDownload = false) {
    const summary = this._generateSessionSummary(this.currentSession.eventLog, this.currentSession.activeStudents, this.currentSession.endTime || new Date().toISOString());

    if (triggerDownload) {
      if (!summary || summary.length === 0) {
        console.warn("Nenhum dado para salvar no resumo de permanência da sessão atual.");
        return;
      }
      const headers = "Matrícula,Nome,Primeira Entrada,Última Saída,Permanência Total (min)\n";
      const csvContent = summary.map(s => {
        return `${s.matricula},"${s.nome}",${s.primeiraEntrada},${s.ultimaSaida},${s.permanenciaTotal}`;
      }).join("\n");

      const fullCsvContent = headers + csvContent + `\n${new Date(this.currentSession.startTime).toLocaleDateString()} - Tempo mínimo: ${this.minStayTime} min`;

      this._downloadFile(fullCsvContent, this._buildFileName("resumo_permanencia_sessao", this.currentSession), "text/csv");
    }
  }

  exportArchivedSessionLog(sessionId) {
    const session = this.archivedSessions.find(s => s.id === sessionId);
    if (!session) {
      console.error(`Sessão arquivada com ID ${sessionId} não encontrada.`);
      return;
    }
    this.saveEventLog(session.eventLog, session);
  }

  exportArchivedSessionSummary(sessionId) {
    const session = this.archivedSessions.find(s => s.id === sessionId);
    if (!session) {
      console.error(`Sessão arquivada com ID ${sessionId} não encontrada.`);
      return;
    }
    if (!session.summary || session.summary.length === 0) {
      console.warn("Nenhum dado para salvar no resumo da sessão arquivada.");
      return;
    }
    const headers = "Matrícula,Nome,Primeira Entrada,Última Saída,Permanência Total (min)\n";
    const csvContent = session.summary.map(s => {
      return `${s.matricula},"${s.nome}",${s.primeiraEntrada},${s.ultimaSaida},${s.permanenciaTotal}`;
    }).join("\n");

    const minimo = session.minStayTime || this.defaultMinStayTime;
    const fullCsvContent = headers + csvContent + `\n${new Date(session.startTime).toLocaleDateString()} - Tempo mínimo: ${minimo} min`;

    this._downloadFile(fullCsvContent, this._buildFileName("resumo_permanencia_sessao_arquivada", session), "text/csv");
  }

  _downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  getCurrentSessionInfo() {
    if (this.currentSession.id) {
      const start = new Date(this.currentSession.startTime);
      return `Sessão Atual: ${this.currentSession.id} (Início: ${start.toLocaleDateString()} ${start.toLocaleTimeString()})`;
    }
    return "Nenhuma sessão ativa.";
  }

  /** Sessões arquivadas, da mais recente para a mais antiga, prontas para a tela. */
  getArchivedSessionsList() {
    return this.archivedSessions
      .slice()
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      .map(session => {
        const inicio = new Date(session.startTime);
        const fim = new Date(session.endTime);
        const alunos = new Set((session.eventLog || []).map(e => e.matricula)).size;

        return {
          id: session.id,
          listaTag: session.listaTag || "",
          data: inicio.toLocaleDateString(),
          inicio: inicio.toLocaleTimeString(),
          fim: fim.toLocaleTimeString(),
          duracao: `${Math.round((fim.getTime() - inicio.getTime()) / (1000 * 60))} min`,
          eventos: (session.eventLog || []).length,
          alunos,
          minStayTime: session.minStayTime || this.defaultMinStayTime,
        };
      });
  }

  /**
   * Apaga uma sessão arquivada, do histórico e do localStorage.
   * Não tem volta — quem chama é que confirma com o usuário.
   */
  deleteArchivedSession(sessionId) {
    const antes = this.archivedSessions.length;
    this.archivedSessions = this.archivedSessions.filter(session => session.id !== sessionId);

    if (this.archivedSessions.length === antes) {
      console.error(`Sessão arquivada ${sessionId} não encontrada.`);
      return false;
    }

    this._removeSessionFromLocalStorage(sessionId);
    this._saveToLocalStorage();
    console.log(`Sessão arquivada ${sessionId} apagada.`);
    return true;
  }
}

// Classe principal da aplicação
class App {
  constructor() {
    this.dom = new DOMManager();
    this.data = new StudentDataManager();
    this.matriculaFocusTimer = null;
    this.matriculaFocusSeconds = 0;
    this.tempoCursor = 2000;

    this._setupEventListeners();
    this._startFocusTimer();
    this._startClock();
    this.dom.focusBarInput();
    this.dom.updateDisplay("minTimeDisplay", `${this.data.minStayTime}`);
    this._updateUIForCurrentSession();
  }

  _startClock() {
    const updateClock = () => {
      const now = new Date();
      const currentTime = now.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });
      this.dom.updateDisplay("clockDisplay", currentTime);
    };

    updateClock();
    setInterval(updateClock, 1000);
  }

  _setupEventListeners() {
    this.dom.get("barInput").addEventListener("change", () => this.handleMatriculaChange());
    this.dom.get("buttonSave").addEventListener("click", () => this.data.saveEventLog(this.data.currentSession.eventLog));
    this.dom.get("buttonStart").addEventListener("click", () => this.startSystem());
    this.dom.get("lineInput").addEventListener("change", () => this.handleRemoveLine());
    if (this.dom.get("buttonSaveSummary")) {
      this.dom.get("buttonSaveSummary").addEventListener("click", () => this.data.saveSummaryLog(true));
    }
    if (this.dom.get("sessionControlButton")) {
      this.dom.get("sessionControlButton").addEventListener("click", () => this.handleSessionControl());
    }

    const modalSessoes = document.getElementById("archived-sessions-modal");
    if (modalSessoes) {
      // Preenche na abertura, para a lista nunca estar desatualizada
      modalSessoes.addEventListener("show.bs.modal", () => this.renderArchivedSessions());
      // Delegação: as linhas são recriadas a cada abertura
      modalSessoes.addEventListener("click", (evento) => this.handleArchivedSessionAction(evento));
    }
  }

  _startFocusTimer() {
    this.matriculaFocusTimer = setInterval(() => {
      if (document.activeElement !== this.dom.get("barInput")) {
        this.matriculaFocusSeconds++;
        if (this.matriculaFocusSeconds >= (this.tempoCursor / 1000) * 5) {
          this.dom.focusBarInput();
          this.matriculaFocusSeconds = 0;
        }
      } else {
        this.matriculaFocusSeconds = 0;
      }
    }, this.tempoCursor);
  }

  startSystem() {
    console.log("Iniciando o sistema...");
    this.dom.get("buttonStart").disabled = true;
    this._openFile();
    this.dom.focusBarInput();
  }

  _openFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls,.json,.csv";

    input.addEventListener("change", (event) => {
      const file = event.target.files[0];
      if (!file) {
        console.error("Nenhum arquivo selecionado.");
        return;
      }

      const nome = file.name.toLowerCase();
      const isJson = nome.endsWith(".json");
      const isCsv = nome.endsWith(".csv");

      const reader = new FileReader();

      reader.onload = (e) => {
        if (isCsv && String(e.target.result).includes("\uFFFD")) {
          // Não é UTF-8: é o "CSV separado por vírgulas" que o Excel salva em ANSI.
          // Relê em windows-1252 para os acentos dos nomes não virarem lixo no log.
          const segundaTentativa = new FileReader();
          segundaTentativa.onload = (ev) => {
            this.data.loadStudentNamesFromCsv(ev.target.result, file.name);
            this._marcarListaCarregada();
          };
          segundaTentativa.onerror = reader.onerror;
          segundaTentativa.readAsText(file, "windows-1252");
          return;
        }

        if (isCsv) {
          this.data.loadStudentNamesFromCsv(e.target.result, file.name);
        } else if (isJson) {
          this.data.loadStudentNamesFromJson(e.target.result, file.name);
        } else {
          this.data.loadStudentNamesFromExcel(e.target.result, file.name);
        }

        this._marcarListaCarregada();
      };

      reader.onerror = (e) => {
        console.error("Erro ao ler o arquivo:", e.target.error);
        // Restaura o botão em caso de erro
        this.dom.get("buttonStart").disabled = false;
      };

      if (isJson || isCsv) {
        reader.readAsText(file, "utf-8");
      } else {
        reader.readAsArrayBuffer(file);
      }
    });

    input.click();
  }

  /**
   * Botão passa a verde com a etiqueta da lista. Sem contagem: `studentNames` é a
   * soma de todas as listas já carregadas, então o número não diz quantos alunos
   * tem a disciplina que acabou de ser aberta.
   */
  _marcarListaCarregada() {
    const total = this.data.studentNames.size;
    const etiqueta = this.data.listaTag;
    const botao = this.dom.get("buttonStart");

    botao.textContent = total > 0
      ? `Lista Carregada${etiqueta ? `: ${etiqueta}` : ""}`
      : "Lista não reconhecida — tente outro arquivo";
    botao.classList.remove(total > 0 ? "btn-danger" : "btn-success");
    botao.classList.add(total > 0 ? "btn-success" : "btn-danger");
    botao.disabled = false;
  }

  handleMatriculaChange() {
    const matricula = this.dom.get("barInput").value.trim();
    if (!matricula) return;

    const { status, permanencia, nome, primeiroNome, horaEntrada, shouldUpdateOccupancy } = this.data.registerEvent(matricula);

    // O 900250 abre caixa de diálogo, então sai do fluxo normal de exibição
    if (status === "Ajustar Mínimo") {
      this._promptNovoTempoMinimo();
      this.dom.get("barInput").value = "";
      this._updateUIForCurrentSession();
      this.dom.focusBarInput();
      return;
    }

    this.dom.updateDisplay("permanenciaDisplay", `Tempo de Permanência: ${permanencia.toFixed(2)} min`);
    this.dom.updateDisplay("entradaDisplay", `Entrada: ${horaEntrada}`);
    this.dom.updateDisplay("nomeDisplay", `Nome: ${nome || "Não encontrado"}`);

    if (status === "Entrada") {
      this.dom.updateDisplay("situacaoDisplay", `<span class="status-top-line"><span class="status-prefix">Entrada:</span></span><span class="status-name-line">${primeiroNome}</span>`, "green", "10rem");
    } else if (status === "Saída") {
      if (permanencia < this.data.minStayTime) {
        this.dom.updateDisplay("situacaoDisplay", `<span class="status-top-line"><span class="status-prefix">Tempo:</span> ${permanencia.toFixed(2)} <span class="status-prefix">min</span></span><span class="status-name-line">${primeiroNome}</span>`, "red", "10rem");
      } else {
        this.dom.updateDisplay("situacaoDisplay", `<span class="status-top-line"><span class="status-prefix">OK:</span></span><span class="status-name-line">${primeiroNome}</span>`, "green", "10rem");
      }
    } else if (status === "Tempo Ajustado") {
      this.dom.updateDisplay("situacaoDisplay", `<span class="status-top-line"><span class="status-prefix">Ajustado:</span> ${permanencia.toFixed(2)} <span class="status-prefix">min</span></span><span class="status-name-line">${primeiroNome}</span>`, "green", "10rem");
    } else if (status === "Aviso") {
      this.dom.updateDisplay("situacaoDisplay", `<span class="status-top-line"><span class="status-prefix">Sem ajuste:</span> ${permanencia.toFixed(2)} <span class="status-prefix">min</span></span><span class="status-name-line">${primeiroNome}</span>`, "orange", "10rem");
    } else if (status === "Nova Entrada") {
      this.dom.updateDisplay("situacaoDisplay", `<span class="status-top-line"><span class="status-prefix">Nova entrada:</span></span><span class="status-name-line">${primeiroNome}</span>`, "green", "10rem");
    } else if (status === "Erro") {
      this.dom.updateDisplay("situacaoDisplay", `<span class="status-name-line">${primeiroNome}</span>`, "red", "10rem");
    } else if (status === "Código") {
      this.dom.updateDisplay("situacaoDisplay", `<span class="status-name-line">${primeiroNome}</span>`, "blue", "10rem");
    } else if (status === "Cancelado") {
      this.dom.updateDisplay("situacaoDisplay", `<span class="status-name-line">${primeiroNome}</span>`, "orange", "10rem");
    } else if (status === "Desfeito") {
      this.dom.updateDisplay("situacaoDisplay", `<span class="status-name-line">${primeiroNome}</span>`, "purple", "10rem");
    }

    if (shouldUpdateOccupancy) {
      this.dom.updateDisplay("espacoDisplay", `${this.data.currentSession.currentOccupancy}`, null, "20rem", "center");
    }

    this.dom.get("barInput").value = "";
    this._updateUIForCurrentSession();
    this.dom.focusBarInput();
  }

  /**
   * Código 900250 — pergunta o novo tempo mínimo da sessão e confirma a mudança.
   * Vale só para a sessão atual; a próxima volta ao padrão.
   */
  _promptNovoTempoMinimo() {
    const atual = this.data.minStayTime;

    const resposta = prompt(
      `TEMPO MÍNIMO DE PERMANÊNCIA\n\n` +
      `Valor atual: ${atual} minutos.\n\n` +
      `Digite o novo tempo mínimo, em minutos:`,
      `${atual}`
    );

    if (resposta === null) {
      this.dom.updateDisplay("situacaoDisplay", `<span class="status-name-line">CANCELADO</span>`, "orange", "10rem");
      return;
    }

    const novo = Number(String(resposta).trim().replace(",", "."));

    if (!Number.isInteger(novo) || novo < 1 || novo > 600) {
      alert(
        `VALOR INVÁLIDO\n\n` +
        `"${resposta}" não serve.\n\n` +
        `Informe um número inteiro de minutos, entre 1 e 600.\n\n` +
        `O tempo mínimo continua em ${atual} minutos.`
      );
      this.dom.updateDisplay("situacaoDisplay", `<span class="status-name-line">INVÁLIDO</span>`, "red", "10rem");
      return;
    }

    if (novo === atual) {
      alert(`O tempo mínimo já é ${atual} minutos.\n\nNada foi alterado.`);
      this.dom.updateDisplay("situacaoDisplay", `<span class="status-top-line"><span class="status-prefix">Mínimo:</span> ${atual} <span class="status-prefix">min</span></span><span class="status-name-line">SEM MUDANÇA</span>`, "orange", "10rem");
      return;
    }

    const confirmou = confirm(
      `CONFIRMAR MUDANÇA\n\n` +
      `Tempo mínimo:  ${atual}  →  ${novo} minutos\n\n` +
      `• Vale para ESTA sessão; a próxima volta a ${this.data.defaultMinStayTime} min\n` +
      `• Muda a cor do display (verde/vermelho) nas próximas saídas\n` +
      `• O código 900260 passa a ajustar para ${novo + 1} min\n` +
      `• Os registros já feitos NÃO são recalculados\n\n` +
      `Confirma?`
    );

    if (!confirmou) {
      this.dom.updateDisplay("situacaoDisplay", `<span class="status-name-line">CANCELADO</span>`, "orange", "10rem");
      return;
    }

    if (!this.data.setMinStayTime(novo)) {
      alert(`Não foi possível ajustar o tempo mínimo para ${novo}.`);
      return;
    }

    this.dom.updateDisplay("minTimeDisplay", `${novo}`);
    this.dom.updateDisplay("situacaoDisplay", `<span class="status-top-line"><span class="status-prefix">Mínimo:</span> ${novo} <span class="status-prefix">min</span></span><span class="status-name-line">AJUSTADO</span>`, "blue", "10rem");
  }

  handleRemoveLine() {
    const matriculaToRemove = this.dom.get("lineInput").value.trim();
    if (!matriculaToRemove) return;

    if (this.data.removeEventByMatricula(matriculaToRemove)) {
      this._updateUIForCurrentSession();
    }
    this.dom.get("lineInput").value = "";
  }

  handleSessionControl() {
    if (this.data.currentSession.id) {
      // Se há uma sessão ativa, o botão finaliza
      const hasEvents = this.data.currentSession.eventLog.length > 0;
      
      if (hasEvents) {
        // Pergunta sobre salvamento apenas se há eventos
        const saveChoice = confirm(
          `FINALIZAR SESSÃO\n\n` +
          `A sessão atual possui ${this.data.currentSession.eventLog.length} evento(s) registrado(s).\n\n` +
          `Deseja SALVAR automaticamente o log antes de finalizar?\n\n` +
          `• OK = Salvar arquivo e finalizar\n` +
          `• Cancelar = Finalizar sem salvar arquivo\n\n` +
          `(Os dados ficarão no localStorage de qualquer forma)`
        );
        
        if (saveChoice) {
          this.data.saveEventLog(this.data.currentSession.eventLog);
        }
      }
      
      // Confirma a finalização final
      const finalConfirm = confirm(
        `CONFIRMAÇÃO FINAL\n\n` +
        `Finalizar a sessão atual?\n\n` +
        `• A sessão será arquivada\n` +
        `• A tela será limpa\n` +
        `• Uma nova sessão será iniciada\n\n` +
        `Confirma a finalização?`
      );
      
      if (finalConfirm) {
        // Executa a finalização
        this.data.endCurrentSession();
        this.data.startNewSession(false);
        
        // Limpa a interface
        this.dom.clearTable();
        this.dom.clearDisplays();
        
        // Atualiza a UI
        this._updateUIForCurrentSession();
        
        alert("✅ Sessão finalizada com sucesso!\n\nNova sessão iniciada.");
      }
    } else {
      // Se não há sessão ativa, o botão inicia uma nova
      this.data.startNewSession(false);
      this._updateUIForCurrentSession();
      alert("✅ Nova sessão iniciada!");
    }
  }

  /** Monta a tabela de sessões arquivadas do modal "Sessões Anteriores". */
  renderArchivedSessions() {
    this.renderStudentListInfo();

    const corpo = this.dom.get("archivedSessionsBody");
    if (!corpo) return;

    const sessoes = this.data.getArchivedSessionsList();

    if (sessoes.length === 0) {
      corpo.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-3">Nenhuma sessão arquivada.</td></tr>`;
      return;
    }

    corpo.innerHTML = sessoes.map(s => `
      <tr>
        <td>${this._escaparHtml(s.listaTag) || "—"}</td>
        <td>${this._escaparHtml(s.data)}</td>
        <td>${this._escaparHtml(s.inicio)}</td>
        <td>${this._escaparHtml(s.duracao)}</td>
        <td>${s.alunos}</td>
        <td>${s.eventos}</td>
        <td>${s.minStayTime} min</td>
        <td class="text-end text-nowrap">
          <button type="button" class="btn btn-sm btn-info" data-acao="log" data-sessao="${this._escaparHtml(s.id)}">Log</button>
          <button type="button" class="btn btn-sm btn-primary" data-acao="resumo" data-sessao="${this._escaparHtml(s.id)}">Resumo</button>
          <button type="button" class="btn btn-sm btn-outline-danger" data-acao="apagar" data-sessao="${this._escaparHtml(s.id)}">Apagar</button>
        </td>
      </tr>`).join("");
  }

  /** Linha de resumo da lista de alunos, dentro do modal. */
  renderStudentListInfo() {
    const alvo = this.dom.get("studentListInfo");
    if (!alvo) return;

    const { total, apelidos, listaTag } = this.data.getStudentListInfo();

    if (total === 0) {
      alvo.textContent = "Nenhuma lista carregada.";
      return;
    }

    const partes = [`${total} aluno(s) reconhecidos`];
    if (apelidos > 0) partes.push(`${apelidos} apelido(s) de matrícula`);
    if (listaTag) partes.push(`última lista: ${listaTag}`);

    alvo.textContent =
      `${partes.join(" · ")}. As listas carregadas se somam, de todas as disciplinas — ` +
      `apagar remove todas de uma vez.`;
  }

  /** Cliques nos botões de cada linha do modal. */
  handleArchivedSessionAction(evento) {
    const botao = evento.target.closest("[data-acao]");
    if (!botao) return;

    const sessionId = botao.dataset.sessao;
    const acao = botao.dataset.acao;

    if (acao === "apagar-listas") {
      this.handleClearStudentList();
      return;
    }

    if (acao === "log") {
      this.data.exportArchivedSessionLog(sessionId);
      return;
    }

    if (acao === "resumo") {
      this.data.exportArchivedSessionSummary(sessionId);
      return;
    }

    if (acao === "apagar") {
      const linha = this.data.getArchivedSessionsList().find(s => s.id === sessionId);
      const descricao = linha
        ? `${linha.listaTag ? linha.listaTag + " — " : ""}${linha.data} às ${linha.inicio}, ${linha.alunos} aluno(s)`
        : sessionId;

      const confirmou = confirm(
        `APAGAR SESSÃO ARQUIVADA\n\n` +
        `${descricao}\n\n` +
        `• Os dados dessa aula serão perdidos definitivamente\n` +
        `• Não há como desfazer\n\n` +
        `Se ainda não baixou o log dessa aula, cancele e baixe antes.\n\n` +
        `Confirma a exclusão?`
      );

      if (confirmou && this.data.deleteArchivedSession(sessionId)) {
        this.renderArchivedSessions();
      }
    }
  }

  /** Apaga a lista de alunos de todas as disciplinas, com confirmação. */
  handleClearStudentList() {
    const { total, listaTag } = this.data.getStudentListInfo();

    if (total === 0) {
      alert("Não há nenhuma lista carregada para apagar.");
      return;
    }

    const confirmou = confirm(
      `APAGAR LISTAS DE ALUNOS\n\n` +
      `${total} aluno(s) de TODAS as disciplinas já carregadas` +
      `${listaTag ? ` (a última foi ${listaTag})` : ""}.\n\n` +
      `• Os próximos bipes sairão como "Sem nome" até você carregar uma lista\n` +
      `• Os nomes já registrados nesta sessão e no histórico NÃO se perdem\n` +
      `• Não há como desfazer: será preciso carregar os arquivos de novo\n\n` +
      `Confirma?`
    );

    if (!confirmou) return;

    this.data.clearStudentNames();
    this.renderStudentListInfo();

    // Botão de carregar volta ao estado inicial
    const botao = this.dom.get("buttonStart");
    if (botao) {
      botao.textContent = "Carregar Lista Alunos (.csv/.xlsx/.json)";
      botao.classList.remove("btn-success");
      botao.classList.add("btn-danger");
      botao.disabled = false;
    }

    alert("Listas de alunos apagadas.");
  }

  /** Escapa texto antes de ir para innerHTML. */
  _escaparHtml(valor) {
    return String(valor === undefined || valor === null ? "" : valor)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  _updateUIForCurrentSession() {
    this.updateRealTimeTable();
    this.dom.updateDisplay("espacoDisplay", `${this.data.currentSession.currentOccupancy}`, null, "20rem", "center");
    this.dom.updateDisplay("sessionInfoDisplay", this.data.getCurrentSessionInfo());
    this.dom.updateDisplay("minTimeDisplay", `${this.data.minStayTime}`);

    const sessionButton = this.dom.get("sessionControlButton");
    if (sessionButton) {
        if (this.data.currentSession.id) {
            sessionButton.textContent = "Finalizar Sessão";
            sessionButton.classList.remove("btn-success");
            sessionButton.classList.add("btn-warning");
        } else {
            sessionButton.textContent = "Nova Sessão";
            sessionButton.classList.remove("btn-warning");
            sessionButton.classList.add("btn-success");
        }
    }
  }

  updateRealTimeTable() {
    const tableData = this.data.getRealTimeTableData();
    const fields = ["id", "Matricula", "Nome", "Entrada", "Permanencia", "Situacao"];
    this.dom.get("barTableBody").innerHTML = tableData
      .map((row) => this._createTableRow(row, fields))
      .join("");
    this._scrollToTop(this.dom.get("barTableBody").parentElement.parentElement);
  }

  _createTableRow(rowData, fields) {
    return `<tr>${fields
      .map((field) => `<td>${rowData[field]}</td>`)
      .join("")}</tr>`;
  }

  _scrollToTop(element) {
    if (element) {
      element.scrollTop = 0;
    }
  }
}

// Inicializa a aplicação quando o DOM estiver carregado
document.addEventListener("DOMContentLoaded", () => {
  new App();
});

