# -*- coding: utf-8 -*-
"""Reescreve as referencias `app.js:NNN` do MUDANCAS.md a partir de ancoras no codigo.

Cada par e (regex que casa a referencia no markdown, ancora literal no app.js).
O regex precisa ter um grupo (\\d+) no numero. Toda referencia do documento tem
de ser coberta por algum par -- o script reclama das que sobrarem.
"""
import io, re, sys

BASE = "G:\\Meu Drive\\_Projetos - Google\\1_Projetos ReSCI\\__Softwares\\AULAS\\C\u00f3digos em EQUIPE112-UFV\\DEV_codigo barra\\"

app = io.open(BASE + "app.js", encoding="utf-8", newline="").read().split("\n")
doc = io.open(BASE + "MUDANCAS.md", encoding="utf-8", newline="").read()


def linha_de(ancora):
    for i, l in enumerate(app, 1):
        if l.strip().startswith(ancora):
            return i
    raise SystemExit("ancora nao encontrada no app.js: " + ancora)


PARES = [
    (r"(?<=`_normalizeMatricula\(value\)` \u2014 `app\.js:)\d+", "_normalizeMatricula(value) {"),
    (r"(?<=`_resolveMatricula\(value\)` \u2014 `app\.js:)\d+", "_resolveMatricula(value) {"),
    (r"(?<=apelidos \(`matriculaAliases`, `app\.js:)\d+", "this.matriculaAliases = new Map(); //"),
    (r"(?<=`_registerMatriculaAliases\(raw, matricula\)` \u2014 `app\.js:)\d+", "_registerMatriculaAliases(raw, matricula) {"),
    (r"(?<=`_pruneMatriculaAliases\(\)` \u2014 `app\.js:)\d+", "_pruneMatriculaAliases() {"),
    (r"(?<=`studentData_matriculaAliases` \(`app\.js:)\d+", "this.matriculaAliases = new Map(matriculaAliasesRaw"),
    (r"(?<=lida: `registerEvent` \(`app\.js:)\d+", "registerEvent(matricula) {"),
    (r"(?<=  `removeEventByMatricula` \(`app\.js:)\d+", "removeEventByMatricula(matriculaToRemove) {"),
    (r"(?<=`currentSession\.exitedStudents` \u2014 `app\.js:)\d+", "exitedStudents: new Map(), // Map<matricula"),
    (r"(?<=tr\u00eas casos em vez de dois \(`app\.js:)\d+", "registerEvent(matricula) {"),
    (r"(?<=`_rebuildStateFromLog\(\)` \u2014 `app\.js:)\d+", "_rebuildStateFromLog() {"),
    (r"(?<=\(`_generateSessionSummary`, `app\.js:)\d+", "_generateSessionSummary(eventLog,"),
    (r"(?<=^- `app\.js:)\d+(?=` \u2014 `fields`)", "const fields = [\"id\", \"Matricula\""),
    (r"(?<=`convertLastReadingToEntry\(\)` \u2014 `app\.js:)\d+", "convertLastReadingToEntry() {"),
    (r"(?<=`cancelEntry` para `newEntry` \(`app\.js:)\d+", "['900112', { action: 'newEntry'"),
    (r"(?<=m\u00e9todo direto \(`app\.js:)\d+", "case 'newEntry':"),
    (r"(?<=Feedback na tela \(`app\.js:)\d+(?=`\): novo status)", '} else if (status === "Nova Entrada") {'),
    (r"(?<=`adjustLastReadingTime\(\)` \u2014 `app\.js:)\d+", "adjustLastReadingTime() {"),
    (r"(?<=`_findEntryEventFor\(saidaEvent\)` \u2014 `app\.js:)\d+", "_findEntryEventFor(saidaEvent) {"),
    (r"(?<=  \(`app\.js:)\d+(?=`\), e o ramo `extendTime`)", "['900260', { action: 'adjustTime'"),
    (r"(?<=Feedback na tela \(`app\.js:)\d+(?=`\): `Ajustado)", '} else if (status === "Tempo Ajustado") {'),
    (r"(?<=virou um \*\*getter\*\*\n  \(`app\.js:)\d+", "get minStayTime() {"),
    (r"(?<=`this\.defaultMinStayTime = 45` \(`app\.js:)\d+", "this.defaultMinStayTime = 45;"),
    (r"(?<=`setMinStayTime\(valor\)` \u2014 `app\.js:)\d+", "setMinStayTime(valor) {"),
    (r"(?<=`handleSpecialCode` \(`app\.js:)\d+", "case 'newMinTime':"),
    (r"(?<=`App\._promptNovoTempoMinimo\(\)` \u2014 `app\.js:)\d+", "_promptNovoTempoMinimo() {"),
    (r"(?<=desvia para ele \(`app\.js:)\d+", 'if (status === "Ajustar M\u00ednimo") {'),
    (r"(?<=`_buildListTag\(fileName\)` \u2014 `app\.js:)\d+", "_buildListTag(fileName) {"),
    (r"(?<=`setStudentListName\(fileName\)` \u2014 `app\.js:)\d+", "setStudentListName(fileName) {"),
    (r"(?<=nome do arquivo \(`app\.js:)\d+", "loadStudentNamesFromExcel(arrayBuffer, fileName) {"),
    (r"(?<=e `app\.js:)\d+(?=`\); quem passa)", "loadStudentNamesFromJson(jsonContent, fileName) {"),
    (r"(?<=`_buildFileName\(prefixo, session\)` \u2014 `app\.js:)\d+", "_buildFileName(prefixo, session) {"),
    (r"(?<=a ser copiados \(`app\.js:)\d+", "minStayTime: this.currentSession.minStayTime,"),
    (r"(?<=passou a\nreceber a sess\u00e3o \(`app\.js:)\d+", "saveEventLog(dataArray, session = this.currentSession) {"),
    (r"(?<=`_parseCsv\(text, separador\)` \u2014 `app\.js:)\d+", "_parseCsv(text, separador) {"),
    (r"(?<=`_detectCsvSeparator\(text\)` \u2014 `app\.js:)\d+", "_detectCsvSeparator(text) {"),
    (r"(?<=`_mapCsvColumns\(cabecalho\)` \u2014 `app\.js:)\d+", "_mapCsvColumns(cabecalho) {"),
    (r"(?<=`loadStudentNamesFromCsv\(csvContent, fileName\)` \u2014 `app\.js:)\d+", "loadStudentNamesFromCsv(csvContent, fileName) {"),
    (r"(?<=O `_openFile` \(`app\.js:)\d+", "_openFile() {"),
    (r"(?<=`_marcarListaCarregada\(\)` \(`app\.js:)\d+", "_marcarListaCarregada() {"),
    (r"(?<=`endCurrentSession` \(`app\.js:)\d+", "endCurrentSession() {"),
    (r"(?<=`getArchivedSessionsList\(\)` \(`app\.js:)\d+", "getArchivedSessionsList() {"),
    (r"(?<=`renderArchivedSessions\(\)` \(`app\.js:)\d+", "renderArchivedSessions() {"),
    (r"(?<=`handleArchivedSessionAction\(\)`\n  \(`app\.js:)\d+", "handleArchivedSessionAction(evento) {"),
    (r"(?<=`deleteArchivedSession`,\n  `app\.js:)\d+", "deleteArchivedSession(sessionId) {"),
    (r"(?<=`_escaparHtml\(\)` \(`app\.js:)\d+", "_escaparHtml(valor) {"),
    (r"(?<=`_saveCurrentSession\(\)` \(`app\.js:)\d+", "_saveCurrentSession() {"),
    (r"(?<=`_criarSessao\(id, startTime\)`\*\* \(`app\.js:)\d+", "_criarSessao(id = null, startTime = null) {"),
    (r"(?<=`_gerarIdDeSessao\(now\)`\*\* \(`app\.js:)\d+", "_gerarIdDeSessao(now) {"),
    (r"(?<=`_refreshSessionNames\(\)` \u2014 `app\.js:)\d+", "_refreshSessionNames() {"),
    (r"(?<=`getStudentListInfo\(\)` \(`app\.js:)\d+", "getStudentListInfo() {"),
    (r"(?<=`renderStudentListInfo\(\)` \(`app\.js:)\d+", "renderStudentListInfo() {"),
    (r"(?<=`clearStudentNames\(\)` \(`app\.js:)\d+", "clearStudentNames() {"),
    (r"(?<=`handleClearStudentList\(\)` \(`app\.js:)\d+", "handleClearStudentList() {"),
    (r"(?<=`_marcarListaCarregada\(\)` \(`app\.js:)\d+", "_marcarListaCarregada() {"),
]

trocas = 0
sem_uso = []

for padrao, ancora in PARES:
    alvo = str(linha_de(ancora))
    doc, n = re.subn(padrao, alvo, doc, flags=re.M)
    if n == 0:
        sem_uso.append(padrao[:50])
    trocas += n

io.open(BASE + "MUDANCAS.md", "w", encoding="utf-8", newline="").write(doc)

print("referencias atualizadas:", trocas)
if sem_uso:
    print("pares que nao casaram nada (regex desatualizado?):")
    for p in sem_uso:
        print("   ", p)

# Conferencia: toda referencia tem de apontar para uma linha com conteudo util
ruins = []
for m in re.finditer(r"app\.js:(\d+)", doc):
    n = int(m.group(1))
    conteudo = app[n - 1].strip() if n <= len(app) else "(fora do arquivo)"
    if conteudo in ("", "}", "};", "*", "*/", "});"):
        ruins.append((n, conteudo))

if ruins:
    print("REFERENCIAS QUEBRADAS:", ruins)
else:
    print("todas as referencias apontam para uma linha util")
