import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  X,
  Compass,
  LayoutDashboard,
  Users,
  Calendar,
  FileText,
  HelpCircle,
} from 'lucide-react';
import { NavigationTab } from '../types';
import { canUserAccessTab } from '../utils/validation';
import { useAuth } from '../auth/AuthContext';

export const TOUR_STORAGE_KEY = 'sigco_onboarding_tour_completed_v1';

interface TourStep {
  id: string;
  targetName: string;
  tab: NavigationTab;
  title: string;
  description: string;
  highlightLabel: string;
  icon: React.FC<{ className?: string }>;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'menu',
    targetName: '1. Menu Principal',
    tab: 'dashboard',
    title: 'Bem-vindo ao SIGCO 👋',
    description:
      'Vamos mostrar rapidamente como utilizar o sistema. No Menu Lateral esquerdo você encontra todas as áreas organizadas em 4 grupos: Principal, Atendimento, Gestão e Sistema.',
    highlightLabel: 'Destaque: Menu Lateral (Principal · Atendimento · Gestão · Sistema)',
    icon: Compass,
  },
  {
    id: 'dashboard',
    targetName: '2. Dashboard',
    tab: 'dashboard',
    title: 'Visão Geral no Dashboard',
    description:
      'O Dashboard apresenta uma visão limpa da clínica: total de pacientes, consultas de hoje, triagens clínicas, pacientes em tratamento, agenda do dia e atividades recentes.',
    highlightLabel: 'Destaque: Indicadores Principais e Agenda de Hoje',
    icon: LayoutDashboard,
  },
  {
    id: 'patients',
    targetName: '3. Pacientes',
    tab: 'patients',
    title: 'Gestão de Pacientes',
    description:
      'Use "Pacientes" para cadastrar novos pacientes, pesquisar por nome ou CPF, editar dados de contato e acompanhar o status em cada etapa do fluxo odontológico.',
    highlightLabel: 'Destaque: Módulo Pacientes (+ Novo Paciente)',
    icon: Users,
  },
  {
    id: 'schedule',
    targetName: '4. Agenda',
    tab: 'schedule',
    title: 'Agenda e Controle de Vagas',
    description:
      'Visualize consultas por dia, semana ou mês, agende horários nas vagas disponibilizadas pelos professores e confirme presença sem conflitos de horário.',
    highlightLabel: 'Destaque: Agenda Clínica e Disponibilidade Docente',
    icon: Calendar,
  },
  {
    id: 'medical_records',
    targetName: '5. Prontuários',
    tab: 'medical_records',
    title: 'Prontuário Eletrônico Odontológico',
    description:
      'Reúne de forma organizada e segura a identificação, anamnese, avaliação, plano de tratamento, evolução clínica, procedimentos e validação do professor supervisor.',
    highlightLabel: 'Destaque: Prontuários e Evolução Clínica',
    icon: FileText,
  },
  {
    id: 'help',
    targetName: '6. Central de Ajuda',
    tab: 'help',
    title: 'Central "Como usar o SIGCO"',
    description:
      'Sempre que tiver dúvidas, acesse "Ajuda" no menu principal para consultar o guia passo a passo completo (18 etapas) ou reiniciar este tour interativo a qualquer momento.',
    highlightLabel: 'Destaque: Guia Completo "Como usar o SIGCO"',
    icon: HelpCircle,
  },
];

interface InteractiveTourProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (tab: NavigationTab) => void;
}

export const InteractiveTour: React.FC<InteractiveTourProps> = ({
  open,
  onClose,
  onNavigate,
}) => {
  const { systemUser } = useAuth();
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setStepIndex(0);
    }
  }, [open]);

  if (!open || !systemUser) return null;

  const currentStep = TOUR_STEPS[stepIndex] || TOUR_STEPS[0];
  const StepIcon = currentStep.icon;
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === TOUR_STEPS.length - 1;

  const navigateToStepTab = (nextIndex: number) => {
    const targetStep = TOUR_STEPS[nextIndex];
    if (targetStep && canUserAccessTab(systemUser.role, targetStep.tab)) {
      onNavigate(targetStep.tab);
    }
  };

  const handleNext = () => {
    if (isLast) {
      handleFinish();
      return;
    }
    const nextIdx = stepIndex + 1;
    setStepIndex(nextIdx);
    navigateToStepTab(nextIdx);
  };

  const handlePrev = () => {
    if (isFirst) return;
    const prevIdx = stepIndex - 1;
    setStepIndex(prevIdx);
    navigateToStepTab(prevIdx);
  };

  const handleFinish = () => {
    localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#003366]/45 backdrop-blur-[1px] flex items-end sm:items-center justify-center p-4">
      <div className="bg-white border-2 border-[#00AEEF] rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-5">
        {/* Top Progress Header */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#E6F6FF] text-[#003366] flex items-center justify-center shrink-0">
              <StepIcon className="w-5 h-5 text-[#00AEEF]" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-[#007BFF]">
                Tour Interativo · Etapa {stepIndex + 1} de {TOUR_STEPS.length}
              </div>
              <div className="text-xs font-medium text-[#64748B]">{currentStep.targetName}</div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleFinish}
            className="text-xs font-medium text-[#64748B] hover:text-[#003366] px-2.5 py-1 rounded-lg hover:bg-[#F1F5F9] transition-colors cursor-pointer"
          >
            Pular
          </button>
        </div>

        {/* Step Content */}
        <div className="space-y-3">
          <h3 className="text-lg font-bold text-[#003366]">{currentStep.title}</h3>
          <p className="text-xs sm:text-sm text-[#1E293B] leading-relaxed">
            {currentStep.description}
          </p>

          <div className="p-3 rounded-xl bg-[#E6F6FF]/80 border border-[#00AEEF]/30 text-xs font-medium text-[#003366] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#00AEEF] shrink-0" />
            <span>{currentStep.highlightLabel}</span>
          </div>
        </div>

        {/* Step Dots */}
        <div className="flex items-center justify-center gap-1.5 pt-1">
          {TOUR_STEPS.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setStepIndex(idx);
                navigateToStepTab(idx);
              }}
              aria-label={`Ir para etapa ${idx + 1}`}
              className={`h-2 rounded-full transition-all cursor-pointer ${
                idx === stepIndex ? 'w-6 bg-[#00AEEF]' : 'w-2 bg-slate-200 hover:bg-slate-300'
              }`}
            />
          ))}
        </div>

        {/* Navigation Controls: Anterior / Pular / Próximo / Concluir */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={handlePrev}
            disabled={isFirst}
            className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-[#003366] hover:bg-[#F1F5F9] disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1.5 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Anterior</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleFinish}
              className="px-3.5 py-2 rounded-xl text-xs font-medium text-[#64748B] hover:text-[#003366] hover:bg-[#F1F5F9] cursor-pointer"
            >
              Pular
            </button>

            <button
              type="button"
              onClick={handleNext}
              className="px-4 py-2 rounded-xl bg-[#00AEEF] hover:bg-[#007BFF] text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            >
              {isLast ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Concluir</span>
                </>
              ) : (
                <>
                  <span>Próximo</span>
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
