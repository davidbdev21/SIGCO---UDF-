import React, { useState } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  Plus,
  Award,
  X,
} from 'lucide-react';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { db, getFriendlyErrorMessage } from '../services/firebase';
import { useClinicData } from '../hooks/useClinicData';
import { useAuth } from '../auth/AuthContext';
import { Anamnesis, ClinicalEvolution, MedicalRecord, PriorityLevel } from '../types';
import {
  canUserAccessClinicalRecord,
  INITIAL_SPECIALTIES,
  INSTITUTION_DOMAIN,
  PATIENT_STATUS_LABELS,
  sanitizeId,
  sanitizeString,
} from '../utils/validation';
import { recordAuditLog } from '../services/clinicService';
import { InstitutionalLockup, PatientStatusBadge } from '../components/BrandIdentity';
import { ContextualHelp } from '../components/ContextualHelp';

export const MedicalRecordsPage: React.FC = () => {
  const { systemUser } = useAuth();
  const {
    visiblePatients,
    medicalRecords,
    anamnesisList,
    evolutions,
    procedures,
    screenings,
    appointments,
    referrals,
    professors,
  } = useClinicData();

  const [selectedPatientId, setSelectedPatientId] = useState<string>(
    visiblePatients[0]?.id || ''
  );
  const [activeSubTab, setActiveSubTab] = useState<
    'identificacao' | 'anamnese' | 'avaliacao_plano' | 'evolucao' | 'historico'
  >('identificacao');
  const [feedback, setFeedback] = useState<string | null>(null);

  // Anamnesis form state
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [medicalHistory, setMedicalHistory] = useState('');
  const [relevantInfo, setRelevantInfo] = useState('');
  const [anamObs, setAnamObs] = useState('');

  // Evaluation & Treatment Plan form state
  const [diagnosis, setDiagnosis] = useState('');
  const [evaluationNotes, setEvaluationNotes] = useState('');
  const [clinicalNeeds, setClinicalNeeds] = useState('');
  const [treatmentPlanProcedure, setTreatmentPlanProcedure] = useState('');
  const [treatmentPlanSpecialty, setTreatmentPlanSpecialty] = useState('Endodontia');
  const [treatmentPlanPriority, setTreatmentPlanPriority] = useState<PriorityLevel>('ALTA');
  const [treatmentPlanForecast, setTreatmentPlanForecast] = useState('3 sessões clínicas');

  // Evolution modal state
  const [evolModalOpen, setEvolModalOpen] = useState(false);
  const [evolProcedure, setEvolProcedure] = useState('');
  const [evolText, setEvolText] = useState('');
  const [evolObs, setEvolObs] = useState('');
  const [evolProfEmail, setEvolProfEmail] = useState('professor.joao@cs.udf.edu.br');

  if (!systemUser) return null;

  // RN03: Receptionist is strictly blocked from accessing clinical records
  if (systemUser.role === 'RECEPCAO') {
    return (
      <div className="bg-white border border-red-200 rounded-2xl p-8 text-center max-w-xl mx-auto my-8 shadow-2xs">
        <ShieldAlert className="w-10 h-10 text-red-600 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-[#003366]">Acesso Clínico Restrito (RN03 / LGPD)</h2>
        <p className="text-xs text-[#64748B] mt-2 leading-relaxed">
          Você não possui permissão para realizar esta ação. O perfil de Recepção possui acesso apenas
          às informações administrativas, cadastro e agendamento, sendo vedado o acesso irrestrito ao
          conteúdo clínico do prontuário eletrônico.
        </p>
      </div>
    );
  }

  const activePatient =
    visiblePatients.find((p) => p.id === selectedPatientId) || visiblePatients[0];

  if (!activePatient) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-2xs">
        <p className="text-sm text-[#64748B]">
          Nenhum paciente vinculado sob sua responsabilidade clínica no momento (RN06).
        </p>
      </div>
    );
  }

  const hasAccess = canUserAccessClinicalRecord(
    systemUser.role,
    systemUser.email,
    activePatient
  );

  const patientRecord = medicalRecords.find((r) => r.patientId === activePatient.id);
  const patientAnamnesis = anamnesisList.find((a) => a.patientId === activePatient.id);
  const patientEvolutions = evolutions.filter((e) => e.patientId === activePatient.id);

  const handleSaveAnamnesis = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = patientAnamnesis?.id || sanitizeId(`anam_${activePatient.id}`);
    const payload: Omit<Anamnesis, 'id'> = {
      patientId: activePatient.id,
      patientName: sanitizeString(activePatient.name, 120),
      chiefComplaint: sanitizeString(
        chiefComplaint || patientAnamnesis?.chiefComplaint || 'Queixa registrada',
        1000
      ),
      medicalHistory: sanitizeString(
        medicalHistory || patientAnamnesis?.medicalHistory || 'Histórico registrado',
        2000
      ),
      relevantInfo: sanitizeString(relevantInfo || patientAnamnesis?.relevantInfo || '', 1500),
      observations: sanitizeString(anamObs || patientAnamnesis?.observations || '', 1500),
      recordedByEmail: sanitizeString(systemUser.email, 120),
      institutionDomain: INSTITUTION_DOMAIN,
      createdByUid: patientAnamnesis?.createdByUid || systemUser.uid,
    };

    try {
      if (patientAnamnesis) {
        await updateDoc(doc(db, 'anamnesis', id), {
          chiefComplaint: payload.chiefComplaint,
          medicalHistory: payload.medicalHistory,
          relevantInfo: payload.relevantInfo,
          observations: payload.observations,
          recordedByEmail: payload.recordedByEmail,
        });
      } else {
        await setDoc(doc(db, 'anamnesis', id), payload);
      }

      await recordAuditLog({
        uid: systemUser.uid,
        userName: systemUser.name,
        userEmail: systemUser.email,
        userRole: systemUser.role,
        action: 'ATUALIZACAO_ANAMNESE',
        targetRecord: `Paciente: ${activePatient.name}`,
        operationSummary: `${systemUser.role} ${systemUser.name} atualizou a anamnese do paciente ${activePatient.name}.`,
      });
      setFeedback('Anamnese clínica salva e registrada na auditoria.');
    } catch (error) {
      setFeedback(getFriendlyErrorMessage(error));
    }
  };

  const handleSaveMedicalRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = patientRecord?.id || sanitizeId(`rec_${activePatient.id}`);
    const payload: Omit<MedicalRecord, 'id'> = {
      patientId: activePatient.id,
      patientName: sanitizeString(activePatient.name, 120),
      responsibleStudentEmail: sanitizeString(
        activePatient.assignedStudentEmail || systemUser.email,
        120
      ),
      supervisorProfessorEmail: sanitizeString(
        activePatient.assignedProfessorEmail || 'professor.joao@cs.udf.edu.br',
        120
      ),
      diagnosis: sanitizeString(diagnosis || patientRecord?.diagnosis || 'Diagnóstico em avaliação', 2000),
      evaluationNotes: sanitizeString(evaluationNotes || patientRecord?.evaluationNotes || '', 2000),
      clinicalNeeds: sanitizeString(
        clinicalNeeds || patientRecord?.clinicalNeeds || 'Necessidade clínica identificada',
        2000
      ),
      treatmentPlanProcedure: sanitizeString(
        treatmentPlanProcedure || patientRecord?.treatmentPlanProcedure || 'Procedimento odontológico',
        500
      ),
      treatmentPlanSpecialty: sanitizeString(
        treatmentPlanSpecialty || patientRecord?.treatmentPlanSpecialty || activePatient.specialtyNeeded,
        80
      ),
      treatmentPlanPriority: treatmentPlanPriority || patientRecord?.treatmentPlanPriority || 'MEDIA',
      treatmentPlanForecast: sanitizeString(
        treatmentPlanForecast || patientRecord?.treatmentPlanForecast || '2 sessões',
        100
      ),
      validatedByProfessor: patientRecord?.validatedByProfessor || false,
      status: 'ATIVO',
      institutionDomain: INSTITUTION_DOMAIN,
      createdByUid: patientRecord?.createdByUid || systemUser.uid,
    };

    try {
      if (patientRecord) {
        await updateDoc(doc(db, 'medical_records', id), {
          diagnosis: payload.diagnosis,
          evaluationNotes: payload.evaluationNotes,
          clinicalNeeds: payload.clinicalNeeds,
          treatmentPlanProcedure: payload.treatmentPlanProcedure,
          treatmentPlanSpecialty: payload.treatmentPlanSpecialty,
          treatmentPlanPriority: payload.treatmentPlanPriority,
          treatmentPlanForecast: payload.treatmentPlanForecast,
        });
      } else {
        await setDoc(doc(db, 'medical_records', id), payload);
      }

      await recordAuditLog({
        uid: systemUser.uid,
        userName: systemUser.name,
        userEmail: systemUser.email,
        userRole: systemUser.role,
        action: 'ATUALIZACAO_PLANO_TRATAMENTO',
        targetRecord: `Paciente: ${activePatient.name}`,
        operationSummary: `${systemUser.role} ${systemUser.name} atualizou avaliação e plano de tratamento de ${activePatient.name}.`,
      });
      setFeedback('Prontuário salvo com sucesso.');
    } catch (error) {
      setFeedback(getFriendlyErrorMessage(error));
    }
  };

  const handleValidateRecordByProfessor = async () => {
    if (!patientRecord) return;
    try {
      await updateDoc(doc(db, 'medical_records', patientRecord.id), {
        validatedByProfessor: true,
        status: 'ATIVO',
      });
      await recordAuditLog({
        uid: systemUser.uid,
        userName: systemUser.name,
        userEmail: systemUser.email,
        userRole: systemUser.role,
        action: 'VALIDACAO_PRONTUARIO_PROFESSOR',
        targetRecord: `Paciente: ${activePatient.name}`,
        operationSummary: `Professor supervisor ${systemUser.name} validou o plano de tratamento do paciente ${activePatient.name}.`,
      });
      setFeedback('Plano de tratamento validado pelo Professor Supervisor!');
    } catch (error) {
      setFeedback(getFriendlyErrorMessage(error));
    }
  };

  const handleCreateEvolution = async (e: React.FormEvent) => {
    e.preventDefault();
    const prof = professors.find((p) => p.email === evolProfEmail) || professors[0];
    const evolId = sanitizeId(`evol_${Date.now()}`);
    const today = new Date().toISOString().slice(0, 10);

    const payload: Omit<ClinicalEvolution, 'id'> = {
      patientId: activePatient.id,
      patientName: sanitizeString(activePatient.name, 120),
      date: today,
      studentName: sanitizeString(systemUser.name, 120),
      studentEmail: sanitizeString(
        systemUser.role === 'ALUNO'
          ? systemUser.email
          : activePatient.assignedStudentEmail || 'aluno.lucas@cs.udf.edu.br',
        120
      ),
      professorName: sanitizeString(prof?.name || 'Prof. Dr. João Carlos Mendes', 120),
      professorEmail: sanitizeString(prof?.email || 'professor.joao@cs.udf.edu.br', 120),
      procedureName: sanitizeString(evolProcedure || procedures[0]?.name || 'Atendimento Clínico', 200),
      evolutionText: sanitizeString(evolText, 2000),
      observations: sanitizeString(evolObs, 1000),
      status: systemUser.role === 'PROFESSOR' ? 'VALIDADO' : 'PENDENTE_VALIDACAO',
      institutionDomain: INSTITUTION_DOMAIN,
      createdByUid: systemUser.uid,
    };

    try {
      await setDoc(doc(db, 'clinical_evolution', evolId), payload);
      await recordAuditLog({
        uid: systemUser.uid,
        userName: systemUser.name,
        userEmail: systemUser.email,
        userRole: systemUser.role,
        action: 'REGISTRO_EVOLUCAO_CLINICA',
        targetRecord: `Paciente: ${activePatient.name}`,
        operationSummary: `${systemUser.role} ${systemUser.name} registrou evolução clínica do paciente ${activePatient.name} em ${today}.`,
      });
      setEvolModalOpen(false);
      setEvolText('');
      setEvolObs('');
      setFeedback('Evolução clínica registrada com sucesso e vinculada ao histórico.');
    } catch (error) {
      setFeedback(getFriendlyErrorMessage(error));
    }
  };

  const handleValidateEvolution = async (evol: ClinicalEvolution) => {
    try {
      await updateDoc(doc(db, 'clinical_evolution', evol.id), {
        status: 'VALIDADO',
      });
      await recordAuditLog({
        uid: systemUser.uid,
        userName: systemUser.name,
        userEmail: systemUser.email,
        userRole: systemUser.role,
        action: 'VALIDACAO_EVOLUCAO_PROFESSOR',
        targetRecord: `Paciente: ${activePatient.name} (${evol.date})`,
        operationSummary: `Professor ${systemUser.name} validou a evolução clínica de ${activePatient.name}.`,
      });
      setFeedback('Evolução clínica validada pelo supervisor.');
    } catch (error) {
      setFeedback(getFriendlyErrorMessage(error));
    }
  };

  return (
    <div className="space-y-6">
      {/* Institutional Medical Record Header */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <InstitutionalLockup size="sm" />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <h1 className="text-xl sm:text-2xl font-bold text-[#003366] tracking-tight">
              Prontuários
            </h1>
            <ContextualHelp
              title="Prontuário Eletrônico"
              description="Reúne identificação, anamnese, avaliação, plano de tratamento, evolução clínica, procedimentos e histórico do paciente."
            />
          </div>
          <p className="text-xs text-[#64748B]">
            Registro clínico centralizado, seguro e validado pelo professor supervisor.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-semibold text-[#003366] whitespace-nowrap">
            Selecionar Paciente:
          </label>
          <select
            value={activePatient.id}
            onChange={(e) => {
              setSelectedPatientId(e.target.value);
              setFeedback(null);
            }}
            className="px-3.5 py-2 text-xs font-semibold bg-[#F8FAFC] border border-slate-200 rounded-xl text-[#003366] focus:outline-none focus:ring-2 focus:ring-[#00AEEF]"
          >
            {visiblePatients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {PATIENT_STATUS_LABELS[p.status]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-[#E6F6FF] border border-[#00AEEF]/40 text-[#003366] text-xs font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#00AEEF] shrink-0" />
            <span>{feedback}</span>
          </span>
          <button type="button" onClick={() => setFeedback(null)}>
            <X className="w-4 h-4 text-[#64748B]" />
          </button>
        </div>
      )}

      {!hasAccess ? (
        <div className="bg-white border border-red-200 rounded-2xl p-8 text-center shadow-2xs">
          <ShieldAlert className="w-8 h-8 text-red-600 mx-auto mb-2" />
          <div className="text-sm font-bold text-[#003366]">
            RN06: Você não possui permissão para visualizar o prontuário deste paciente.
          </div>
        </div>
      ) : (
        <>
          {/* Sub-navigation Tabs */}
          <div className="flex flex-wrap items-center gap-1 p-1.5 bg-white border border-slate-200/90 rounded-2xl shadow-2xs">
            {(
              [
                { id: 'identificacao', label: '1. Identificação e Vínculo' },
                { id: 'anamnese', label: '2. Anamnese' },
                { id: 'avaliacao_plano', label: '3. Avaliação e Plano de Tratamento' },
                { id: 'evolucao', label: '4. Evolução Clínica e Procedimentos' },
                { id: 'historico', label: '5. Histórico Cronológico Completo' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveSubTab(t.id)}
                className={`px-3.5 py-2 text-xs font-medium rounded-xl transition-colors cursor-pointer whitespace-nowrap ${
                  activeSubTab === t.id
                    ? 'bg-[#00AEEF] text-white shadow-2xs font-semibold'
                    : 'text-[#64748B] hover:text-[#003366] hover:bg-[#F1F5F9]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* 1. Identificação */}
          {activeSubTab === 'identificacao' && (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-[#003366] border-b border-slate-100 pb-2">
                  Dados Pessoais
                </h3>
                <div className="text-xs space-y-2.5">
                  <div>
                    <span className="text-[#64748B] block">Nome Completo:</span>
                    <span className="font-semibold text-[#003366]">{activePatient.name}</span>
                  </div>
                  <div>
                    <span className="text-[#64748B] block">CPF / Data de Nascimento:</span>
                    <span className="tabular-nums text-[#1E293B]">
                      {activePatient.cpf} · {activePatient.birthDate}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#64748B] block">Sexo:</span>
                    <span className="text-[#1E293B]">{activePatient.gender}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-bold text-[#003366] border-b border-slate-100 pb-2">
                  Contatos e Endereço
                </h3>
                <div className="text-xs space-y-2.5">
                  <div>
                    <span className="text-[#64748B] block">Telefone / WhatsApp:</span>
                    <span className="tabular-nums text-[#1E293B]">
                      {activePatient.phone} / {activePatient.whatsapp}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#64748B] block">E-mail:</span>
                    <span className="text-[#1E293B]">{activePatient.email}</span>
                  </div>
                  <div>
                    <span className="text-[#64748B] block">Endereço:</span>
                    <span className="text-[#1E293B]">{activePatient.address}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-bold text-[#003366] border-b border-slate-100 pb-2">
                  Responsáveis e Situação Clínica
                </h3>
                <div className="text-xs space-y-2.5">
                  <div>
                    <span className="text-[#64748B] block">Aluno Responsável (RN06):</span>
                    <span className="font-semibold text-[#007BFF]">
                      {activePatient.assignedStudentEmail || 'Não atribuído'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#64748B] block">Professor Supervisor (RN07):</span>
                    <span className="text-[#1E293B]">
                      {activePatient.assignedProfessorEmail || 'Não atribuído'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#64748B] block mb-1">
                      Status / Faltas Não Justificadas (RN01):
                    </span>
                    <div className="flex items-center gap-2">
                      <PatientStatusBadge status={activePatient.status} />
                      <span className="tabular-nums font-semibold text-[#003366]">
                        {activePatient.unjustifiedAbsences}/2 faltas
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. Anamnese */}
          {activeSubTab === 'anamnese' && (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs">
              <h3 className="text-base font-bold text-[#003366] mb-4">
                Anamnese Odontológica e Sistêmica
              </h3>
              <form onSubmit={handleSaveAnamnesis} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#003366] mb-1">
                    Queixa Principal *
                  </label>
                  <textarea
                    rows={2}
                    defaultValue={patientAnamnesis?.chiefComplaint || ''}
                    onChange={(e) => setChiefComplaint(e.target.value)}
                    placeholder="Descreva a queixa principal relatada pelo paciente..."
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#00AEEF] focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#003366] mb-1">
                    Histórico Médico e Odontológico *
                  </label>
                  <textarea
                    rows={3}
                    defaultValue={patientAnamnesis?.medicalHistory || ''}
                    onChange={(e) => setMedicalHistory(e.target.value)}
                    placeholder="Doenças preexistentes, pressão arterial, diabetes, alergias..."
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#00AEEF] focus:bg-white"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#003366] mb-1">
                      Informações Relevantes / Medicamentos em Uso
                    </label>
                    <textarea
                      rows={2}
                      defaultValue={patientAnamnesis?.relevantInfo || ''}
                      onChange={(e) => setRelevantInfo(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#00AEEF] focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#003366] mb-1">
                      Observações Complementares
                    </label>
                    <textarea
                      rows={2}
                      defaultValue={patientAnamnesis?.observations || ''}
                      onChange={(e) => setAnamObs(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#00AEEF] focus:bg-white"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-[#00AEEF] hover:bg-[#007BFF] text-white text-xs font-semibold rounded-xl shadow-2xs cursor-pointer"
                  >
                    Salvar Anamnese no Prontuário
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 3. Avaliação & Plano de Tratamento */}
          {activeSubTab === 'avaliacao_plano' && (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-base font-bold text-[#003366]">
                    Avaliação Clínica e Plano de Tratamento
                  </h3>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    Status de Validação Docente:{' '}
                    <span className="font-semibold text-[#007BFF]">
                      {patientRecord?.validatedByProfessor
                        ? 'Validado pelo Professor Supervisor'
                        : 'Aguardando validação do Professor Supervisor'}
                    </span>
                  </p>
                </div>

                {(systemUser.role === 'PROFESSOR' || systemUser.role === 'ADMIN') &&
                  patientRecord &&
                  !patientRecord.validatedByProfessor && (
                    <button
                      type="button"
                      onClick={handleValidateRecordByProfessor}
                      className="px-4 py-2 bg-[#003366] hover:bg-[#007BFF] text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <Award className="w-4 h-4 text-[#00AEEF]" />
                      <span>Validar Tratamento (Supervisor)</span>
                    </button>
                  )}
              </div>

              <form onSubmit={handleSaveMedicalRecord} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#003366] mb-1">
                      Diagnóstico Clínico *
                    </label>
                    <textarea
                      rows={2}
                      defaultValue={patientRecord?.diagnosis || ''}
                      onChange={(e) => setDiagnosis(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#003366] mb-1">
                      Necessidades Odontológicas *
                    </label>
                    <textarea
                      rows={2}
                      defaultValue={patientRecord?.clinicalNeeds || ''}
                      onChange={(e) => setClinicalNeeds(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-[#003366] mb-1">
                      Procedimento Planejado *
                    </label>
                    <input
                      type="text"
                      defaultValue={patientRecord?.treatmentPlanProcedure || ''}
                      onChange={(e) => setTreatmentPlanProcedure(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#003366] mb-1">
                      Especialidade *
                    </label>
                    <select
                      defaultValue={
                        patientRecord?.treatmentPlanSpecialty || activePatient.specialtyNeeded
                      }
                      onChange={(e) => setTreatmentPlanSpecialty(e.target.value)}
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
                      Previsão *
                    </label>
                    <input
                      type="text"
                      defaultValue={patientRecord?.treatmentPlanForecast || '3 sessões'}
                      onChange={(e) => setTreatmentPlanForecast(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-[#00AEEF] hover:bg-[#007BFF] text-white text-xs font-semibold rounded-xl shadow-2xs cursor-pointer"
                  >
                    Salvar Avaliação e Plano de Tratamento
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 4. Evolução Clínica e Procedimentos */}
          {activeSubTab === 'evolucao' && (
            <div className="space-y-4">
              <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-[#003366]">
                    Evolução Clínica por Atendimento
                  </h3>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    Cada atendimento registra aluno responsável, professor supervisor, procedimento e validação.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEvolProcedure(procedures[0]?.name || '');
                    setEvolModalOpen(true);
                  }}
                  className="px-4 py-2.5 bg-[#00AEEF] hover:bg-[#007BFF] text-white text-xs font-semibold rounded-xl shadow-2xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap self-start sm:self-auto"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Registrar Evolução Clínica</span>
                </button>
              </div>

              <div className="space-y-3">
                {patientEvolutions.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-xs text-[#64748B]">
                    Nenhuma evolução clínica registrada para este paciente.
                  </div>
                ) : (
                  patientEvolutions.map((ev) => (
                    <div
                      key={ev.id}
                      className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-2.5"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="tabular-nums font-bold text-[#003366]">{ev.date}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-[#007BFF]">{ev.procedureName}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span
                            className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold border ${
                              ev.status === 'VALIDADO'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            {ev.status === 'VALIDADO'
                              ? 'Validado pelo Supervisor'
                              : 'Pendente de Validação Docente'}
                          </span>
                          {(systemUser.role === 'PROFESSOR' || systemUser.role === 'ADMIN') &&
                            ev.status !== 'VALIDADO' && (
                              <button
                                type="button"
                                onClick={() => handleValidateEvolution(ev)}
                                className="px-3 py-1 bg-[#003366] hover:bg-[#007BFF] text-white text-[11px] font-semibold rounded-lg cursor-pointer"
                              >
                                Validar Evolução
                              </button>
                            )}
                        </div>
                      </div>

                      <p className="text-xs text-[#1E293B] leading-relaxed">{ev.evolutionText}</p>
                      {ev.observations && (
                        <p className="text-xs text-[#64748B]">Observações: {ev.observations}</p>
                      )}

                      <div className="text-[11px] text-[#64748B] pt-1 flex flex-wrap items-center gap-2">
                        <span>
                          Aluno: <strong className="text-[#003366]">{ev.studentName}</strong> ({ev.studentEmail})
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          Supervisor: <strong className="text-[#003366]">{ev.professorName}</strong>
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* 5. Histórico Cronológico Completo */}
          {activeSubTab === 'historico' && (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs space-y-4">
              <h3 className="text-base font-bold text-[#003366]">
                Linha do Tempo Clínica do Paciente (Ordem Cronológica)
              </h3>
              <div className="divide-y divide-slate-100 text-xs">
                {screenings
                  .filter((s) => s.patientId === activePatient.id)
                  .map((s) => (
                    <div key={s.id} className="py-3.5 flex items-start justify-between gap-4">
                      <div>
                        <span className="font-semibold text-[#003366]">Triagem Inicial Realizada</span>
                        <p className="text-[#64748B] mt-0.5">
                          Especialidade: {s.specialty} · Necessidades: {s.dentalNeeds}
                        </p>
                      </div>
                      <span className="tabular-nums text-[#64748B] shrink-0">{s.screeningDate}</span>
                    </div>
                  ))}
                {appointments
                  .filter((a) => a.patientId === activePatient.id)
                  .map((a) => (
                    <div key={a.id} className="py-3.5 flex items-start justify-between gap-4">
                      <div>
                        <span className="font-semibold text-[#003366]">
                          Consulta ({a.status}) — {a.specialty}
                        </span>
                        <p className="text-[#64748B] mt-0.5">
                          Aluno: {a.studentName} · Supervisor: {a.professorName} · {a.notes}
                        </p>
                      </div>
                      <span className="tabular-nums text-[#64748B] shrink-0">
                        {a.date} {a.startTime}
                      </span>
                    </div>
                  ))}
                {patientEvolutions.map((e) => (
                  <div key={e.id} className="py-3.5 flex items-start justify-between gap-4">
                    <div>
                      <span className="font-semibold text-[#007BFF]">
                        Evolução Clínica: {e.procedureName}
                      </span>
                      <p className="text-[#1E293B] mt-0.5">{e.evolutionText}</p>
                    </div>
                    <span className="tabular-nums text-[#64748B] shrink-0">{e.date}</span>
                  </div>
                ))}
                {referrals
                  .filter((r) => r.patientId === activePatient.id)
                  .map((r) => (
                    <div key={r.id} className="py-3.5 flex items-start justify-between gap-4">
                      <div>
                        <span className="font-semibold text-[#003366]">
                          Encaminhamento: {r.originSpecialty} → {r.destinationSpecialty}
                        </span>
                        <p className="text-[#64748B] mt-0.5">Motivo: {r.reason}</p>
                      </div>
                      <span className="tabular-nums text-[#64748B] shrink-0">{r.date}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Evolution Modal */}
      {evolModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#003366]/45 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-[#003366]">
                Registrar Atendimento e Evolução Clínica
              </h2>
              <button type="button" onClick={() => setEvolModalOpen(false)}>
                <X className="w-5 h-5 text-[#64748B]" />
              </button>
            </div>

            <form onSubmit={handleCreateEvolution} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#003366] mb-1">
                  Procedimento Realizado *
                </label>
                <select
                  value={evolProcedure}
                  onChange={(e) => setEvolProcedure(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                >
                  {procedures.map((proc) => (
                    <option key={proc.id} value={`${proc.code} - ${proc.name}`}>
                      {proc.code} — {proc.name} ({proc.specialty})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#003366] mb-1">
                  Professor Supervisor Responsável *
                </label>
                <select
                  value={evolProfEmail}
                  onChange={(e) => setEvolProfEmail(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                >
                  {professors.map((p) => (
                    <option key={p.id} value={p.email}>
                      {p.name} ({p.specialty})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#003366] mb-1">
                  Descrição Detalhada da Evolução Clínica *
                </label>
                <textarea
                  required
                  rows={4}
                  value={evolText}
                  onChange={(e) => setEvolText(e.target.value)}
                  placeholder="Descreva anestesia, isolamento, protocolo clínico executado e conduta..."
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#003366] mb-1">
                  Observações e Orientações Pós-Atendimento
                </label>
                <input
                  type="text"
                  value={evolObs}
                  onChange={(e) => setEvolObs(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEvolModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-[#003366] bg-white border border-[#00AEEF] rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#00AEEF] hover:bg-[#007BFF] rounded-xl cursor-pointer"
                >
                  Salvar Evolução Clínica
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
