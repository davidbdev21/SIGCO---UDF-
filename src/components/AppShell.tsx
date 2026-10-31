import React, { useState, useRef, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  Clock,
  Stethoscope,
  Calendar,
  FileText,
  Smile,
  ArrowLeftRight,
  GraduationCap,
  BookOpen,
  Building2,
  BarChart3,
  UserCog,
  Settings,
  ShieldCheck,
  LogOut,
  Menu,
  X,
  ChevronDown,
  HelpCircle,
  User,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { NavigationTab } from '../types';
import { useAuth, validateSigcoPasswordStrength } from '../auth/AuthContext';
import { canUserAccessTab, ROLE_LABELS } from '../utils/validation';
import { INSTITUTIONAL_PERSONAS } from '../services/seedData';
import { UdfOfficialLogo } from './BrandIdentity';

interface AppShellProps {
  activeTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  onStartTour: () => void;
  children: React.ReactNode;
}

interface MenuItemConfig {
  id: NavigationTab;
  label: string;
  icon: React.FC<{ className?: string }>;
}

interface MenuGroupConfig {
  groupTitle: string;
  items: MenuItemConfig[];
}

// Section 9: Grouped Menu Structure (Principal, Atendimento, Gestão, Sistema)
const MENU_GROUPS: MenuGroupConfig[] = [
  {
    groupTitle: 'Principal',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'patients', label: 'Pacientes', icon: Users },
      { id: 'schedule', label: 'Agenda', icon: Calendar },
    ],
  },
  {
    groupTitle: 'Atendimento',
    items: [
        { id: 'screening', label: 'Triagem', icon: Stethoscope },
      { id: 'medical_records', label: 'Prontuários', icon: FileText },
      { id: 'odontogram', label: 'Odontograma', icon: Smile },
      { id: 'referrals', label: 'Encaminhamentos', icon: ArrowLeftRight },
    ],
  },
  {
    groupTitle: 'Gestão',
    items: [
      { id: 'students', label: 'Alunos', icon: GraduationCap },
      { id: 'professors', label: 'Professores', icon: BookOpen },
      { id: 'clinics_specialties', label: 'Clínicas', icon: Building2 },
      { id: 'reports', label: 'Relatórios', icon: BarChart3 },
    ],
  },
  {
    groupTitle: 'Sistema',
    items: [
      { id: 'users', label: 'Usuários', icon: UserCog },
      { id: 'settings', label: 'Configurações', icon: Settings },
      { id: 'audit', label: 'Auditoria', icon: ShieldCheck },
    ],
  },
];

const ALL_MENU_ITEMS: MenuItemConfig[] = [
  ...MENU_GROUPS.flatMap((g) => g.items),
  { id: 'help', label: 'Como usar o SIGCO', icon: HelpCircle },
];

