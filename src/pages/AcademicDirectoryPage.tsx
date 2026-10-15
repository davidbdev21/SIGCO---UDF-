import React, { useState } from 'react';
import { Plus, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { db, getFriendlyErrorMessage } from '../services/firebase';
import { useClinicData } from '../hooks/useClinicData';
import { useAuth } from '../auth/AuthContext';
import { Clinic, Procedure, ProfessorProfile, Specialty, StudentProfile } from '../types';
import {
  INITIAL_SPECIALTIES,
  INSTITUTION_DOMAIN,
  isValidInstitutionalEmail,
  RESTRICTED_DOMAIN_MESSAGE,
  sanitizeId,
  sanitizeString,
} from '../utils/validation';
import { recordAuditLog } from '../services/clinicService';
import { ContextualHelp } from '../components/ContextualHelp';

interface AcademicDirectoryPageProps {
  mode: 'students' | 'professors' | 'clinics_specialties';
}

export const AcademicDirectoryPage: React.FC<AcademicDirectoryPageProps> = ({ mode }) => {
  const { systemUser } = useAuth();
  const { students, professors, clinics, specialties, procedures } = useClinicData();

  const [subTab, setSubTab] = useState<'clinics' | 'specialties' | 'procedures'>('clinics');
  const [modalOpen, setModalOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  // Student form
  const [stuName, setStuName] = useState('');
  const [stuEmail, setStuEmail] = useState('');
  const [stuEnrollment, setStuEnrollment] = useState('');
  const [stuSemester, setStuSemester] = useState('8º Semestre');
  const [stuSpecialty, setStuSpecialty] = useState('Endodontia');
  const [stuSupervisor, setStuSupervisor] = useState('professor.joao@cs.udf.edu.br');

  // Professor form
  const [profName, setProfName] = useState('');
  const [profEmail, setProfEmail] = useState('');
  const [profCro, setProfCro] = useState('');
  const [profSpecialty, setProfSpecialty] = useState('Endodontia');
  const [profClinic, setProfClinic] = useState('Clínica Integrada I — Endodontia');

  // Clinic / Specialty / Procedure form
  const [itemName, setItemName] = useState('');
  const [itemCode, setItemCode] = useState('');
  const [itemSpecialty, setItemSpecialty] = useState('Clínica Geral');
  const [itemDesc, setItemDesc] = useState('');
  const [itemNumber, setItemNumber] = useState(60);

  if (!systemUser) return null;

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidInstitutionalEmail(stuEmail)) {
      setFeedback({ type: 'error', message: RESTRICTED_DOMAIN_MESSAGE });
      return;
    }

    const id = sanitizeId(`stu_${Date.now()}`);
    const payload: Omit<StudentProfile, 'id'> = {
      name: sanitizeString(stuName, 120),
      email: stuEmail.trim().toLowerCase(),
      enrollmentNumber: sanitizeString(stuEnrollment, 30),
      semester: sanitizeString(stuSemester, 20),
      specialtyClinic: sanitizeString(stuSpecialty, 80),
      supervisorEmail: sanitizeString(stuSupervisor, 120),
      active: true,
      institutionDomain: INSTITUTION_DOMAIN,
      createdByUid: systemUser.uid,
    };

    try {
      await setDoc(doc(db, 'students', id), payload);
      await recordAuditLog({
        uid: systemUser.uid,
        userName: systemUser.name,
        userEmail: systemUser.email,
        userRole: systemUser.role,
        action: 'CADASTRO_ALUNO',
        targetRecord: `Aluno: ${payload.name} (${payload.email})`,
        operationSummary: `${systemUser.name} cadastrou o aluno ${payload.name} com e-mail institucional ${payload.email}.`,
      });
      setModalOpen(false);
      setStuName('');
      setStuEmail('');
      setStuEnrollment('');
      setFeedback({ type: 'success', message: 'Aluno cadastrado com sucesso.' });
    } catch (error) {
      setFeedback({ type: 'error', message: getFriendlyErrorMessage(error) });
    }
  };

  const handleSaveProfessor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidInstitutionalEmail(profEmail)) {
      setFeedback({ type: 'error', message: RESTRICTED_DOMAIN_MESSAGE });
      return;
    }

    const id = sanitizeId(`prof_${Date.now()}`);
    const payload: Omit<ProfessorProfile, 'id'> = {
      name: sanitizeString(profName, 120),
      email: profEmail.trim().toLowerCase(),
      cro: sanitizeString(profCro, 30),
      specialty: sanitizeString(profSpecialty, 80),
      clinicName: sanitizeString(profClinic, 100),
      active: true,
      institutionDomain: INSTITUTION_DOMAIN,
      createdByUid: systemUser.uid,
    };

    try {
      await setDoc(doc(db, 'professors', id), payload);
      await recordAuditLog({
        uid: systemUser.uid,
        userName: systemUser.name,
        userEmail: systemUser.email,
        userRole: systemUser.role,
        action: 'CADASTRO_PROFESSOR',
        targetRecord: `Professor: ${payload.name} (${payload.email})`,
        operationSummary: `${systemUser.name} cadastrou o professor supervisor ${payload.name} (${payload.cro}).`,
      });
      setModalOpen(false);
      setProfName('');
      setProfEmail('');
      setProfCro('');
      setFeedback({ type: 'success', message: 'Professor supervisor cadastrado com sucesso.' });
    } catch (error) {
      setFeedback({ type: 'error', message: getFriendlyErrorMessage(error) });
    }
  };

  const handleSaveCatalogItem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (subTab === 'clinics') {
        const id = sanitizeId(`clin_${Date.now()}`);
        const payload: Omit<Clinic, 'id'> = {
          name: sanitizeString(itemName, 100),
          specialty: sanitizeString(itemSpecialty, 80),
          location: sanitizeString(itemDesc, 100, 'Bloco B — Saúde'),
          capacity: Number(itemNumber) || 12,
          active: true,
          institutionDomain: INSTITUTION_DOMAIN,
          createdByUid: systemUser.uid,
        };
        await setDoc(doc(db, 'clinics', id), payload);
      } else if (subTab === 'specialties') {
        const id = sanitizeId(`spec_${Date.now()}`);
        const payload: Omit<Specialty, 'id'> = {
          name: sanitizeString(itemName, 80),
          code: sanitizeString(itemCode || 'ESP-09', 20),
          description: sanitizeString(itemDesc, 500),
          active: true,
          institutionDomain: INSTITUTION_DOMAIN,
          createdByUid: systemUser.uid,
        };
        await setDoc(doc(db, 'specialties', id), payload);
      } else {
        const id = sanitizeId(`proc_${Date.now()}`);
        const payload: Omit<Procedure, 'id'> = {
          code: sanitizeString(itemCode || 'TUSS-85000', 30),
          name: sanitizeString(itemName, 150),
          specialty: sanitizeString(itemSpecialty, 80),
          description: sanitizeString(itemDesc, 1000),
          estimatedDurationMinutes: Number(itemNumber) || 60,
          status: 'ATIVO',
          institutionDomain: INSTITUTION_DOMAIN,
          createdByUid: systemUser.uid,
        };
        await setDoc(doc(db, 'procedures', id), payload);
      }
      setModalOpen(false);
      setItemName('');
      setItemCode('');
      setItemDesc('');
      setFeedback({ type: 'success', message: 'Registro salvo com sucesso no banco de dados.' });
    } catch (error) {
      setFeedback({ type: 'error', message: getFriendlyErrorMessage(error) });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-[#003366] tracking-tight">
              {mode === 'students' && 'Alunos'}
              {mode === 'professors' && 'Professores'}
              {mode === 'clinics_specialties' && 'Clínicas e Especialidades'}
            </h1>
            <ContextualHelp
              title={
                mode === 'students'
                  ? 'Alunos de Odontologia'
                  : mode === 'professors'
                  ? 'Professores e Supervisores'
                  : 'Clínicas e Especialidades'
              }
              description={
                mode === 'students'
                  ? 'Gerencie alunos cadastrados, vínculo com clínica/especialidade e supervisor responsável.'
                  : mode === 'professors'
                  ? 'Gerencie professores supervisores, CRO, clínica vinculada e supervisão de prontuários.'
                  : 'Organize as clínicas-escola, especialidades atendidas e catálogo de procedimentos.'
              }
            />
          </div>
          <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
            Todos os alunos e professores utilizam credenciais institucionais @cs.udf.edu.br.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setFeedback(null);
            setModalOpen(true);
          }}
          className="px-4 py-2.5 bg-[#00AEEF] hover:bg-[#007BFF] text-white text-xs font-semibold rounded-xl shadow-2xs flex items-center gap-2 cursor-pointer whitespace-nowrap self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>
            {mode === 'students' && '+ Cadastrar Aluno (@cs.udf.edu.br)'}
            {mode === 'professors' && '+ Cadastrar Professor (@cs.udf.edu.br)'}
            {mode === 'clinics_specialties' && '+ Novo Registro Clínico'}
          </span>
        </button>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs font-medium ${
            feedback.type === 'success'
              ? 'bg-[#E6F6FF] border-[#00AEEF]/40 text-[#003366]'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <span className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-[#00AEEF] shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </span>
          <button type="button" onClick={() => setFeedback(null)}>
            <X className="w-4 h-4 text-[#64748B]" />
          </button>
        </div>
      )}

      {/* STUDENTS MODE */}
      {mode === 'students' && (
        <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200/80 bg-[#F1F5F9]/70 text-[11px] font-semibold text-[#003366]">
                  <th className="py-3.5 px-4">Nome do Aluno</th>
                  <th className="py-3.5 px-4">E-mail Institucional</th>
                  <th className="py-3.5 px-4">Matrícula / Semestre</th>
                  <th className="py-3.5 px-4">Clínica / Especialidade</th>
                  <th className="py-3.5 px-4">Professor Supervisor</th>
                  <th className="py-3.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {students.map((stu) => (
                  <tr key={stu.id} className="hover:bg-[#E6F6FF]/35 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-[#003366]">{stu.name}</td>
                    <td className="py-3.5 px-4 text-[#007BFF] font-medium">{stu.email}</td>
                    <td className="py-3.5 px-4 tabular-nums text-[#1E293B]">
                      {stu.enrollmentNumber} · {stu.semester}
                    </td>
                    <td className="py-3.5 px-4 font-medium text-[#003366]">{stu.specialtyClinic}</td>
                    <td className="py-3.5 px-4 text-[#64748B]">{stu.supervisorEmail}</td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold">
                        {stu.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PROFESSORS MODE */}
      {mode === 'professors' && (
        <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200/80 bg-[#F1F5F9]/70 text-[11px] font-semibold text-[#003366]">
                  <th className="py-3.5 px-4">Professor / Supervisor</th>
                  <th className="py-3.5 px-4">E-mail Institucional</th>
                  <th className="py-3.5 px-4">Registro CRO</th>
                  <th className="py-3.5 px-4">Especialidade</th>
                  <th className="py-3.5 px-4">Clínica Vinculada</th>
                  <th className="py-3.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {professors.map((prof) => (
                  <tr key={prof.id} className="hover:bg-[#E6F6FF]/35 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-[#003366]">{prof.name}</td>
                    <td className="py-3.5 px-4 text-[#007BFF] font-medium">{prof.email}</td>
                    <td className="py-3.5 px-4 tabular-nums text-[#1E293B]">{prof.cro}</td>
                    <td className="py-3.5 px-4 font-medium text-[#003366]">{prof.specialty}</td>
                    <td className="py-3.5 px-4 text-[#64748B]">{prof.clinicName}</td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold">
                        {prof.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CLINICS, SPECIALTIES & PROCEDURES MODE */}
      {mode === 'clinics_specialties' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-1 p-1.5 bg-white border border-slate-200/90 rounded-2xl shadow-2xs self-start w-fit">
            {(
              [
                { id: 'clinics', label: `Clínicas Físicas (${clinics.length})` },
                { id: 'specialties', label: `Especialidades (${specialties.length})` },
                { id: 'procedures', label: `Catálogo de Procedimentos (${procedures.length})` },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSubTab(t.id)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-xl transition-colors cursor-pointer whitespace-nowrap ${
                  subTab === t.id
                    ? 'bg-[#00AEEF] text-white shadow-2xs font-semibold'
                    : 'text-[#64748B] hover:text-[#003366]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {subTab === 'clinics' && (
            <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-[#F1F5F9]/70 text-[11px] font-semibold text-[#003366]">
                    <th className="py-3.5 px-4">Nome da Clínica</th>
                    <th className="py-3.5 px-4">Especialidade Principal</th>
                    <th className="py-3.5 px-4">Localização / Boxes</th>
                    <th className="py-3.5 px-4 text-right">Capacidade (Equipos)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {clinics.map((c) => (
                    <tr key={c.id} className="hover:bg-[#E6F6FF]/35 transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-[#003366]">{c.name}</td>
                      <td className="py-3.5 px-4 text-[#007BFF] font-medium">{c.specialty}</td>
                      <td className="py-3.5 px-4 text-[#64748B]">{c.location}</td>
                      <td className="py-3.5 px-4 text-right tabular-nums font-bold text-[#003366]">
                        {c.capacity} vagas
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {subTab === 'specialties' && (
            <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-[#F1F5F9]/70 text-[11px] font-semibold text-[#003366]">
                    <th className="py-3.5 px-4">Código</th>
                    <th className="py-3.5 px-4">Especialidade</th>
                    <th className="py-3.5 px-4">Descrição Clínica</th>
                    <th className="py-3.5 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {specialties.map((s) => (
                    <tr key={s.id} className="hover:bg-[#E6F6FF]/35 transition-colors">
                      <td className="py-3.5 px-4 tabular-nums text-[#007BFF] font-semibold">
                        {s.code}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-[#003366]">{s.name}</td>
                      <td className="py-3.5 px-4 text-[#64748B]">{s.description}</td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold">
                          {s.active ? 'Ativa' : 'Inativa'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {subTab === 'procedures' && (
            <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-[#F1F5F9]/70 text-[11px] font-semibold text-[#003366]">
                    <th className="py-3.5 px-4">Código</th>
                    <th className="py-3.5 px-4">Procedimento Odontológico</th>
                    <th className="py-3.5 px-4">Especialidade</th>
                    <th className="py-3.5 px-4">Descrição Técnica</th>
                    <th className="py-3.5 px-4 text-right">Duração Estimada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {procedures.map((p) => (
                    <tr key={p.id} className="hover:bg-[#E6F6FF]/35 transition-colors">
                      <td className="py-3.5 px-4 tabular-nums text-[#007BFF] font-semibold">
                        {p.code}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-[#003366]">{p.name}</td>
                      <td className="py-3.5 px-4 text-[#1E293B] font-medium">{p.specialty}</td>
                      <td className="py-3.5 px-4 text-[#64748B]">{p.description}</td>
                      <td className="py-3.5 px-4 text-right tabular-nums font-semibold text-[#003366]">
                        {p.estimatedDurationMinutes} min
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal for Student / Professor / Catalog */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-[#003366]/45 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-[#003366]">
                {mode === 'students' && 'Cadastrar Aluno (@cs.udf.edu.br)'}
                {mode === 'professors' && 'Cadastrar Professor (@cs.udf.edu.br)'}
                {mode === 'clinics_specialties' && 'Novo Registro no Catálogo Clínico'}
              </h2>
              <button type="button" onClick={() => setModalOpen(false)}>
                <X className="w-5 h-5 text-[#64748B]" />
              </button>
            </div>

            {mode === 'students' && (
              <form onSubmit={handleSaveStudent} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-[#003366] mb-1">
                    Nome Completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={stuName}
                    onChange={(e) => setStuName(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#003366] mb-1">
                    E-mail Institucional (@cs.udf.edu.br) *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="aluno.nome@cs.udf.edu.br"
                    value={stuEmail}
                    onChange={(e) => setStuEmail(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#003366] mb-1">
                      Matrícula *
                    </label>
                    <input
                      type="text"
                      required
                      value={stuEnrollment}
                      onChange={(e) => setStuEnrollment(e.target.value)}
                      className="w-full px-3 py-2 text-xs tabular-nums border border-slate-200 rounded-xl bg-[#F8FAFC]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#003366] mb-1">
                      Semestre *
                    </label>
                    <input
                      type="text"
                      required
                      value={stuSemester}
                      onChange={(e) => setStuSemester(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#003366] mb-1">
                    Clínica / Especialidade *
                  </label>
                  <select
                    value={stuSpecialty}
                    onChange={(e) => setStuSpecialty(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                  >
                    {INITIAL_SPECIALTIES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#003366] mb-1">
                    Professor Supervisor *
                  </label>
                  <select
                    value={stuSupervisor}
                    onChange={(e) => setStuSupervisor(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                  >
                    {professors.map((p) => (
                      <option key={p.id} value={p.email}>
                        {p.name} ({p.email})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-[#003366] bg-white border border-[#00AEEF] rounded-xl cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-semibold text-white bg-[#00AEEF] hover:bg-[#007BFF] rounded-xl cursor-pointer"
                  >
                    Salvar Aluno
                  </button>
                </div>
              </form>
            )}

            {mode === 'professors' && (
              <form onSubmit={handleSaveProfessor} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-[#003366] mb-1">
                    Nome do Professor *
                  </label>
                  <input
                    type="text"
                    required
                    value={profName}
                    onChange={(e) => setProfName(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#003366] mb-1">
                    E-mail Institucional (@cs.udf.edu.br) *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="professor.nome@cs.udf.edu.br"
                    value={profEmail}
                    onChange={(e) => setProfEmail(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#003366] mb-1">
                      CRO *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="CRO-DF 0000"
                      value={profCro}
                      onChange={(e) => setProfCro(e.target.value)}
                      className="w-full px-3 py-2 text-xs tabular-nums border border-slate-200 rounded-xl bg-[#F8FAFC]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#003366] mb-1">
                      Especialidade *
                    </label>
                    <select
                      value={profSpecialty}
                      onChange={(e) => setProfSpecialty(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                    >
                      {INITIAL_SPECIALTIES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#003366] mb-1">
                    Clínica Principal *
                  </label>
                  <input
                    type="text"
                    required
                    value={profClinic}
                    onChange={(e) => setProfClinic(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-[#003366] bg-white border border-[#00AEEF] rounded-xl cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-semibold text-white bg-[#00AEEF] hover:bg-[#007BFF] rounded-xl cursor-pointer"
                  >
                    Salvar Professor
                  </button>
                </div>
              </form>
            )}

            {mode === 'clinics_specialties' && (
              <form onSubmit={handleSaveCatalogItem} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-[#003366] mb-1">
                    Nome / Título *
                  </label>
                  <input
                    type="text"
                    required
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                  />
                </div>
                {subTab !== 'clinics' && (
                  <div>
                    <label className="block text-xs font-semibold text-[#003366] mb-1">
                      Código *
                    </label>
                    <input
                      type="text"
                      required
                      value={itemCode}
                      onChange={(e) => setItemCode(e.target.value)}
                      className="w-full px-3 py-2 text-xs tabular-nums border border-slate-200 rounded-xl bg-[#F8FAFC]"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-[#003366] mb-1">
                    Especialidade *
                  </label>
                  <select
                    value={itemSpecialty}
                    onChange={(e) => setItemSpecialty(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                  >
                    {INITIAL_SPECIALTIES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#003366] mb-1">
                    {subTab === 'clinics' ? 'Localização / Andar *' : 'Descrição *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={itemDesc}
                    onChange={(e) => setItemDesc(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                  />
                </div>
                {subTab !== 'specialties' && (
                  <div>
                    <label className="block text-xs font-semibold text-[#003366] mb-1">
                      {subTab === 'clinics'
                        ? 'Capacidade (Vagas/Boxes)'
                        : 'Duração Estimada (Minutos)'}
                    </label>
                    <input
                      type="number"
                      value={itemNumber}
                      onChange={(e) => setItemNumber(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs tabular-nums border border-slate-200 rounded-xl bg-[#F8FAFC]"
                    />
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-[#003366] bg-white border border-[#00AEEF] rounded-xl cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-semibold text-white bg-[#00AEEF] hover:bg-[#007BFF] rounded-xl cursor-pointer"
                  >
                    Salvar Registro
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
