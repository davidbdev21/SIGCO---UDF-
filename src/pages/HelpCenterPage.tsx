import React, { useState } from 'react';
import {
  Search,
  PlayCircle,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  BookOpen,
} from 'lucide-react';
import { NavigationTab } from '../types';
import { canUserAccessTab } from '../utils/validation';
import { useAuth } from '../auth/AuthContext';

interface HelpCenterPageProps {
  onNavigate: (tab: NavigationTab) => void;
  onStartTour: () => void;
}

interface GuideStep {
  stepNumber: number;
  title: string;
  category: 'Principal' | 'Atendimento' | 'Gestão' | 'Sistema';
  summary: string;
  bullets: string[];
  flowDiagram?: string[];
  targetTab?: NavigationTab;
  actionButtonLabel?: string;
}

const GUIDE_STEPS: GuideStep[] = [
  {
    stepNumber: 1,
    title: 'ETAPA 1 — LOGIN',
    category: 'Principal',
    summary:
      'Entre utilizando seu e-mail institucional @cs.udf.edu.br. Após o primeiro login, sua sessão será mantida automaticamente neste dispositivo até você sair.',
    bullets: [
      'Acesso restrito exclusivamente a contas institucionais @cs.udf.edu.br.',
      'Persistência automática de sessão (browserLocalPersistence): não é necessário reconectar a cada página ou recarregamento.',
      'Validação em três camadas: interface, servidor e regras do banco de dados.',
    ],
  },
  {
    stepNumber: 2,
    title: 'ETAPA 2 — DASHBOARD',
    category: 'Principal',
    summary: 'O Dashboard apresenta uma visão geral e organizada da clínica odontológica.',
    bullets: [
      'Pacientes: total de pacientes ativos vinculados ao seu perfil.',
      'Consultas de hoje: atendimentos programados para o dia atual.',
      'Lista de espera: pacientes aguardando triagem ou vaga clínica.',
      'Em tratamento: pacientes com plano clínico em andamento.',
      'Atividades: resumo da agenda de hoje e histórico recente de operações.',
    ],
    targetTab: 'dashboard',
    actionButtonLabel: 'Ir para o Dashboard',
  },
  {
    stepNumber: 3,
    title: 'ETAPA 3 — PACIENTES',
    category: 'Principal',
    summary: 'Use "Pacientes" para gerenciar o cadastro completo e acompanhar a situação clínica.',
    bullets: [
      'Cadastrar paciente utilizando o botão principal "Novo paciente".',
      'Pesquisar paciente rapidamente por nome, CPF ou telefone.',
      'Editar informações cadastrais e vínculos com aluno/professor.',
      'Consultar histórico e visualizar o status atual no fluxo odontológico.',
    ],
    targetTab: 'patients',
    actionButtonLabel: 'Novo paciente / Ver Pacientes',
  },
  {
    stepNumber: 4,
    title: 'ETAPA 4 — LISTA DE ESPERA',
    category: 'Atendimento',
    summary: 'Use a Lista de Espera para acompanhar pacientes aguardando atendimento.',
    bullets: [
      'Adicionar paciente na fila por especialidade.',
      'Visualizar posição exata e data de entrada na fila.',
      'Definir prioridade clínica (Baixa, Média, Alta ou Urgente).',
      'Encaminhar diretamente para triagem odontológica.',
      'Acompanhar status (Aguardando triagem, Aguardando vaga, Em atendimento).',
    ],
    targetTab: 'waiting_list',
    actionButtonLabel: 'Abrir Lista de Espera',
  },
  {
    stepNumber: 5,
    title: 'ETAPA 5 — TRIAGEM',
    category: 'Atendimento',
    summary:
      'A triagem é responsável pela avaliação odontológica inicial. Nenhum paciente segue para tratamento sem passar pela triagem (RN02).',
    bullets: [
      'Registrar anamnese inicial e queixa principal.',
      'Identificar necessidade odontológica e classificar especialidade.',
      'Definir prioridade de atendimento e encaminhar para a clínica responsável.',
    ],
    flowDiagram: ['Paciente', 'Triagem', 'Necessidade', 'Especialidade', 'Encaminhamento'],
    targetTab: 'screening',
    actionButtonLabel: 'Acessar Triagem',
  },
  {
    stepNumber: 6,
    title: 'ETAPA 6 — AGENDA',
    category: 'Principal',
    summary:
      'A Agenda mostra os horários disponíveis dos professores e as consultas agendadas. O sistema impede conflitos de horário automaticamente.',
    bullets: [
      'Visualizar dia, visualizar semana e visualizar mês.',
      'Agendar, remarcar e cancelar consultas respeitando o limite de vagas (RN04/RN05).',
      'Confirmar atendimento ou registrar falta (aplicação automática da regra RN01 na 2ª falta não justificada).',
    ],
    targetTab: 'schedule',
    actionButtonLabel: 'Abrir Agenda',
  },
  {
    stepNumber: 7,
    title: 'ETAPA 7 — PRONTUÁRIO',
    category: 'Atendimento',
    summary:
      'O prontuário reúne as informações clínicas autorizadas, com proteção de sigilo (RN03/RN06) e validação pelo professor supervisor.',
    bullets: [
      'Seções organizadas: Identificação, Anamnese, Avaliação e Plano de Tratamento.',
      'Registro de Evolução Clínica, Procedimentos, Odontograma, Encaminhamentos e Histórico.',
      'Recepcionistas não possuem acesso aos dados clínicos sensíveis (conformidade LGPD).',
    ],
    targetTab: 'medical_records',
    actionButtonLabel: 'Abrir Prontuários',
  },
  {
    stepNumber: 8,
    title: 'ETAPA 8 — ODONTOGRAMA',
    category: 'Atendimento',
    summary:
      'Use o odontograma interativo (padrão FDI) para registrar visualmente situações relacionadas aos dentes.',
    bullets: [
      'Consultar e selecionar dentes permanentes (arcadas superior e inferior).',
      'Registrar tratamentos, restaurações, ausências, cáries e necessidades de procedimento.',
      'Incluir face dentária e observações clínicas por elemento.',
    ],
    targetTab: 'odontogram',
    actionButtonLabel: 'Abrir Odontograma',
  },
  {
    stepNumber: 9,
    title: 'ETAPA 9 — ENCAMINHAMENTOS',
    category: 'Atendimento',
    summary:
      'Utilize encaminhamentos quando o paciente precisar de atendimento em outra especialidade odontológica.',
    bullets: [
      'Exemplo de fluxo integrado: Triagem → Endodontia → Prótese.',
      'Acompanhamento de status em tempo real: Pendente, Aceito, Em atendimento e Concluído.',
    ],
    flowDiagram: ['Triagem', 'Endodontia', 'Prótese'],
    targetTab: 'referrals',
    actionButtonLabel: 'Ver Encaminhamentos',
  },
  {
    stepNumber: 10,
    title: 'ETAPA 10 — ALUNOS',
    category: 'Gestão',
    summary: 'Área destinada ao gerenciamento dos alunos de odontologia da instituição.',
    bullets: [
      'Visualizar alunos cadastrados, matrícula e semestre.',
      'Consultar vínculo com clínica/especialidade e professor supervisor.',
      'Acompanhar pacientes sob responsabilidade, agenda e atividades autorizadas.',
    ],
    targetTab: 'students',
    actionButtonLabel: 'Gerenciar Alunos',
  },
  {
    stepNumber: 11,
    title: 'ETAPA 11 — PROFESSORES',
    category: 'Gestão',
    summary: 'Área destinada aos professores e supervisores clínicos.',
    bullets: [
      'Visualizar alunos supervisionados e pacientes vinculados.',
      'Definir disponibilidade de horários e número de vagas por clínica.',
      'Acompanhar atendimentos e supervisionar/validar prontuários e evoluções.',
    ],
    targetTab: 'professors',
    actionButtonLabel: 'Gerenciar Professores',
  },
  {
    stepNumber: 12,
    title: 'ETAPA 12 — CLÍNICAS E ESPECIALIDADES',
    category: 'Gestão',
    summary: 'Área para organizar as clínicas-escola, capacidade de boxes e especialidades.',
    bullets: [
      'Especialidades atendidas: Clínica Geral, Endodontia, Cirurgia, Prótese, Periodontia, Dentística e Odontopediatria.',
      'Controle de localização física, capacidade de atendimento e status ativo.',
    ],
    targetTab: 'clinics_specialties',
    actionButtonLabel: 'Ver Clínicas e Especialidades',
  },
  {
    stepNumber: 13,
    title: 'ETAPA 13 — RELATÓRIOS',
    category: 'Gestão',
    summary: 'Use Relatórios para consultar indicadores e exportar informações administrativas.',
    bullets: [
      'Filtros combinados por período, especialidade, aluno, professor e status.',
      'Exportação em CSV e impressão institucional com resumo estatístico.',
    ],
    targetTab: 'reports',
    actionButtonLabel: 'Consultar Relatórios',
  },
  {
    stepNumber: 14,
    title: 'ETAPA 14 — USUÁRIOS',
    category: 'Sistema',
    summary: 'Somente usuários autorizados (Administrador) podem acessar esta área.',
    bullets: [
      'Cadastrar, editar, ativar/desativar contas institucionais (@cs.udf.edu.br).',
      'Definir perfil e controlar permissões: Administrador, Recepção, Triagem, Professor e Aluno.',
    ],
    targetTab: 'users',
    actionButtonLabel: 'Gerenciar Usuários',
  },
  {
    stepNumber: 15,
    title: 'ETAPA 15 — CONFIGURAÇÕES',
    category: 'Sistema',
    summary: 'Gerencie configurações pessoais, aparência e preferências.',
    bullets: [
      'Configurações pessoais do perfil ativo, densidade visual e preferências.',
      'Parâmetros administrativos da clínica são exibidos exclusivamente quando o usuário possui permissão de Administrador.',
    ],
    targetTab: 'settings',
    actionButtonLabel: 'Abrir Configurações',
  },
  {
    stepNumber: 16,
    title: 'ETAPA 16 — AUDITORIA',
    category: 'Sistema',
    summary:
      'Somente usuários autorizados. Mostra registros imutáveis de ações importantes no sistema (RN08).',
    bullets: [
      'Campos auditados: Usuário, Perfil, Ação, Data, Horário e Registro afetado.',
      'Garante rastreabilidade completa em conformidade com a LGPD.',
    ],
    targetTab: 'audit',
    actionButtonLabel: 'Consultar Auditoria',
  },
  {
    stepNumber: 17,
    title: 'ETAPA 17 — SAIR',
    category: 'Sistema',
    summary:
      'Para encerrar seu acesso com segurança, clique no seu perfil no canto superior direito e selecione "Sair".',
    bullets: [
      'Executa o logout real no Firebase Authentication.',
      'Encerra a sessão persistente e retorna imediatamente para a tela de login institucional.',
    ],
  },
];

