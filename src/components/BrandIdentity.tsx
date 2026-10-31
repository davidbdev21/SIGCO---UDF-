import React from 'react';
import { Patient, PriorityLevel, WaitingListStatus } from '../types';
import { PATIENT_STATUS_LABELS, PRIORITY_LABELS, WAITING_LIST_STATUS_LABELS } from '../utils/validation';

interface UdfLogoProps {
  variant?: 'default' | 'light';
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
  className?: string;
}

/**
 * Official UDF Institutional Logo (Cyan 5-pointed star + UDF wordmark in #003366 or #FFFFFF on dark backgrounds)
 * Strictly preserves the official geometry, star proportions, and colors (#00AEEF & #003366).
 */
export const UdfOfficialLogo: React.FC<UdfLogoProps> = ({
  variant = 'default',
  size = 'md',
  showSubtitle = false,
  className = '',
}) => {
  const starSize = size === 'sm' ? 28 : size === 'lg' ? 48 : 36;
  const textSizeClass =
    size === 'sm' ? 'text-xl' : size === 'lg' ? 'text-3xl' : 'text-2xl';
  const textColor = variant === 'light' ? '#FFFFFF' : '#003366';

  return (
    <div
      className={`inline-flex items-center gap-3 select-none shrink-0 ${className}`}
      aria-label="Logo Oficial UDF"
    >
      <svg
        width={starSize}
        height={starSize}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        {/* Official UDF 5-Pointed Continuous Ribbon Star in #00AEEF */}
        <path
          d="M11 26.5L54.5 22.5L18.5 54L32.5 8.5L47.5 52.5L11 26.5Z"
          stroke="#00AEEF"
          strokeWidth="4.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="leading-tight">
        <span
          style={{ color: textColor }}
          className={`font-bold tracking-tight leading-none block ${textSizeClass}`}
        >
          UDF
        </span>
        {showSubtitle && (
          <span
            style={{ color: variant === 'light' ? '#E6F6FF' : '#003366' }}
            className="text-xs sm:text-sm font-medium tracking-normal block mt-0.5"
          >
            Centro Universitário
          </span>
        )}
      </div>
    </div>
  );
};

interface SigcoLogoProps {
  variant?: 'default' | 'light';
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
  className?: string;
}

/**
 * Official SIGCO Dental Emblem + Wordmark (SIG in #003366 + CO in #00AEEF)
 */
