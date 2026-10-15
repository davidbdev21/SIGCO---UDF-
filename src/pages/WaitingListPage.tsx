import React, { useState } from 'react';
import { Plus, Stethoscope, Trash2, ArrowUpDown, CheckCircle2, Search, X } from 'lucide-react';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, getFriendlyErrorMessage } from '../services/firebase';
import { useClinicData } from '../hooks/useClinicData';
import { useAuth } from '../auth/AuthContext';
import { NavigationTab, PriorityLevel, WaitingListEntry } from '../types';
import {
  INITIAL_SPECIALTIES,
  INSTITUTION_DOMAIN,
  PRIORITY_LABELS,
  sanitizeId,
  sanitizeString,
} from '../utils/validation';
import { recordAuditLog, removeWaitingListEntry } from '../services/clinicService';
import { PriorityBadge } from '../components/BrandIdentity';
import { ContextualHelp } from '../components/ContextualHelp';

interface WaitingListPageProps {
  onNavigate: (tab: NavigationTab) => void;
}

export const WaitingListPage: React.FC<WaitingListPageProps> = ({ onNavigate }) => {
  const { systemUser } = useAuth();
  const {
    waitingList,
    patients,
    updateWaitingListLocal,
    removeWaitingListLocal,
    addWaitingListLocal,
  } = useClinicData();

  const [searchQuery, setSearchQuery] = useState('');
  const [specialtyFilter, setSpecialtyFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [specialty, setSpecialty] = useState('Clínica Geral');
  const [priority, setPriority] = useState<PriorityLevel>('MEDIA');
  const [notes, setNotes] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!systemUser) return null;

  const sortedEntries = [...waitingList]
    .filter((w) => {
      const q = searchQuery.trim().toLowerCase();
      return !q || w.patientName.toLowerCase().includes(q) || w.specialty.toLowerCase().includes(q);
    })
    .filter((w) => specialtyFilter === 'ALL' || w.specialty === specialtyFilter)
    .filter((w) => priorityFilter === 'ALL' || w.priority === priorityFilter)
    .filter((w) => statusFilter === 'ALL' || w.status === statusFilter)
    .sort((a, b) => a.position - b.position);

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const pat = patients.find((p) => p.id === selectedPatientId);
    if (!pat) return;

    const entryId = sanitizeId(`wait_${Date.now()}`);
    const nextPos = waitingList.length + 1;
    const payload: Omit<WaitingListEntry, 'id'> = {
      patientId: pat.id,
      patientName: sanitizeString(pat.name, 120),
      position: nextPos,
      entryDate: new Date().toISOString().slice(0, 10),
      specialty: sanitizeString(specialty, 80),
      priority,
      status: pat.triaged ? 'AGUARDANDO_VAGA' : 'AGUARDANDO_TRIAGEM',
      notes: sanitizeString(notes, 1000, 'Inserido na lista de espera.'),
      responsibleName: sanitizeString(systemUser.name, 120),
      institutionDomain: INSTITUTION_DOMAIN,
      createdByUid: systemUser.uid,
    };

    const newEntry: WaitingListEntry = {
      id: entryId,
      ...payload,
    };

    addWaitingListLocal(newEntry);
    setModalOpen(false);
    setFeedback(`Paciente ${pat.name} incluído na lista de espera na posição #${nextPos}.`);

    if (auth.currentUser) {
      try {
        await setDoc(doc(db, 'waiting_list', entryId), payload);
        await recordAuditLog({
          uid: systemUser.uid,
          userName: systemUser.name,
          userEmail: systemUser.email,
          userRole: systemUser.role,
          action: 'INCLUSAO_LISTA_ESPERA',
          targetRecord: `Paciente: ${pat.name}`,
          operationSummary: `${systemUser.name} adicionou ${pat.name} na posição #${nextPos} da lista de espera (${specialty}).`,
        }).catch(() => {});
      } catch (error) {
        console.warn('Firestore add waiting list sync notice:', error);
      }
    }
  };

  const handleChangePriority = async (entry: WaitingListEntry, nextPriority: PriorityLevel) => {
    updateWaitingListLocal(entry.id, { priority: nextPriority });
    setFeedback(`Prioridade de ${entry.patientName} alterada para ${PRIORITY_LABELS[nextPriority]}.`);

    if (auth.currentUser) {
      try {
        await updateDoc(doc(db, 'waiting_list', entry.id), {
          priority: nextPriority,
        });
      } catch (error) {
        console.warn('Firestore priority update sync notice:', error);
      }
    }
  };

  const handleForwardStatus = async (
    entry: WaitingListEntry,
    nextStatus: WaitingListEntry['status']
  ) => {
    updateWaitingListLocal(entry.id, { status: nextStatus });

    if (auth.currentUser) {
      try {
        await updateDoc(doc(db, 'waiting_list', entry.id), {
          status: nextStatus,
        });
      } catch (error) {
        console.warn('Firestore status update sync notice:', error);
      }
    }

    if (nextStatus === 'AGUARDANDO_TRIAGEM') {
      onNavigate('screening');
    } else {
      setFeedback(`Status de ${entry.patientName} atualizado para ${nextStatus}.`);
    }
  };

  const handleRemove = async (entry: WaitingListEntry) => {
    removeWaitingListLocal(entry.id);
    setFeedback(`Registro de ${entry.patientName} removido da fila.`);

    if (auth.currentUser) {
      try {
        await removeWaitingListEntry(entry.id, systemUser);
      } catch (error) {
        console.warn('Firestore remove waiting list sync notice:', error);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-[#003366] tracking-tight">Lista de Espera</h1>
            <ContextualHelp
              title="Lista de Espera"
              description="Aqui você acompanha pacientes aguardando triagem ou atendimento, visualiza posição, define prioridade e encaminha para a triagem."
            />
          </div>
          <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
            Controle centralizado de posição, prioridade clínica, encaminhamento para triagem e vagas.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (patients.length > 0) setSelectedPatientId(patients[0].id);
            setModalOpen(true);
          }}
          className="px-4 py-2.5 bg-[#00AEEF] hover:bg-[#007BFF] text-white text-xs font-semibold rounded-xl shadow-2xs transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>+ Adicionar Paciente</span>
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

      {/* Search & Filters Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar paciente..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-[#F8FAFC] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#00AEEF]"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
        >
          <option value="ALL">Todos os status</option>
          <option value="AGUARDANDO_TRIAGEM">Aguardando triagem</option>
          <option value="AGUARDANDO_VAGA">Aguardando vaga</option>
          <option value="EM_ATENDIMENTO">Em atendimento</option>
          <option value="ATENDIDO">Atendido</option>
        </select>

        <select
          value={specialtyFilter}
          onChange={(e) => setSpecialtyFilter(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
        >
          <option value="ALL">Todas as especialidades</option>
          {INITIAL_SPECIALTIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
        >
          <option value="ALL">Todas as prioridades</option>
          {Object.entries(PRIORITY_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              Prioridade: {label}
            </option>
          ))}
        </select>
      </div>

      {/* Waiting List Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 bg-[#F1F5F9]/70 text-[11px] font-semibold text-[#003366]">
                <th className="py-3.5 px-4">Posição</th>
                <th className="py-3.5 px-4">Paciente</th>
                <th className="py-3.5 px-4">Data de entrada</th>
                <th className="py-3.5 px-4">Especialidade</th>
                <th className="py-3.5 px-4">Prioridade</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Responsável</th>
                <th className="py-3.5 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {sortedEntries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-[#64748B]">
                    Nenhum paciente na lista de espera para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                sortedEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-[#E6F6FF]/35 transition-colors">
                    <td className="py-3.5 px-4 tabular-nums font-bold text-[#003366]">
                      {String(entry.position).padStart(2, '0')}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-[#003366]">{entry.patientName}</div>
                      {entry.notes && (
                        <div className="text-[11px] text-[#64748B] truncate max-w-xs">
                          {entry.notes}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 tabular-nums text-[#64748B]">{entry.entryDate}</td>
                    <td className="py-3.5 px-4 font-medium text-[#1E293B]">{entry.specialty}</td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <PriorityBadge priority={entry.priority} />
                        <select
                          aria-label="Alterar prioridade"
                          value={entry.priority}
                          onChange={(e) =>
                            handleChangePriority(entry, e.target.value as PriorityLevel)
                          }
                          className="px-1.5 py-0.5 text-[10px] border border-slate-200 rounded bg-white text-[#64748B]"
                        >
                          {Object.entries(PRIORITY_LABELS).map(([k, label]) => (
                            <option key={k} value={k}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#E6F6FF] text-[#003366] border border-[#00AEEF]/30 text-[11px] font-medium">
                        {entry.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-[#64748B]">{entry.responsibleName}</td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleForwardStatus(entry, 'AGUARDANDO_TRIAGEM')}
                          className="px-2.5 py-1 bg-[#E6F6FF] hover:bg-[#00AEEF] text-[#003366] hover:text-white rounded-lg text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                          title="Encaminhar para Triagem"
                        >
                          <Stethoscope className="w-3.5 h-3.5" />
                          <span>Triagem</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleForwardStatus(entry, 'AGUARDANDO_VAGA')}
                          className="px-2.5 py-1 bg-white hover:bg-[#F1F5F9] text-[#003366] border border-slate-200 rounded-lg text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                          title="Encaminhar para Especialidade"
                        >
                          <ArrowUpDown className="w-3.5 h-3.5 text-[#007BFF]" />
                          <span>Vaga</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemove(entry)}
                          className="p-1.5 text-[#64748B] hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                          title="Remover da fila"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add to Waiting List Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-[#003366]/45 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-[#003366]">
                Incluir Paciente na Lista de Espera
              </h2>
              <button type="button" onClick={() => setModalOpen(false)}>
                <X className="w-5 h-5 text-[#64748B]" />
              </button>
            </div>

            <form onSubmit={handleAddEntry} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#003366] mb-1">
                  Paciente *
                </label>
                <select
                  value={selectedPatientId}
                  onChange={(e) => setSelectedPatientId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                >
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (CPF: {p.cpf})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#003366] mb-1">
                  Especialidade Solicitada *
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
                  Observações da Fila
                </label>
                <textarea
                  rows={2}
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
                  Confirmar Inclusão
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