export const AppShell: React.FC<AppShellProps> = ({
  activeTab,
  onSelectTab,
  onStartTour,
  children,
}) => {
  const {
    systemUser,
    switchInstitutionalPersona,
    logout,
    changeOwnPassword,
    isDevBypassActive,
    setDevBypassActive,
  } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileTab, setProfileTab] = useState<'info' | 'security'>('info');

  // State for password change in modal (Section 9)
  const [modalCurrentPassword, setModalCurrentPassword] = useState('');
  const [modalNewPassword, setModalNewPassword] = useState('');
  const [modalConfirmPassword, setModalConfirmPassword] = useState('');
  const [modalShowPasswords, setModalShowPasswords] = useState(false);
  const [modalPasswordLoading, setModalPasswordLoading] = useState(false);
  const [modalPasswordFeedback, setModalPasswordFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const profileDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        profileDropdownRef.current &&
        !profileDropdownRef.current.contains(event.target as Node)
      ) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [profileMenuOpen]);

  if (!systemUser) return null;

  const activeMenuItem = ALL_MENU_ITEMS.find((m) => m.id === activeTab) || ALL_MENU_ITEMS[0];



  return (
    <div className="min-h-screen bg-[#F1F5F9] flex flex-col lg:flex-row">
      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-[#003366]/50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Institutional Sidebar in UDF Navy (#003366) — Organized by Groups (Section 9) */}
      <aside
        data-tour="menu"
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#003366] text-white flex flex-col border-r border-[#002244] transition-transform duration-150 lg:static lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Top Brand Block: [LOGO UDF] + SIGCO */}
        <div className="px-5 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => onSelectTab('dashboard')}
              className="text-left cursor-pointer"
            >
              <UdfOfficialLogo variant="light" size="sm" />
              <div className="mt-2 pt-2 border-t border-white/10">
                <div className="text-sm font-bold tracking-tight leading-none">
                  <span className="text-white">SIG</span>
                  <span className="text-[#00AEEF]">CO</span>
                </div>
                <div className="text-[10px] text-sky-200/80 mt-0.5 leading-tight">
                  Sistema de Gestão de Clínica Odontológica
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1.5 text-sky-200 hover:text-white"
              aria-label="Fechar menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Grouped Navigation Menu with discrete separators */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-4">
          {MENU_GROUPS.map((group, groupIdx) => {
            const visibleItems = group.items.filter((item) =>
              canUserAccessTab(systemUser.role, item.id)
            );
            if (visibleItems.length === 0) return null;

            return (
              <div
                key={group.groupTitle}
                className={groupIdx > 0 ? 'pt-3 border-t border-white/10' : ''}
              >
                <div className="px-3 mb-1.5 text-[10px] font-semibold text-sky-200/60 tracking-wider">
                  {group.groupTitle}
                </div>
                <div className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-tour={item.id}
                        onClick={() => {
                          onSelectTab(item.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer whitespace-nowrap ${
                          isActive
                            ? 'bg-[#00AEEF] text-white font-semibold'
                            : 'text-sky-100/85 hover:bg-white/10 hover:text-white font-medium'
                        }`}
                      >
                        <span className="flex items-center gap-2.5 truncate">
                          <Icon
                            className={`w-4 h-4 shrink-0 ${
                              isActive ? 'text-white' : 'text-[#00AEEF]'
                            }`}
                          />
                          <span className="truncate">{item.label}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Dedicated "Ajuda" Button in Main Menu (Section 11) */}
          <div className="pt-3 border-t border-white/10">
            <button
              type="button"
              data-tour="help"
              onClick={() => {
                onSelectTab('help');
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'help'
                  ? 'bg-[#00AEEF] text-white font-semibold'
                  : 'text-sky-100/85 hover:bg-white/10 hover:text-white font-medium'
              }`}
            >
              <span className="flex items-center gap-2.5 truncate">
                <HelpCircle
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === 'help' ? 'text-white' : 'text-[#00AEEF]'
                  }`}
                />
                <span className="truncate">Ajuda</span>
              </span>
            </button>
          </div>
        </nav>

        {/* Quiet Sidebar Footer */}
        <div className="p-3 border-t border-white/10 bg-[#00264d] shrink-0">
          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-sky-100 hover:bg-red-600/80 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Clean Minimal Top Header (Section 10) */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-20">
          {/* Left Zone: Mobile Menu Trigger + Current Section */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 text-[#003366] hover:bg-[#E6F6FF] rounded-lg border border-slate-200"
              aria-label="Abrir menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-xs text-[#64748B] truncate">
              <span className="hidden sm:inline font-semibold text-[#003366]">SIGCO</span>
              <span className="hidden sm:inline" aria-hidden="true">
                ·
              </span>
              <span className="font-semibold text-[#007BFF] truncate">
                {activeMenuItem.label}
              </span>
            </div>
          </div>

          {/* Central Zone: Dev Mode Quick Persona Switcher */}
          {isDevBypassActive && (
            <div className="hidden md:flex items-center gap-2 px-2.5 py-1 bg-amber-50/90 border border-amber-200 rounded-lg text-[11px] text-amber-900 font-medium">
              <span className="font-semibold text-amber-900">Modo Dev</span>
              <span className="text-amber-300" aria-hidden="true">·</span>
              <span className="text-slate-600">Perfil:</span>
              <select
                value={systemUser.email}
                onChange={(e) => {
                  const targetPersona = INSTITUTIONAL_PERSONAS.find((p) => p.email === e.target.value);
                  if (targetPersona) switchInstitutionalPersona(targetPersona);
                }}
                className="bg-white border border-amber-300 rounded px-2 py-0.5 text-[11px] font-semibold text-[#003366] focus:outline-none cursor-pointer"
                title="Alternar perfil ativo para testar telas e permissões"
              >
                {INSTITUTIONAL_PERSONAS.map((p) => (
                  <option key={p.email} value={p.email}>
                    {p.name} ({ROLE_LABELS[p.role]})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Right Zone (Section 10): ONLY Nome + Foto/Avatar + Perfil */}
          <div ref={profileDropdownRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setProfileMenuOpen((prev) => !prev)}
              className="px-3 py-1.5 rounded-xl hover:bg-[#F1F5F9] border border-slate-200 transition-colors flex items-center gap-2.5 cursor-pointer"
            >
              <div className="w-8 h-8 rounded-full bg-[#003366] text-white text-xs font-bold flex items-center justify-center shrink-0">
                {systemUser.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="text-left hidden sm:block">
                <div className="text-xs font-semibold text-[#003366] leading-tight max-w-[160px] truncate">
                  {systemUser.name}
                </div>
                <div className="text-[11px] text-[#64748B] leading-tight">
                  {ROLE_LABELS[systemUser.role]}
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-[#64748B]" />
            </button>

            {/* Dropdown: Meu perfil, Configurações, Ajuda, Sair (Section 10) */}
            {profileMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-lg py-1.5 z-50">
                <div className="px-4 py-2.5 border-b border-slate-100 sm:hidden">
                  <div className="text-xs font-semibold text-[#003366] truncate">
                    {systemUser.name}
                  </div>
                  <div className="text-[11px] text-[#64748B]">{ROLE_LABELS[systemUser.role]}</div>
                </div>

                {isDevBypassActive && (
                  <div className="px-4 py-2 bg-amber-50/70 border-b border-amber-100">
                    <div className="text-[10px] font-semibold text-amber-800 uppercase tracking-wider mb-1">
                      Modo Dev Ativo
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        setDevBypassActive(false);
                      }}
                      className="w-full text-left py-1 text-xs text-amber-900 hover:text-amber-700 font-medium flex items-center gap-1.5 cursor-pointer"
                    >
                      <Lock className="w-3.5 h-3.5 text-amber-600" />
                      <span>Ver Tela de Login</span>
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    setProfileModalOpen(true);
                  }}
                  className="w-full text-left px-4 py-2.5 text-xs text-[#1E293B] hover:bg-[#F1F5F9] flex items-center gap-2.5 cursor-pointer"
                >
                  <User className="w-4 h-4 text-[#00AEEF]" />
                  <span>Meu perfil</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    onSelectTab('settings');
                  }}
                  className="w-full text-left px-4 py-2.5 text-xs text-[#1E293B] hover:bg-[#F1F5F9] flex items-center gap-2.5 cursor-pointer"
                >
                  <Settings className="w-4 h-4 text-[#00AEEF]" />
                  <span>Configurações</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    onSelectTab('help');
                  }}
                  className="w-full text-left px-4 py-2.5 text-xs text-[#1E293B] hover:bg-[#F1F5F9] flex items-center gap-2.5 cursor-pointer"
                >
                  <HelpCircle className="w-4 h-4 text-[#00AEEF]" />
                  <span>Ajuda</span>
                </button>

                <div className="my-1 border-t border-slate-100" />

                <button
                  type="button"
                  onClick={async () => {
                    setProfileMenuOpen(false);
                    await logout();
                  }}
                  className="w-full text-left px-4 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-50 flex items-center gap-2.5 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sair</span>
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>

      {/* "Meu perfil" Modal (Section 9 & 10) */}
      {profileModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#003366]/45 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-[#003366]">Meu Perfil Institucional</h3>
                <div className="text-xs text-[#64748B]">{systemUser.email}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setProfileModalOpen(false);
                  setModalPasswordFeedback(null);
                }}
                className="text-[#64748B] hover:text-[#003366] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation Tabs inside modal */}
            <div className="flex items-center gap-1 bg-[#F1F5F9] p-1 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setProfileTab('info')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-center transition-colors cursor-pointer ${
                  profileTab === 'info'
                    ? 'bg-white text-[#003366] shadow-2xs'
                    : 'text-[#64748B] hover:text-[#003366]'
                }`}
              >
                Dados Cadastrais
              </button>
              <button
                type="button"
                onClick={() => setProfileTab('security')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-center transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                  profileTab === 'security'
                    ? 'bg-white text-[#003366] shadow-2xs'
                    : 'text-[#64748B] hover:text-[#003366]'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Segurança</span>
                {systemUser.mustChangePassword && (
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                )}
              </button>
            </div>

            {/* TAB 1: DADOS CADASTRAIS */}
            {profileTab === 'info' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-full bg-[#003366] text-white text-sm font-bold flex items-center justify-center shrink-0">
                    {systemUser.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-[#003366] truncate">{systemUser.name}</div>
                    <div className="text-xs text-[#007BFF] font-medium">
                      {ROLE_LABELS[systemUser.role]}
                    </div>
                    <div className="text-xs text-[#64748B] truncate">{systemUser.email}</div>
                  </div>
                </div>

                <div className="bg-[#F1F5F9]/70 rounded-xl p-3.5 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">Registro / Matrícula:</span>
                    <span className="font-semibold text-[#1E293B]">{systemUser.registrationCode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">Especialidade / Setor:</span>
                    <span className="font-semibold text-[#1E293B]">{systemUser.specialty}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">Domínio Institucional:</span>
                    <span className="font-semibold text-[#003366]">@{systemUser.institutionDomain}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">Status da Conta:</span>
                    <span className="font-semibold text-emerald-700">Ativo</span>
                  </div>
                  {systemUser.lastAccess && (
                    <div className="flex justify-between">
                      <span className="text-[#64748B]">Último Acesso:</span>
                      <span className="font-medium text-[#64748B]">
                        {systemUser.lastAccess.replace('T', ' ').slice(0, 16)}
                      </span>
                    </div>
                  )}
                </div>

                {systemUser.mustChangePassword && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold">Aviso de Segurança:</div>
                      <div className="text-[11px] mt-0.5">
                        Sua conta possui solicitação pendente para alterar a senha inicial. Acesse a aba <strong>Segurança</strong> para definir sua nova senha.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: SEGURANÇA — ALTERAR SENHA (Section 9) */}
            {profileTab === 'security' && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setModalPasswordFeedback(null);
                  if (modalNewPassword !== modalConfirmPassword) {
                    setModalPasswordFeedback({
                      type: 'error',
                      message: 'A nova senha e a confirmação não coincidem.',
                    });
                    return;
                  }
                  const strength = validateSigcoPasswordStrength(modalNewPassword);
                  if (!strength.valid) {
                    setModalPasswordFeedback({
                      type: 'error',
                      message: strength.message,
                    });
                    return;
                  }

                  setModalPasswordLoading(true);
                  const result = await changeOwnPassword(
                    modalCurrentPassword,
                    modalNewPassword
                  );
                  setModalPasswordLoading(false);

                  if (result.success) {
                    setModalPasswordFeedback({
                      type: 'success',
                      message: result.message,
                    });
                    setModalCurrentPassword('');
                    setModalNewPassword('');
                    setModalConfirmPassword('');
                  } else {
                    setModalPasswordFeedback({
                      type: 'error',
                      message: result.message,
                    });
                  }
                }}
                className="space-y-3.5"
              >
                <div className="text-xs text-[#64748B]">
                  Atualize sua senha exclusiva do SIGCO diretamente no Firebase Authentication.
                </div>

                {modalPasswordFeedback && (
                  <div
                    className={`p-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${
                      modalPasswordFeedback.type === 'success'
                        ? 'bg-[#E6F6FF] border-[#00AEEF]/40 text-[#003366]'
                        : 'bg-red-50 border-red-200 text-red-900'
                    }`}
                  >
                    {modalPasswordFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-[#00AEEF] shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                    )}
                    <span>{modalPasswordFeedback.message}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-[#003366] mb-1">
                    Senha Atual *
                  </label>
                  <div className="relative">
                    <input
                      type={modalShowPasswords ? 'text' : 'password'}
                      required
                      value={modalCurrentPassword}
                      onChange={(e) => setModalCurrentPassword(e.target.value)}
                      placeholder="Sua senha atual do SIGCO"
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                    />
                    <button
                      type="button"
                      onClick={() => setModalShowPasswords((p) => !p)}
                      className="absolute right-3 top-2.5 text-[#64748B] hover:text-[#003366] cursor-pointer"
                    >
                      {modalShowPasswords ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#003366] mb-1">
                    Nova Senha * (Mínimo de 8 caracteres)
                  </label>
                  <input
                    type={modalShowPasswords ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={modalNewPassword}
                    onChange={(e) => setModalNewPassword(e.target.value)}
                    placeholder="Nova senha do SIGCO"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                  />
                  {modalNewPassword && (
                    <div className="text-[11px] space-y-0.5 pt-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            modalNewPassword.length >= 8 ? 'bg-emerald-500' : 'bg-red-400'
                          }`}
                        />
                        <span
                          className={
                            modalNewPassword.length >= 8
                              ? 'text-emerald-700'
                              : 'text-red-700'
                          }
                        >
                          Mínimo de 8 caracteres
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#003366] mb-1">
                    Confirmar Nova Senha *
                  </label>
                  <input
                    type={modalShowPasswords ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={modalConfirmPassword}
                    onChange={(e) => setModalConfirmPassword(e.target.value)}
                    placeholder="Repita a nova senha"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={modalPasswordLoading}
                  className="w-full py-2 px-4 bg-[#00AEEF] hover:bg-[#007BFF] text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer disabled:bg-slate-300"
                >
                  {modalPasswordLoading ? 'Atualizando...' : 'Atualizar Senha'}
                </button>
              </form>
            )}

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setProfileModalOpen(false);
                  onStartTour();
                }}
                className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-[#003366] hover:bg-[#F1F5F9] cursor-pointer"
              >
                Iniciar tour guiado
              </button>
              <button
                type="button"
                onClick={() => {
                  setProfileModalOpen(false);
                  setModalPasswordFeedback(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#003366] text-xs font-semibold cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
