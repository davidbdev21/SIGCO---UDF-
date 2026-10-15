import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Mail,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
  HeartHandshake,
  Award,
  ArrowLeft,
  ExternalLink,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { FIREBASE_CONSOLE_AUTH_PROVIDERS_URL } from '../services/firebase';
import {
  InstitutionalLockup,
  SigcoOfficialLogo,
  UdfOfficialLogo,
} from '../components/BrandIdentity';

export const LoginPage: React.FC = () => {
  const {
    verifyEmailAuthorizationForLogin,
    loginWithSigcoCredentials,
    requestPasswordReset,
    loginAsTemporaryImmi,
    authError,
    emailPasswordProviderDisabled,
    clearAuthError,
    loading,
    setDevBypassActive,
  } = useAuth();

  const [viewMode, setViewMode] = useState<'login' | 'forgot_password'>('login');
  const [emailInput, setEmailInput] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [emailVerifiedStatus, setEmailVerifiedStatus] = useState<
    'idle' | 'checking' | 'authorized' | 'unauthorized'
  >('idle');
  const [localError, setLocalError] = useState<string | null>(null);
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Step 1 of Login Flow (Section 2): Verify email format, @cs.udf.edu.br domain, and authorization in SIGCO
  const handleVerifyEmailStep = async (emailToVerify: string): Promise<boolean> => {
    const trimmed = emailToVerify.trim().toLowerCase();
    if (!trimmed) return false;

    setLocalError(null);
    clearAuthError();
    setEmailVerifiedStatus('checking');

    const check = await verifyEmailAuthorizationForLogin(trimmed);
    if (!check.authorized) {
      setEmailVerifiedStatus('unauthorized');
      setLocalError(check.message);
      return false;
    }

    setEmailVerifiedStatus('authorized');
    return true;
  };

  const handleSubmitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAuthError();
    setLocalError(null);

    const trimmedEmail = emailInput.trim().toLowerCase();
    const isAuthorized = await handleVerifyEmailStep(trimmedEmail);
    if (!isAuthorized) {
      return;
    }

    if (!passwordInput || passwordInput.length < 8) {
      setLocalError('Informe sua senha exclusiva do SIGCO (mínimo de 8 caracteres).');
      return;
    }

    setSubmitting(true);
    await loginWithSigcoCredentials(trimmedEmail, passwordInput);
    setSubmitting(false);
  };

  const handleSubmitPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAuthError();
    setLocalError(null);
    setResetSuccessMessage(null);

    const trimmedEmail = emailInput.trim().toLowerCase();
    setSubmitting(true);
    const result = await requestPasswordReset(trimmedEmail);
    setSubmitting(false);

    if (result.success) {
      setResetSuccessMessage(result.message);
    } else {
      setLocalError(result.message);
    }
  };

  const displayedError = localError || authError;

  return (
    <div className="min-h-screen bg-[#F1F5F9] flex flex-col lg:flex-row">
      {/* Left Institutional Panel */}
      <div className="lg:w-7/12 bg-gradient-to-br from-[#FFFFFF] via-[#E6F6FF]/50 to-[#E6F6FF] flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-200">
        <div className="p-8 lg:p-14 my-auto space-y-6">
          <InstitutionalLockup variant="default" size="lg" />

          <h2 className="text-xl lg:text-2xl font-semibold text-[#003366] max-w-xl leading-relaxed">
            Tecnologia e cuidado para uma odontologia mais organizada e eficiente.
          </h2>

          <p className="text-sm text-[#64748B] max-w-lg leading-relaxed">
            Plataforma integrada da Clínica Odontológica Universitária UDF para controle completo de
            pacientes, triagem, agendamentos, prontuários eletrônicos e supervisão acadêmica.
          </p>
        </div>

        {/* Institutional Navy Footer (#003366) */}
        <div className="bg-[#003366] text-white p-6 lg:px-14 lg:py-7">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <InstitutionalLockup variant="light" size="sm" />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-[#00AEEF] shrink-0" />
                <span className="text-slate-200">Mais controle para a clínica</span>
              </div>
              <div className="flex items-center gap-2.5">
                <HeartHandshake className="w-4 h-4 text-[#00AEEF] shrink-0" />
                <span className="text-slate-200">Melhor experiência para o paciente</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Award className="w-4 h-4 text-[#00AEEF] shrink-0" />
                <span className="text-slate-200">Apoio à formação acadêmica</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Login Card — Clean & Focused (Section 2, 10, 21) */}
      <div className="lg:w-5/12 p-6 sm:p-10 flex items-center justify-center bg-[#F1F5F9]">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 sm:p-8">
          {/* Official UDF Logo + SIGCO */}
          <div className="flex flex-col items-center text-center mb-6">
            <UdfOfficialLogo variant="default" size="md" />
            <div className="mt-3">
              <SigcoOfficialLogo variant="default" size="md" />
            </div>

            <h1 className="text-xl font-bold text-[#003366] mt-5">
              {viewMode === 'login' ? 'Acesso Institucional' : 'Recuperação de Senha'}
            </h1>
            <p className="text-xs text-[#64748B] mt-1">
              {viewMode === 'login'
                ? 'Use seu e-mail @cs.udf.edu.br e sua senha do SIGCO.'
                : 'Informe seu e-mail institucional @cs.udf.edu.br para receber o link de redefinição.'}
            </p>
          </div>

          {import.meta.env.DEV && (
            <div className="mb-5 p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-3">
              <div className="text-[11px] text-amber-900 leading-snug">
                <span className="font-bold">Modo de Desenvolvimento:</span> Acesso liberado sem login para revisão de telas.
              </div>
              <button
                type="button"
                onClick={() => setDevBypassActive(true)}
                className="py-1.5 px-3 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer whitespace-nowrap transition-colors"
              >
                Entrar Direto
              </button>
            </div>
          )}

          {displayedError && (
            <div
              role="alert"
              className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-red-900"
            >
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="text-xs font-medium leading-relaxed">{displayedError}</div>
            </div>
          )}

          {emailPasswordProviderDisabled && (
            <div className="mb-5 p-4 rounded-xl bg-[#E6F6FF] border border-[#00AEEF] text-xs text-[#003366] space-y-2">
              <div className="font-bold">
                Ativação única necessária no Console do Firebase Authentication:
              </div>
              <ol className="list-decimal list-inside space-y-1 text-[#1E293B]">
                <li>Abra o painel de provedores do Firebase Authentication abaixo.</li>
                <li>Clique em <strong>E-mail/senha (Email/Password)</strong>.</li>
                <li>Ative a chave <strong>Ativar (Enable)</strong> e clique em <strong>Salvar</strong>.</li>
              </ol>
              <a
                href={FIREBASE_CONSOLE_AUTH_PROVIDERS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-semibold text-[#007BFF] hover:text-[#003366] pt-1"
              >
                <span>Abrir Console do Firebase Authentication</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          {resetSuccessMessage && (
            <div className="mb-5 p-3.5 rounded-xl bg-[#E6F6FF] border border-[#00AEEF]/40 flex items-start gap-2.5 text-[#003366]">
              <CheckCircle2 className="w-4 h-4 text-[#00AEEF] shrink-0 mt-0.5" />
              <div className="text-xs font-medium leading-relaxed">{resetSuccessMessage}</div>
            </div>
          )}

          {viewMode === 'login' ? (
            <form onSubmit={handleSubmitLogin} className="space-y-4">
              <div>
                <label
                  htmlFor="institutional-email"
                  className="block text-xs font-medium text-[#003366] mb-1.5"
                >
                  E-mail institucional
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#64748B] absolute left-3.5 top-3" />
                  <input
                    id="institutional-email"
                    type="email"
                    required
                    value={emailInput}
                    onChange={(e) => {
                      setEmailInput(e.target.value);
                      setEmailVerifiedStatus('idle');
                      setLocalError(null);
                      clearAuthError();
                    }}
                    onBlur={() => {
                      if (emailInput.trim()) {
                        handleVerifyEmailStep(emailInput);
                      }
                    }}
                    placeholder="usuario@cs.udf.edu.br"
                    className="w-full pl-10 pr-3.5 py-2.5 text-xs bg-[#F8FAFC] border border-slate-200 rounded-xl text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#00AEEF] focus:bg-white transition-all"
                  />
                </div>
                {emailVerifiedStatus === 'authorized' && !displayedError && (
                  <p className="text-[11px] text-emerald-700 font-medium mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>E-mail institucional autorizado no SIGCO.</span>
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="institutional-password"
                  className="block text-xs font-medium text-[#003366] mb-1.5"
                >
                  Senha
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#64748B] absolute left-3.5 top-3" />
                  <input
                    id="institutional-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={passwordInput}
                    onChange={(e) => {
                      setPasswordInput(e.target.value);
                      setLocalError(null);
                      clearAuthError();
                    }}
                    placeholder="Sua senha exclusiva do SIGCO"
                    className="w-full pl-10 pr-10 py-2.5 text-xs bg-[#F8FAFC] border border-slate-200 rounded-xl text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#00AEEF] focus:bg-white transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-2.5 text-[#64748B] hover:text-[#003366] cursor-pointer"
                    aria-label="Alternar visibilidade da senha"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || loading || emailVerifiedStatus === 'checking'}
                className="w-full py-2.5 px-4 bg-[#00AEEF] hover:bg-[#007BFF] active:bg-[#003366] disabled:bg-slate-300 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
              >
                <span>{submitting || loading ? 'Entrando...' : 'Entrar'}</span>
              </button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    clearAuthError();
                    setLocalError(null);
                    setResetSuccessMessage(null);
                    setViewMode('forgot_password');
                  }}
                  className="text-xs font-semibold text-[#007BFF] hover:text-[#003366] transition-colors cursor-pointer"
                >
                  Esqueci minha senha
                </button>
              </div>

              {/* Acesso Temporário Direto Liberado para Immi */}
              <div className="pt-3 border-t border-slate-200">
                <div className="p-3 bg-gradient-to-r from-[#E6F6FF] to-blue-50 border border-[#00AEEF]/40 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#003366]">
                      <Sparkles className="w-3.5 h-3.5 text-[#00AEEF]" />
                      <span>Acesso Temporário Liberado</span>
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full">
                      Perfil Administrador
                    </span>
                  </div>

                  <p className="text-[11px] text-[#64748B] leading-relaxed">
                    Clique abaixo para entrar diretamente como <strong>Immi</strong> (ou preencha{' '}
                    <code className="text-[#003366] font-mono text-[10px] bg-white px-1 py-0.5 rounded border border-slate-200">
                      immi@cs.udf.edu.br
                    </code>{' '}
                    com a senha provisória).
                  </p>

                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                    <button
                      type="button"
                      disabled={submitting || loading}
                      onClick={async () => {
                        setLocalError(null);
                        clearAuthError();
                        setSubmitting(true);
                        await loginAsTemporaryImmi();
                        setSubmitting(false);
                      }}
                      className="flex-1 py-2 px-3 bg-[#003366] hover:bg-[#002244] active:bg-[#001830] text-white text-xs font-semibold rounded-lg shadow-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <UserCheck className="w-3.5 h-3.5 text-[#00AEEF]" />
                      <span>Entrar como Immi (1 Clique)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setEmailInput('immi@cs.udf.edu.br');
                        setPasswordInput('Immi@2026!');
                        setEmailVerifiedStatus('authorized');
                        setLocalError(null);
                        clearAuthError();
                      }}
                      className="py-2 px-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-[#003366] text-[11px] font-medium rounded-lg transition-colors cursor-pointer"
                      title="Preencher campos de login"
                    >
                      Preencher campos
                    </button>
                  </div>
                </div>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubmitPasswordReset} className="space-y-4">
              <div>
                <label
                  htmlFor="reset-email"
                  className="block text-xs font-medium text-[#003366] mb-1.5"
                >
                  E-mail institucional
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#64748B] absolute left-3.5 top-3" />
                  <input
                    id="reset-email"
                    type="email"
                    required
                    value={emailInput}
                    onChange={(e) => {
                      setEmailInput(e.target.value);
                      setLocalError(null);
                      setResetSuccessMessage(null);
                    }}
                    placeholder="usuario@cs.udf.edu.br"
                    className="w-full pl-10 pr-3.5 py-2.5 text-xs bg-[#F8FAFC] border border-slate-200 rounded-xl text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#00AEEF] focus:bg-white transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 bg-[#00AEEF] hover:bg-[#007BFF] active:bg-[#003366] disabled:bg-slate-300 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
              >
                <span>{submitting ? 'Enviando...' : 'Solicitar redefinição'}</span>
              </button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    clearAuthError();
                    setLocalError(null);
                    setResetSuccessMessage(null);
                    setViewMode('login');
                  }}
                  className="text-xs font-semibold text-[#64748B] hover:text-[#003366] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Voltar ao login do SIGCO</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
