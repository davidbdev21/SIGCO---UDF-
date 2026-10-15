import React, { useState } from 'react';
import { Stethoscope, CheckCircle2, AlertCircle, ArrowRight, X } from 'lucide-react';
import { useClinicData } from '../hooks/useClinicData';
import { useAuth } from '../auth/AuthContext';
import { PriorityLevel } from '../types';
import { INITIAL_SPECIALTIES, PRIORITY_LABELS } from '../utils/validation';
import { registerScreeningAndForward } from '../services/clinicService';
import { getFriendlyErrorMessage } from '../services/firebase';
import { PriorityBadge } from '../components/BrandIdentity';
import { ContextualHelp } from '../components/ContextualHelp';

const CLINICAL_FLOW_STEPS = [
  'Lista de espera',
  'Triagem',
  'Especialidade',
  'Vaga',
  'Agendamento',
  'Tratamento',
];

export const ScreeningPage: React.FC = () => {
  const { systemUser } = useAuth();
  const { patients, waitingList, screenings, students, professors } = useClinicData();

  const awaitingPatients = patients.filter((p) => p.status !== 'EXCLUIDO');
  const [selectedPatientId, setSelectedPatientId] = useState<string>(
    awaitingPatients.find((p) => !p.triaged)?.id || awaitingPatients[0]?.id || ''
  );
  const [initialAnamnesis, setInitialAnamnesis] = useState('');
  const [dentalNeeds, setDentalNeeds] = useState('');
  const [specialty, setSpecialty] = useState('Clínica Geral');
  const [priority, setPriority] = useState<PriorityLevel>('ALTA');
  const [notes, setNotes] = useState('');
  const [assignedStudentEmail, setAssignedStudentEmail] = useState('');
  const [assignedProfessorEmail, setAssignedProfessorEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  if (!systemUser) return null;

  const handleSubmitScreening = async (e: React.FormEvent) => {
    e.preventDefault();
    const pat = patients.find((p) => p.id === selectedPatientId);
    if (!pat) return;

    setSubmitting(true);
    setFeedback(null);

    try {
      const waitEntry = waitingList.find((w) => w.patientId === pat.id);
      await registerScreeningAndForward(
        {
          patient: pat,
          initialAnamnesis,
          dentalNeeds,
          specialty,
          priority,
          notes,
          assignedStudentEmail,
          assignedProfessorEmail,
          waitingEntryId: waitEntry?.id,
        },
        systemUser
      );

      setInitialAnamnesis('');
      setDentalNeeds('');
      setNotes('');
      setFeedback({
        type: 'success',
        message: `Triagem de ${pat.name} concluída (RN02)! Paciente classificado em ${specialty} (${PRIORITY_LABELS[priority]}) e liberado para agendamento clínico.`,
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        message: getFriendlyErrorMessage(error),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-[#003366] tracking-tight">Triagem</h1>
            <ContextualHelp
              title="Triagem Odontológica (RN02)"
              description="Avaliação inicial obrigatória: Paciente → Triagem → Necessidade → Especialidade → Encaminhamento."
            />
          </div>
          <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
            O paciente só poderá seguir para tratamento após passar pela avaliação de triagem inicial.
          </p>
        </div>
      </div>

      {/* Clean Clinical Workflow Progression */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
        <div className="text-[11px] font-semibold text-[#003366] mb-2">
          Fluxo Clínico da Triagem ao Tratamento
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {CLINICAL_FLOW_STEPS.map((step, index) => {
            const isCurrent = step === 'Triagem';
            return (
              <React.Fragment key={step}>
                <span
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    isCurrent
                      ? 'bg-[#003366] text-white font-semibold'
                      : 'text-slate-600 bg-slate-100 font-medium'
                  }`}
                >
                  {index + 1}. {step}
                </span>
                {index < CLINICAL_FLOW_STEPS.length - 1 && (
                  <span className="text-slate-300 font-medium px-0.5" aria-hidden="true">
                    →
                  </span>
                )}
              </React.Fragment>
            );
          })}
        </div>
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
          <button type="button" onClick={() => setFeedback(null)}>
            <X className="w-4 h-4 text-[#64748B]" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Triage Form Card */}
        <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs">
          <div className="flex items-center gap-2 text-[#007BFF] text-xs font-semibold mb-4">
            <Stethoscope className="w-4 h-4 text-[#00AEEF]" />
            <span>Registrar Nova Triagem e Encaminhamento</span>
          </div>

          <form onSubmit={handleSubmitScreening} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#003366] mb-1">
                1. Paciente da Lista de Espera *
              </label>
              <select
                required
                value={selectedPatientId}
                onChange={(e) => setSelectedPatientId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
              >
                {awaitingPatients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.triaged ? 'Triado (Reavaliação)' : 'Aguardando Triagem (RN02)'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#003366] mb-1">
                2. Anamnese Inicial e Queixa Principal *
              </label>
              <textarea
                required
                rows={3}
                value={initialAnamnesis}
                onChange={(e) => setInitialAnamnesis(e.target.value)}
                placeholder="Descreva a queixa principal, histórico de dor e condições sistêmicas..."
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#003366] mb-1">
                3. Necessidades Odontológicas Identificadas *
              </label>
              <textarea
                required
                rows={2}
                value={dentalNeeds}
                onChange={(e) => setDentalNeeds(e.target.value)}
                placeholder="Ex: Tratamento endodôntico do elemento 36..."
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#003366] mb-1">
                  4. Classificar Especialidade *
                </label>
                <select
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
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
                  5. Definir Prioridade *
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as PriorityLevel)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                >
                  {Object.entries(PRIORITY_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#003366] mb-1">
                  Vincular Aluno (Opcional)
                </label>
                <select
                  value={assignedStudentEmail}
                  onChange={(e) => setAssignedStudentEmail(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                >
                  <option value="">Aguardar vaga na especialidade</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.email}>
                      {s.name} ({s.specialtyClinic})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#003366] mb-1">
                  Professor Supervisor (Opcional)
                </label>
                <select
                  value={assignedProfessorEmail}
                  onChange={(e) => setAssignedProfessorEmail(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                >
                  <option value="">A definir no agendamento</option>
                  {professors.map((p) => (
                    <option key={p.id} value={p.email}>
                      {p.name} ({p.specialty})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#003366] mb-1">
                Observações da Triagem
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Exames radiográficos solicitados ou orientações..."
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 bg-[#00AEEF] hover:bg-[#007BFF] text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer whitespace-nowrap shadow-2xs"
            >
              {submitting ? 'Registrando Triagem...' : 'Concluir Triagem e Encaminhar'}
            </button>
          </form>
        </div>

        {/* Historical Screenings Table (Matching Reference Board "Triagem" table) */}
        <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs flex flex-col">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-base font-bold text-[#003366]">Pacientes Triados e Encaminhados</h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Histórico de triagens realizadas pelos cirurgiões-dentistas da clínica
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200/80 bg-[#F1F5F9]/70 text-[11px] font-semibold text-[#003366]">
                  <th className="py-3 px-4">Paciente</th>
                  <th className="py-3 px-4">Data da triagem</th>
                  <th className="py-3 px-4">Especialidade</th>
                  <th className="py-3 px-4">Prioridade</th>
                  <th className="py-3 px-4">Necessidade Clínica</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {screenings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-[#64748B]">
                      Nenhuma triagem registrada até o momento.
                    </td>
                  </tr>
                ) : (
                  screenings.map((scr) => (
                    <tr key={scr.id} className="hover:bg-[#E6F6FF]/35 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-[#003366]">{scr.patientName}</div>
                        <div className="text-[11px] text-[#64748B]">Dentista: {scr.dentistName}</div>
                      </td>
                      <td className="py-3.5 px-4 tabular-nums text-[#64748B]">
                        {scr.screeningDate}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-[#003366]">{scr.specialty}</td>
                      <td className="py-3.5 px-4">
                        <PriorityBadge priority={scr.priority} />
                      </td>
                      <td className="py-3.5 px-4 text-[#64748B] max-w-xs">
                        <div className="line-clamp-2">{scr.dentalNeeds}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-[#E6F6FF] text-[#003366] border border-[#00AEEF]/30 text-[11px] font-semibold">
                          Triado
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
