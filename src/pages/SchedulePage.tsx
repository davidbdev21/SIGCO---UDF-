import React, { useState } from 'react';
import {
  Calendar as CalendarIcon,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Clock,
  UserCheck,
  X,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  CalendarRange,
} from 'lucide-react';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { db, getFriendlyErrorMessage } from '../services/firebase';
import { useClinicData } from '../hooks/useClinicData';
import { useAuth } from '../auth/AuthContext';
import { Appointment, AttendanceType, Availability } from '../types';
import {
  INITIAL_SPECIALTIES,
  INSTITUTION_DOMAIN,
  sanitizeId,
  sanitizeString,
} from '../utils/validation';
import {
  recordAuditLog,
  registerAttendanceAndEnforceRN01,
  scheduleClinicalAppointment,
} from '../services/clinicService';
import { ContextualHelp } from '../components/ContextualHelp';

// Helper utilities for date arithmetic and localized formatting
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

function getWeekInterval(dateStr: string) {
  const d = parseYMD(dateStr);
  const dayOfWeek = d.getDay(); // 0 = Domingo
  const start = new Date(d);
  start.setDate(d.getDate() - dayOfWeek);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  const startStr = toYMD(start);
  const endStr = toYMD(end);

  const days: { dateStr: string; dayLabel: string; dayNum: number; isSelected: boolean; isToday: boolean }[] = [];
  const todayStr = getTodayYMD();
  const weekDayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  for (let i = 0; i < 7; i++) {
    const cur = new Date(start);
    cur.setDate(start.getDate() + i);
    const cStr = toYMD(cur);
    days.push({
      dateStr: cStr,
      dayLabel: weekDayNames[i],
      dayNum: cur.getDate(),
      isSelected: cStr === dateStr,
      isToday: cStr === todayStr,
    });
  }

  return { startStr, endStr, days };
}

