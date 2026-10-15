import React, { useState } from 'react';
import { ArrowLeftRight, Plus, CheckCircle2, X } from 'lucide-react';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { db, getFriendlyErrorMessage } from '../services/firebase';
import { useClinicData } from '../hooks/useClinicData';
import { useAuth } from '../auth/AuthContext';
import { PriorityLevel, Referral, ReferralStatus } from '../types';
import {
  INITIAL_SPECIALTIES,
  INSTITUTION_DOMAIN,
  PRIORITY_LABELS,
  sanitizeId,
  sanitizeString,
} from '../utils/validation';
import { recordAuditLog } from '../services/clinicService';
import { PriorityBadge } from '../components/BrandIdentity';
import { ContextualHelp } from '../components/ContextualHelp';

export const ReferralsPage: React.FC = () => {
  const { systemUser } = useAuth();
  const { referrals, visiblePatients } = useClinicData();

  const [modalOpen, setModalOpen] = useState(false);
  const [patientId, setPatientId] = useState(visiblePatients[0]?.id || '');
  const [originSpecialty, setOriginSpecialty] = useState('Cirurgia');
  const [destinationSpecialty, setDestinationSpecialty] = useState('Prótese');
  const [reason, setReason] = useState('');
  const [priority, setPriority] = useState<PriorityLevel>('ALTA');
  const [notes, setNotes] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!systemUser) return null;

  const handleCreateReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    const pat = visiblePatients.find((p) => p.id === patientId);
    if (!pat) return;

    const refId = sanitizeId(`ref_${Date.now()}`);
    const today = new Date().toISOString().slice(0, 10);

    const payload: Omit<Referral, 'id'> = {
      patientId: pat.id,
      patientName: sanitizeString(pat.name, 120),
      originSpecialty: sanitizeString(originSpecialty, 80),
      destinationSpecialty: sanitizeString(destinationSpecialty, 80),
      responsibleProfessional: sanitizeString(systemUser.name, 120),
      responsibleEmail: sanitizeString(systemUser.email, 120),
      reason: sanitizeString(reason, 1000),
      date: today,
      priority,
      notes: sanitizeString(notes, 1000),
      status: 'PENDENTE',
      institutionDomain: INSTITUTION_DOMAIN,
      createdByUid: systemUser.uid,
    };

    try {
      await setDoc(doc(db, 'referrals', refId), payload);
      await updateDoc(doc(db, 'patients', pat.id), {
        status: 'ENCAMINHADO',
        specialtyNeeded: sanitizeString(destinationSpecialty, 80),
        priority,
      });

      await recordAuditLog({
        uid: systemUser.uid,
        userName: systemUser.name,
        userEmail: systemUser.email,
        userRole: systemUser.role,
        action: 'ENCAMINHAMENTO_ENTRE_CLINICAS',
        targetRecord: `Paciente: ${pat.name} (${originSpecialty} -> ${destinationSpecialty})`,
        operationSummary: `${systemUser.role} ${systemUser.name} encaminhou ${pat.name} de ${originSpecialty} para ${destinationSpecialty}.`,
      });

      setModalOpen(false);
      setReason('');
      setNotes('');
      setFeedback(
        `Paciente ${pat.name} encaminhado de ${originSpecialty} para ${destinationSpecialty} com sucesso.`
      );
    } catch (error) {
      setFeedback(getFriendlyErrorMessage(error));
    }
  };

  const handleUpdateStatus = async (ref: Referral, nextStatus: ReferralStatus) => {
    try {
      await updateDoc(doc(db, 'referrals', ref.id), {
        status: nextStatus,
      });
      await recordAuditLog({
        uid: systemUser.uid,
        userName: systemUser.name,
        userEmail: systemUser.email,
        userRole: systemUser.role,
        action: 'ATUALIZACAO_STATUS_ENCAMINHAMENTO',
        targetRecord: `Paciente: ${ref.patientName}`,
        operationSummary: `Status do encaminhamento (${ref.originSpecialty} -> ${ref.destinationSpecialty}) atualizado para ${nextStatus}.`,
      });
      setFeedback(`Status do encaminhamento de ${ref.patientName} alterado para ${nextStatus}.`);
    } catch (error) {
      setFeedback(getFriendlyErrorMessage(error));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-[#003366] tracking-tight">Encaminhamentos</h1>
            <ContextualHelp
              title="Encaminhamentos entre Especialidades"
              description="Utilize encaminhamentos quando o paciente precisar de atendimento em outra especialidade (ex.: Triagem → Endodontia → Prótese)."
            />
          </div>
          <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
            Fluxo interdisciplinar: Triagem → Endodontia → Prótese com status em tempo real.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (visiblePatients.length > 0) setPatientId(visiblePatients[0].id);
            setModalOpen(true);
          }}
          className="px-4 py-2.5 bg-[#00AEEF] hover:bg-[#007BFF] text-white text-xs font-semibold rounded-xl shadow-2xs flex items-center gap-2 cursor-pointer whitespace-nowrap self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Novo encaminhamento</span>
        </button>
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

      <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 bg-[#F1F5F9]/70 text-[11px] font-semibold text-[#003366]">
                <th className="py-3.5 px-4">Data</th>
                <th className="py-3.5 px-4">Paciente</th>
                <th className="py-3.5 px-4">Origem → Destino</th>
                <th className="py-3.5 px-4">Profissional Responsável</th>
                <th className="py-3.5 px-4">Motivo / Observação</th>
                <th className="py-3.5 px-4">Prioridade</th>
                <th className="py-3.5 px-4 text-right">Status / Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {referrals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[#64748B]">
                    Nenhum encaminhamento registrado.
                  </td>
                </tr>
              ) : (
                referrals.map((ref) => (
                  <tr key={ref.id} className="hover:bg-[#E6F6FF]/35 transition-colors">
                    <td className="py-3.5 px-4 tabular-nums text-[#64748B]">{ref.date}</td>
                    <td className="py-3.5 px-4 font-semibold text-[#003366]">{ref.patientName}</td>
                    <td className="py-3.5 px-4">
                      <span className="font-medium text-[#1E293B]">{ref.originSpecialty}</span>
                      <ArrowLeftRight className="w-3.5 h-3.5 inline mx-1.5 text-[#00AEEF]" />
                      <span className="font-bold text-[#003366]">{ref.destinationSpecialty}</span>
                    </td>
                    <td className="py-3.5 px-4 text-[#1E293B]">
                      <div className="font-medium">{ref.responsibleProfessional}</div>
                      <div className="text-[11px] text-[#007BFF]">{ref.responsibleEmail}</div>
                    </td>
                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="text-[#1E293B]">{ref.reason}</div>
                      {ref.notes && (
                        <div className="text-[11px] text-[#64748B] mt-0.5">{ref.notes}</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <PriorityBadge priority={ref.priority} />
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <select
                        value={ref.status}
                        disabled={ref.status === 'CONCLUIDO'}
                        onChange={(e) => handleUpdateStatus(ref, e.target.value as ReferralStatus)}
                        className="px-2.5 py-1 text-xs font-semibold border border-slate-200 rounded-lg bg-[#F8FAFC] text-[#003366]"
                      >
                        <option value="PENDENTE">Pendente</option>
                        <option value="ACEITO">Aceito</option>
                        <option value="EM_ATENDIMENTO">Em Atendimento</option>
                        <option value="CONCLUIDO">Concluído</option>
                        <option value="CANCELADO">Cancelado</option>
                      </select>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-[#003366]/45 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-[#003366]">
                Solicitar Encaminhamento para Outra Especialidade
              </h2>
              <button type="button" onClick={() => setModalOpen(false)}>
                <X className="w-5 h-5 text-[#64748B]" />
              </button>
            </div>

            <form onSubmit={handleCreateReferral} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#003366] mb-1">
                  Paciente *
                </label>
                <select
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                >
                  {visiblePatients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#003366] mb-1">
                    Clínica / Especialidade de Origem *
                  </label>
                  <select
                    value={originSpecialty}
                    onChange={(e) => setOriginSpecialty(e.target.value)}
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
                    Clínica / Especialidade de Destino *
                  </label>
                  <select
                    value={destinationSpecialty}
                    onChange={(e) => setDestinationSpecialty(e.target.value)}
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
                  Prioridade Clínica *
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

              <div>
                <label className="block text-xs font-semibold text-[#003366] mb-1">
                  Motivo Clínico do Encaminhamento *
                </label>
                <textarea
                  required
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ex: Tratamento endodôntico concluído; encaminhado para reabilitação protética..."
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#003366] mb-1">
                  Observações Complementares
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
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
                  Confirmar Encaminhamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
