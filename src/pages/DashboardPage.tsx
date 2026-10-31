import React from 'react';
import {
  ArrowRight,
  Calendar,
  Users,
  Clock,
  Smile,
  Stethoscope,
  Activity,
} from 'lucide-react';
import { useClinicData } from '../hooks/useClinicData';
import { useAuth } from '../auth/AuthContext';
import { NavigationTab } from '../types';
import { INITIAL_SPECIALTIES, ROLE_LABELS } from '../utils/validation';
import { ContextualHelp } from '../components/ContextualHelp';

interface DashboardPageProps {
  onNavigate: (tab: NavigationTab) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const { systemUser } = useAuth();
  const {
    visiblePatients,
    screenings,
    appointments,
    auditLogs,
    dataLoading,
  } = useClinicData();

  if (!systemUser) return null;

  const todayStr = '2026-10-05';
  const inTreatmentCount = visiblePatients.filter((p) => p.status === 'EM_TRATAMENTO').length;

  const scopedAppointments =
    systemUser.role === 'ALUNO'
      ? appointments.filter((a) => a.studentEmail.toLowerCase() === systemUser.email.toLowerCase())
      : systemUser.role === 'PROFESSOR'
      ? appointments.filter((a) => a.professorEmail.toLowerCase() === systemUser.email.toLowerCase())
      : appointments;

  const todayAppointments = scopedAppointments.filter((a) => a.date === todayStr);
  const displayedTodayAppointments =
    todayAppointments.length > 0 ? todayAppointments : scopedAppointments.slice(0, 4);

  // Weekly Period Bar Chart Data (Max 2 charts — Section 8)
  const weeklyBarData = [
    { day: 'Seg', count: Math.max(4, todayAppointments.length + 2) },
    { day: 'Ter', count: 6 },
    { day: 'Qua', count: 8 },
    { day: 'Qui', count: 5 },
    { day: 'Sex', count: 9 },
  ];
  const maxWeeklyCount = Math.max(10, ...weeklyBarData.map((d) => d.count));

  // Specialty Breakdown (2nd chart)
  const totalPat = Math.max(1, visiblePatients.length);
  const specialtyCounts = INITIAL_SPECIALTIES.map((spec) => {
    const count = visiblePatients.filter((p) => p.specialtyNeeded === spec).length;
    const pct = Math.round((count / totalPat) * 100);
    return { specialty: spec, count, pct };
  }).filter((item) => item.count > 0);

  return (
    <div data-tour="dashboard" className="space-y-8">
      {/* 1. Title + 2. Short Description + 3. Single Primary Action (Section 16) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-[#003366] tracking-tight">Dashboard</h1>
            <ContextualHelp
              title="Visão Geral da Clínica"
              description="Apresenta os 4 indicadores essenciais da clínica, a agenda do dia e as atividades recentes do seu perfil."
            />
          </div>
          <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
            Olá, <span className="font-semibold text-[#003366]">{systemUser.name}</span> ·{' '}
            {ROLE_LABELS[systemUser.role]} ({systemUser.specialty})
          </p>
        </div>

        {/* Single Primary Action per Screen */}
        {systemUser.role === 'TRIAGEM' ? (
          <button
            type="button"
            onClick={() => onNavigate('screening')}
            className="px-4 py-2.5 bg-[#00AEEF] hover:bg-[#007BFF] text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap self-start sm:self-auto"
          >
            <Stethoscope className="w-4 h-4" />
            <span>Realizar Triagem</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onNavigate('schedule')}
            className="px-4 py-2.5 bg-[#00AEEF] hover:bg-[#007BFF] text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap self-start sm:self-auto"
          >
            <Calendar className="w-4 h-4" />
            <span>Ver Agenda Clínica</span>
          </button>
        )}
      </div>