export const SchedulePage: React.FC = () => {
  const { systemUser } = useAuth();
  const {
    visiblePatients,
    appointments,
    availabilities,
    students,
    professors,
    clinics,
    updateAppointmentLocal,
  } = useClinicData();

  const [viewMode, setViewMode] = useState<'daily' | 'weekly' | 'monthly' | 'availability'>('daily');
  const [selectedDate, setSelectedDate] = useState('2026-10-05');
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [availabilityModalOpen, setAvailabilityModalOpen] = useState(false);
  const [attendanceModalApt, setAttendanceModalApt] = useState<Appointment | null>(null);

  // Navigation handlers
  const handlePrevPeriod = () => {
    const d = parseYMD(selectedDate);
    if (viewMode === 'daily') {
      d.setDate(d.getDate() - 1);
    } else if (viewMode === 'weekly') {
      d.setDate(d.getDate() - 7);
    } else if (viewMode === 'monthly') {
      d.setMonth(d.getMonth() - 1);
    }
    setSelectedDate(toYMD(d));
  };

  const handleNextPeriod = () => {
    const d = parseYMD(selectedDate);
    if (viewMode === 'daily') {
      d.setDate(d.getDate() + 1);
    } else if (viewMode === 'weekly') {
      d.setDate(d.getDate() + 7);
    } else if (viewMode === 'monthly') {
      d.setMonth(d.getMonth() + 1);
    }
    setSelectedDate(toYMD(d));
  };

  const handleToday = () => {
    setSelectedDate(getTodayYMD());
  };

  const handleJumpToDemo = () => {
    setSelectedDate('2026-10-05');
  };

  const weekInterval = getWeekInterval(selectedDate);

  const getPeriodLabel = () => {
    if (viewMode === 'daily') {
      const d = parseYMD(selectedDate);
      const text = d.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
      return text.charAt(0).toUpperCase() + text.slice(1);
    }
    if (viewMode === 'weekly') {
      const startD = parseYMD(weekInterval.startStr);
      const endD = parseYMD(weekInterval.endStr);
      return `Semana de ${startD.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} a ${endD.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
    }
    if (viewMode === 'monthly') {
      const d = parseYMD(selectedDate);
      const mText = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      return mText.charAt(0).toUpperCase() + mText.slice(1);
    }
    return 'Grade Semanal de Supervisores';
  };

  // Schedule form state
  const [patientId, setPatientId] = useState('');
  const [availabilityId, setAvailabilityId] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [aptDate, setAptDate] = useState('2026-10-05');
  const [startTime, setStartTime] = useState('14:00');
  const [endTime, setEndTime] = useState('15:30');
  const [notes, setNotes] = useState('');

  // Availability form state
  const [profEmail, setProfEmail] = useState('professor.joao@cs.udf.edu.br');
  const [clinicName, setClinicName] = useState('Clínica Integrada I — Endodontia');
  const [specialty, setSpecialty] = useState('Endodontia');
  const [dayOfWeek, setDayOfWeek] = useState('Segunda-feira');
  const [availStart, setAvailStart] = useState('14:00');
  const [availEnd, setAvailEnd] = useState('18:00');
  const [totalSlots, setTotalSlots] = useState(8);
  const [authorizedStudentsInfo, setAuthorizedStudentsInfo] = useState(
    'Alunos do 8º Semestre autorizados pelo supervisor'
  );

  // Attendance form state
  const [attendanceType, setAttendanceType] = useState<AttendanceType>('PRESENCA');
  const [justification, setJustification] = useState('');

  const [feedback, setFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!systemUser) return null;

  const scopedAppointments = appointments.filter((apt) => {
    if (systemUser.role === 'ALUNO') {
      return apt.studentEmail.toLowerCase() === systemUser.email.toLowerCase();
    }
    if (systemUser.role === 'PROFESSOR') {
      return apt.professorEmail.toLowerCase() === systemUser.email.toLowerCase();
    }
    return true;
  });

  const displayedAppointments = scopedAppointments.filter((apt) => {
    if (viewMode === 'daily') return apt.date === selectedDate;
    if (viewMode === 'weekly') return apt.date >= weekInterval.startStr && apt.date <= weekInterval.endStr;
    if (viewMode === 'monthly') return apt.date.startsWith(selectedDate.slice(0, 7));
    return true;
  });

  const openScheduleModal = () => {
    const firstTriaged = visiblePatients.find((p) => p.triaged && p.status !== 'CANCELADO');
    setPatientId(firstTriaged?.id || visiblePatients[0]?.id || '');
    setAvailabilityId(availabilities[0]?.id || '');
    setStudentEmail(
      systemUser.role === 'ALUNO' ? systemUser.email : students[0]?.email || 'aluno.lucas@cs.udf.edu.br'
    );
    setAptDate(selectedDate);
    setStartTime('14:00');
    setEndTime('15:30');
    setNotes('');
    setScheduleModalOpen(true);
  };

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    const pat = visiblePatients.find((p) => p.id === patientId);
    const avail = availabilities.find((a) => a.id === availabilityId);
    const stu = students.find((s) => s.email.toLowerCase() === studentEmail.toLowerCase());

    if (!pat || !avail) return;

    setSubmitting(true);
    setFeedback(null);
    try {
      await scheduleClinicalAppointment(
        {
          patient: pat,
          availability: avail,
          studentName: stu?.name || systemUser.name,
          studentEmail: stu?.email || studentEmail,
          date: aptDate,
          startTime,
          endTime,
          notes,
          existingAppointments: appointments,
        },
        systemUser
      );
      setScheduleModalOpen(false);
      setFeedback({
        type: 'success',
        message: `Consulta agendada com sucesso para ${pat.name} em ${aptDate} (${startTime}–${endTime}). Vaga alocada na disponibilidade do professor.`,
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : getFriendlyErrorMessage(error),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateAvailability = async (e: React.FormEvent) => {
    e.preventDefault();
    const prof = professors.find((p) => p.email === profEmail);
    const availId = sanitizeId(`avail_${Date.now()}`);

    const payload: Omit<Availability, 'id'> = {
      professorName: sanitizeString(prof?.name || systemUser.name, 120),
      professorEmail: sanitizeString(prof?.email || profEmail, 120),
      clinicName: sanitizeString(clinicName, 100),
      specialty: sanitizeString(specialty, 80),
      dayOfWeek: sanitizeString(dayOfWeek, 30),
      startTime: sanitizeString(availStart, 10),
      endTime: sanitizeString(availEnd, 10),
      totalSlots: Number(totalSlots),
      usedSlots: 0,
      authorizedStudentsInfo: sanitizeString(authorizedStudentsInfo, 500),
      status: 'ATIVA',
      institutionDomain: INSTITUTION_DOMAIN,
      createdByUid: systemUser.uid,
    };

    try {
      await setDoc(doc(db, 'availability', availId), payload);
      await recordAuditLog({
        uid: systemUser.uid,
        userName: systemUser.name,
        userEmail: systemUser.email,
        userRole: systemUser.role,
        action: 'CADASTRO_DISPONIBILIDADE_PROFESSOR',
        targetRecord: `${payload.professorName} (${dayOfWeek})`,
        operationSummary: `Disponibilidade cadastrada: ${payload.clinicName} — ${dayOfWeek} (${availStart}–${availEnd}) com ${totalSlots} vagas.`,
      });
      setAvailabilityModalOpen(false);
      setFeedback({
        type: 'success',
        message: `Disponibilidade do professor cadastrada (${dayOfWeek}, ${availStart}–${availEnd}, ${totalSlots} vagas).`,
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        message: getFriendlyErrorMessage(error),
      });
    }
  };

  const handleConfirmPresenceQuick = async (apt: Appointment) => {
    updateAppointmentLocal(apt.id, { status: 'CONFIRMADA' });
    try {
      await updateDoc(doc(db, 'appointments', apt.id), {
        status: 'CONFIRMADA',
      });
      setFeedback({
        type: 'success',
        message: `Presença confirmada na recepção para ${apt.patientName}. Consulta atualizada para CONFIRMADA.`,
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        message: getFriendlyErrorMessage(error),
      });
    }
  };

  const handleRegisterAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attendanceModalApt) return;
    const pat = visiblePatients.find((p) => p.id === attendanceModalApt.patientId);
    if (!pat) return;
    const avail = availabilities.find((a) => a.id === attendanceModalApt.availabilityId);

    setSubmitting(true);
    setFeedback(null);
    try {
      const result = await registerAttendanceAndEnforceRN01(
        {
          appointment: attendanceModalApt,
          patient: pat,
          availability: avail,
          attendanceType,
          justification,
        },
        systemUser
      );

      setAttendanceModalApt(null);
      setJustification('');

      if (result.triggeredProgramRemoval) {
        setFeedback({
          type: 'warning',
          message:
            result.alertMessage ||
            `RN01 EXECUTADA: O paciente ${pat.name} acumulou 2 faltas não justificadas, teve o status alterado automaticamente para CANCELADO e sua vaga foi liberada.`,
        });
      } else {
        setFeedback({
          type: 'success',
          message:
            result.alertMessage ||
            `Registro de frequência (${attendanceType}) salvo com sucesso para ${pat.name}.`,
        });
      }
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
      {/* Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-[#003366] tracking-tight">Agenda</h1>
            <ContextualHelp
              title="Agenda e Disponibilidade"
              description="Visualize horários por dia, semana ou mês, agende consultas nas vagas dos professores sem conflitos e registre presença ou faltas (RN01)."
            />
          </div>
          <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
            Consultas agendadas, controle de vagas docentes e registro de presença ou faltas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {(systemUser.role === 'ADMIN' || systemUser.role === 'PROFESSOR') && (
            <button
              type="button"
              onClick={() => setAvailabilityModalOpen(true)}
              className="px-3.5 py-2.5 bg-white hover:bg-[#E6F6FF] text-[#003366] border border-[#00AEEF] text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Clock className="w-4 h-4 text-[#00AEEF]" />
              <span>Disponibilizar Vagas</span>
            </button>
          )}
          <button
            type="button"
            onClick={openScheduleModal}
            className="px-4 py-2.5 bg-[#00AEEF] hover:bg-[#007BFF] text-white text-xs font-semibold rounded-xl shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Agendar consulta</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-start justify-between gap-3 text-xs font-medium ${
            feedback.type === 'warning'
              ? 'bg-red-50 border-red-300 text-red-900'
              : feedback.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-900'
              : 'bg-[#E6F6FF] border-[#00AEEF]/40 text-[#003366]'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-[#00AEEF] shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button type="button" onClick={() => setFeedback(null)}>
            <X className="w-4 h-4 text-[#64748B]" />
          </button>
        </div>
      )}

      {/* View Mode Switcher & Date Navigation Controls */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F1F5F9] rounded-xl self-start">
            {(
              [
                { id: 'daily', label: 'Visão Diária' },
                { id: 'weekly', label: 'Visão Semanal' },
                { id: 'monthly', label: 'Visão Mensal' },
                { id: 'availability', label: 'Disponibilidade dos Professores' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setViewMode(tab.id)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  viewMode === tab.id
                    ? 'bg-[#00AEEF] text-white shadow-2xs font-semibold'
                    : 'text-[#64748B] hover:text-[#003366]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {viewMode !== 'availability' && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handlePrevPeriod}
                className="p-1.5 rounded-xl border border-slate-200 bg-[#F8FAFC] hover:bg-[#E6F6FF] text-[#003366] transition-colors cursor-pointer"
                title="Período anterior"
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
                onClick={handleNextPeriod}
                className="p-1.5 rounded-xl border border-slate-200 bg-[#F8FAFC] hover:bg-[#E6F6FF] text-[#003366] transition-colors cursor-pointer"
                title="Próximo período"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleToday}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 bg-[#F8FAFC] hover:bg-[#E6F6FF] text-[#003366] transition-colors cursor-pointer"
                title="Ir para o dia atual"
              >
                Hoje
              </button>

              {selectedDate !== '2026-10-05' && (
                <button
                  type="button"
                  onClick={handleJumpToDemo}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-xl border border-dashed border-[#00AEEF] text-[#007BFF] hover:bg-[#E6F6FF] transition-colors cursor-pointer inline-flex items-center gap-1"
                  title="Restaurar data com consultas acadêmicas simuladas"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Semana Demo (05/10/2026)</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Period Details & Context */}
        {viewMode !== 'availability' && (
          <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#003366]">{getPeriodLabel()}</span>
              <span className="text-[11px] text-[#64748B]">·</span>
              <span className="text-[11px] font-medium text-[#64748B]">
                {displayedAppointments.length}{' '}
                {displayedAppointments.length === 1 ? 'consulta encontrada' : 'consultas encontradas'}
              </span>
            </div>

            {/* Weekly Interactive Strip */}
            {viewMode === 'weekly' && (
              <div className="flex items-center gap-1 overflow-x-auto py-1">
                {weekInterval.days.map((day) => {
                  const countForDay = scopedAppointments.filter((a) => a.date === day.dateStr).length;
                  return (
                    <button
                      key={day.dateStr}
                      type="button"
                      onClick={() => setSelectedDate(day.dateStr)}
                      className={`px-2.5 py-1 rounded-lg text-center text-xs transition-colors cursor-pointer border ${
                        day.isSelected
                          ? 'bg-[#003366] text-white border-[#003366] font-bold shadow-2xs'
                          : countForDay > 0
                          ? 'bg-[#E6F6FF] text-[#003366] border-[#00AEEF]/40 hover:bg-[#00AEEF] hover:text-white'
                          : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <div className="text-[10px] leading-tight">{day.dayLabel}</div>
                      <div className="text-xs font-semibold tabular-nums leading-tight">{day.dayNum}</div>
                      {countForDay > 0 && (
                        <div
                          className={`text-[9px] font-bold mt-0.5 px-1 rounded ${
                            day.isSelected ? 'bg-[#00AEEF] text-white' : 'text-[#007BFF]'
                          }`}
                        >
                          {countForDay} {countForDay === 1 ? 'cons.' : 'cons.'}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Availability Tab View (Section 8) */}
      {viewMode === 'availability' ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-base font-bold text-[#003366]">
              Grade de Disponibilidade e Vagas dos Professores Supervisores (RN04)
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Os alunos somente podem agendar pacientes dentro das disponibilidades e limites de vagas abaixo.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200/80 bg-[#F1F5F9]/70 text-[11px] font-semibold text-[#003366]">
                  <th className="py-3.5 px-4">Professor Supervisor</th>
                  <th className="py-3.5 px-4">Clínica / Especialidade</th>
                  <th className="py-3.5 px-4">Dia e Horário</th>
                  <th className="py-3.5 px-4">Ocupação de Vagas</th>
                  <th className="py-3.5 px-4">Alunos Autorizados</th>
                  <th className="py-3.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {availabilities.map((av) => {
                  const remaining = Math.max(0, av.totalSlots - av.usedSlots);
                  return (
                    <tr key={av.id} className="hover:bg-[#E6F6FF]/35 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-[#003366]">{av.professorName}</div>
                        <div className="text-[11px] text-[#007BFF]">{av.professorEmail}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-[#003366]">{av.specialty}</div>
                        <div className="text-[11px] text-[#64748B]">{av.clinicName}</div>
                      </td>
                      <td className="py-3.5 px-4 tabular-nums text-[#1E293B] font-medium">
                        {av.dayOfWeek} · {av.startTime}–{av.endTime}
                      </td>
                      <td className="py-3.5 px-4 tabular-nums">
                        <span className="font-bold text-[#003366]">
                          {av.usedSlots} / {av.totalSlots}
                        </span>{' '}
                        <span className="text-[#007BFF] font-medium">({remaining} livres)</span>
                      </td>
                      <td className="py-3.5 px-4 text-[#64748B] max-w-xs">{av.authorizedStudentsInfo}</td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-[#E6F6FF] text-[#003366] border border-[#00AEEF]/30 text-[11px] font-semibold">
                          {av.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Appointments Table View (Section 7 & Section 13) */
        <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200/80 bg-[#F1F5F9]/70 text-[11px] font-semibold text-[#003366]">
                  <th className="py-3.5 px-4">Data / Horário</th>
                  <th className="py-3.5 px-4">Paciente</th>
                  <th className="py-3.5 px-4">Aluno Responsável</th>
                  <th className="py-3.5 px-4">Professor Supervisor</th>
                  <th className="py-3.5 px-4">Clínica / Especialidade</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Controle de Presença / Faltas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {displayedAppointments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-[#64748B]">
                      Nenhuma consulta encontrada para o período selecionado ({selectedDate}). Alterne para Visão Semanal ou agende uma nova consulta.
                    </td>
                  </tr>
                ) : (
                  displayedAppointments.map((apt) => {
                    const pat = visiblePatients.find((p) => p.id === apt.patientId);
                    return (
                      <tr key={apt.id} className="hover:bg-[#E6F6FF]/35 transition-colors">
                        <td className="py-3.5 px-4 tabular-nums text-[#003366] whitespace-nowrap">
                          <div className="font-semibold">{apt.date}</div>
                          <div className="text-[11px] text-[#64748B]">
                            {apt.startTime}–{apt.endTime}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-[#003366]">{apt.patientName}</div>
                          {pat && (
                            <div className="tabular-nums text-[11px] text-[#64748B] mt-0.5">
                              Faltas não just.: {pat.unjustifiedAbsences}/2
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-[#1E293B]">{apt.studentName}</div>
                          <div className="text-[11px] text-[#007BFF]">{apt.studentEmail}</div>
                        </td>
                        <td className="py-3.5 px-4 text-[#64748B]">{apt.professorName}</td>
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-[#003366]">{apt.specialty}</div>
                          <div className="text-[11px] text-[#64748B]">{apt.clinicName}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold border ${
                              apt.status === 'CONFIRMADA' || apt.status === 'ATENDIDA'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : apt.status === 'FALTOU' || apt.status === 'CANCELADA'
                                ? 'bg-red-50 text-red-700 border-red-200'
                                : 'bg-[#E6F6FF] text-[#003366] border-[#00AEEF]/30'
                            }`}
                          >
                            {apt.status}
                          </span>
                          {apt.notes && (
                            <div className="text-[11px] text-[#64748B] max-w-xs truncate mt-1">
                              {apt.notes}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            {apt.status === 'AGENDADA' && (
                              <button
                                type="button"
                                onClick={() => handleConfirmPresenceQuick(apt)}
                                className="px-2.5 py-1 text-xs font-medium bg-[#E6F6FF] hover:bg-[#00AEEF] text-[#003366] hover:text-white border border-[#00AEEF]/30 rounded-lg transition-colors cursor-pointer"
                              >
                                Confirmar
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setAttendanceModalApt(apt);
                                setAttendanceType('PRESENCA');
                                setJustification('');
                              }}
                              className="px-2.5 py-1 text-xs font-semibold bg-[#003366] hover:bg-[#007BFF] text-white rounded-lg inline-flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <UserCheck className="w-3.5 h-3.5 text-[#00AEEF]" />
                              <span>Presença / Falta (RN01)</span>
                            </button>
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
      )}

      {/* Modal: Schedule Appointment */}
      {scheduleModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#003366]/45 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-[#003366]">
                Agendar Consulta Clínica (Validação RN02, RN04 e RN05)
              </h2>
              <button type="button" onClick={() => setScheduleModalOpen(false)}>
                <X className="w-5 h-5 text-[#64748B]" />
              </button>
            </div>

            <form onSubmit={handleCreateSchedule} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#003366] mb-1">
                  Paciente (Deve estar Triado — RN02) *
                </label>
                <select
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                >
                  {visiblePatients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.triaged ? `Triado (${p.specialtyNeeded})` : 'NÃO TRIADO (Bloqueado RN02)'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#003366] mb-1">
                  Disponibilidade do Professor / Vaga da Clínica (RN04) *
                </label>
                <select
                  value={availabilityId}
                  onChange={(e) => setAvailabilityId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                >
                  {availabilities.map((av) => (
                    <option key={av.id} value={av.id}>
                      {av.professorName} — {av.specialty} ({av.dayOfWeek} {av.startTime}–{av.endTime}) [Vagas:{' '}
                      {av.usedSlots}/{av.totalSlots}]
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#003366] mb-1">
                  Aluno Responsável *
                </label>
                <select
                  value={studentEmail}
                  onChange={(e) => setStudentEmail(e.target.value)}
                  disabled={systemUser.role === 'ALUNO'}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC] disabled:bg-slate-100"
                >
                  {students.map((s) => (
                    <option key={s.id} value={s.email}>
                      {s.name} ({s.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#003366] mb-1">Data *</label>
                  <input
                    type="date"
                    required
                    value={aptDate}
                    onChange={(e) => setAptDate(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs tabular-nums border border-slate-200 rounded-xl bg-[#F8FAFC]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#003366] mb-1">Início *</label>
                  <input
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs tabular-nums border border-slate-200 rounded-xl bg-[#F8FAFC]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#003366] mb-1">Término *</label>
                  <input
                    type="time"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs tabular-nums border border-slate-200 rounded-xl bg-[#F8FAFC]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#003366] mb-1">
                  Procedimento Previsto / Observações
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Sessão de instrumentação endodôntica..."
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setScheduleModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-[#003366] bg-white border border-[#00AEEF] rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#00AEEF] hover:bg-[#007BFF] rounded-xl cursor-pointer"
                >
                  {submitting ? 'Validando Horário...' : 'Confirmar Agendamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Professor Availability (Section 8) */}
      {availabilityModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#003366]/45 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-[#003366]">
                Cadastrar Disponibilidade e Vagas do Professor
              </h2>
              <button type="button" onClick={() => setAvailabilityModalOpen(false)}>
                <X className="w-5 h-5 text-[#64748B]" />
              </button>
            </div>

            <form onSubmit={handleCreateAvailability} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#003366] mb-1">
                  Professor Supervisor *
                </label>
                <select
                  value={profEmail}
                  onChange={(e) => setProfEmail(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                >
                  {professors.map((p) => (
                    <option key={p.id} value={p.email}>
                      {p.name} ({p.specialty})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#003366] mb-1">Clínica *</label>
                  <select
                    value={clinicName}
                    onChange={(e) => setClinicName(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                  >
                    {clinics.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#003366] mb-1">
                    Especialidade *
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
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-[#003366] mb-1">
                    Dia da Semana *
                  </label>
                  <select
                    value={dayOfWeek}
                    onChange={(e) => setDayOfWeek(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                  >
                    {['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira'].map(
                      (d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      )
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#003366] mb-1">Início *</label>
                  <input
                    type="time"
                    value={availStart}
                    onChange={(e) => setAvailStart(e.target.value)}
                    className="w-full px-2 py-2 text-xs tabular-nums border border-slate-200 rounded-xl bg-[#F8FAFC]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#003366] mb-1">Fim *</label>
                  <input
                    type="time"
                    value={availEnd}
                    onChange={(e) => setAvailEnd(e.target.value)}
                    className="w-full px-2 py-2 text-xs tabular-nums border border-slate-200 rounded-xl bg-[#F8FAFC]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#003366] mb-1">
                    Qtd. Vagas *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={totalSlots}
                    onChange={(e) => setTotalSlots(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs tabular-nums border border-slate-200 rounded-xl bg-[#F8FAFC]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#003366] mb-1">
                    Alunos Autorizados *
                  </label>
                  <input
                    type="text"
                    value={authorizedStudentsInfo}
                    onChange={(e) => setAuthorizedStudentsInfo(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAvailabilityModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-[#003366] bg-white border border-[#00AEEF] rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#00AEEF] hover:bg-[#007BFF] rounded-xl cursor-pointer"
                >
                  Publicar Disponibilidade
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Attendance & RN01 Enforcement (Section 13) */}
      {attendanceModalApt && (
        <div className="fixed inset-0 z-50 bg-[#003366]/45 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-[#003366]">
                Controle de Presença e Faltas (Regra RN01)
              </h2>
              <button type="button" onClick={() => setAttendanceModalApt(null)}>
                <X className="w-5 h-5 text-[#64748B]" />
              </button>
            </div>

            <div className="p-3.5 bg-[#E6F6FF]/60 border border-[#00AEEF]/30 rounded-xl text-xs space-y-1">
              <div className="font-bold text-[#003366]">{attendanceModalApt.patientName}</div>
              <div className="text-[#64748B]">
                Horário:{' '}
                <span className="tabular-nums font-medium text-[#1E293B]">
                  {attendanceModalApt.date} às {attendanceModalApt.startTime}
                </span>
              </div>
              <div className="text-amber-800 font-semibold">
                Faltas não justificadas acumuladas:{' '}
                {visiblePatients.find((p) => p.id === attendanceModalApt.patientId)?.unjustifiedAbsences || 0} / 2
              </div>
            </div>

            <form onSubmit={handleRegisterAttendance} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#003366] mb-1">
                  Ocorrência da Consulta *
                </label>
                <select
                  value={attendanceType}
                  onChange={(e) => setAttendanceType(e.target.value as AttendanceType)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                >
                  <option value="PRESENCA">Presença Confirmada (Atendida)</option>
                  <option value="FALTA_NAO_JUSTIFICADA">
                    Falta Não Justificada (Contabiliza na Regra RN01)
                  </option>
                  <option value="FALTA_JUSTIFICADA">Falta Justificada (Atestado / Aviso Prévio)</option>
                  <option value="CANCELAMENTO">Cancelamento (Libera vaga da clínica)</option>
                  <option value="REMARCACAO">Remarcação de Consulta</option>
                </select>
              </div>

              {attendanceType === 'FALTA_NAO_JUSTIFICADA' && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900">
                  <strong>Aviso de Regra de Negócio (RN01):</strong> Ao atingir{' '}
                  <strong>2 faltas não justificadas</strong>, o backend alterará automaticamente o
                  status do paciente para <strong>CANCELADO</strong>, retirará do programa de
                  atendimento, alertará o supervisor e liberará a vaga na clínica.
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#003366] mb-1">
                  Justificativa / Observação no Histórico
                </label>
                <textarea
                  rows={2}
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Informe observações ou motivo da falta/remarcação..."
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAttendanceModalApt(null)}
                  className="px-4 py-2 text-xs font-semibold text-[#003366] bg-white border border-[#00AEEF] rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#00AEEF] hover:bg-[#007BFF] rounded-xl cursor-pointer"
                >
                  {submitting ? 'Processando...' : 'Registrar Frequência'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
