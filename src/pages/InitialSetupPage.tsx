import React, { useState, useMemo } from 'react';
import {
  ShieldCheck,
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ShieldAlert,
  ExternalLink,
  RefreshCw,
  Play,
  Check,
  Info,
} from 'lucide-react';
import { InstitutionalLockup } from '../components/BrandIdentity';
import { useAuth, validateSigcoPasswordStrength } from '../auth/AuthContext';
import { isValidInstitutionalEmail, RESTRICTED_DOMAIN_MESSAGE } from '../utils/validation';
import { FIREBASE_CONSOLE_AUTH_PROVIDERS_URL } from '../services/firebase';

interface InitialSetupPageProps {
  onSetupSuccess?: () => void;
  onGoToLogin?: () => void;
}

export const InitialSetupPage: React.FC<InitialSetupPageProps> = ({
  onSetupSuccess,
  onGoToLogin,
}) => {
  const { bootstrapFirstAdmin, enterDevDemoMode } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    isProviderDisabled?: boolean;
  } | null>(null);

  const passwordStrength = useMemo(
    () => validateSigcoPasswordStrength(password),
    [password]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setFeedback({
        type: 'error',
        message: 'Informe seu nome completo (mínimo de 2 caracteres).',
      });
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (!isValidInstitutionalEmail(trimmedEmail)) {
      setFeedback({
        type: 'error',
        message: RESTRICTED_DOMAIN_MESSAGE,
      });
      return;
    }

    if (password !== confirmPassword) {
      setFeedback({
        type: 'error',
        message: 'A confirmação de senha não coincide com a senha digitada.',
      });
      return;
    }

    if (!passwordStrength.valid) {
      setFeedback({
        type: 'error',
        message: passwordStrength.message,
      });
      return;
    }

    setLoading(true);

    const result = await bootstrapFirstAdmin({
      name: trimmedName,
      email: trimmedEmail,
      password,
    });

    setLoading(false);

    if (result.success) {
      setFeedback({
        type: 'success',
        message:
          'Primeiro administrador criado com sucesso no SIGCO e no Firebase Authentication! Redirecionando...',
      });
      if (onSetupSuccess) {
        setTimeout(() => {
          onSetupSuccess();
        }, 1200);
      }
    } else {
      setFeedback({
        type: 'error',
        message: result.message,
        isProviderDisabled: result.isProviderDisabled,
      });
    }
  };

  const handleEnterDevDemo = () => {
    if (!import.meta.env.DEV) return;
    const trimmedName = name.trim() || 'Prof. Dr. Roberto Mendes';
    const trimmedEmail = email.trim().toLowerCase() || 'administrador@cs.udf.edu.br';
    enterDevDemoMode({
      name: trimmedName,
      email: trimmedEmail,
      role: 'ADMIN',
      registrationCode: 'ADM-001',
      specialty: 'Gestão Clínica Geral',
    });
    if (onSetupSuccess) {
      onSetupSuccess();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#001f3f] via-[#003366] to-[#002244] text-[#1E293B] flex flex-col justify-center items-center p-4 sm:p-6">
      <div className="w-full max-w-lg">
        {/* Card Header with UDF Branding */}
        <div className="bg-white rounded-t-3xl p-6 sm:p-8 border-b border-slate-100 shadow-xl text-center space-y-3">
          <div className="flex justify-center">
            <InstitutionalLockup size="lg" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Configuração Inicial do Sistema</span>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold text-[#003366] tracking-tight">
            Criar Primeiro Administrador
          </h1>

          <p className="text-xs sm:text-sm text-[#64748B] leading-relaxed max-w-md mx-auto">
            Nenhum administrador foi identificado no sistema. Esta etapa única cria o
            coordenador principal com nível <strong>ADMINISTRADOR</strong> no SIGCO e no
            Firebase Authentication.
          </p>
        </div>

        {/* Form Body */}
        <div className="bg-white rounded-b-3xl p-6 sm:p-8 shadow-xl space-y-5 border-t border-slate-100">
          {/* Important Security Notice */}
          <div className="p-3.5 rounded-xl bg-[#E6F6FF]/70 border border-[#00AEEF]/30 text-xs text-[#003366] flex items-start gap-2.5 leading-relaxed">
            <ShieldAlert className="w-4 h-4 text-[#00AEEF] shrink-0 mt-0.5" />
            <div>
              <strong>Processo protegido:</strong> Após a conclusão deste cadastro, esta
              rota será <strong>permanentemente bloqueada</strong> para impedir a criação pública
              de outros administradores. Novos usuários serão cadastrados exclusivamente pelo
              painel de Gerenciamento de Usuários.
            </div>
          </div>

          {/* Feedback message & Firebase activation instructions */}
          {feedback && (
            <div className="space-y-3">
              <div
                className={`p-4 rounded-xl text-xs flex items-start gap-3 border ${
                  feedback.type === 'success'
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                    : 'bg-rose-50 text-rose-900 border-rose-200'
                }`}
              >
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1 flex-1">
                  <p className="font-semibold">{feedback.message}</p>
                </div>
              </div>

              {/* Step-by-step activation guide when provider is disabled */}
              {feedback.isProviderDisabled && (
                <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-300/80 text-amber-950 text-xs space-y-3 shadow-xs">
                  <div className="flex items-center gap-2 font-bold text-sm text-amber-950">
                    <Info className="w-4 h-4 text-amber-700" />
                    <span>Como Ativar o Provedor E-mail/Senha no Firebase</span>
                  </div>

                  <p className="text-amber-900 leading-relaxed">
                    O Firebase Authentication deste projeto (<code>ornate-quanta-6hl8x</code>) ainda não possui o método <strong>E-mail/senha</strong> habilitado no console da nuvem. Siga os passos rápidos abaixo:
                  </p>

                  <ol className="list-decimal list-inside space-y-1.5 text-amber-950 font-medium bg-white/70 p-3 rounded-xl border border-amber-200">
                    <li>
                      Acesse a página oficial de provedores:{' '}
                      <a
                        href={FIREBASE_CONSOLE_AUTH_PROVIDERS_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-bold text-[#003366] hover:underline"
                      >
                        <span>Abrir Console do Firebase</span>
                        <ExternalLink className="w-3 h-3 text-[#00AEEF]" />
                      </a>
                    </li>
                    <li>Na lista de provedores, clique sobre a linha <strong>E-mail/senha</strong>.</li>
                    <li>Ative a 1ª opção: <strong>&ldquo;Permitir que os usuários façam login usando o endereço de e-mail e a senha&rdquo;</strong>.</li>
                    <li>Clique no botão azul <strong>Salvar</strong>.</li>
                    <li>Retorne a esta tela e clique no botão de recarregar abaixo.</li>
                  </ol>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleSubmit}
                      className="px-3.5 py-2 bg-amber-700 hover:bg-amber-800 text-white font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Tentar Novamente no Firebase</span>
                    </button>
                  </div>

                  {/* Development Mode: Visual Evaluation Fallback (Requisito 4) */}
                  {import.meta.env.DEV && (
                    <div className="mt-3 pt-3 border-t border-amber-200/80 space-y-2">
                      <div className="text-[11px] font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                        <Play className="w-3.5 h-3.5 text-[#003366]" />
                        <span>Acesso para Teste Visual Imediato (Modo Dev)</span>
                      </div>
                      <p className="text-[11px] text-amber-800 leading-relaxed">
                        Se preferir avaliar as telas e testar os módulos clínicos imediatamente sem aguardar a ativação no console, entre no modo de teste visual com o administrador informado:
                      </p>
                      <button
                        type="button"
                        onClick={handleEnterDevDemo}
                        className="w-full py-2.5 px-4 bg-[#003366] hover:bg-[#002244] text-white font-bold text-xs rounded-xl shadow-2xs transition-all cursor-pointer flex items-center justify-center gap-2"
                      >
                        <ShieldCheck className="w-4 h-4 text-[#00AEEF]" />
                        <span>Entrar como Administrador em Modo de Avaliação Visual (Dev)</span>
                      </button>
                      <p className="text-[10px] text-slate-500 text-center">
                        * Utiliza dados locais fictícios em memória. Sem persistência no banco de dados real. Desativado em produção.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Nome Completo */}
            <div className="space-y-1.5">
              <label
                htmlFor="setup-name"
                className="block text-xs font-semibold text-[#003366]"
              >
                Nome Completo do Administrador
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-[#64748B] absolute left-3.5 top-3 pointer-events-none" />
                <input
                  id="setup-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Prof. Dr. Roberto Mendes"
                  className="w-full pl-10 pr-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#00AEEF] focus:bg-white"
                />
              </div>
            </div>

            {/* E-mail Institucional */}
            <div className="space-y-1.5">
              <label
                htmlFor="setup-email"
                className="block text-xs font-semibold text-[#003366]"
              >
                E-mail Acadêmico UDF (@cs.udf.edu.br)
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#64748B] absolute left-3.5 top-3 pointer-events-none" />
                <input
                  id="setup-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="administrador@cs.udf.edu.br"
                  className="w-full pl-10 pr-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#00AEEF] focus:bg-white"
                />
              </div>
              <p className="text-[11px] text-[#64748B]">
                Somente o domínio institucional <code>@cs.udf.edu.br</code> é aceito.
              </p>
            </div>

            {/* Senha */}
            <div className="space-y-1.5">
              <label
                htmlFor="setup-password"
                className="block text-xs font-semibold text-[#003366]"
              >
                Senha do Administrador
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#64748B] absolute left-3.5 top-3 pointer-events-none" />
                <input
                  id="setup-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres (letras e números)"
                  className="w-full pl-10 pr-10 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#00AEEF] focus:bg-white font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-[#64748B] hover:text-[#003366] transition-colors cursor-pointer"
                  title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Password strength checklist */}
              {password.length > 0 && (
                <div className="pt-1.5 space-y-1">
                  <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                    <span
                      className={`inline-flex items-center gap-1 ${
                        passwordStrength.hasMinLength ? 'text-emerald-700 font-medium' : 'text-slate-400'
                      }`}
                    >
                      <CheckCircle2 className="w-3 h-3" /> Mínimo 8 caracteres
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 ${
                        passwordStrength.hasLetters ? 'text-emerald-700 font-medium' : 'text-slate-400'
                      }`}
                    >
                      <CheckCircle2 className="w-3 h-3" /> Contém letras
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 ${
                        passwordStrength.hasNumbers ? 'text-emerald-700 font-medium' : 'text-slate-400'
                      }`}
                    >
                      <CheckCircle2 className="w-3 h-3" /> Contém números
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 ${
                        passwordStrength.hasSpecial ? 'text-emerald-700 font-medium' : 'text-slate-400'
                      }`}
                    >
                      <CheckCircle2 className="w-3 h-3" /> Caractere especial
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Confirmação de Senha */}
            <div className="space-y-1.5">
              <label
                htmlFor="setup-confirm-password"
                className="block text-xs font-semibold text-[#003366]"
              >
                Confirmar Senha
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#64748B] absolute left-3.5 top-3 pointer-events-none" />
                <input
                  id="setup-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a senha digitada"
                  className="w-full pl-10 pr-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#00AEEF] focus:bg-white font-mono"
                />
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[#003366] hover:bg-[#002244] text-white font-bold text-xs rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Criando administrador no Firebase...</span>
                  </>
                ) : (
                  <>
                    <span>Criar Primeiro Administrador e Inicializar</span>
                    <ArrowRight className="w-4 h-4 text-[#00AEEF]" />
                  </>
                )}
              </button>
            </div>
          </form>

          {onGoToLogin && (
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={onGoToLogin}
                className="text-xs text-[#007BFF] hover:underline font-medium cursor-pointer"
              >
                Já existe administrador configurado? Ir para o login
              </button>
            </div>
          )}

          {import.meta.env.DEV && (
            <div className="pt-3 border-t border-slate-100 text-center">
              <button
                type="button"
                onClick={handleEnterDevDemo}
                className="text-xs text-[#64748B] hover:text-[#003366] font-medium flex items-center justify-center gap-1.5 mx-auto cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 text-[#00AEEF]" />
                <span>Testar interface visual imediatamente (Modo Dev com dados locais)</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