      {/* Section 8: ONLY the 4 Truly Important Indicators (Pacientes, Consultas de hoje, Triagens, Em tratamento) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => onNavigate('patients')}
          className="bg-white border border-slate-200 hover:border-[#00AEEF] rounded-2xl p-5 text-left transition-colors flex items-center gap-4 cursor-pointer"
        >
          <div className="w-11 h-11 rounded-xl bg-[#E6F6FF] flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 text-[#00AEEF]" />
          </div>
          <div>
            <div className="text-xs font-medium text-[#64748B]">Pacientes</div>
            <div className="text-2xl font-bold text-[#003366] tabular-nums mt-0.5">
              {dataLoading ? '...' : visiblePatients.length}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('schedule')}
          className="bg-white border border-slate-200 hover:border-[#00AEEF] rounded-2xl p-5 text-left transition-colors flex items-center gap-4 cursor-pointer"
        >
          <div className="w-11 h-11 rounded-xl bg-[#E6F6FF] flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5 text-[#00AEEF]" />
          </div>
          <div>
            <div className="text-xs font-medium text-[#64748B]">Consultas de hoje</div>
            <div className="text-2xl font-bold text-[#003366] tabular-nums mt-0.5">
              {dataLoading ? '...' : todayAppointments.length}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('screening')}
          className="bg-white border border-slate-200 hover:border-[#00AEEF] rounded-2xl p-5 text-left transition-colors flex items-center gap-4 cursor-pointer"
        >
          <div className="w-11 h-11 rounded-xl bg-[#E6F6FF] flex items-center justify-center shrink-0">
            <Stethoscope className="w-5 h-5 text-[#00AEEF]" />
          </div>
          <div>
            <div className="text-xs font-medium text-[#64748B]">Triagens clínicas</div>
            <div className="text-2xl font-bold text-[#003366] tabular-nums mt-0.5">
              {dataLoading ? '...' : screenings.length}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('patients')}
          className="bg-white border border-slate-200 hover:border-[#00AEEF] rounded-2xl p-5 text-left transition-colors flex items-center gap-4 cursor-pointer"
        >
          <div className="w-11 h-11 rounded-xl bg-[#E6F6FF] flex items-center justify-center shrink-0">
            <Smile className="w-5 h-5 text-[#00AEEF]" />
          </div>
          <div>
            <div className="text-xs font-medium text-[#64748B]">Em tratamento</div>
            <div className="text-2xl font-bold text-[#003366] tabular-nums mt-0.5">
              {dataLoading ? '...' : inTreatmentCount}
            </div>
          </div>
        </button>
      </div>

      {/* Section 8: Next -> "Agenda de hoje" */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-[#003366]">Agenda de hoje</h2>
            <ContextualHelp
              title="Agenda de hoje"
              description="Lista os atendimentos programados para hoje vinculados ao seu perfil."
            />
          </div>
          <button
            type="button"
            onClick={() => onNavigate('schedule')}
            className="text-xs font-semibold text-[#007BFF] hover:text-[#003366] flex items-center gap-1 cursor-pointer whitespace-nowrap"
          >
            <span>Abrir agenda</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-[#F1F5F9]/60 text-[11px] font-semibold text-[#003366]">
                <th className="py-3 px-5">Horário</th>
                <th className="py-3 px-5">Paciente</th>
                <th className="py-3 px-5">Especialidade · Clínica</th>
                <th className="py-3 px-5 hidden md:table-cell">Aluno Responsável</th>
                <th className="py-3 px-5 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {displayedTodayAppointments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-[#64748B]">
                    Nenhuma consulta agendada para hoje.
                  </td>
                </tr>
              ) : (
                displayedTodayAppointments.map((apt) => (
                  <tr key={apt.id} className="hover:bg-[#F1F5F9]/50 transition-colors">
                    <td className="py-3.5 px-5 tabular-nums font-semibold text-[#003366] whitespace-nowrap">
                      {apt.startTime}–{apt.endTime}
                    </td>
                    <td className="py-3.5 px-5 font-semibold text-[#1E293B]">{apt.patientName}</td>
                    <td className="py-3.5 px-5 text-[#64748B]">
                      <span className="font-medium text-[#003366]">{apt.specialty}</span> ·{' '}
                      {apt.clinicName}
                    </td>
                    <td className="py-3.5 px-5 text-[#1E293B] hidden md:table-cell">
                      {apt.studentName}
                    </td>
                    <td className="py-3.5 px-5 text-right font-semibold text-[#007BFF]">
                      {apt.status}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 8: Below -> "Atividades recentes" + Max 2 Clean Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Atividades Recentes */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#00AEEF]" />
                <h2 className="text-sm font-bold text-[#003366]">Atividades recentes</h2>
              </div>
              <span className="text-[11px] text-[#64748B]">Últimos registros</span>
            </div>

            <div className="divide-y divide-slate-100">
              {auditLogs.slice(0, 4).map((log) => (
                <div key={log.id} className="py-3 space-y-0.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-[#003366] truncate">
                      {log.targetRecord}
                    </span>
                    <span className="text-[11px] text-[#64748B] tabular-nums shrink-0">
                      {log.timestampIso.slice(0, 10)}
                    </span>
                  </div>
                  <p className="text-xs text-[#64748B] line-clamp-1">{log.operationSummary}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Max 2 Useful Charts (Chart 1: Consultas da semana, Chart 2: Especialidades) */}
        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-[#003366]">Consultas na semana</h2>
            <p className="text-[11px] text-[#64748B] mt-0.5">Atendimentos por dia útil</p>
          </div>

          <div className="mt-4 pt-4 flex items-end justify-between gap-2 h-36 border-b border-slate-100 pb-2">
            {weeklyBarData.map((item, idx) => {
              const heightPct = Math.max(18, Math.round((item.count / maxWeeklyCount) * 100));
              return (
                <div
                  key={item.day}
                  className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end"
                >
                  <span className="text-[10px] font-semibold text-[#003366] tabular-nums">
                    {item.count}
                  </span>
                  <div
                    className={`w-full max-w-[22px] rounded-t-md ${
                      idx === 4 ? 'bg-[#003366]' : 'bg-[#00AEEF]'
                    }`}
                    style={{ height: `${heightPct}%` }}
                  />
                  <span className="text-[10px] text-[#64748B]">{item.day}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-[#003366]">Por especialidade</h2>
            <p className="text-[11px] text-[#64748B] mt-0.5">Demanda clínica atual</p>
          </div>

          <div className="space-y-3 my-3">
            {specialtyCounts.slice(0, 4).map((item) => (
              <div key={item.specialty} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-[#1E293B] font-medium truncate">{item.specialty}</span>
                  <span className="font-semibold text-[#003366] tabular-nums">{item.pct}%</span>
                </div>
                <div className="w-full h-1.5 bg-[#F1F5F9] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#00AEEF] rounded-full"
                    style={{ width: `${Math.max(10, item.pct)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
