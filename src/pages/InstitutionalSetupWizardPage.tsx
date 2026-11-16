import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Copy,
  Check,
  CheckCircle2,
  Circle,
  ShieldCheck,
  AlertCircle,
  Info,
  Server,
  Key,
  FileText,
  Mail,
  Lock,
  Sparkles,
  ChevronRight,
  UserCheck,
} from 'lucide-react';
import { UdfOfficialLogo } from '../components/BrandIdentity';
import firebaseConfig from '../../firebase-applet-config.json';
import { FIREBASE_CONSOLE_AUTH_PROVIDERS_URL } from '../services/firebase';

interface StepDefinition {
  id: number;
  title: string;
  shortTitle: string;
  category: 'Diagnóstico' | 'Firebase' | 'Administração' | 'Testes';
  summary: string;
}

const STEPS: StepDefinition[] = [
  {
    id: 1,
    title: 'Verificar a configuração do Firebase',
    shortTitle: 'Projeto Firebase',
    category: 'Diagnóstico',
    summary: 'Identifique o projeto Firebase do SIGCO e o status do provedor E-mail/Senha.',
  },
  {
    id: 2,
    title: 'Acessar o Console do Firebase',
    shortTitle: 'Console Firebase',
    category: 'Firebase',
    summary: 'Acesse o portal oficial do Firebase Authentication no plano gratuito Spark.',
  },
  {
    id: 3,
    title: 'Ativar o provedor E-mail/Senha',
    shortTitle: 'Ativar E-mail/Senha',
    category: 'Firebase',
    summary: 'Habilite o método E-mail/Senha com 1 clique para permitir o login direto na aplicação.',
  },
  {
    id: 4,
    title: 'Cadastro administrativo de usuários',
    shortTitle: 'Cadastro de usuários',
    category: 'Administração',
    summary: 'Entenda como o administrador cadastra novas contas com senha inicial sem cadastro público livre.',
  },
  {
    id: 5,
    title: 'Validação do domínio @cs.udf.edu.br',
    shortTitle: 'Domínio @cs.udf.edu.br',
    category: 'Administração',
    summary: 'Entenda como o sistema valida e restringe o acesso aos endereços com o domínio acadêmico da UDF.',
  },
  {
    id: 6,
    title: 'Recuperação de senha no Firebase',
    shortTitle: 'Recuperação de senha',
    category: 'Firebase',
    summary: 'Compreenda o fluxo seguro de redefinição de senha com envio de link para o e-mail cadastrado.',
  },
  {
    id: 7,
    title: 'Segurança do Firestore e perfis (ABAC)',
    shortTitle: 'Segurança & Perfis',
    category: 'Administração',
    summary: 'Como as regras do Firestore protegem os dados clínicos de acordo com o perfil de cada usuário.',
  },
  {
    id: 8,
    title: 'Checklist de testes obrigatórios',
    shortTitle: 'Roteiro de testes',
    category: 'Testes',
    summary: 'Valide os cenários de login, credenciais inválidas, contas inativas e persistência de sessão.',
  },
];

const STORAGE_CHECKLIST_KEY = 'sigco_email_password_setup_checklist_v1';

