import React, { useState } from 'react';
import { Search, Plus, Edit3, Trash2, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { useClinicData } from '../hooks/useClinicData';
import { useAuth } from '../auth/AuthContext';
import { Patient, PriorityLevel } from '../types';
import {
  INITIAL_SPECIALTIES,
  PATIENT_STATUS_LABELS,
  PRIORITY_LABELS,
} from '../utils/validation';
import { savePatientRecord } from '../services/clinicService';
import { getFriendlyErrorMessage } from '../services/firebase';
import { PatientStatusBadge, PriorityBadge } from '../components/BrandIdentity';
import { ContextualHelp } from '../components/ContextualHelp';

const LIFECYCLE_STEPS: { key: Patient['status'][]; label: string }[] = [
  { key: ['LISTA_ESPERA', 'AGUARDANDO_TRIAGEM'], label: '1. Espera / Triagem' },
  { key: ['TRIADO', 'AGUARDANDO_VAGA'], label: '2. Triado / Vaga' },
  { key: ['EM_TRATAMENTO'], label: '3. Em Tratamento' },
  { key: ['ENCAMINHADO'], label: '4. Encaminhado' },
  { key: ['CONCLUIDO', 'ALTA'], label: '5. Concluído / Alta' },
];

export const PatientsPage: React.FC = () => {
  const { systemUser } = useAuth();
  const { visiblePatients, students, professors } = useClinicData();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [specialtyFilter, setSpecialtyFilter] = useState<string>('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  // Form state
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('1990-05-15');
  const [gender, setGender] = useState('Feminino');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [status, setStatus] = useState<Patient['status']>('AGUARDANDO_TRIAGEM');
  const [specialtyNeeded, setSpecialtyNeeded] = useState('Clínica Geral');
  const [priority, setPriority] = useState<PriorityLevel>('MEDIA');
  const [assignedStudentEmail, setAssignedStudentEmail] = useState('');
  const [assignedProfessorEmail, setAssignedProfessorEmail] = useState('');
  const [addToWaitingList, setAddToWaitingList] = useState(true);
  const [saving, setSaving] = useState(false);

  if (!systemUser) return null;

  const openNewModal = () => {
    setEditingPatient(null);
    setName('');
    setCpf('');
    setBirthDate('1990-05-15');
    setGender('Feminino');
    setPhone('(61) 99100-0000');
    setWhatsapp('(61) 99100-0000');
    setEmail('paciente.novo@exemplo.com');
    setAddress('Asa Sul, Brasília-DF');
    setAdminNotes('');
    setStatus('AGUARDANDO_TRIAGEM');
    setSpecialtyNeeded('Clínica Geral');
    setPriority('MEDIA');
    setAssignedStudentEmail(systemUser.role === 'ALUNO' ? systemUser.email : '');
    setAssignedProfessorEmail('');
    setAddToWaitingList(true);
    setModalOpen(true);
  };

  const openEditModal = (pat: Patient) => {
    setEditingPatient(pat);
    setName(pat.name);
    setCpf(pat.cpf);
    setBirthDate(pat.birthDate);
    setGender(pat.gender);
    setPhone(pat.phone);
    setWhatsapp(pat.whatsapp);
    setEmail(pat.email);
    setAddress(pat.address);
    setAdminNotes(pat.adminNotes);
    setStatus(pat.status);
    setSpecialtyNeeded(pat.specialtyNeeded);
    setPriority(pat.priority);
    setAssignedStudentEmail(pat.assignedStudentEmail);
    setAssignedProfessorEmail(pat.assignedProfessorEmail);
    setAddToWaitingList(false);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      await savePatientRecord(
        {
          name,
          cpf,
          birthDate,
          gender,
          phone,
          whatsapp: whatsapp || phone,
          email,
          address,
          registrationDate: editingPatient?.registrationDate || new Date().toISOString().slice(0, 10),
          adminNotes,
          status,
          specialtyNeeded,
          priority,
          unjustifiedAbsences: editingPatient?.unjustifiedAbsences || 0,
          triaged:
            editingPatient?.triaged ||
            !['LISTA_ESPERA', 'AGUARDANDO_TRIAGEM'].includes(status),
          assignedStudentEmail,
          assignedProfessorEmail,
        },
        systemUser,
        editingPatient?.id,
        !editingPatient && addToWaitingList
      );
      setModalOpen(false);
      setFeedback({
        type: 'success',
        message: editingPatient
          ? 'Cadastro do paciente atualizado com sucesso.'
          : 'Paciente cadastrado com sucesso e registrado no fluxo.',
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        message: getFriendlyErrorMessage(error),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSoftDelete = async (pat: Patient) => {
    setFeedback(null);
    try {
      await savePatientRecord(
        {
          ...pat,
          status: 'EXCLUIDO',
        },
        systemUser,
        pat.id,
        false
      );
      setFeedback({
        type: 'success',
        message: `Registro de ${pat.name} arquivado/excluído com rastreabilidade na auditoria.`,
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        message: getFriendlyErrorMessage(error),
      });
    }
  };

  const filteredPatients = visiblePatients.filter((p) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesQuery =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.cpf.toLowerCase().includes(q) ||
      p.phone.toLowerCase().includes(q) ||
      p.whatsapp.toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;
    const matchesSpecialty = specialtyFilter === 'ALL' || p.specialtyNeeded === specialtyFilter;
    return matchesQuery && matchesStatus && matchesSpecialty;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-[#003366] tracking-tight">Pacientes</h1>
            <ContextualHelp
              title="Pacientes"
              description="Cadastre novos pacientes, pesquise por nome ou CPF, edite dados de contato e acompanhe o status clínico."
            />
          </div>
          <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
            {systemUser.role === 'ALUNO'
              ? 'Exibindo exclusivamente os pacientes sob sua responsabilidade clínica (RN06).'
              : 'Gestão centralizada de dados pessoais, contatos, status do fluxo odontológico e vínculos.'}
          </p>
        </div>

        <button
          type="button"
          onClick={openNewModal}
          className="px-4 py-2.5 bg-[#00AEEF] hover:bg-[#007BFF] text-white text-xs font-semibold rounded-xl shadow-2xs transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Novo paciente</span>
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
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </span>
          <button type="button" onClick={() => setFeedback(null)} className="text-[#64748B] hover:text-[#003366]">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search & Filters (Nome, CPF, Telefone, Status, Especialidade) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-6 relative">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar paciente por nome, CPF ou telefone..."
            className="w-full pl-9 pr-3.5 py-2 text-xs bg-[#F8FAFC] border border-slate-200 rounded-xl text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#00AEEF] focus:bg-white"
          />
        </div>

        <div className="md:col-span-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-[#F8FAFC] border border-slate-200 rounded-xl text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#00AEEF]"
          >
            <option value="ALL">Todos os status</option>
            {Object.entries(PATIENT_STATUS_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-3">
          <select
            value={specialtyFilter}
            onChange={(e) => setSpecialtyFilter(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-[#F8FAFC] border border-slate-200 rounded-xl text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#00AEEF]"
          >
            <option value="ALL">Todas as especialidades</option>
            {INITIAL_SPECIALTIES.map((spec) => (
              <option key={spec} value={spec}>
                {spec}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Patients Data Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 bg-[#F1F5F9]/70 text-[11px] font-semibold text-[#003366]">
                <th className="py-3.5 px-4">Paciente / CPF</th>
                <th className="py-3.5 px-4">Contatos</th>
                <th className="py-3.5 px-4">Especialidade</th>
                <th className="py-3.5 px-4">Prioridade</th>
                <th className="py-3.5 px-4">Status / Etapa do Fluxo</th>
                <th className="py-3.5 px-4">Vínculo Clínico</th>
                <th className="py-3.5 px-4 text-right">Faltas (RN01)</th>
                <th className="py-3.5 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredPatients.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-[#64748B]">
                    Nenhum paciente encontrado com os critérios selecionados.
                  </td>
                </tr>
              ) : (
                filteredPatients.map((pat) => {
                  const activeStepIdx = LIFECYCLE_STEPS.findIndex((s) => s.key.includes(pat.status));
                  return (
                    <tr key={pat.id} className="hover:bg-[#E6F6FF]/35 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-[#003366]">{pat.name}</div>
                        <div className="tabular-nums text-[11px] text-[#64748B] mt-0.5">
                          CPF: {pat.cpf} · Nasc: {pat.birthDate}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="tabular-nums font-medium text-[#1E293B]">{pat.whatsapp}</div>
                        <div className="text-[11px] text-[#64748B] truncate max-w-[180px]">{pat.email}</div>
                      </td>

                      <td className="py-3.5 px-4 font-medium text-[#003366]">{pat.specialtyNeeded}</td>

                      <td className="py-3.5 px-4">
                        <PriorityBadge priority={pat.priority} />
                      </td>

                      <td className="py-3.5 px-4">
                        <PatientStatusBadge status={pat.status} />
                        <div className="flex items-center gap-1 mt-1.5">
                          {LIFECYCLE_STEPS.map((st, idx) => (
                            <div
                              key={st.label}
                              title={st.label}
                              className={`h-1.5 w-5 rounded-full ${
                                pat.status === 'CANCELADO'
                                  ? 'bg-red-300'
                                  : idx <= activeStepIdx
                                  ? 'bg-[#00AEEF]'
                                  : 'bg-slate-200'
                              }`}
                            />
                          ))}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-[#64748B]">
                        {pat.assignedStudentEmail ? (
                          <div>
                            <div className="text-[11px] font-medium text-[#1E293B]">
                              {pat.assignedStudentEmail}
                            </div>
                            <div className="text-[10px] text-[#64748B]">
                              Sup: {pat.assignedProfessorEmail || 'A definir'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">Não vinculado</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right tabular-nums">
                        <span
                          className={`font-semibold ${
                            pat.unjustifiedAbsences >= 2
                              ? 'text-red-600'
                              : pat.unjustifiedAbsences === 1
                              ? 'text-amber-600'
                              : 'text-[#003366]'
                          }`}
                        >
                          {pat.unjustifiedAbsences} / 2
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(pat)}
                            className="p-1.5 text-[#003366] hover:text-[#00AEEF] hover:bg-[#E6F6FF] rounded-lg transition-colors cursor-pointer"
                            title="Editar paciente"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {(systemUser.role === 'ADMIN' || systemUser.role === 'RECEPCAO') && (
                            <button
                              type="button"
                              onClick={() => handleSoftDelete(pat)}
                              className="p-1.5 text-[#64748B] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="Arquivar / Excluir paciente"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Patient Modal — Structured like "Cadastro de Pacientes" Reference Board */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-[#003366]/45 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 space-y-5 my-8 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-lg font-bold text-[#003366]">
                  {editingPatient ? 'Editar Cadastro de Paciente' : 'Cadastro de Pacientes'}
                </h2>
                <p className="text-xs text-[#64748B]">
                  Preencha os dados pessoais, contatos, endereço e classificação clínica
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-[#64748B] hover:text-[#003366]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-5">
              {/* Section: Dados Pessoais */}
              <div>
                <div className="text-xs font-bold text-[#003366] mb-2.5">Dados Pessoais</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div className="sm:col-span-1">
                    <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                      Nome completo *
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-[#F8FAFC] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#00AEEF] focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                      CPF *
                    </label>
                    <input
                      type="text"
                      required
                      value={cpf}
                      onChange={(e) => setCpf(e.target.value)}
                      placeholder="000.000.000-00"
                      className="w-full px-3 py-2 text-xs tabular-nums bg-[#F8FAFC] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#00AEEF] focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                      Data de nascimento *
                    </label>
                    <input
                      type="date"
                      required
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs tabular-nums bg-[#F8FAFC] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#00AEEF] focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                      Sexo *
                    </label>
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-[#F8FAFC] border border-slate-200 rounded-xl"
                    >
                      <option value="Feminino">Feminino</option>
                      <option value="Masculino">Masculino</option>
                      <option value="Outro">Outro / Não informado</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                      Especialidade necessária *
                    </label>
                    <select
                      value={specialtyNeeded}
                      onChange={(e) => setSpecialtyNeeded(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-[#F8FAFC] border border-slate-200 rounded-xl"
                    >
                      {INITIAL_SPECIALTIES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                      Prioridade *
                    </label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as PriorityLevel)}
                      className="w-full px-3 py-2 text-xs bg-[#F8FAFC] border border-slate-200 rounded-xl"
                    >
                      {Object.entries(PRIORITY_LABELS).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Section: Contatos */}
              <div className="border-t border-slate-100 pt-4">
                <div className="text-xs font-bold text-[#003366] mb-2.5">Contatos</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div>
                    <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                      Telefone *
                    </label>
                    <input
                      type="text"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(00) 00000-0000"
                      className="w-full px-3 py-2 text-xs tabular-nums bg-[#F8FAFC] border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                      WhatsApp *
                    </label>
                    <input
                      type="text"
                      required
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      placeholder="(00) 00000-0000"
                      className="w-full px-3 py-2 text-xs tabular-nums bg-[#F8FAFC] border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                      E-mail *
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="exemplo@email.com"
                      className="w-full px-3 py-2 text-xs bg-[#F8FAFC] border border-slate-200 rounded-xl"
                    />
                  </div>
                </div>
              </div>

              {/* Section: Endereço & Vínculo */}
              <div className="border-t border-slate-100 pt-4">
                <div className="text-xs font-bold text-[#003366] mb-2.5">
                  Endereço e Vínculo Clínico
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                      Logradouro / Endereço Completo *
                    </label>
                    <input
                      type="text"
                      required
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-[#F8FAFC] border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                      Status no Fluxo *
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as Patient['status'])}
                      className="w-full px-3 py-2 text-xs bg-[#F8FAFC] border border-slate-200 rounded-xl"
                    >
                      {Object.entries(PATIENT_STATUS_LABELS).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                      Aluno Responsável
                    </label>
                    <select
                      value={assignedStudentEmail}
                      onChange={(e) => setAssignedStudentEmail(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-[#F8FAFC] border border-slate-200 rounded-xl"
                    >
                      <option value="">Sem vínculo de aluno</option>
                      {students.map((stu) => (
                        <option key={stu.id} value={stu.email}>
                          {stu.name} ({stu.email})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                      Professor Supervisor
                    </label>
                    <select
                      value={assignedProfessorEmail}
                      onChange={(e) => setAssignedProfessorEmail(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-[#F8FAFC] border border-slate-200 rounded-xl"
                    >
                      <option value="">Sem vínculo de supervisor</option>
                      {professors.map((prof) => (
                        <option key={prof.id} value={prof.email}>
                          {prof.name} ({prof.specialty})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#64748B] mb-1">
                      Observações Administrativas
                    </label>
                    <input
                      type="text"
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-[#F8FAFC] border border-slate-200 rounded-xl"
                    />
                  </div>
                </div>
              </div>

              {!editingPatient && (
                <label className="flex items-center gap-2 text-xs text-[#003366] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addToWaitingList}
                    onChange={(e) => setAddToWaitingList(e.target.checked)}
                    className="rounded border-slate-300 text-[#00AEEF] focus:ring-[#00AEEF]"
                  />
                  <span>Incluir automaticamente na Lista de Espera para Triagem (RN02)</span>
                </label>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-[#003366] bg-white border border-[#00AEEF] hover:bg-[#E6F6FF] rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#00AEEF] hover:bg-[#007BFF] rounded-xl cursor-pointer shadow-2xs"
                >
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