export const HelpCenterPage: React.FC<HelpCenterPageProps> = ({ onNavigate, onStartTour }) => {
  const { systemUser } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [expandedStep, setExpandedStep] = useState<number | null>(1);

  if (!systemUser) return null;

  const filteredSteps = GUIDE_STEPS.filter((step) => {
    const matchesCategory = categoryFilter === 'ALL' || step.category === categoryFilter;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      step.title.toLowerCase().includes(q) ||
      step.summary.toLowerCase().includes(q) ||
      step.bullets.some((b) => b.toLowerCase().includes(q));
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Page Header following strict hierarchy (Section 11, 12, 16) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#007BFF]">
            <BookOpen className="w-4 h-4 text-[#00AEEF]" />
            <span>Central de Ajuda · Guia Oficial em 17 Etapas</span>
          </div>
          <h1 className="text-2xl font-bold text-[#003366] tracking-tight">
            Como usar o SIGCO
          </h1>
          <p className="text-xs sm:text-sm text-[#64748B]">
            Bem-vindo ao SIGCO — Vamos mostrar rapidamente como utilizar todas as funções do sistema sem necessidade de treinamento presencial.
          </p>
        </div>

        {/* Single Primary Action: Iniciar tour novamente (Section 13) */}
        <button
          type="button"
          onClick={onStartTour}
          className="px-4 py-2.5 bg-[#00AEEF] hover:bg-[#007BFF] text-white text-xs font-semibold rounded-xl shadow-2xs transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap self-start md:self-center"
        >
          <PlayCircle className="w-4 h-4" />
          <span>Iniciar tour novamente</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar no guia (ex.: triagem, agenda, prontuário, faltas, login)..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-[#F1F5F9]/70 border border-slate-200 rounded-xl text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#00AEEF] focus:bg-white"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] rounded-xl overflow-x-auto">
          {(['ALL', 'Principal', 'Atendimento', 'Gestão', 'Sistema'] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                categoryFilter === cat
                  ? 'bg-[#003366] text-white'
                  : 'text-[#64748B] hover:text-[#003366]'
              }`}
            >
              {cat === 'ALL' ? 'Todas as 18 Etapas' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* 18-Step Accordion List */}
      <div className="space-y-3">
        {filteredSteps.map((step) => {
          const isExpanded = expandedStep === step.stepNumber || searchQuery.trim().length > 0;
          const canOpenTab =
            step.targetTab && canUserAccessTab(systemUser.role, step.targetTab);

          return (
            <div
              key={step.stepNumber}
              className="bg-white border border-slate-200 rounded-2xl overflow-hidden transition-colors"
            >
              <button
                type="button"
                onClick={() =>
                  setExpandedStep(isExpanded && !searchQuery ? null : step.stepNumber)
                }
                className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 hover:bg-[#F1F5F9]/50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <span className="w-8 h-8 rounded-xl bg-[#E6F6FF] text-[#003366] font-bold text-xs tabular-nums flex items-center justify-center shrink-0">
                    {String(step.stepNumber).padStart(2, '0')}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-sm font-bold text-[#003366]">{step.title}</h2>
                      <span className="text-[11px] text-[#64748B]">· {step.category}</span>
                    </div>
                    <p className="text-xs text-[#64748B] mt-0.5 truncate">{step.summary}</p>
                  </div>
                </div>

                <div className="text-[#64748B] shrink-0">
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="px-5 pb-5 pt-2 border-t border-slate-100 space-y-4 bg-[#F1F5F9]/30">
                  <p className="text-xs sm:text-sm text-[#1E293B] leading-relaxed">
                    {step.summary}
                  </p>

                  {/* Visual Flow Diagram when present (e.g. Etapa 5 Triagem & Etapa 9 Encaminhamentos) */}
                  {step.flowDiagram && (
                    <div className="p-3.5 rounded-xl bg-white border border-slate-200 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-semibold text-[#003366] mr-1">
                        Fluxo:
                      </span>
                      {step.flowDiagram.map((node, i) => (
                        <React.Fragment key={node}>
                          <span className="px-2.5 py-1 rounded-lg bg-[#E6F6FF] text-[#003366] text-xs font-semibold">
                            {node}
                          </span>
                          {i < step.flowDiagram!.length - 1 && (
                            <ArrowRight className="w-3.5 h-3.5 text-[#00AEEF]" />
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  )}

                  <ul className="space-y-2">
                    {step.bullets.map((bullet) => (
                      <li
                        key={bullet}
                        className="flex items-start gap-2 text-xs text-[#1E293B] leading-relaxed"
                      >
                        <CheckCircle2 className="w-4 h-4 text-[#00AEEF] shrink-0 mt-0.5" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>

                  {canOpenTab && step.targetTab && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => onNavigate(step.targetTab!)}
                        className="px-3.5 py-2 rounded-xl bg-white hover:bg-[#E6F6FF] text-[#003366] border border-[#00AEEF]/50 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <span>{step.actionButtonLabel || 'Abrir módulo'}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-[#00AEEF]" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
