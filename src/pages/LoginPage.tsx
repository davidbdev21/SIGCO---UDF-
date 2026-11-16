import React, { useState } from 'react';
import {
  AlertTriangle,
  Info,
  ExternalLink,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { UdfOfficialLogo } from '../components/BrandIdentity';
import { FIREBASE_CONSOLE_AUTH_PROVIDERS_URL } from '../services/firebase';
import { INSTITUTIONAL_PERSONAS } from '../services/seedData';
import { ROLE_LABELS } from '../utils/validation';

export const LoginPage: React.FC = () => {
  const {
    loginWithEmailAndPassword,
    switchInstitutionalPersona,
    authError,
    clearAuthError,
    loading,
  } = useAuth();

  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [providerNotice, setProviderNotice] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setProviderNotice(null);
    clearAuthError();

    const trimmedEmail = email.trim().toLowerCase();

    // 1. Validar se o e-mail está preenchido
    if (!trimmedEmail) {
      setLocalError('Informe seu e-mail acadêmico (@cs.udf.edu.br).');
      return;
    }

    // 2. Verificar se o domínio é exatamente @cs.udf.edu.br
    const isDevAdmin = trimmedEmail === 'davidb.dev21@gmail.com';
    if (!isDevAdmin && !trimmedEmail.endsWith('@cs.udf.edu.br')) {
      setLocalError('Acesso restrito. O endereço deve possuir o domínio @cs.udf.edu.br.');
      return;
    }

    if (!password) {
      setLocalError('Informe sua senha de acesso ao SIGCO.');
      return;
    }

    setSubmitting(true);

    try {
      const result = await loginWithEmailAndPassword(trimmedEmail, password);
      if (!result.success) {
        if (result.isProviderDisabled) {
          setProviderNotice(
            'O provedor E-mail/Senha precisa ser ativado no Console do Firebase Authentication deste projeto.'
          );
        } else {
          setLocalError(result.message);
        }
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Falha na autenticação.');
    } finally {
      setSubmitting(false);
    }
  };

  const displayedError = localError || (authError && !authError.includes('indisponível') ? authError : null);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col justify-between font-sans selection:bg-[#00AEEF]/20">
      {/* Top Banner / White Space */}
      <div className="w-full max-w-4xl mx-auto px-6 sm:px-10 pt-8 sm:pt-12 pb-12 flex-1 flex flex-col justify-center">
        {/* Official UDF Institutional Header */}
        <div className="flex items-center justify-between flex-wrap gap-4 mb-8 sm:mb-10">
          <UdfOfficialLogo size="lg" showSubtitle={true} />
        </div>

        {/* Main Content Area */}
        <div className="max-w-xl">
          <div className="space-y-1.5">
            <div className="inline-block px-3 py-1 rounded-full bg-[#E6F6FF] text-[#003B71] text-xs font-bold uppercase tracking-wider">
              SIGCO • Clínica Odontológica UDF
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-[#003B71] tracking-tight leading-tight">
              Bem-vindo ao SIGCO
            </h1>
            <p className="text-sm sm:text-base font-medium text-slate-600">
              Sistema de Gestão de Clínica Odontológica da UDF
            </p>
          </div>

          <p className="mt-4 text-slate-700 text-xs sm:text-sm leading-relaxed">
            Informe seu e-mail acadêmico (<span className="text-[#003B71] font-semibold">@cs.udf.edu.br</span>) e sua senha cadastrada pelo administrador.
          </p>

          {/* Provider Warning Notice (shown when Email/Password provider needs activation in Firebase) */}
          {providerNotice && (
            <div className="mt-6 p-4 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-900 text-sm flex items-start gap-3 animate-in fade-in">
              <Info className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="leading-relaxed flex-1">
                <div className="font-semibold text-amber-950">Ativação do Provedor Necessária</div>
                <p className="mt-0.5 text-xs sm:text-sm text-amber-900">
                  {providerNotice}
                </p>
                <div className="mt-3 flex items-center gap-3 flex-wrap">
                  <a
                    href={FIREBASE_CONSOLE_AUTH_PROVIDERS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#003B71] hover:bg-[#002D57] text-white text-xs font-semibold shadow-2xs"
                  >
                    <span>Abrir Console do Firebase</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Dynamic Error Feedback */}
          {displayedError && !providerNotice && (
            <div className="mt-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-start gap-3 animate-in fade-in">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-red-900">Atenção ao entrar</div>
                <div className="mt-0.5 text-xs sm:text-sm leading-relaxed">{displayedError}</div>
              </div>
            </div>
          )}

          {/* Institutional Login Form */}
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {/* E-mail Acadêmico */}
            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5"
              >
                E-mail acadêmico
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setLocalError(null);
                    clearAuthError();
                  }}
                  placeholder="nome.sobrenome@cs.udf.edu.br"
                  autoComplete="username"
                  required
                  autoFocus
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 focus:border-[#003B71] focus:ring-2 focus:ring-[#003B71]/20 bg-white text-sm text-slate-900 placeholder:text-slate-400 transition-all outline-none"
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Apenas contas acadêmicas com o formato <span className="font-semibold text-slate-700">@cs.udf.edu.br</span>.
              </p>
            </div>

            {/* Senha */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="login-password"
                  className="block text-xs font-bold text-slate-700 uppercase tracking-wider"
                >
                  Senha
                </label>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setLocalError(null);
                    clearAuthError();
                  }}
                  placeholder="Digite sua senha de acesso"
                  autoComplete="current-password"
                  required
                  className="w-full pl-10 pr-11 py-3 rounded-xl border border-slate-300 focus:border-[#003B71] focus:ring-2 focus:ring-[#003B71]/20 bg-white text-sm text-slate-900 placeholder:text-slate-400 transition-all outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting || loading}
                className="w-full inline-flex items-center justify-center gap-2 bg-[#003B71] hover:bg-[#002D57] active:scale-[0.99] text-white font-semibold text-sm sm:text-base py-3.5 px-6 rounded-xl transition-all shadow-sm hover:shadow cursor-pointer disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[#003B71]/40 focus:ring-offset-2"
              >
                <span>{submitting ? 'Entrando no SIGCO...' : 'Entrar no SIGCO'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>

          {/* Support Section */}
          <div className="mt-12 pt-6 border-t border-slate-200">
            <h2 className="text-base font-bold text-[#003B71]">
              Acesso institucional e alteração de senha
            </h2>
            <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
              O cadastro é realizado exclusivamente pela coordenação ou administração da clínica odontológica.
              Cada usuário pode alterar sua própria senha após entrar no sistema, em <strong>Configurações</strong> ou <strong>Meu Perfil → Segurança</strong>.
            </p>
          </div>

          {/* Development Quick Role Test Panel (Dev Mode Only - Requirement 4) */}
          {import.meta.env.DEV && (
            <div className="mt-8 p-5 rounded-2xl bg-slate-50 border border-dashed border-slate-300 text-xs text-slate-600">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                  <span>Ambiente de Desenvolvimento — Teste Visual dos Perfis</span>
                </div>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                  Dev Mode
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed mb-3">
                Para avaliar as telas e fluxos clínicos enquanto a ativação do provedor E-mail/Senha está sendo concluída no Firebase Console, você pode alternar entre os perfis institucionais abaixo com dados simulados em memória:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {INSTITUTIONAL_PERSONAS.map((persona) => (
                  <button
                    key={persona.email}
                    type="button"
                    onClick={() => switchInstitutionalPersona(persona)}
                    className="flex flex-col text-left p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-[#E6F6FF]/40 hover:border-[#00AEEF] transition-all cursor-pointer group shadow-2xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800 group-hover:text-[#003B71] text-xs">
                        {persona.name}
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 group-hover:bg-[#003B71] group-hover:text-white transition-colors">
                        {ROLE_LABELS[persona.role]}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 mt-0.5 font-mono">
                      {persona.email}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full border-t border-slate-200 bg-white py-4 px-6 text-center text-xs text-slate-500">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            © {new Date().getFullYear()} Centro Universitário UDF — Clínica Odontológica. Todos os direitos reservados.
          </span>
          <span className="text-slate-400">
            SIGCO v2.8 • Autenticação E-mail/Senha
          </span>
        </div>
      </footer>
    </div>
  );
};
