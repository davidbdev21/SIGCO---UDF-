import React, { useState } from 'react';
import {
  Plus,
  Stethoscope,
  Trash2,
  ArrowUpDown,
  CheckCircle2,
  Search,
  X,
  Clock,
  Users,
  Megaphone,
  Play,
  CheckCircle,
  AlertCircle,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  UserCheck,
  Building2,
} from 'lucide-react';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, getFriendlyErrorMessage } from '../services/firebase';
import { useClinicData } from '../hooks/useClinicData';
import { useAuth } from '../auth/AuthContext';
import { Appointment, NavigationTab, PriorityLevel, WaitingListEntry, WaitingListStatus } from '../types';
import {
  INITIAL_SPECIALTIES,
  INSTITUTION_DOMAIN,
  PRIORITY_LABELS,
  WAITING_LIST_STATUS_LABELS,
  sanitizeId,
  sanitizeString,
} from '../utils/validation';
import { recordAuditLog, removeWaitingListEntry } from '../services/clinicService';
import { PriorityBadge, WaitingListStatusBadge } from '../components/BrandIdentity';
import { ContextualHelp } from '../components/ContextualHelp';

interface WaitingListPageProps {
  onNavigate: (tab: NavigationTab) => void;
}

// In-person unified queue item representing both appointments scheduled for today and walk-in entries
interface InPersonQueueItem {
  id: string;
  sourceType: 'WAITING_ENTRY' | 'APPOINTMENT';
  patientId: string;
  patientName: string;
  patientCpf?: string;
  patientPhone?: string;
  specialty: string;
  priority: PriorityLevel;
  status: WaitingListStatus | 'AGUARDANDO_CHEGADA';
  checkInTime?: string;
  callTime?: string;
  boxCadeira?: string;
  queueType: 'AGENDADO' | 'ENCAIXE' | 'URGENCIA' | 'ESPONTANEA';
  responsibleName: string;
  scheduledTime?: string;
  notes?: string;
  originalAppointment?: Appointment;
  originalWaitingEntry?: WaitingListEntry;
}

function parseYMD(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
}

function toYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getTodayYMD(): string {
  return toYMD(new Date());
}