export const SigcoOfficialLogo: React.FC<SigcoLogoProps> = ({
  variant = 'default',
  size = 'md',
  showSubtitle = true,
  className = '',
}) => {
  const iconSize = size === 'sm' ? 28 : size === 'lg' ? 46 : 36;
  const titleClass =
    size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-3xl' : 'text-xl';
  const subtitleClass =
    size === 'sm' ? 'text-[10px]' : size === 'lg' ? 'text-xs' : 'text-[11px]';
  const primaryColor = variant === 'light' ? '#FFFFFF' : '#003366';
  const subtitleColor = variant === 'light' ? '#E6F6FF' : '#003366';

  return (
    <div className={`inline-flex items-center gap-2.5 select-none shrink-0 ${className}`}>
      {/* Official SIGCO Tooth + Check Swoosh Emblem */}
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        {/* Left Crown/Root in #003366 (or #E6F6FF on dark) */}
        <path
          d="M32 15C26 9.5 15 11.5 14 23C13 33 18.5 41 21 48C22.5 52 25.5 51 27.5 45C29 40.5 31 40.5 32.5 44"
          stroke={primaryColor}
          strokeWidth="4.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Right Crown & Check Accent in #00AEEF */}
        <path
          d="M32 15C38 9.5 49 11.5 50 23C50.8 31 47 38 43.5 44.5"
          stroke="#00AEEF"
          strokeWidth="4.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Checkmark Inside/Below Tooth */}
        <path
          d="M27 28.5L32.5 34L44 21.5"
          stroke="#00AEEF"
          strokeWidth="4.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Bottom Protective Smile Swoosh */}
        <path
          d="M17 51.5C25 57.5 39.5 57.5 49 48.5"
          stroke={primaryColor}
          strokeWidth="4.2"
          strokeLinecap="round"
        />
        <path
          d="M44 48L50 47.5L49.5 53.5"
          stroke="#00AEEF"
          strokeWidth="3.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <div className="leading-tight">
        <div className={`font-bold tracking-tight leading-none ${titleClass}`}>
          <span style={{ color: primaryColor }}>SIG</span>
          <span style={{ color: '#00AEEF' }}>CO</span>
        </div>
        {showSubtitle && (
          <div
            style={{ color: subtitleColor }}
            className={`font-medium leading-tight mt-0.5 ${subtitleClass}`}
          >
            Sistema de Gestão de
            <br />
            Clínica Odontológica
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Combined Institutional Header Lockup: [LOGO UDF] | [LOGO SIGCO]
 */
export const InstitutionalLockup: React.FC<{
  variant?: 'default' | 'light';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}> = ({ variant = 'default', size = 'md', className = '' }) => {
  const dividerColor = variant === 'light' ? 'bg-white/25' : 'bg-[#003366]/25';
  const dividerHeight = size === 'sm' ? 'h-7' : size === 'lg' ? 'h-12' : 'h-9';

  return (
    <div className={`inline-flex items-center gap-3.5 ${className}`}>
      <UdfOfficialLogo variant={variant} size={size} />
      <div className={`w-px ${dividerHeight} ${dividerColor}`} aria-hidden="true" />
      <SigcoOfficialLogo variant={variant} size={size} />
    </div>
  );
};

/**
 * Discreet Institutional Status Badge (Section 10)
 */
export const PatientStatusBadge: React.FC<{ status: Patient['status'] }> = ({ status }) => {
  const label = PATIENT_STATUS_LABELS[status] || status;

  const styleMap: Record<Patient['status'], string> = {
    LISTA_ESPERA: 'bg-[#E6F6FF] text-[#003366] border-[#00AEEF]/30',
    AGUARDANDO_TRIAGEM: 'bg-[#E6F6FF] text-[#007BFF] border-[#007BFF]/30',
    TRIADO: 'bg-sky-50 text-[#003366] border-sky-200',
    AGUARDANDO_VAGA: 'bg-amber-50 text-amber-800 border-amber-200',
    EM_TRATAMENTO: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    ENCAMINHADO: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    CONCLUIDO: 'bg-teal-50 text-teal-800 border-teal-200',
    ALTA: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    CANCELADO: 'bg-red-50 text-red-700 border-red-200',
    EXCLUIDO: 'bg-slate-100 text-slate-600 border-slate-300',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border whitespace-nowrap ${styleMap[status]}`}
    >
      {label}
    </span>
  );
};

/**
 * Discreet Institutional Priority Badge
 */
export const PriorityBadge: React.FC<{ priority: PriorityLevel }> = ({ priority }) => {
  const label = PRIORITY_LABELS[priority];
  const styleMap: Record<PriorityLevel, string> = {
    URGENTE: 'bg-red-50 text-red-700 border-red-200 font-semibold',
    ALTA: 'bg-orange-50 text-orange-700 border-orange-200 font-medium',
    MEDIA: 'bg-amber-50 text-amber-800 border-amber-200 font-medium',
    BAIXA: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-medium',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] border whitespace-nowrap ${styleMap[priority]}`}
    >
      {label}
    </span>
  );
};

/**
 * Discreet Institutional Waiting List Status Badge
 */
export const WaitingListStatusBadge: React.FC<{ status: WaitingListStatus }> = ({ status }) => {
  const label = WAITING_LIST_STATUS_LABELS[status] || status;
  const styleMap: Record<WaitingListStatus, string> = {
    AGUARDANDO_TRIAGEM: 'bg-[#E6F6FF] text-[#007BFF] border-[#007BFF]/30',
    AGUARDANDO_VAGA: 'bg-amber-50 text-amber-800 border-amber-200',
    PRESENTE: 'bg-blue-50 text-[#003366] border-[#00AEEF]/50 font-semibold',
    CHAMADO: 'bg-purple-50 text-purple-800 border-purple-200 font-semibold',
    EM_ATENDIMENTO: 'bg-emerald-50 text-emerald-800 border-emerald-300 font-medium',
    ATENDIDO: 'bg-teal-50 text-teal-800 border-teal-200',
    NAO_COMPARECEU: 'bg-red-50 text-red-700 border-red-200',
    REMOVIDO: 'bg-slate-100 text-slate-600 border-slate-300',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] border whitespace-nowrap ${
        styleMap[status] || 'bg-slate-50 text-slate-700 border-slate-200'
      }`}
    >
      {label}
    </span>
  );
};