export const InstitutionalSetupWizardPage: React.FC<{
  onBackToLogin: () => void;
}> = ({ onBackToLogin }) => {
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [completedSteps, setCompletedSteps] = useState<Record<number, boolean>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_CHECKLIST_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_CHECKLIST_KEY, JSON.stringify(completedSteps));
    } catch {
      // Ignored
    }
  }, [completedSteps]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 2500);
  };

  const toggleStepCompleted = (stepId: number) => {
    setCompletedSteps((prev) => ({
      ...prev,
      [stepId]: !prev[stepId],
    }));
  };

  const currentStep = STEPS[currentStepIndex];
  const progressPercent = Math.round(
    (Object.values(completedSteps).filter(Boolean).length / STEPS.length) * 100
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col font-sans selection:bg-[#00AEEF]/20">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-2xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onBackToLogin}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-[#003B71] hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar ao Login</span>
            </button>
            <div className="hidden sm:block h-5 w-px bg-slate-200" />
            <div className="hidden sm:flex items-center gap-2">
              <UdfOfficialLogo size="sm" showSubtitle={false} />
              <span className="text-xs font-semibold text-slate-500">
                • Guia de Ativação do Provedor E-mail/Senha
              </span>
            </div>
          </div>

          {/* Progress Indicator */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs font-bold text-[#003B71]">
                {Object.values(completedSteps).filter(Boolean).length} de {STEPS.length} concluídas
              </div>
              <div className="text-[11px] text-slate-500">{progressPercent}% do progresso</div>
            </div>
            <div className="w-24 sm:w-32 h-2.5 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
              <div
                className="h-full bg-gradient-to-r from-[#003B71] to-[#00AEEF] transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 flex-1 flex flex-col lg:flex-row gap-8">
        {/* Left Sidebar: Stepper Navigation */}
        <aside className="w-full lg:w-72 shrink-0">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs sticky top-20">
            <div className="px-2 pb-3 mb-2 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Etapas do Guia
              </span>
              <span className="text-[11px] font-semibold text-[#003B71] bg-slate-100 px-2 py-0.5 rounded-full">
                8 etapas
              </span>
            </div>

            <nav className="space-y-1">
              {STEPS.map((s, index) => {
                const isActive = index === currentStepIndex;
                const isDone = completedSteps[s.id];
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setCurrentStepIndex(index)}
                    className={`w-full text-left p-2.5 rounded-xl text-xs font-medium transition-all flex items-center justify-between gap-2.5 cursor-pointer ${
                      isActive
                        ? 'bg-[#E6F6FF] text-[#003B71] font-semibold ring-1 ring-[#00AEEF]/40'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 font-bold ${
                          isDone
                            ? 'bg-emerald-500 text-white'
                            : isActive
                            ? 'bg-[#003B71] text-white'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {isDone ? <Check className="w-3 h-3 stroke-[3]" /> : s.id}
                      </span>
                      <span className="truncate">{s.shortTitle}</span>
                    </div>
                    {isActive && <ChevronRight className="w-3.5 h-3.5 text-[#00AEEF] shrink-0" />}
                  </button>
                );
              })}
            </nav>

            <div className="mt-4 pt-3 border-t border-slate-100 px-2">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Autenticação controlada pela aplicação via Firebase Auth Spark.</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Right Area: Active Step Content */}
        <main className="flex-1 bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-2xs flex flex-col justify-between">
          <div className="space-y-6">
            {/* Step Category & Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#007BFF]">
                  <span className="px-2 py-0.5 rounded-md bg-[#E6F6FF] text-[#003B71] font-bold">
                    Etapa {currentStep.id} de {STEPS.length}
                  </span>
                  <span>• {currentStep.category}</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-[#003B71] tracking-tight">
                  {currentStep.title}
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  {currentStep.summary}
                </p>
              </div>

              {/* Completion Toggle */}
              <button
                type="button"
                onClick={() => toggleStepCompleted(currentStep.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
                  completedSteps[currentStep.id]
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {completedSteps[currentStep.id] ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Etapa concluída</span>
                  </>
                ) : (
                  <>
                    <Circle className="w-4 h-4 text-slate-400" />
                    <span>Marcar como concluída</span>
                  </>
                )}
              </button>
            </div>

            {/* STEP 1: Verificar o projeto atual */}
            {currentStep.id === 1 && (
              <div className="space-y-5 text-sm text-slate-700">
                <p>
                  O SIGCO agora utiliza exclusivamente o provedor de <strong>E-mail e Senha</strong> do Firebase Authentication.
                  Os identificadores reais do ambiente são:
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                    <div className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-[#003B71]" />
                      <span>Projeto Firebase</span>
                    </div>
                    <div className="font-mono text-xs text-slate-900 font-semibold break-all">
                      {firebaseConfig.projectId}
                    </div>
                    <p className="text-[11px] text-slate-500">ID do projeto no Google Cloud</p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                    <div className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-[#003B71]" />
                      <span>Banco Firestore</span>
                    </div>
                    <div className="font-mono text-xs text-slate-900 font-semibold break-all">
                      {firebaseConfig.firestoreDatabaseId}
                    </div>
                    <p className="text-[11px] text-slate-500">Banco de dados clínico ativo</p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs sm:text-sm space-y-2">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Remoção completa de dependências externas</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    Não há dependência de Microsoft Entra ID (Azure), Azure Client ID, Azure Tenant ID ou Google Sign-In.
                    A autenticação é simples, direta e 100% controlada pela aplicação e pelo Firebase Authentication.
                  </p>
                </div>
              </div>
            )}

            {/* STEP 2: Acessar o Console do Firebase */}
            {currentStep.id === 2 && (
              <div className="space-y-5 text-sm text-slate-700">
                <p>
                  Para ativar o provedor de E-mail/Senha, acesse a página de autenticação no Console oficial do Firebase:
                </p>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <div className="font-bold text-[#003B71] text-sm">
                        Console do Firebase — Provedores de Login
                      </div>
                      <div className="text-xs text-slate-500">
                        Projeto: <code className="font-mono text-slate-800">{firebaseConfig.projectId}</code>
                      </div>
                    </div>
                    <a
                      href={FIREBASE_CONSOLE_AUTH_PROVIDERS_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#003B71] hover:bg-[#002D57] text-white text-xs font-semibold transition-colors cursor-pointer shadow-xs"
                    >
                      <span>Abrir Console do Firebase</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                  <div className="p-2.5 bg-white rounded-lg border border-slate-200 text-xs font-mono break-all text-slate-600">
                    {FIREBASE_CONSOLE_AUTH_PROVIDERS_URL}
                  </div>
                </div>

                <p className="text-xs text-slate-500">
                  O plano <strong>Spark (gratuito)</strong> do Firebase inclui autenticação por e-mail e senha sem nenhum custo adicional.
                </p>
              </div>
            )}

            {/* STEP 3: Ativar o provedor E-mail/Senha */}
            {currentStep.id === 3 && (
              <div className="space-y-5 text-sm text-slate-700">
                <p>
                  No Console do Firebase Authentication, siga estes passos para ativar o provedor:
                </p>

                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                    <div className="font-bold text-slate-900 text-xs flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#003B71] text-white flex items-center justify-center text-[10px]">1</span>
                      <span>Acessar Método de Login</span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-600">
                      Na seção <strong>Authentication</strong>, clique na aba <strong>Sign-in method</strong> (Método de login).
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                    <div className="font-bold text-slate-900 text-xs flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#003B71] text-white flex items-center justify-center text-[10px]">2</span>
                      <span>Selecionar E-mail/Senha</span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-600">
                      Na lista de provedores nativos, clique na linha <strong>E-mail/senha</strong>.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                    <div className="font-bold text-slate-900 text-xs flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#003B71] text-white flex items-center justify-center text-[10px]">3</span>
                      <span>Habilitar e Salvar</span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-600">
                      Mude a primeira chave seletora <strong>Ativar</strong> para a posição ligada (azul) e clique em <strong>Salvar</strong>.
                      Não é necessário ativar a opção "Link do e-mail (login sem senha)".
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: Cadastro administrativo de usuários */}
            {currentStep.id === 4 && (
              <div className="space-y-5 text-sm text-slate-700">
                <p>
                  Para preservar a segurança da clínica odontológica, o SIGCO <strong>não permite cadastro público livre</strong>.
                  Novos usuários são cadastrados exclusivamente pelo <strong>ADMINISTRADOR</strong>:
                </p>

                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="font-bold text-xs text-[#003B71] flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-[#00AEEF]" />
                      <span>Painel de Administração do Sistema</span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                      O administrador acessa o menu lateral <strong>Administração &gt; Usuários</strong> e clica em <strong>Novo usuário</strong>.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="font-bold text-xs text-[#003B71] flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-[#00AEEF]" />
                      <span>Atribuição de Perfil e Senha Inicial</span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                      O administrador define o nome, e-mail acadêmico (<code className="font-mono text-slate-800">@cs.udf.edu.br</code>), perfil de acesso (ADMINISTRADOR, RECEPCAO, TRIAGEM, PROFESSOR ou ALUNO) e senha inicial forte.
                      A senha é enviada de forma criptografada diretamente ao Firebase Authentication.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="font-bold text-xs text-[#003B71] flex items-center gap-2">
                      <Lock className="w-4 h-4 text-[#00AEEF]" />
                      <span>Bloqueio de Auto-Elevação de Privilégios</span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                      Nenhum usuário comum pode alterar o próprio perfil para ADMINISTRADOR. Apenas administradores ativos podem gerenciar permissões no sistema.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 5: Validação do domínio @cs.udf.edu.br */}
            {currentStep.id === 5 && (
              <div className="space-y-5 text-sm text-slate-700">
                <p>
                  O SIGCO restringe o acesso aos endereços com o domínio acadêmico <code className="font-mono text-[#003B71] font-bold">@cs.udf.edu.br</code>:
                </p>

                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-xs sm:text-sm space-y-1.5">
                  <div className="font-bold flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-amber-700" />
                    <span>Aviso Importante</span>
                  </div>
                  <p className="leading-relaxed text-amber-900">
                    A verificação do sufixo <code className="font-mono font-bold">@cs.udf.edu.br</code> valida a sintaxe do e-mail acadêmico exigido pela aplicação, mas não substitui a comprovação institucional oficial da posse da caixa postal. Por isso, a autorização final depende sempre da existência de conta ativa no banco de dados e no Firebase Authentication.
                  </p>
                </div>

                <div className="space-y-2 text-xs sm:text-sm text-slate-600">
                  <div className="font-bold text-slate-900 uppercase tracking-wider text-xs">
                    Bloqueios automáticos:
                  </div>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-[#00AEEF] shrink-0 mt-0.5" />
                      <span>Contas pessoais (ex.: <code className="font-mono text-slate-800">@gmail.com</code>, <code className="font-mono text-slate-800">@hotmail.com</code>) são bloqueadas na interface e no servidor.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-[#00AEEF] shrink-0 mt-0.5" />
                      <span>E-mails não cadastrados previamente pelo administrador são rejeitados com aviso claro.</span>
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {/* STEP 6: Alteração de senha pelo próprio usuário */}
            {currentStep.id === 6 && (
              <div className="space-y-5 text-sm text-slate-700">
                <p>
                  Cada usuário gerencia e altera sua própria senha diretamente dentro do SIGCO pelo <strong>Firebase Authentication</strong>:
                </p>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs sm:text-sm">
                  <div className="font-bold text-slate-900 flex items-center gap-2">
                    <Mail className="w-4 h-4 text-[#003B71]" />
                    <span>Alteração de Senha em Configurações ou Meu Perfil</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    Após entrar no sistema, qualquer usuário (Administrador, Recepção, Triagem, Professor ou Aluno) acessa <strong>Configurações → Segurança</strong> ou <strong>Meu Perfil → Segurança</strong>, informa sua senha atual e define uma nova senha de acesso.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs sm:text-sm">
                  <div className="font-bold text-slate-900 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#003B71]" />
                    <span>Privacidade de Credenciais</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    Por motivos de segurança e conformidade, administradores nunca visualizam a senha atual dos usuários nem realizam redefinição remota.
                  </p>
                </div>
              </div>
            )}

            {/* STEP 7: Segurança do Firestore e perfis (ABAC) */}
            {currentStep.id === 7 && (
              <div className="space-y-5 text-sm text-slate-700">
                <p>
                  As regras de segurança do Cloud Firestore (<code className="font-mono text-slate-800">firestore.rules</code>) validam cada operação contra o perfil do usuário:
                </p>

                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                    <div className="font-bold text-xs text-[#003B71]">ADMINISTRADOR</div>
                    <p className="text-xs text-slate-600">Acesso total a relatórios, configurações da clínica, auditoria e gerenciamento de usuários.</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                    <div className="font-bold text-xs text-[#003B71]">RECEPCAO</div>
                    <p className="text-xs text-slate-600">Cadastro de pacientes, fila de espera e controle de presença. Proibido de acessar prontuários e diagnósticos clínicos (RN03).</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                    <div className="font-bold text-xs text-[#003B71]">TRIAGEM</div>
                    <p className="text-xs text-slate-600">Avaliação inicial obrigatória do paciente (RN02), anamnese e classificação de prioridade.</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                    <div className="font-bold text-xs text-[#003B71]">PROFESSOR</div>
                    <p className="text-xs text-slate-600">Supervisão clínica, validação de evoluções, controle de vagas e horários de atendimento.</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                    <div className="font-bold text-xs text-[#003B71]">ALUNO</div>
                    <p className="text-xs text-slate-600">Atendimento aos pacientes vinculados, odontograma, evolução e encaminhamentos.</p>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 8: Checklist de testes obrigatórios */}
            {currentStep.id === 8 && (
              <div className="space-y-5 text-sm text-slate-700">
                <p>
                  Roteiro de validação da autenticação com E-mail e Senha:
                </p>

                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                    <div className="font-bold text-xs text-emerald-700">1. Login com e-mail institucional e senha correta</div>
                    <p className="text-xs text-slate-600">Acesso liberado diretamente e sessão persistida no navegador.</p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                    <div className="font-bold text-xs text-red-700">2. Login com senha incorreta</div>
                    <p className="text-xs text-slate-600">Mensagem: "E-mail acadêmico ou senha incorretos. Verifique os dados informados."</p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                    <div className="font-bold text-xs text-red-700">3. Login com domínio pessoal (ex.: @gmail.com)</div>
                    <p className="text-xs text-slate-600">Mensagem: "Acesso restrito. O endereço deve possuir o domínio @cs.udf.edu.br."</p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                    <div className="font-bold text-xs text-red-700">4. Login com conta desativada</div>
                    <p className="text-xs text-slate-600">Mensagem: "Seu acesso ao SIGCO está desativado. Entre em contato com o administrador."</p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                    <div className="font-bold text-xs text-[#003B71]">5. Alteração de senha pelo usuário</div>
                    <p className="text-xs text-slate-600">Cada usuário altera a própria senha em Configurações ou Meu Perfil → Segurança.</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Footer Navigation */}
          <div className="pt-8 mt-8 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
            <button
              type="button"
              disabled={currentStepIndex === 0}
              onClick={() => setCurrentStepIndex((prev) => Math.max(0, prev - 1))}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Etapa anterior</span>
            </button>

            <div className="flex items-center gap-2">
              {currentStepIndex < STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    setCompletedSteps((prev) => ({ ...prev, [currentStep.id]: true }));
                    setCurrentStepIndex((prev) => Math.min(STEPS.length - 1, prev + 1));
                  }}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#003B71] hover:bg-[#002D57] text-white text-xs font-semibold shadow-xs cursor-pointer transition-colors"
                >
                  <span>Próxima etapa</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onBackToLogin}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs cursor-pointer transition-colors"
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Concluir e Ir para o Login</span>
                </button>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};