export const WaitingListPage: React.FC<WaitingListPageProps> = ({ onNavigate }) => {
  const { systemUser } = useAuth();
  const {
    waitingList,
    patients,
    appointments,
    clinics,
    students,
    updateWaitingListLocal,
    removeWaitingListLocal,
    addWaitingListLocal,
    updateAppointmentLocal,
  } = useClinicData();

  // Tab mode: "presencial" (Atendimento do Dia na Recepção) vs "geral" (Lista Geral de Vagas & Triagem)
  const [activeTab, setActiveTab] = useState<'presencial' | 'geral'>('presencial');

  // In-person Date Reference (default to 2026-10-05 demo date or today)
  const [selectedDate, setSelectedDate] = useState('2026-10-05');

  // Last Called Patient Call Announcement Banner
  const [lastCalled, setLastCalled] = useState<{
    patientName: string;
    boxCadeira: string;
    studentName: string;
    callTime: string;
  } | null>({
    patientName: 'Juliana Martins Prado (Fictícia)',
    boxCadeira: 'Box 18 — Clínica Integrada II',
    studentName: 'Mariana Costa (Aluna)',
    callTime: '14:05',
  });

  // Call Modal state
  const [callModalItem, setCallModalItem] = useState<InPersonQueueItem | null>(null);
  const [targetBox, setTargetBox] = useState('Box 01 — Clínica Integrada I');
  const [callStudent, setCallStudent] = useState('');

  // Encaixe / Urgência Presencial Modal
  const [walkInModalOpen, setWalkInModalOpen] = useState(false);
  const [walkInPatientId, setWalkInPatientId] = useState('');
  const [walkInType, setWalkInType] = useState<'ENCAIXE' | 'URGENCIA' | 'ESPONTANEA'>('ENCAIXE');
  const [walkInSpecialty, setWalkInSpecialty] = useState('Clínica Geral');
  const [walkInPriority, setWalkInPriority] = useState<PriorityLevel>('MEDIA');
  const [walkInBox, setWalkInBox] = useState('Box 04');
  const [walkInNotes, setWalkInNotes] = useState('');

  // General Waiting List Tab states
  const [searchQuery, setSearchQuery] = useState('');
  const [specialtyFilter, setSpecialtyFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [queueTypeFilter, setQueueTypeFilter] = useState('ALL');

  // General Add Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [specialty, setSpecialty] = useState('Clínica Geral');
  const [priority, setPriority] = useState<PriorityLevel>('MEDIA');
  const [notes, setNotes] = useState('');

  const [feedback, setFeedback] = useState<string | null>(null);

  if (!systemUser) return null;

  // --- Date navigation handlers ---
  const handlePrevDay = () => {
    const d = parseYMD(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(toYMD(d));
  };

  const handleNextDay = () => {
    const d = parseYMD(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(toYMD(d));
  };

  const handleToday = () => {
    setSelectedDate(getTodayYMD());
  };

  const handleJumpToDemo = () => {
    setSelectedDate('2026-10-05');
  };

  const formattedDate = () => {
    const d = parseYMD(selectedDate);
    const text = d.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    return text.charAt(0).toUpperCase() + text.slice(1);
  };

  // --- Build unified in-person queue for selectedDate ---
  // 1. In-person waiting list entries for this date
  const dateWaitingEntries = waitingList.filter(
    (w) => w.entryDate === selectedDate || w.checkInTime || w.queueType
  );

  // 2. Appointments scheduled for this date
  const dateAppointments = appointments.filter((a) => a.date === selectedDate);

  // Combine them without duplicating
  const inPersonItems: InPersonQueueItem[] = [];

  // Add waiting entries for today
  dateWaitingEntries.forEach((entry) => {
    const pat = patients.find((p) => p.id === entry.patientId);
    inPersonItems.push({
      id: entry.id,
      sourceType: 'WAITING_ENTRY',
      patientId: entry.patientId,
      patientName: entry.patientName,
      patientCpf: pat?.cpf,
      patientPhone: pat?.phone || pat?.whatsapp,
      specialty: entry.specialty,
      priority: entry.priority,
      status: entry.status,
      checkInTime: entry.checkInTime || '13:30',
      callTime: entry.callTime,
      boxCadeira: entry.boxCadeira,
      queueType: entry.queueType || 'AGENDADO',
      responsibleName: entry.responsibleName,
      notes: entry.notes,
      originalWaitingEntry: entry,
    });
  });

  // Add appointments that aren't already represented in the waiting list
  dateAppointments.forEach((apt) => {
    const alreadyPresent = inPersonItems.some(
      (item) => item.patientId === apt.patientId || item.id === `apt_${apt.id}`
    );
    if (!alreadyPresent) {
      const pat = patients.find((p) => p.id === apt.patientId);
      let mappedStatus: WaitingListStatus | 'AGUARDANDO_CHEGADA' = 'AGUARDANDO_CHEGADA';
      if (apt.status === 'CONFIRMADA') mappedStatus = 'PRESENTE';
      else if (apt.status === 'EM_ATENDIMENTO') mappedStatus = 'EM_ATENDIMENTO';
      else if (apt.status === 'ATENDIDA') mappedStatus = 'ATENDIDO';
      else if (apt.status === 'FALTOU' || apt.status === 'CANCELADA') mappedStatus = 'NAO_COMPARECEU';

      inPersonItems.push({
        id: `apt_${apt.id}`,
        sourceType: 'APPOINTMENT',
        patientId: apt.patientId,
        patientName: apt.patientName,
        patientCpf: pat?.cpf,
        patientPhone: pat?.phone || pat?.whatsapp,
        specialty: apt.specialty,
        priority: pat?.priority || 'MEDIA',
        status: mappedStatus,
        checkInTime: apt.status === 'CONFIRMADA' || apt.status === 'EM_ATENDIMENTO' || apt.status === 'ATENDIDA' ? apt.startTime : undefined,
        boxCadeira: apt.clinicName.includes('Boxes') ? apt.clinicName : undefined,
        queueType: 'AGENDADO',
        responsibleName: `${apt.studentName} (Prof. ${apt.professorName})`,
        scheduledTime: `${apt.startTime}–${apt.endTime}`,
        notes: apt.notes,
        originalAppointment: apt,
      });
    }
  });

  // Filter in-person queue
  const filteredInPersonItems = inPersonItems.filter((item) => {
    const q = searchQuery.trim().toLowerCase();
    const matchSearch =
      !q ||
      item.patientName.toLowerCase().includes(q) ||
      item.specialty.toLowerCase().includes(q) ||
      (item.patientCpf && item.patientCpf.includes(q)) ||
      item.responsibleName.toLowerCase().includes(q);

    const matchStatus = statusFilter === 'ALL' || item.status === statusFilter;
    const matchSpecialty = specialtyFilter === 'ALL' || item.specialty === specialtyFilter;
    const matchPriority = priorityFilter === 'ALL' || item.priority === priorityFilter;
    const matchType = queueTypeFilter === 'ALL' || item.queueType === queueTypeFilter;

    return matchSearch && matchStatus && matchSpecialty && matchPriority && matchType;
  });

  // Calculate In-Person Real-time Metrics
  const totalExpected = inPersonItems.length;
  const waitingCount = inPersonItems.filter((i) => i.status === 'PRESENTE').length;
  const inAttendanceCount = inPersonItems.filter(
    (i) => i.status === 'CHAMADO' || i.status === 'EM_ATENDIMENTO'
  ).length;
  const completedCount = inPersonItems.filter((i) => i.status === 'ATENDIDO').length;

  // --- Flow Actions ---
  const handleCheckIn = async (item: InPersonQueueItem) => {
    const nowTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    // Update appointment if linked
    if (item.originalAppointment) {
      updateAppointmentLocal(item.originalAppointment.id, { status: 'CONFIRMADA' });
      if (auth.currentUser) {
        updateDoc(doc(db, 'appointments', item.originalAppointment.id), { status: 'CONFIRMADA' }).catch(() => {});
      }
    }

    // Update or create in waiting list
    if (item.originalWaitingEntry) {
      updateWaitingListLocal(item.originalWaitingEntry.id, {
        status: 'PRESENTE',
        checkInTime: nowTime,
      });
      if (auth.currentUser) {
        updateDoc(doc(db, 'waiting_list', item.originalWaitingEntry.id), {
          status: 'PRESENTE',
          checkInTime: nowTime,
        }).catch(() => {});
      }
    } else {
      // Create waiting list record for this check-in
      const entryId = sanitizeId(`wait_checkin_${Date.now()}`);
      const payload: WaitingListEntry = {
        id: entryId,
        patientId: item.patientId,
        patientName: item.patientName,
        position: waitingList.length + 1,
        entryDate: selectedDate,
        specialty: item.specialty,
        priority: item.priority,
        status: 'PRESENTE',
        notes: `Check-in realizado às ${nowTime} para consulta agendada.`,
        responsibleName: item.responsibleName,
        institutionDomain: INSTITUTION_DOMAIN,
        createdByUid: systemUser.uid,
        checkInTime: nowTime,
        queueType: 'AGENDADO',
        appointmentId: item.originalAppointment?.id,
      };
      addWaitingListLocal(payload);
      if (auth.currentUser) {
        setDoc(doc(db, 'waiting_list', entryId), payload).catch(() => {});
      }
    }

    setFeedback(`Check-in confirmado para ${item.patientName} às ${nowTime}. Paciente aguardando na sala de espera.`);
  };

  const handleOpenCallModal = (item: InPersonQueueItem) => {
    setCallModalItem(item);
    setTargetBox(item.boxCadeira || 'Box 04 — Clínica Integrada I');
    setCallStudent(item.responsibleName || (students[0] ? students[0].name : 'Aluno Responsável'));
  };

  const handleConfirmCall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!callModalItem) return;

    const nowTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    // Update banner
    setLastCalled({
      patientName: callModalItem.patientName,
      boxCadeira: targetBox,
      studentName: callStudent,
      callTime: nowTime,
    });

    // Update in-memory & Firestore
    if (callModalItem.originalWaitingEntry) {
      updateWaitingListLocal(callModalItem.originalWaitingEntry.id, {
        status: 'CHAMADO',
        boxCadeira: targetBox,
        callTime: nowTime,
        responsibleName: callStudent,
      });
      if (auth.currentUser) {
        updateDoc(doc(db, 'waiting_list', callModalItem.originalWaitingEntry.id), {
          status: 'CHAMADO',
          boxCadeira: targetBox,
          callTime: nowTime,
          responsibleName: callStudent,
        }).catch(() => {});
      }
    } else if (callModalItem.originalAppointment) {
      updateAppointmentLocal(callModalItem.originalAppointment.id, {
        status: 'EM_ATENDIMENTO',
      });
      if (auth.currentUser) {
        updateDoc(doc(db, 'appointments', callModalItem.originalAppointment.id), {
          status: 'EM_ATENDIMENTO',
        }).catch(() => {});
      }
    }

    setCallModalItem(null);
    setFeedback(`Paciente ${callModalItem.patientName} chamado para o ${targetBox}. Chamada anunciada no painel.`);
  };

  const handleStartAttendance = async (item: InPersonQueueItem) => {
    if (item.originalWaitingEntry) {
      updateWaitingListLocal(item.originalWaitingEntry.id, { status: 'EM_ATENDIMENTO' });
      if (auth.currentUser) {
        updateDoc(doc(db, 'waiting_list', item.originalWaitingEntry.id), { status: 'EM_ATENDIMENTO' }).catch(() => {});
      }
    }
    if (item.originalAppointment) {
      updateAppointmentLocal(item.originalAppointment.id, { status: 'EM_ATENDIMENTO' });
      if (auth.currentUser) {
        updateDoc(doc(db, 'appointments', item.originalAppointment.id), { status: 'EM_ATENDIMENTO' }).catch(() => {});
      }
    }
    setFeedback(`Atendimento iniciado para ${item.patientName} no ${item.boxCadeira || 'Box Odontológico'}.`);
  };

  const handleCompleteAttendance = async (item: InPersonQueueItem) => {
    if (item.originalWaitingEntry) {
      updateWaitingListLocal(item.originalWaitingEntry.id, { status: 'ATENDIDO' });
      if (auth.currentUser) {
        updateDoc(doc(db, 'waiting_list', item.originalWaitingEntry.id), { status: 'ATENDIDO' }).catch(() => {});
      }
    }
    if (item.originalAppointment) {
      updateAppointmentLocal(item.originalAppointment.id, { status: 'ATENDIDA' });
      if (auth.currentUser) {
        updateDoc(doc(db, 'appointments', item.originalAppointment.id), { status: 'ATENDIDA' }).catch(() => {});
      }
    }
    setFeedback(`Atendimento concluído com sucesso para ${item.patientName}.`);
  };

  const handleMarkAbsence = async (item: InPersonQueueItem) => {
    if (item.originalWaitingEntry) {
      updateWaitingListLocal(item.originalWaitingEntry.id, { status: 'NAO_COMPARECEU' });
      if (auth.currentUser) {
        updateDoc(doc(db, 'waiting_list', item.originalWaitingEntry.id), { status: 'NAO_COMPARECEU' }).catch(() => {});
      }
    }
    if (item.originalAppointment) {
      updateAppointmentLocal(item.originalAppointment.id, { status: 'FALTOU' });
      if (auth.currentUser) {
        updateDoc(doc(db, 'appointments', item.originalAppointment.id), { status: 'FALTOU' }).catch(() => {});
      }
    }
    setFeedback(`Paciente ${item.patientName} marcado como ausente (Não compareceu).`);
  };

  const handleCreateWalkIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const pat = patients.find((p) => p.id === walkInPatientId);
    if (!pat) return;

    const nowTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const entryId = sanitizeId(`wait_walkin_${Date.now()}`);
    const nextPos = waitingList.length + 1;

    const payload: WaitingListEntry = {
      id: entryId,
      patientId: pat.id,
      patientName: sanitizeString(pat.name, 120),
      position: nextPos,
      entryDate: selectedDate,
      specialty: sanitizeString(walkInSpecialty, 80),
      priority: walkInPriority,
      status: 'PRESENTE',
      notes: sanitizeString(walkInNotes, 1000, `Encaixe presencial registrado às ${nowTime}.`),
      responsibleName: sanitizeString(systemUser.name, 120),
      institutionDomain: INSTITUTION_DOMAIN,
      createdByUid: systemUser.uid,
      checkInTime: nowTime,
      boxCadeira: walkInBox,
      queueType: walkInType,
    };

    addWaitingListLocal(payload);
    setWalkInModalOpen(false);
    setWalkInNotes('');
    setFeedback(`Paciente ${pat.name} admitido como ${walkInType} às ${nowTime} e incluído na fila da recepção.`);

    if (auth.currentUser) {
      try {
        await setDoc(doc(db, 'waiting_list', entryId), payload);
        await recordAuditLog({
          uid: systemUser.uid,
          userName: systemUser.name,
          userEmail: systemUser.email,
          userRole: systemUser.role,
          action: 'ENCAIXE_PRESENCIAL',
          targetRecord: `Paciente: ${pat.name}`,
          operationSummary: `${systemUser.name} adicionou ${pat.name} como encaixe presencial na fila de hoje.`,
        }).catch(() => {});
      } catch (err) {
        console.warn('Firestore walk-in sync notice:', err);
      }
    }
  };

  // --- General Waiting List Functions ---
  const sortedGeneralEntries = [...waitingList]
    .filter((w) => {
      const q = searchQuery.trim().toLowerCase();
      return !q || w.patientName.toLowerCase().includes(q) || w.specialty.toLowerCase().includes(q);
    })
    .filter((w) => specialtyFilter === 'ALL' || w.specialty === specialtyFilter)
    .filter((w) => priorityFilter === 'ALL' || w.priority === priorityFilter)
    .filter((w) => statusFilter === 'ALL' || w.status === statusFilter)
    .sort((a, b) => a.position - b.position);

  const handleAddGeneralEntry = async (e: React.FormEvent) => {
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
      notes: sanitizeString(notes, 1000, 'Inserido na lista de espera geral.'),
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
    setFeedback(`Paciente ${pat.name} incluído na lista geral de espera na posição #${nextPos}.`);

    if (auth.currentUser) {
      try {
        await setDoc(doc(db, 'waiting_list', entryId), payload);
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
        await updateDoc(doc(db, 'waiting_list', entry.id), { priority: nextPriority });
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
        await updateDoc(doc(db, 'waiting_list', entry.id), { status: nextStatus });
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
      {/* Header and Master Mode Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-[#003366] tracking-tight">Lista de Espera e Recepção</h1>
            <ContextualHelp
              title="Lista de Espera e Atendimento Presencial"
              description="Gerencie tanto o fluxo presencial do dia (check-in de recepção, chamada ao box, início e conclusão do atendimento) quanto a lista de espera geral para triagens e vagas futuras."
            />
          </div>
          <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
            Controle de recepção presencial, chamada sonora/visual de boxes e regulação de vagas clínicas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {activeTab === 'presencial' ? (
            <button
              type="button"
              onClick={() => {
                if (patients.length > 0) setWalkInPatientId(patients[0].id);
                setWalkInModalOpen(true);
              }}
              className="px-4 py-2.5 bg-[#00AEEF] hover:bg-[#007BFF] text-white text-xs font-semibold rounded-xl shadow-2xs transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>+ Encaixe Presencial / Urgência</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (patients.length > 0) setSelectedPatientId(patients[0].id);
                setModalOpen(true);
              }}
              className="px-4 py-2.5 bg-[#00AEEF] hover:bg-[#007BFF] text-white text-xs font-semibold rounded-xl shadow-2xs transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>+ Adicionar na Fila Geral</span>
            </button>
          )}
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

      {/* Main Tab Switcher */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-2.5 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 bg-[#F1F5F9] rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('presencial')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'presencial'
                ? 'bg-[#003366] text-white shadow-2xs'
                : 'text-[#64748B] hover:text-[#003366]'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Atendimento Presencial do Dia (Recepção)</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                activeTab === 'presencial' ? 'bg-[#00AEEF] text-white' : 'bg-slate-200 text-[#003366]'
              }`}
            >
              {waitingCount + inAttendanceCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('geral')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'geral'
                ? 'bg-[#003366] text-white shadow-2xs'
                : 'text-[#64748B] hover:text-[#003366]'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Lista Geral de Espera (Especialidades & Triagem)</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                activeTab === 'geral' ? 'bg-[#00AEEF] text-white' : 'bg-slate-200 text-[#003366]'
              }`}
            >
              {waitingList.length}
            </span>
          </button>
        </div>

        {/* Date Reference controls for In-person mode */}
        {activeTab === 'presencial' && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePrevDay}
              className="p-1.5 rounded-xl border border-slate-200 bg-[#F8FAFC] hover:bg-[#E6F6FF] text-[#003366] transition-colors cursor-pointer"
              title="Dia anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-xl bg-[#F8FAFC]">
              <CalendarIcon className="w-4 h-4 text-[#00AEEF]" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="text-xs tabular-nums text-[#1E293B] bg-transparent focus:outline-none cursor-pointer"
              />
            </div>

            <button
              type="button"
              onClick={handleNextDay}
              className="p-1.5 rounded-xl border border-slate-200 bg-[#F8FAFC] hover:bg-[#E6F6FF] text-[#003366] transition-colors cursor-pointer"
              title="Próximo dia"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleToday}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 bg-[#F8FAFC] hover:bg-[#E6F6FF] text-[#003366] transition-colors cursor-pointer"
            >
              Hoje
            </button>

            {selectedDate !== '2026-10-05' && (
              <button
                type="button"
                onClick={handleJumpToDemo}
                className="px-2.5 py-1.5 text-xs font-medium rounded-xl border border-dashed border-[#00AEEF] text-[#007BFF] hover:bg-[#E6F6FF] transition-colors cursor-pointer inline-flex items-center gap-1"
                title="Ir para a data das consultas simuladas"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Dia Demo (05/10/2026)</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* ABA 1: ATENDIMENTO PRESENCIAL DO DIA                                      */}
      {/* ========================================================================= */}
      {activeTab === 'presencial' && (
        <div className="space-y-5">
          {/* Top Real-time Metrics Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
              <div className="text-xs font-medium text-[#64748B]">Total Esperados Hoje</div>
              <div className="text-2xl font-bold tabular-nums text-[#003366] mt-1">{totalExpected}</div>
              <div className="text-[11px] text-[#64748B] mt-0.5">Agendados + Encaixes</div>
            </div>

            <div className="bg-white border border-blue-200 rounded-2xl p-4 shadow-2xs bg-blue-50/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-blue-900">Aguardando na Recepção</span>
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
              </div>
              <div className="text-2xl font-bold tabular-nums text-[#003366] mt-1">{waitingCount}</div>
              <div className="text-[11px] text-blue-700 mt-0.5 font-medium">Check-in já realizado</div>
            </div>

            <div className="bg-white border border-emerald-200 rounded-2xl p-4 shadow-2xs bg-emerald-50/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-900">Em Atendimento</span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              </div>
              <div className="text-2xl font-bold tabular-nums text-emerald-800 mt-1">{inAttendanceCount}</div>
              <div className="text-[11px] text-emerald-700 mt-0.5">Boxes ocupados no momento</div>
            </div>

            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
              <div className="text-xs font-medium text-[#64748B]">Atendimentos Concluídos</div>
              <div className="text-2xl font-bold tabular-nums text-[#003366] mt-1">{completedCount}</div>
              <div className="text-[11px] text-teal-700 mt-0.5 font-medium">Finalizados hoje</div>
            </div>
          </div>

          {/* Active Call Highlight Announcement Banner */}
          {lastCalled && (
            <div className="bg-[#003366] text-white rounded-2xl p-4 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-3 border border-[#00AEEF]">
              <div className="flex items-start md:items-center gap-3">
                <div className="p-2.5 bg-[#00AEEF] text-white rounded-xl shrink-0">
                  <Megaphone className="w-5 h-5 animate-bounce" />
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-[#00AEEF] font-bold">
                    Painel de Chamada da Recepção
                  </div>
                  <div className="text-base font-bold text-white flex flex-wrap items-center gap-2">
                    <span>{lastCalled.patientName}</span>
                    <span className="text-sm font-normal text-slate-200">dirigir-se ao</span>
                    <span className="px-2.5 py-0.5 bg-white text-[#003366] rounded-lg font-extrabold text-sm shadow-xs">
                      {lastCalled.boxCadeira}
                    </span>
                  </div>
                  <div className="text-xs text-slate-300 mt-0.5">
                    Responsável: <span className="text-white font-medium">{lastCalled.studentName}</span> · Chamado às{' '}
                    <span className="tabular-nums font-semibold">{lastCalled.callTime}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end md:self-auto">
                <button
                  type="button"
                  onClick={() => setLastCalled(null)}
                  className="px-3 py-1.5 text-xs text-slate-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                >
                  Dispensar Alerta
                </button>
              </div>
            </div>
          )}

          {/* Search & Filter Bar */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar paciente, CPF ou aluno..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#F8FAFC] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#00AEEF]"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC] text-[#003366]"
            >
              <option value="ALL">Todos os status presenciais</option>
              <option value="PRESENTE">Presente na recepção</option>
              <option value="CHAMADO">Chamado ao box</option>
              <option value="EM_ATENDIMENTO">Em atendimento no box</option>
              <option value="ATENDIDO">Atendimento concluído</option>
              <option value="AGUARDANDO_CHEGADA">Aguardando chegada / agendado</option>
              <option value="NAO_COMPARECEU">Não compareceu / falta</option>
            </select>

            <select
              value={queueTypeFilter}
              onChange={(e) => setQueueTypeFilter(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC] text-[#003366]"
            >
              <option value="ALL">Todos os tipos de atendimento</option>
              <option value="AGENDADO">Consulta Agendada</option>
              <option value="ENCAIXE">Encaixe Presencial</option>
              <option value="URGENCIA">Urgência Odontológica</option>
              <option value="ESPONTANEA">Demanda Espontânea</option>
            </select>

            <select
              value={specialtyFilter}
              onChange={(e) => setSpecialtyFilter(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC] text-[#003366]"
            >
              <option value="ALL">Todas as especialidades</option>
              {INITIAL_SPECIALTIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* In-Person Queue Table */}
          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-[#F8FAFC]/50">
              <div className="text-xs font-bold text-[#003366]">
                Fila de Atendimento — {formattedDate()}
              </div>
              <div className="text-[11px] text-[#64748B]">
                {filteredInPersonItems.length}{' '}
                {filteredInPersonItems.length === 1 ? 'paciente listado' : 'pacientes listados'}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-[#F1F5F9]/70 text-[11px] font-semibold text-[#003366]">
                    <th className="py-3.5 px-4">Horário / Entrada</th>
                    <th className="py-3.5 px-4">Paciente</th>
                    <th className="py-3.5 px-4">Tipo / Especialidade</th>
                    <th className="py-3.5 px-4">Box / Cadeira</th>
                    <th className="py-3.5 px-4">Aluno / Supervisor</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Ações do Fluxo Presencial</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredInPersonItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-[#64748B]">
                        Nenhum paciente na fila presencial para a data selecionada ({selectedDate}). Alterne a data ou adicione um encaixe presencial.
                      </td>
                    </tr>
                  ) : (
                    filteredInPersonItems.map((item) => (
                      <tr key={item.id} className="hover:bg-[#E6F6FF]/35 transition-colors">
                        <td className="py-3.5 px-4 tabular-nums">
                          {item.checkInTime ? (
                            <div>
                              <div className="font-bold text-[#003366] flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5 text-[#00AEEF]" />
                                <span>{item.checkInTime}</span>
                              </div>
                              <div className="text-[10px] text-emerald-700 font-medium">Check-in feito</div>
                            </div>
                          ) : (
                            <div>
                              <div className="font-medium text-[#64748B]">{item.scheduledTime || 'Sem horário'}</div>
                              <div className="text-[10px] text-amber-700">Aguardando chegada</div>
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-[#003366]">{item.patientName}</div>
                          <div className="text-[11px] text-[#64748B] flex items-center gap-2">
                            {item.patientCpf && <span>CPF: {item.patientCpf}</span>}
                            {item.patientPhone && <span>· {item.patientPhone}</span>}
                          </div>
                          {item.notes && (
                            <div className="text-[11px] text-slate-500 max-w-xs truncate mt-0.5">
                              {item.notes}
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                item.queueType === 'URGENCIA'
                                  ? 'bg-red-100 text-red-800'
                                  : item.queueType === 'ENCAIXE'
                                  ? 'bg-amber-100 text-amber-900'
                                  : 'bg-blue-100 text-blue-900'
                              }`}
                            >
                              {item.queueType}
                            </span>
                            <span className="font-medium text-[#1E293B]">{item.specialty}</span>
                          </div>
                          <div className="mt-1">
                            <PriorityBadge priority={item.priority} />
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          {item.boxCadeira ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-[#003366] bg-slate-100 px-2 py-0.5 rounded-md text-[11px]">
                              <Building2 className="w-3 h-3 text-[#007BFF]" />
                              <span>{item.boxCadeira}</span>
                            </span>
                          ) : (
                            <span className="text-[11px] text-[#64748B] italic">A definir na chamada</span>
                          )}
                          {item.callTime && (
                            <div className="text-[10px] text-purple-700 mt-0.5 tabular-nums">
                              Chamado às {item.callTime}
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-[#64748B]">
                          <div className="text-[#1E293B] font-medium">{item.responsibleName}</div>
                        </td>

                        <td className="py-3.5 px-4">
                          {item.status === 'AGUARDANDO_CHEGADA' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] border border-amber-200 bg-amber-50 text-amber-800">
                              Aguardando chegada
                            </span>
                          ) : (
                            <WaitingListStatusBadge status={item.status as WaitingListStatus} />
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {/* Check-in Action */}
                            {item.status === 'AGUARDANDO_CHEGADA' && (
                              <button
                                type="button"
                                onClick={() => handleCheckIn(item)}
                                className="px-3 py-1.5 bg-[#00AEEF] hover:bg-[#007BFF] text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                                title="Registrar chegada do paciente na recepção"
                              >
                                <UserCheck className="w-3.5 h-3.5" />
                                <span>Dar Check-in</span>
                              </button>
                            )}

                            {/* Call to Box Action */}
                            {item.status === 'PRESENTE' && (
                              <button
                                type="button"
                                onClick={() => handleOpenCallModal(item)}
                                className="px-3 py-1.5 bg-[#003366] hover:bg-[#007BFF] text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                                title="Chamar paciente para o Box de Atendimento"
                              >
                                <Megaphone className="w-3.5 h-3.5 text-[#00AEEF]" />
                                <span>Chamar ao Box</span>
                              </button>
                            )}

                            {/* Start Attendance Action */}
                            {item.status === 'CHAMADO' && (
                              <button
                                type="button"
                                onClick={() => handleStartAttendance(item)}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                                title="Iniciar atendimento na cadeira odontológica"
                              >
                                <Play className="w-3.5 h-3.5" />
                                <span>Iniciar Atendimento</span>
                              </button>
                            )}

                            {/* Complete Attendance Action */}
                            {item.status === 'EM_ATENDIMENTO' && (
                              <button
                                type="button"
                                onClick={() => handleCompleteAttendance(item)}
                                className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                                title="Finalizar atendimento presencial"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                                <span>Concluir</span>
                              </button>
                            )}

                            {/* Mark Absence (available for pending or present) */}
                            {(item.status === 'AGUARDANDO_CHEGADA' || item.status === 'PRESENTE') && (
                              <button
                                type="button"
                                onClick={() => handleMarkAbsence(item)}
                                className="p-1.5 text-[#64748B] hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                                title="Registrar não comparecimento / falta"
                              >
                                <AlertCircle className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 2: LISTA GERAL DE ESPERA (ESPECIALIDADES & TRIAGEM)                     */}
      {/* ========================================================================= */}
      {activeTab === 'geral' && (
        <div className="space-y-5">
          {/* Search & Filters Bar */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar paciente na fila..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#F8FAFC] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#00AEEF]"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC] text-[#003366]"
            >
              <option value="ALL">Todos os status</option>
              <option value="AGUARDANDO_TRIAGEM">Aguardando triagem</option>
              <option value="AGUARDANDO_VAGA">Aguardando vaga</option>
              <option value="PRESENTE">Presente na recepção</option>
              <option value="EM_ATENDIMENTO">Em atendimento</option>
              <option value="ATENDIDO">Atendido</option>
            </select>

            <select
              value={specialtyFilter}
              onChange={(e) => setSpecialtyFilter(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC] text-[#003366]"
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
              className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC] text-[#003366]"
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
                  {sortedGeneralEntries.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-[#64748B]">
                        Nenhum paciente na lista de espera para os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    sortedGeneralEntries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-[#E6F6FF]/35 transition-colors">
                        <td className="py-3.5 px-4 tabular-nums font-bold text-[#003366]">
                          #{String(entry.position).padStart(2, '0')}
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
                          <WaitingListStatusBadge status={entry.status} />
                        </td>
                        <td className="py-3.5 px-4 text-[#64748B]">{entry.responsibleName}</td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {/* Fast-track to Today's In-person check-in */}
                            <button
                              type="button"
                              onClick={() => {
                                const nowTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                                updateWaitingListLocal(entry.id, {
                                  status: 'PRESENTE',
                                  entryDate: selectedDate,
                                  checkInTime: nowTime,
                                  queueType: 'ENCAIXE',
                                });
                                setActiveTab('presencial');
                                setFeedback(`Paciente ${entry.patientName} admitido presencialmente hoje às ${nowTime}.`);
                              }}
                              className="px-2.5 py-1 bg-[#00AEEF] hover:bg-[#007BFF] text-white rounded-lg text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                              title="Dar entrada presencial deste paciente hoje"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>Check-in Hoje</span>
                            </button>

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
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CHAMAR PACIENTE PARA BOX ODONTOLÓGICO                              */}
      {/* ========================================================================= */}
      {callModalItem && (
        <div className="fixed inset-0 z-50 bg-[#003366]/45 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-[#00AEEF]" />
                <h2 className="text-base font-bold text-[#003366]">Chamar Paciente ao Box</h2>
              </div>
              <button type="button" onClick={() => setCallModalItem(null)}>
                <X className="w-5 h-5 text-[#64748B]" />
              </button>
            </div>

            <div className="p-3 bg-[#E6F6FF]/60 border border-[#00AEEF]/30 rounded-xl text-xs space-y-1">
              <div className="font-bold text-[#003366] text-sm">{callModalItem.patientName}</div>
              <div className="text-[#64748B]">
                Especialidade: <span className="font-medium text-[#1E293B]">{callModalItem.specialty}</span>
              </div>
              {callModalItem.checkInTime && (
                <div className="text-[#64748B]">
                  Horário de Chegada (Check-in):{' '}
                  <span className="font-medium text-[#003366] tabular-nums">{callModalItem.checkInTime}</span>
                </div>
              )}
            </div>

            <form onSubmit={handleConfirmCall} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#003366] mb-1">
                  Box ou Cadeira Odontológica Destino *
                </label>
                <select
                  value={targetBox}
                  onChange={(e) => setTargetBox(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC] text-[#003366] font-medium"
                >
                  <optgroup label="Clínica Integrada I — Endodontia">
                    <option value="Box 01 — Clínica Integrada I">Box 01 (Clínica I)</option>
                    <option value="Box 02 — Clínica Integrada I">Box 02 (Clínica I)</option>
                    <option value="Box 03 — Clínica Integrada I">Box 03 (Clínica I)</option>
                    <option value="Box 04 — Clínica Integrada I">Box 04 (Clínica I)</option>
                  </optgroup>
                  <optgroup label="Clínica Integrada II — Clínica Geral">
                    <option value="Box 17 — Clínica Integrada II">Box 17 (Clínica II)</option>
                    <option value="Box 18 — Clínica Integrada II">Box 18 (Clínica II)</option>
                    <option value="Box 19 — Clínica Integrada II">Box 19 (Clínica II)</option>
                    <option value="Box 20 — Clínica Integrada II">Box 20 (Clínica II)</option>
                  </optgroup>
                  <optgroup label="Centro Cirúrgico III — Cirurgia">
                    <option value="Sala Cirúrgica 01">Sala Cirúrgica 01</option>
                    <option value="Sala Cirúrgica 02">Sala Cirúrgica 02</option>
                  </optgroup>
                  <optgroup label="Clínica IV — Prótese">
                    <option value="Box 37 — Clínica IV">Box 37 (Clínica IV)</option>
                    <option value="Box 38 — Clínica IV">Box 38 (Clínica IV)</option>
                  </optgroup>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#003366] mb-1">
                  Aluno Responsável pelo Atendimento *
                </label>
                <select
                  value={callStudent}
                  onChange={(e) => setCallStudent(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC] text-[#003366]"
                >
                  {students.map((s) => (
                    <option key={s.id} value={`${s.name} (${s.specialtyClinic})`}>
                      {s.name} — {s.specialtyClinic} ({s.semester})
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-900">
                Ao confirmar, o paciente será anunciado imediatamente no <strong>Painel de Chamada</strong> e seu status mudará para <strong>CHAMADO</strong>.
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCallModalItem(null)}
                  className="px-4 py-2 text-xs font-semibold text-[#003366] bg-white border border-[#00AEEF] rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#003366] hover:bg-[#007BFF] rounded-xl cursor-pointer flex items-center gap-1.5"
                >
                  <Megaphone className="w-4 h-4 text-[#00AEEF]" />
                  <span>Confirmar Chamada</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ENCAIXE PRESENCIAL / URGÊNCIA DO DIA                                */}
      {/* ========================================================================= */}
      {walkInModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#003366]/45 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-[#003366]">
                Admitir Encaixe Presencial / Urgência
              </h2>
              <button type="button" onClick={() => setWalkInModalOpen(false)}>
                <X className="w-5 h-5 text-[#64748B]" />
              </button>
            </div>

            <form onSubmit={handleCreateWalkIn} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#003366] mb-1">
                  Paciente *
                </label>
                <select
                  value={walkInPatientId}
                  onChange={(e) => setWalkInPatientId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                >
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (CPF: {p.cpf})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#003366] mb-1">
                    Tipo de Admissão *
                  </label>
                  <select
                    value={walkInType}
                    onChange={(e) => setWalkInType(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC] text-[#003366] font-semibold"
                  >
                    <option value="ENCAIXE">Encaixe Presencial</option>
                    <option value="URGENCIA">Urgência Odontológica</option>
                    <option value="ESPONTANEA">Demanda Espontânea</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#003366] mb-1">
                    Prioridade Clínica *
                  </label>
                  <select
                    value={walkInPriority}
                    onChange={(e) => setWalkInPriority(e.target.value as PriorityLevel)}
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#003366] mb-1">
                    Especialidade *
                  </label>
                  <select
                    value={walkInSpecialty}
                    onChange={(e) => setWalkInSpecialty(e.target.value)}
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
                    Box Previsto
                  </label>
                  <input
                    type="text"
                    value={walkInBox}
                    onChange={(e) => setWalkInBox(e.target.value)}
                    placeholder="Ex: Box 04"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#003366] mb-1">
                  Queixa Principal / Motivo do Encaixe
                </label>
                <textarea
                  rows={2}
                  value={walkInNotes}
                  onChange={(e) => setWalkInNotes(e.target.value)}
                  placeholder="Relato do paciente, sintomatologia ou motivo do atendimento hoje..."
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setWalkInModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-[#003366] bg-white border border-[#00AEEF] rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#00AEEF] hover:bg-[#007BFF] rounded-xl cursor-pointer"
                >
                  Confirmar Admissão Presencial
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADICIONAR PACIENTE NA FILA GERAL                                   */}
      {/* ========================================================================= */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-[#003366]/45 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-[#003366]">
                Incluir Paciente na Lista Geral de Espera
              </h2>
              <button type="button" onClick={() => setModalOpen(false)}>
                <X className="w-5 h-5 text-[#64748B]" />
              </button>
            </div>

            <form onSubmit={handleAddGeneralEntry} className="space-y-4">
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
