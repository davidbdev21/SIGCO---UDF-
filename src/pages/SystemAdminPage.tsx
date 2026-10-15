import React, { useState, useMemo } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  Plus,
  AlertTriangle,
  X,
  Search,
  Filter,
  Edit2,
  UserCheck,
  UserX,
  KeyRound,
  Trash2,
  Lock,
  Eye,
  EyeOff,
  ShieldAlert,
} from 'lucide-react';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { db, getFriendlyErrorMessage } from '../services/firebase';
import { useClinicData } from '../hooks/useClinicData';
import { useAuth, validateSigcoPasswordStrength } from '../auth/AuthContext';
import { SystemUser, UserRole } from '../types';
import {
  INITIAL_SPECIALTIES,
  INSTITUTION_DOMAIN,
  isValidInstitutionalEmail,
  RESTRICTED_DOMAIN_MESSAGE,
  ROLE_LABELS,
  sanitizeId,
  sanitizeString,
} from '../utils/validation';
import { InstitutionalLockup } from '../components/BrandIdentity';
import { ContextualHelp } from '../components/ContextualHelp';

interface SystemAdminPageProps {
  mode: 'users' | 'settings' | 'audit';
}

export const SystemAdminPage: React.FC<SystemAdminPageProps> = ({ mode }) => {
  const {
    systemUser,
    adminCreateUser,
    adminUpdateUser,
    adminToggleUserStatus,
    adminSendPasswordReset,
    adminDeleteUser,
    changeOwnPassword,
  } = useAuth();
  const { users, auditLogs, patients } = useClinicData();

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  // Modals
  const [createUserModalOpen, setCreateUserModalOpen] = useState(false);
  const [editUserModalUser, setEditUserModalUser] = useState<SystemUser | null>(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<SystemUser | null>(null);
  const [resetPasswordConfirmUser, setResetPasswordConfirmUser] = useState<SystemUser | null>(null);

  // Search & Filters for Users (Section 20)
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('ALL');
  const [userStatusFilter, setUserStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Form State: Create User (Section 7)
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createRole, setCreateRole] = useState<UserRole>('ALUNO');
  const [createStatus, setCreateStatus] = useState<boolean>(true);
  const [createPassword, setCreatePassword] = useState('');
  const [createConfirmPassword, setCreateConfirmPassword] = useState('');
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [createRegistrationCode, setCreateRegistrationCode] = useState('');
  const [createSpecialty, setCreateSpecialty] = useState('Clínica Geral');
  const [createMustChangePassword, setCreateMustChangePassword] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);

  // Form State: Edit User
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('ALUNO');
  const [editStatus, setEditStatus] = useState<boolean>(true);
  const [editRegistrationCode, setEditRegistrationCode] = useState('');
  const [editSpecialty, setEditSpecialty] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Form State: Password Change for Self (Section 9)
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showChangePasswords, setShowChangePasswords] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordChangeFeedback, setPasswordChangeFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Password validation analysis
  const passwordStrength = useMemo(
    () => validateSigcoPasswordStrength(createPassword),
    [createPassword]
  );
  const newPasswordStrength = useMemo(
    () => validateSigcoPasswordStrength(newPassword),
    [newPassword]
  );

  // Filtered users list
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = userSearch.toLowerCase().trim();
      const matchQuery =
        !q ||
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.registrationCode && u.registrationCode.toLowerCase().includes(q)) ||
        (u.specialty && u.specialty.toLowerCase().includes(q));

      const matchRole = userRoleFilter === 'ALL' || u.role === userRoleFilter;
      const matchStatus =
        userStatusFilter === 'ALL' ||
        (userStatusFilter === 'ACTIVE' && u.active !== false) ||
        (userStatusFilter === 'INACTIVE' && u.active === false);

      return matchQuery && matchRole && matchStatus;
    });
  }, [users, userSearch, userRoleFilter, userStatusFilter]);

  if (!systemUser) return null;

  // Section 7 & 8: Admin creates user
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const trimmedEmail = createEmail.trim().toLowerCase();
    if (!isValidInstitutionalEmail(trimmedEmail)) {
      setFeedback({ type: 'error', message: RESTRICTED_DOMAIN_MESSAGE });
      return;
    }

    if (createPassword !== createConfirmPassword) {
      setFeedback({ type: 'error', message: 'As senhas informadas não coincidem.' });
      return;
    }

    if (!passwordStrength.valid) {
      setFeedback({ type: 'error', message: passwordStrength.message });
      return;
    }

    setCreateSubmitting(true);
    const result = await adminCreateUser(
      {
        name: createName.trim(),
        email: trimmedEmail,
        role: createRole,
        active: createStatus,
        initialPassword: createPassword,
        registrationCode: createRegistrationCode.trim() || `UDF-${Math.floor(1000 + Math.random() * 9000)}`,
        specialty: createSpecialty.trim() || 'Clínica Geral',
        mustChangePassword: createMustChangePassword,
      },
      users
    );
    setCreateSubmitting(false);

    if (result.success) {
      setFeedback({ type: 'success', message: result.message });
      setCreateUserModalOpen(false);
      setCreateName('');
      setCreateEmail('');
      setCreatePassword('');
      setCreateConfirmPassword('');
      setCreateRegistrationCode('');
      setCreateMustChangePassword(false);
    } else {
      setFeedback({ type: 'error', message: result.message });
    }
  };

  const handleOpenEditUserModal = (targetUser: SystemUser) => {
    setEditUserModalUser(targetUser);
    setEditName(targetUser.name);
    setEditRole(targetUser.role);
    setEditStatus(targetUser.active !== false);
    setEditRegistrationCode(targetUser.registrationCode || '');
    setEditSpecialty(targetUser.specialty || 'Clínica Geral');
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUserModalUser) return;
    setEditSubmitting(true);

    const result = await adminUpdateUser(editUserModalUser, {
      name: editName.trim(),
      role: editRole,
      active: editStatus,
      registrationCode: editRegistrationCode.trim(),
      specialty: editSpecialty.trim(),
    });
    setEditSubmitting(false);

    if (result.success) {
      setFeedback({ type: 'success', message: result.message });
      setEditUserModalUser(null);
    } else {
      setFeedback({ type: 'error', message: result.message });
    }
  };

  const handleToggleStatus = async (targetUser: SystemUser) => {
    const nextActive = !targetUser.active;
    const result = await adminToggleUserStatus(targetUser, nextActive);
    setFeedback({
      type: result.success ? 'success' : 'error',
      message: result.message,
    });
  };

  const handleConfirmResetPassword = async () => {
    if (!resetPasswordConfirmUser) return;
    const result = await adminSendPasswordReset(resetPasswordConfirmUser);
    setResetPasswordConfirmUser(null);
    setFeedback({
      type: result.success ? 'success' : 'error',
      message: result.message,
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmUser) return;
    const result = await adminDeleteUser(deleteConfirmUser);
    setDeleteConfirmUser(null);
    setFeedback({
      type: result.success ? 'success' : 'error',
      message: result.message,
    });
  };

  // Section 9: Self Password Change
  const handleChangeOwnPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordChangeFeedback(null);

    if (newPassword !== confirmNewPassword) {
      setPasswordChangeFeedback({
        type: 'error',
        message: 'A nova senha e a confirmação não coincidem.',
      });
      return;
    }

    if (!newPasswordStrength.valid) {
      setPasswordChangeFeedback({
        type: 'error',
        message: newPasswordStrength.message,
      });
      return;
    }

    setChangingPassword(true);
    const result = await changeOwnPassword(currentPassword, newPassword);
    setChangingPassword(false);

    if (result.success) {
      setPasswordChangeFeedback({
        type: 'success',
        message: result.message,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } else {
      setPasswordChangeFeedback({
        type: 'error',
        message: result.message,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-[#003366] tracking-tight">
              {mode === 'users' && 'Gerenciamento de Usuários'}
              {mode === 'settings' && 'Configurações'}
              {mode === 'audit' && 'Auditoria'}
            </h1>
            <ContextualHelp
              title={
                mode === 'users'
                  ? 'Usuários e Permissões'
                  : mode === 'settings'
                  ? 'Configurações do Sistema'
                  : 'Auditoria (RN08)'
              }
              description={
                mode === 'users'
                  ? 'Área restrita ao Administrador para cadastrar, editar, desativar, redefinir senhas e excluir usuários @cs.udf.edu.br.'
                  : mode === 'settings'
                  ? 'Gerencie suas preferências pessoais, segurança da conta e configurações clínicas.'
                  : 'Registro imutável de ações realizadas no sistema (Usuário, Ação, Data, Horário e Registro afetado).'
              }
            />
          </div>
          <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
            {mode === 'users' &&
              'Cadastro, perfis de acesso RBAC, credenciais do SIGCO e controle de acesso (@cs.udf.edu.br).'}
            {mode === 'settings' &&
              'Configurações pessoais, alteração de senha institucional e regras da clínica.'}
            {mode === 'audit' &&
              'Histórico rastreável e imutável de ações importantes realizadas pelos usuários autorizados.'}
          </p>
        </div>

        {mode === 'users' && systemUser.role === 'ADMIN' && (
          <button
            type="button"
            onClick={() => {
              setFeedback(null);
              setCreateUserModalOpen(true);
            }}
            className="px-4 py-2.5 bg-[#00AEEF] hover:bg-[#007BFF] text-white text-xs font-semibold rounded-xl shadow-2xs flex items-center gap-2 cursor-pointer whitespace-nowrap self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>+ Novo Usuário</span>
          </button>
        )}
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs font-medium ${
            feedback.type === 'success'
              ? 'bg-[#E6F6FF] border-[#00AEEF]/40 text-[#003366]'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <span className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-[#00AEEF] shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </span>
          <button type="button" onClick={() => setFeedback(null)} className="cursor-pointer">
            <X className="w-4 h-4 text-[#64748B]" />
          </button>
        </div>
      )}

      {/* USERS VIEW — Complete Section 20 implementation */}
      {mode === 'users' && (
        <div className="space-y-4">
          {/* Search & Filter Bar (Section 20) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-2xs">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-2.5" />
              <input
                type="text"
                placeholder="Buscar usuário por nome, e-mail, matrícula/CRO ou especialidade..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#F8FAFC] border border-slate-200 rounded-xl text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#00AEEF] focus:bg-white transition-all"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 bg-[#F8FAFC] border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-[#003366]">
                <Filter className="w-3.5 h-3.5 text-[#64748B]" />
                <span className="text-[11px] font-medium text-[#64748B]">Perfil:</span>
                <select
                  value={userRoleFilter}
                  onChange={(e) => setUserRoleFilter(e.target.value)}
                  className="bg-transparent font-semibold text-xs focus:outline-none cursor-pointer"
                >
                  <option value="ALL">Todos os Perfis</option>
                  <option value="ADMIN">Administrador</option>
                  <option value="RECEPCAO">Recepção</option>
                  <option value="TRIAGEM">Dentista de Triagem</option>
                  <option value="PROFESSOR">Professor / Supervisor</option>
                  <option value="ALUNO">Aluno de Odontologia</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5 bg-[#F8FAFC] border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-[#003366]">
                <span className="text-[11px] font-medium text-[#64748B]">Status:</span>
                <select
                  value={userStatusFilter}
                  onChange={(e) => setUserStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
                  className="bg-transparent font-semibold text-xs focus:outline-none cursor-pointer"
                >
                  <option value="ALL">Todos os Status</option>
                  <option value="ACTIVE">Ativos</option>
                  <option value="INACTIVE">Desativados</option>
                </select>
              </div>
            </div>
          </div>

          {/* User Table (Section 20: Nome, E-mail, Perfil, Status, Último acesso, Ações) */}
          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-[#F1F5F9]/70 text-[11px] font-semibold text-[#003366]">
                    <th className="py-3.5 px-4">Nome</th>
                    <th className="py-3.5 px-4">E-mail Institucional</th>
                    <th className="py-3.5 px-4">Perfil</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Último Acesso</th>
                    <th className="py-3.5 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-xs text-[#64748B]">
                        Nenhum usuário encontrado para os critérios pesquisados.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const isCurrentAdmin =
                        u.id === systemUser.id ||
                        u.uid === systemUser.uid ||
                        u.email.toLowerCase() === systemUser.email.toLowerCase();

                      return (
                        <tr key={u.id} className="hover:bg-[#E6F6FF]/35 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-[#003366] flex items-center gap-2">
                              <span>{u.name}</span>
                              {isCurrentAdmin && (
                                <span className="text-[10px] bg-sky-100 text-[#003366] px-1.5 py-0.5 rounded font-bold">
                                  Você
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-[#64748B]">
                              Matrícula/CRO: {u.registrationCode || '—'} · {u.specialty || 'Geral'}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-[#007BFF] font-medium">{u.email}</td>
                          <td className="py-3.5 px-4 font-bold text-[#003366]">
                            {ROLE_LABELS[u.role]}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold ${
                                u.active !== false
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-red-50 text-red-700 border border-red-200'
                              }`}
                            >
                              {u.active !== false ? 'Ativo' : 'Desativado'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-[#64748B] tabular-nums text-[11px]">
                            {u.lastAccess
                              ? u.lastAccess.includes('T')
                                ? u.lastAccess.replace('T', ' ').slice(0, 16)
                                : u.lastAccess
                              : 'Nunca acessou'}
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              {/* Edit User Button */}
                              <button
                                type="button"
                                title="Editar usuário"
                                onClick={() => handleOpenEditUserModal(u)}
                                className="p-1.5 rounded-lg border border-slate-200 hover:bg-[#E6F6FF] text-[#003366] transition-colors cursor-pointer"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              {/* Toggle Active / Inactive Button */}
                              <button
                                type="button"
                                title={u.active !== false ? 'Desativar acesso' : 'Ativar acesso'}
                                disabled={isCurrentAdmin}
                                onClick={() => handleToggleStatus(u)}
                                className={`p-1.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                  u.active !== false
                                    ? 'border-slate-200 hover:bg-amber-50 text-amber-700'
                                    : 'border-slate-200 hover:bg-emerald-50 text-emerald-700'
                                }`}
                              >
                                {u.active !== false ? (
                                  <UserX className="w-3.5 h-3.5" />
                                ) : (
                                  <UserCheck className="w-3.5 h-3.5" />
                                )}
                              </button>

                              {/* Reset Password Button */}
                              <button
                                type="button"
                                title="Redefinir senha do SIGCO"
                                onClick={() => setResetPasswordConfirmUser(u)}
                                className="p-1.5 rounded-lg border border-slate-200 hover:bg-[#E6F6FF] text-[#007BFF] transition-colors cursor-pointer"
                              >
                                <KeyRound className="w-3.5 h-3.5" />
                              </button>

                              {/* Delete User Button (Admin only, never self) */}
                              <button
                                type="button"
                                title={
                                  isCurrentAdmin
                                    ? 'Não é permitido excluir a própria conta'
                                    : 'Excluir usuário do SIGCO'
                                }
                                disabled={isCurrentAdmin}
                                onClick={() => setDeleteConfirmUser(u)}
                                className="p-1.5 rounded-lg border border-slate-200 hover:bg-red-50 text-red-600 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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
        </div>
      )}

      {/* SETTINGS VIEW (Section 9: Own Password Change + Personal & Appearance + Admin rules) */}
      {mode === 'settings' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <InstitutionalLockup size="md" />
            <div className="text-xs text-[#64748B] sm:text-right">
              <div className="font-semibold text-[#003366]">
                {systemUser.name} · {ROLE_LABELS[systemUser.role]}
              </div>
              <div>{systemUser.email}</div>
            </div>
          </div>

          {/* Section 9: Security — Change Own Password directly in Firebase Authentication */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-[#003366]">
              <Lock className="w-4 h-4 text-[#00AEEF]" />
              <span>Segurança — Alterar Minha Senha do SIGCO</span>
            </div>
            <p className="text-xs text-[#64748B]">
              Atualize sua senha exclusiva do SIGCO diretamente no Firebase Authentication. Esta senha é independente de senhas de outros serviços externos.
            </p>

            {passwordChangeFeedback && (
              <div
                className={`p-3.5 rounded-xl border text-xs font-medium flex items-center gap-2 ${
                  passwordChangeFeedback.type === 'success'
                    ? 'bg-[#E6F6FF] border-[#00AEEF]/40 text-[#003366]'
                    : 'bg-red-50 border-red-200 text-red-900'
                }`}
              >
                {passwordChangeFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-[#00AEEF] shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span>{passwordChangeFeedback.message}</span>
              </div>
            )}

            <form onSubmit={handleChangeOwnPasswordSubmit} className="space-y-4 max-w-lg">
              <div>
                <label className="block text-xs font-semibold text-[#003366] mb-1">
                  Senha Atual *
                </label>
                <div className="relative">
                  <input
                    type={showChangePasswords ? 'text' : 'password'}
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Sua senha atual do SIGCO"
                    className="w-full px-3.5 py-2.5 text-xs bg-[#F8FAFC] border border-slate-200 rounded-xl text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#00AEEF]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowChangePasswords((prev) => !prev)}
                    className="absolute right-3 top-2.5 text-[#64748B] hover:text-[#003366] cursor-pointer"
                  >
                    {showChangePasswords ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#003366] mb-1">
                  Nova Senha * (Mínimo de 8 caracteres)
                </label>
                <input
                  type={showChangePasswords ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Nova senha do SIGCO"
                  className="w-full px-3.5 py-2.5 text-xs bg-[#F8FAFC] border border-slate-200 rounded-xl text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#00AEEF]"
                />
                {newPassword && (
                  <div className="mt-2 text-[11px] space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          newPasswordStrength.hasMinLength ? 'bg-emerald-500' : 'bg-slate-300'
                        }`}
                      />
                      <span className={newPasswordStrength.hasMinLength ? 'text-emerald-700' : 'text-slate-500'}>
                        Pelo menos 8 caracteres
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          newPasswordStrength.hasLetters && newPasswordStrength.hasNumbers
                            ? 'bg-emerald-500'
                            : 'bg-slate-300'
                        }`}
                      />
                      <span
                        className={
                          newPasswordStrength.hasLetters && newPasswordStrength.hasNumbers
                            ? 'text-emerald-700'
                            : 'text-slate-500'
                        }
                      >
                        Letras e números recomendados
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
                  type={showChangePasswords ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Confirme a nova senha"
                  className="w-full px-3.5 py-2.5 text-xs bg-[#F8FAFC] border border-slate-200 rounded-xl text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#00AEEF]"
                />
              </div>

              <button
                type="submit"
                disabled={changingPassword}
                className="py-2.5 px-5 bg-[#00AEEF] hover:bg-[#007BFF] text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer disabled:bg-slate-300 whitespace-nowrap"
              >
                {changingPassword ? 'Atualizando senha...' : 'Alterar Senha do SIGCO'}
              </button>
            </form>
          </div>

          {/* Personal Settings, Appearance & Preferences */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
              <div className="text-sm font-bold text-[#003366]">
                Configurações Pessoais e Preferências
              </div>
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between py-2 border-b border-slate-100">
                  <div>
                    <div className="font-semibold text-[#1E293B]">Aparência institucional</div>
                    <div className="text-[#64748B]">Tema claro oficial UDF + SIGCO</div>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-[#E6F6FF] text-[#003366] font-semibold">
                    Padrão Institucional
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-slate-100">
                  <div>
                    <div className="font-semibold text-[#1E293B]">Densidade da interface</div>
                    <div className="text-[#64748B]">Layout limpo com foco nas ações principais</div>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-[#F1F5F9] text-[#003366] font-semibold">
                    Confortável
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <div>
                    <div className="font-semibold text-[#1E293B]">Sessão persistente</div>
                    <div className="text-[#64748B]">Sessão mantida com browserLocalPersistence</div>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-semibold">
                    Ativo
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
              <div className="text-sm font-bold text-[#003366]">
                Preferências de Notificações
              </div>
              <div className="space-y-3 text-xs">
                <label className="flex items-center justify-between py-2 border-b border-slate-100 cursor-pointer">
                  <div>
                    <div className="font-semibold text-[#1E293B]">Alertas de consultas do dia</div>
                    <div className="text-[#64748B]">Exibir avisos de confirmação e presença</div>
                  </div>
                  <input type="checkbox" defaultChecked className="accent-[#00AEEF] w-4 h-4" />
                </label>
                <label className="flex items-center justify-between py-2 border-b border-slate-100 cursor-pointer">
                  <div>
                    <div className="font-semibold text-[#1E293B]">Avisos de encaminhamento</div>
                    <div className="text-[#64748B]">Notificar quando houver novo encaminhamento</div>
                  </div>
                  <input type="checkbox" defaultChecked className="accent-[#00AEEF] w-4 h-4" />
                </label>
                <label className="flex items-center justify-between py-2 cursor-pointer">
                  <div>
                    <div className="font-semibold text-[#1E293B]">Dicas de ajuda contextual (?)</div>
                    <div className="text-[#64748B]">Mostrar explicações rápidas nas telas</div>
                  </div>
                  <input type="checkbox" defaultChecked className="accent-[#00AEEF] w-4 h-4" />
                </label>
              </div>
            </div>
          </div>

          {/* Administrative Clinical Rules — ONLY visible to ADMIN */}
          {systemUser.role === 'ADMIN' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-2 text-[#007BFF] text-xs font-semibold">
                  <ShieldCheck className="w-4 h-4 text-[#00AEEF]" />
                  <span>Configurações Administrativas — Regras da Clínica</span>
                </div>
                <div className="divide-y divide-slate-100 text-xs space-y-3">
                  <div className="pt-2">
                    <div className="font-bold text-[#003366]">
                      Domínio Institucional Exclusivo (@cs.udf.edu.br)
                    </div>
                    <p className="text-[#64748B] mt-0.5">
                      Bloqueio ativo no Frontend, Backend e Firestore Security Rules para qualquer domínio diferente de @cs.udf.edu.br.
                    </p>
                  </div>
                  <div className="pt-3">
                    <div className="font-bold text-[#003366]">
                      RN01 — Limite de Faltas Não Justificadas (Máximo: 2)
                    </div>
                    <p className="text-[#64748B] mt-0.5">
                      Ao registrar a 2ª falta não justificada, o paciente é retirado automaticamente do programa e a vaga é liberada.
                    </p>
                  </div>
                  <div className="pt-3">
                    <div className="font-bold text-[#003366]">
                      RN02 — Triagem Odontológica Obrigatória
                    </div>
                    <p className="text-[#64748B] mt-0.5">
                      Bloqueia o agendamento clínico caso o paciente ainda não tenha passado pela triagem inicial.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-2 text-[#003366] text-xs font-semibold">
                  <ShieldCheck className="w-4 h-4 text-[#00AEEF]" />
                  <span>Segurança da Informação & Conformidade LGPD</span>
                </div>
                <p className="text-xs text-[#64748B] leading-relaxed">
                  O SIGCO opera com trilha de auditoria imutável de todas as ações clínicas e administrativas, assegurando integridade e total conformidade com a LGPD.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* AUDIT LOGS VIEW */}
      {mode === 'audit' && (
        <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200/80 bg-[#F1F5F9]/70 text-[11px] font-semibold text-[#003366]">
                  <th className="py-3.5 px-4">Data / Horário (ISO)</th>
                  <th className="py-3.5 px-4">Usuário / E-mail</th>
                  <th className="py-3.5 px-4">Perfil</th>
                  <th className="py-3.5 px-4">Ação</th>
                  <th className="py-3.5 px-4">Registro Afetado</th>
                  <th className="py-3.5 px-4">Resumo da Operação Realizada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {[...auditLogs]
                  .sort((a, b) => b.timestampIso.localeCompare(a.timestampIso))
                  .map((log) => (
                    <tr key={log.id} className="hover:bg-[#E6F6FF]/35 transition-colors">
                      <td className="py-3.5 px-4 tabular-nums text-[11px] text-[#64748B] whitespace-nowrap">
                        {log.timestampIso.replace('T', ' ').slice(0, 19)}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-[#003366]">{log.userName}</div>
                        <div className="text-[11px] text-[#007BFF]">{log.userEmail}</div>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-[#003366]">{log.userRole}</td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#E6F6FF] text-[#003366] border border-[#00AEEF]/30 text-[11px] font-semibold">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-[#1E293B]">
                        {log.targetRecord}
                      </td>
                      <td className="py-3.5 px-4 text-[#64748B] max-w-md">
                        {log.operationSummary}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: NOVO USUÁRIO (Section 7: Nome, Email, Perfil, Status, Senha inicial, Confirmação, Forçar troca) */}
      {createUserModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#003366]/45 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-[#003366]">
                  Novo Usuário do SIGCO
                </h2>
                <p className="text-xs text-[#64748B]">
                  Cadastre o usuário no Firebase Authentication e Cloud Firestore (@cs.udf.edu.br).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreateUserModalOpen(false)}
                className="cursor-pointer"
              >
                <X className="w-5 h-5 text-[#64748B]" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#003366] mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Nome do usuário"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#003366] mb-1">
                  E-mail Institucional (@cs.udf.edu.br) *
                </label>
                <input
                  type="email"
                  required
                  placeholder="usuario@cs.udf.edu.br"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                />
                <p className="text-[11px] text-[#64748B] mt-1">
                  O acesso é restrito e exclusivo para o domínio institucional @cs.udf.edu.br.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#003366] mb-1">
                    Perfil de Acesso *
                  </label>
                  <select
                    value={createRole}
                    onChange={(e) => setCreateRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                  >
                    <option value="ADMIN">Administrador</option>
                    <option value="RECEPCAO">Recepção</option>
                    <option value="TRIAGEM">Dentista de Triagem</option>
                    <option value="PROFESSOR">Professor / Supervisor</option>
                    <option value="ALUNO">Aluno de Odontologia</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#003366] mb-1">
                    Status da Conta *
                  </label>
                  <select
                    value={createStatus ? 'active' : 'inactive'}
                    onChange={(e) => setCreateStatus(e.target.value === 'active')}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                  >
                    <option value="active">Ativo</option>
                    <option value="inactive">Desativado</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#003366] mb-1">
                    Matrícula / CRO
                  </label>
                  <input
                    type="text"
                    value={createRegistrationCode}
                    onChange={(e) => setCreateRegistrationCode(e.target.value)}
                    placeholder="Ex: MAT-202401 ou CRO-DF-1234"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#003366] mb-1">
                    Especialidade / Setor
                  </label>
                  <select
                    value={createSpecialty}
                    onChange={(e) => setCreateSpecialty(e.target.value)}
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

              {/* Password Section (Section 7) */}
              <div className="p-3.5 bg-[#F8FAFC] border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-[#003366] flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-[#00AEEF]" />
                    <span>Senha Inicial do SIGCO</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCreatePassword((p) => !p)}
                    className="text-[11px] text-[#007BFF] hover:underline cursor-pointer flex items-center gap-1"
                  >
                    {showCreatePassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    <span>{showCreatePassword ? 'Ocultar' : 'Exibir'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-[#1E293B] mb-1">
                      Senha Inicial *
                    </label>
                    <input
                      type={showCreatePassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={createPassword}
                      onChange={(e) => setCreatePassword(e.target.value)}
                      placeholder="Mínimo de 8 caracteres"
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#1E293B] mb-1">
                      Confirmar Senha Inicial *
                    </label>
                    <input
                      type={showCreatePassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={createConfirmPassword}
                      onChange={(e) => setCreateConfirmPassword(e.target.value)}
                      placeholder="Repita a senha"
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white"
                    />
                  </div>
                </div>

                {createPassword && (
                  <div className="text-[11px] space-y-1 pt-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          passwordStrength.hasMinLength ? 'bg-emerald-500' : 'bg-red-400'
                        }`}
                      />
                      <span className={passwordStrength.hasMinLength ? 'text-emerald-700' : 'text-red-700'}>
                        {passwordStrength.hasMinLength
                          ? 'Mínimo de 8 caracteres atingido'
                          : 'Necessário pelo menos 8 caracteres'}
                      </span>
                    </div>
                  </div>
                )}

                <label className="flex items-center gap-2 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={createMustChangePassword}
                    onChange={(e) => setCreateMustChangePassword(e.target.checked)}
                    className="accent-[#00AEEF] w-4 h-4 rounded"
                  />
                  <span className="text-xs text-[#1E293B]">
                    Forçar troca de senha no primeiro acesso
                  </span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCreateUserModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-[#003366] bg-white border border-[#00AEEF] rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#00AEEF] hover:bg-[#007BFF] rounded-xl cursor-pointer disabled:bg-slate-300"
                >
                  {createSubmitting ? 'Cadastrando...' : 'Cadastrar Usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDITAR USUÁRIO */}
      {editUserModalUser && (
        <div className="fixed inset-0 z-50 bg-[#003366]/45 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-[#003366]">Editar Usuário</h2>
                <div className="text-xs text-[#007BFF]">{editUserModalUser.email}</div>
              </div>
              <button
                type="button"
                onClick={() => setEditUserModalUser(null)}
                className="cursor-pointer"
              >
                <X className="w-5 h-5 text-[#64748B]" />
              </button>
            </div>

            <form onSubmit={handleSaveEditUser} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#003366] mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#003366] mb-1">
                    Perfil RBAC *
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                  >
                    <option value="ADMIN">Administrador</option>
                    <option value="RECEPCAO">Recepção</option>
                    <option value="TRIAGEM">Dentista de Triagem</option>
                    <option value="PROFESSOR">Professor / Supervisor</option>
                    <option value="ALUNO">Aluno de Odontologia</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#003366] mb-1">
                    Status *
                  </label>
                  <select
                    value={editStatus ? 'active' : 'inactive'}
                    onChange={(e) => setEditStatus(e.target.value === 'active')}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                  >
                    <option value="active">Ativo</option>
                    <option value="inactive">Desativado</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#003366] mb-1">
                  Matrícula / CRO
                </label>
                <input
                  type="text"
                  value={editRegistrationCode}
                  onChange={(e) => setEditRegistrationCode(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#003366] mb-1">
                  Especialidade / Setor
                </label>
                <select
                  value={editSpecialty}
                  onChange={(e) => setEditSpecialty(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
                >
                  {INITIAL_SPECIALTIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditUserModalUser(null)}
                  className="px-4 py-2 text-xs font-semibold text-[#003366] bg-white border border-[#00AEEF] rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#00AEEF] hover:bg-[#007BFF] rounded-xl cursor-pointer disabled:bg-slate-300"
                >
                  {editSubmitting ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAR REDEFINIÇÃO DE SENHA (Section 11) */}
      {resetPasswordConfirmUser && (
        <div className="fixed inset-0 z-50 bg-[#003366]/45 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 text-[#003366]">
              <div className="w-10 h-10 rounded-full bg-[#E6F6FF] flex items-center justify-center shrink-0">
                <KeyRound className="w-5 h-5 text-[#00AEEF]" />
              </div>
              <div>
                <h3 className="text-base font-bold">Redefinir Senha do Usuário</h3>
                <div className="text-xs text-[#64748B]">{resetPasswordConfirmUser.email}</div>
              </div>
            </div>

            <p className="text-xs text-[#1E293B] leading-relaxed">
              O SIGCO enviará um link oficial de redefinição de senha para a caixa de entrada institucional de <strong>{resetPasswordConfirmUser.name}</strong> ({resetPasswordConfirmUser.email}).
            </p>
            <p className="text-[11px] text-[#64748B]">
              Por motivos de segurança e conformidade, administradores nunca têm acesso à senha em texto puro.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setResetPasswordConfirmUser(null)}
                className="px-4 py-2 text-xs font-semibold text-[#003366] bg-white border border-slate-200 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmResetPassword}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#00AEEF] hover:bg-[#007BFF] rounded-xl cursor-pointer"
              >
                Enviar Link de Redefinição
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAR EXCLUSÃO DE USUÁRIO (Section 13) */}
      {deleteConfirmUser && (
        <div className="fixed inset-0 z-50 bg-[#003366]/45 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 text-red-600">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#003366]">Excluir Usuário</h3>
                <div className="text-xs text-[#64748B]">{deleteConfirmUser.email}</div>
              </div>
            </div>

            <p className="text-xs text-[#1E293B] leading-relaxed">
              <strong>Tem certeza que deseja excluir este usuário?</strong>
            </p>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
              <div className="font-bold">Preservação do Histórico Clínico (RN08):</div>
              <p className="text-[11px]">
                Prontuários eletrônicos, evoluções clínicas, agendamentos e registros de auditoria criados por <strong>{deleteConfirmUser.name}</strong> serão mantidos integralmente no sistema para conformidade e integridade dos dados.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteConfirmUser(null)}
                className="px-4 py-2 text-xs font-semibold text-[#003366] bg-white border border-slate-200 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl cursor-pointer"
              >
                Sim, Excluir Usuário
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
