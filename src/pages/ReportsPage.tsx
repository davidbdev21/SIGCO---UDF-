import React, { useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { useClinicData } from '../hooks/useClinicData';
import { INITIAL_SPECIALTIES, PATIENT_STATUS_LABELS } from '../utils/validation';
import { InstitutionalLockup, PatientStatusBadge } from '../components/BrandIdentity';
import { ContextualHelp } from '../components/ContextualHelp';

export const ReportsPage: React.FC = () => {
  const {
    patients,
    appointments,
    attendanceRecords,
    evolutions,
    students,
    professors,
  } = useClinicData();

  const [reportType, setReportType] = useState<
    | 'pacientes'
    | 'lista_espera'
    | 'consultas'
    | 'faltas_rn01'
    | 'encaminhamentos'
    | 'produtividade_aluno'
    | 'atendimentos_professor'
  >('pacientes');
  const [specialtyFilter, setSpecialtyFilter] = useState('ALL');
  const [studentFilter, setStudentFilter] = useState('ALL');
  const [professorFilter, setProfessorFilter] = useState('ALL');

  const exportCsv = () => {
    let headers: string[] = [];
    let rows: string[][] = [];

    if (reportType === 'pacientes') {
      headers = ['Nome', 'CPF', 'Especialidade', 'Status', 'Prioridade', 'Faltas Nao Justificadas'];
      rows = patients
        .filter((p) => specialtyFilter === 'ALL' || p.specialtyNeeded === specialtyFilter)
        .map((p) => [
          p.name,
          p.cpf,
          p.specialtyNeeded,
          PATIENT_STATUS_LABELS[p.status],
          p.priority,
          String(p.unjustifiedAbsences),
        ]);
    } else if (reportType === 'faltas_rn01') {
      headers = ['Data', 'Paciente', 'Tipo', 'Desligamento RN01', 'Justificativa', 'Responsavel'];
      rows = attendanceRecords.map((a) => [
        a.date,
        a.patientName,
        a.type,
        a.triggeredProgramRemoval ? 'SIM (RN01)' : 'NAO',
        a.justification,
        a.recordedByEmail,
      ]);
    } else {
      headers = ['Data', 'Paciente', 'Especialidade', 'Aluno', 'Professor', 'Status'];
      rows = appointments.map((a) => [
        a.date,
        a.patientName,
        a.specialty,
        a.studentName,
        a.professorName,
        a.status,
      ]);
    }

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `relatorio_sigco_${reportType}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Institutional Report Header */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <InstitutionalLockup size="sm" />
          <div className="flex items-center gap-2 pt-1">
            <h1 className="text-xl sm:text-2xl font-bold text-[#003366] tracking-tight">
              Relatórios
            </h1>
            <ContextualHelp
              title="Relatórios e Indicadores"
              description="Consulte indicadores por período, especialidade, aluno, professor ou status e exporte os dados."
            />
          </div>
          <p className="text-xs text-[#64748B]">
            Consulte indicadores da clínica com filtros por especialidade, aluno e professor.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={exportCsv}
            className="px-3.5 py-2.5 bg-white hover:bg-[#E6F6FF] text-[#003366] border border-[#00AEEF] text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-4 h-4 text-[#00AEEF]" />
            <span>Exportar Excel / CSV</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-2.5 bg-[#00AEEF] hover:bg-[#007BFF] text-white text-xs font-semibold rounded-xl shadow-2xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Printer className="w-4 h-4" />
            <span>Exportar PDF / Imprimir</span>
          </button>
        </div>
      </div>

      {/* Report Selector & Filters */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-[#003366] mb-1">
            Tipo de Relatório
          </label>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value as any)}
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC] text-[#003366] font-semibold"
          >
            <option value="pacientes">Pacientes Cadastrados e por Especialidade</option>
            <option value="lista_espera">Lista de Espera Centralizada</option>
            <option value="consultas">Consultas Realizadas e Canceladas</option>
            <option value="faltas_rn01">Relatório de Faltas e Desligamentos RN01</option>
            <option value="encaminhamentos">Encaminhamentos entre Clínicas</option>
            <option value="produtividade_aluno">Produtividade por Aluno</option>
            <option value="atendimentos_professor">Atendimentos por Professor Supervisor</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-[#003366] mb-1">
            Filtrar Especialidade
          </label>
          <select
            value={specialtyFilter}
            onChange={(e) => setSpecialtyFilter(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
          >
            <option value="ALL">Todas as Especialidades</option>
            {INITIAL_SPECIALTIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-[#003366] mb-1">
            Filtrar Aluno
          </label>
          <select
            value={studentFilter}
            onChange={(e) => setStudentFilter(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
          >
            <option value="ALL">Todos os Alunos</option>
            {students.map((s) => (
              <option key={s.id} value={s.email}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-[#003366] mb-1">
            Filtrar Professor Supervisor
          </label>
          <select
            value={professorFilter}
            onChange={(e) => setProfessorFilter(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
          >
            <option value="ALL">Todos os Professores</option>
            {professors.map((p) => (
              <option key={p.id} value={p.email}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary KPI Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
          <div className="text-xs text-[#64748B]">Total de Pacientes</div>
          <div className="text-2xl font-bold tabular-nums text-[#003366] mt-1">
            {patients.length}
          </div>
        </div>
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
          <div className="text-xs text-[#64748B]">Tratamentos em Andamento</div>
          <div className="text-2xl font-bold tabular-nums text-[#00AEEF] mt-1">
            {patients.filter((p) => p.status === 'EM_TRATAMENTO').length}
          </div>
        </div>
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
          <div className="text-xs text-[#64748B]">Tratamentos Concluídos / Alta</div>
          <div className="text-2xl font-bold tabular-nums text-[#003366] mt-1">
            {patients.filter((p) => p.status === 'CONCLUIDO' || p.status === 'ALTA').length}
          </div>
        </div>
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
          <div className="text-xs text-[#64748B]">Desligamentos RN01 (2 Faltas)</div>
          <div className="text-2xl font-bold tabular-nums text-red-600 mt-1">
            {patients.filter((p) => p.status === 'CANCELADO').length}
          </div>
        </div>
      </div>

      {/* Report Content Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs">
        {reportType === 'produtividade_aluno' && (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 bg-[#F1F5F9]/70 text-[11px] font-semibold text-[#003366]">
                <th className="py-3.5 px-4">Aluno de Odontologia</th>
                <th className="py-3.5 px-4">Clínica / Semestre</th>
                <th className="py-3.5 px-4 text-right">Pacientes Vinculados</th>
                <th className="py-3.5 px-4 text-right">Consultas Agendadas/Atendidas</th>
                <th className="py-3.5 px-4 text-right">Evoluções Registradas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {students
                .filter((s) => studentFilter === 'ALL' || s.email === studentFilter)
                .map((s) => {
                  const patCount = patients.filter((p) => p.assignedStudentEmail === s.email).length;
                  const aptCount = appointments.filter((a) => a.studentEmail === s.email).length;
                  const evCount = evolutions.filter((e) => e.studentEmail === s.email).length;
                  return (
                    <tr key={s.id} className="hover:bg-[#E6F6FF]/35 transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-[#003366]">
                        {s.name} <span className="text-[#007BFF] font-normal">({s.email})</span>
                      </td>
                      <td className="py-3.5 px-4 text-[#64748B]">
                        {s.specialtyClinic} · {s.semester}
                      </td>
                      <td className="py-3.5 px-4 text-right tabular-nums font-bold text-[#003366]">
                        {patCount}
                      </td>
                      <td className="py-3.5 px-4 text-right tabular-nums text-[#1E293B]">
                        {aptCount}
                      </td>
                      <td className="py-3.5 px-4 text-right tabular-nums text-[#00AEEF] font-bold">
                        {evCount}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        )}

        {reportType === 'atendimentos_professor' && (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 bg-[#F1F5F9]/70 text-[11px] font-semibold text-[#003366]">
                <th className="py-3.5 px-4">Professor Supervisor</th>
                <th className="py-3.5 px-4">Especialidade / CRO</th>
                <th className="py-3.5 px-4 text-right">Alunos Supervisionados</th>
                <th className="py-3.5 px-4 text-right">Consultas Supervisionadas</th>
                <th className="py-3.5 px-4 text-right">Evoluções Validadas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {professors
                .filter((p) => professorFilter === 'ALL' || p.email === professorFilter)
                .map((p) => {
                  const stuCount = students.filter((s) => s.supervisorEmail === p.email).length;
                  const aptCount = appointments.filter((a) => a.professorEmail === p.email).length;
                  const valCount = evolutions.filter(
                    (e) => e.professorEmail === p.email && e.status === 'VALIDADO'
                  ).length;
                  return (
                    <tr key={p.id} className="hover:bg-[#E6F6FF]/35 transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-[#003366]">{p.name}</td>
                      <td className="py-3.5 px-4 text-[#64748B]">
                        {p.specialty} · <span className="tabular-nums">{p.cro}</span>
                      </td>
                      <td className="py-3.5 px-4 text-right tabular-nums">{stuCount}</td>
                      <td className="py-3.5 px-4 text-right tabular-nums">{aptCount}</td>
                      <td className="py-3.5 px-4 text-right tabular-nums text-[#00AEEF] font-bold">
                        {valCount}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        )}

        {reportType === 'faltas_rn01' && (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 bg-[#F1F5F9]/70 text-[11px] font-semibold text-[#003366]">
                <th className="py-3.5 px-4">Data</th>
                <th className="py-3.5 px-4">Paciente</th>
                <th className="py-3.5 px-4">Tipo de Registro</th>
                <th className="py-3.5 px-4">Acionou Desligamento RN01?</th>
                <th className="py-3.5 px-4">Justificativa / Histórico</th>
                <th className="py-3.5 px-4">Registrado por</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {attendanceRecords.map((a) => (
                <tr key={a.id} className="hover:bg-[#E6F6FF]/35 transition-colors">
                  <td className="py-3.5 px-4 tabular-nums text-[#64748B]">{a.date}</td>
                  <td className="py-3.5 px-4 font-semibold text-[#003366]">{a.patientName}</td>
                  <td className="py-3.5 px-4 font-medium text-[#1E293B]">{a.type}</td>
                  <td className="py-3.5 px-4">
                    {a.triggeredProgramRemoval ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-red-50 text-red-700 border border-red-200 text-[11px] font-bold">
                        SIM — Desligado Automaticamente (RN01)
                      </span>
                    ) : (
                      <span className="text-[#64748B]">Não</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-[#64748B]">{a.justification}</td>
                  <td className="py-3.5 px-4 text-[#007BFF]">{a.recordedByEmail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {(reportType === 'pacientes' ||
          reportType === 'lista_espera' ||
          reportType === 'consultas' ||
          reportType === 'encaminhamentos') && (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 bg-[#F1F5F9]/70 text-[11px] font-semibold text-[#003366]">
                <th className="py-3.5 px-4">Paciente</th>
                <th className="py-3.5 px-4">Especialidade</th>
                <th className="py-3.5 px-4">Status Atual</th>
                <th className="py-3.5 px-4">Aluno Vinculado</th>
                <th className="py-3.5 px-4 text-right">Faltas Não Justificadas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {patients
                .filter((p) => specialtyFilter === 'ALL' || p.specialtyNeeded === specialtyFilter)
                .filter((p) => studentFilter === 'ALL' || p.assignedStudentEmail === studentFilter)
                .filter(
                  (p) => professorFilter === 'ALL' || p.assignedProfessorEmail === professorFilter
                )
                .map((p) => (
                  <tr key={p.id} className="hover:bg-[#E6F6FF]/35 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-[#003366]">{p.name}</td>
                    <td className="py-3.5 px-4 text-[#1E293B]">{p.specialtyNeeded}</td>
                    <td className="py-3.5 px-4">
                      <PatientStatusBadge status={p.status} />
                    </td>
                    <td className="py-3.5 px-4 text-[#007BFF]">
                      {p.assignedStudentEmail || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-right tabular-nums font-bold text-[#003366]">
                      {p.unjustifiedAbsences} / 2
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
