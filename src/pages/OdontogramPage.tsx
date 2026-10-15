import React, { useState } from 'react';
import { CheckCircle2, ShieldAlert, X } from 'lucide-react';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { db, getFriendlyErrorMessage } from '../services/firebase';
import { useClinicData } from '../hooks/useClinicData';
import { useAuth } from '../auth/AuthContext';
import { Odontogram, ToothCondition } from '../types';
import { INSTITUTION_DOMAIN, sanitizeId, sanitizeString } from '../utils/validation';
import { recordAuditLog } from '../services/clinicService';
import { ContextualHelp } from '../components/ContextualHelp';

const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];
const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38];

const CONDITION_META: Record<
  ToothCondition,
  { label: string; borderClass: string; bgClass: string; textClass: string; shortCode: string }
> = {
  HIGIDO: {
    label: 'Hígido (Normal)',
    borderClass: 'border-slate-200',
    bgClass: 'bg-white',
    textClass: 'text-[#64748B]',
    shortCode: 'HIG',
  },
  CARIE: {
    label: 'Cárie Ativa',
    borderClass: 'border-red-500',
    bgClass: 'bg-red-50',
    textClass: 'text-red-700',
    shortCode: 'CAR',
  },
  RESTAURACAO: {
    label: 'Restauração Presente',
    borderClass: 'border-[#007BFF]',
    bgClass: 'bg-[#E6F6FF]',
    textClass: 'text-[#007BFF]',
    shortCode: 'RES',
  },
  AUSENTE: {
    label: 'Elemento Ausente / Extraído',
    borderClass: 'border-slate-300',
    bgClass: 'bg-[#F1F5F9]',
    textClass: 'text-[#64748B]',
    shortCode: 'AUS',
  },
  EM_TRATAMENTO: {
    label: 'Em Tratamento Clínico',
    borderClass: 'border-[#00AEEF]',
    bgClass: 'bg-[#E6F6FF]',
    textClass: 'text-[#003366]',
    shortCode: 'TRT',
  },
  NECESSIDADE_PROCEDIMENTO: {
    label: 'Necessidade de Procedimento',
    borderClass: 'border-amber-500',
    bgClass: 'bg-amber-50',
    textClass: 'text-amber-800',
    shortCode: 'NEC',
  },
};

export const OdontogramPage: React.FC = () => {
  const { systemUser } = useAuth();
  const { visiblePatients, odontograms } = useClinicData();

  const [selectedPatientId, setSelectedPatientId] = useState<string>(
    visiblePatients[0]?.id || ''
  );
  const [selectedTooth, setSelectedTooth] = useState<number>(36);
  const [condition, setCondition] = useState<ToothCondition>('EM_TRATAMENTO');
  const [surface, setSurface] = useState<string>('Oclusal (O)');
  const [notes, setNotes] = useState<string>('');
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!systemUser) return null;

  if (systemUser.role === 'RECEPCAO') {
    return (
      <div className="bg-white border border-red-200 rounded-2xl p-8 text-center max-w-xl mx-auto shadow-2xs">
        <ShieldAlert className="w-8 h-8 text-red-600 mx-auto mb-2" />
        <div className="text-sm font-bold text-[#003366]">
          RN03: O perfil de Recepção não possui acesso ao Odontograma Clínico.
        </div>
      </div>
    );
  }

  const activePatient =
    visiblePatients.find((p) => p.id === selectedPatientId) || visiblePatients[0];

  if (!activePatient) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-xs text-[#64748B] shadow-2xs">
        Nenhum paciente disponível sob sua responsabilidade (RN06).
      </div>
    );
  }

  const patientTeeth = odontograms.filter((o) => o.patientId === activePatient.id);

  const getToothRecord = (toothNum: number): Odontogram | undefined =>
    patientTeeth.find((o) => o.toothNumber === toothNum);

  const handleSelectTooth = (num: number) => {
    setSelectedTooth(num);
    const existing = getToothRecord(num);
    if (existing) {
      setCondition(existing.condition);
      setSurface(existing.surface);
      setNotes(existing.notes);
    } else {
      setCondition('HIGIDO');
      setSurface('Oclusal (O)');
      setNotes('');
    }
  };

  const handleSaveTooth = async (e: React.FormEvent) => {
    e.preventDefault();
    const existing = getToothRecord(selectedTooth);
    const docId = existing?.id || sanitizeId(`odon_${activePatient.id}_${selectedTooth}`);

    const payload: Omit<Odontogram, 'id'> = {
      patientId: activePatient.id,
      patientName: sanitizeString(activePatient.name, 120),
      toothNumber: selectedTooth,
      condition,
      surface: sanitizeString(surface, 50, 'Oclusal (O)'),
      notes: sanitizeString(notes, 500, ''),
      updatedByEmail: sanitizeString(systemUser.email, 120),
      institutionDomain: INSTITUTION_DOMAIN,
      createdByUid: existing?.createdByUid || systemUser.uid,
    };

    try {
      if (existing) {
        await updateDoc(doc(db, 'odontograms', docId), {
          condition: payload.condition,
          surface: payload.surface,
          notes: payload.notes,
          updatedByEmail: payload.updatedByEmail,
        });
      } else {
        await setDoc(doc(db, 'odontograms', docId), payload);
      }

      await recordAuditLog({
        uid: systemUser.uid,
        userName: systemUser.name,
        userEmail: systemUser.email,
        userRole: systemUser.role,
        action: 'ATUALIZACAO_ODONTOGRAMA',
        targetRecord: `Paciente: ${activePatient.name} (Dente ${selectedTooth})`,
        operationSummary: `${systemUser.role} ${systemUser.name} registrou ${CONDITION_META[condition].label} no dente ${selectedTooth} de ${activePatient.name}.`,
      });
      setFeedback(
        `Elemento dentário ${selectedTooth} atualizado no odontograma de ${activePatient.name}.`
      );
    } catch (error) {
      setFeedback(getFriendlyErrorMessage(error));
    }
  };

  const renderArchRow = (teeth: number[], label: string) => (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold text-[#003366]">{label}</div>
      <div className="grid grid-cols-8 gap-2">
        {teeth.map((num) => {
          const rec = getToothRecord(num);
          const cond = rec?.condition || 'HIGIDO';
          const meta = CONDITION_META[cond];
          const isSelected = selectedTooth === num;
          return (
            <button
              key={num}
              type="button"
              onClick={() => handleSelectTooth(num)}
              className={`p-2 rounded-xl border-2 text-center transition-all cursor-pointer ${
                meta.borderClass
              } ${meta.bgClass} ${
                isSelected ? 'ring-2 ring-[#003366] ring-offset-1 shadow-xs' : ''
              }`}
            >
              <div className="tabular-nums font-bold text-xs text-[#003366]">{num}</div>
              <div className={`tabular-nums text-[10px] font-semibold mt-1 ${meta.textClass}`}>
                {meta.shortCode}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-[#003366] tracking-tight">Odontograma</h1>
            <ContextualHelp
              title="Odontograma (Padrão FDI)"
              description="Use o odontograma para consultar dentes, registrar tratamentos, restaurações, ausências, cáries e necessidades de procedimento."
            />
          </div>
          <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
            Mapeamento gráfico por elemento dentário vinculado ao prontuário do paciente.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold text-[#003366]">Paciente:</label>
          <select
            value={activePatient.id}
            onChange={(e) => setSelectedPatientId(e.target.value)}
            className="px-3.5 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-xl text-[#003366] focus:outline-none focus:ring-2 focus:ring-[#00AEEF]"
          >
            {visiblePatients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-[#E6F6FF] border border-[#00AEEF]/40 text-[#003366] text-xs font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#00AEEF] shrink-0" />
            <span>{feedback}</span>
          </span>
          <button type="button" onClick={() => setFeedback(null)}>
            <X className="w-4 h-4 text-[#64748B]" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Visual Dental Chart */}
        <div className="lg:col-span-8 bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <span className="text-sm font-bold text-[#003366]">
              Arcada Dentária Permanente — {activePatient.name}
            </span>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#64748B]">
              {Object.entries(CONDITION_META).map(([key, m]) => (
                <span key={key} className="flex items-center gap-1">
                  <span className="tabular-nums font-bold text-[#003366]">{m.shortCode}:</span>
                  <span>{m.label}</span>
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {renderArchRow(UPPER_RIGHT, 'Quadrante 1 — Superior Direito (18 a 11)')}
            {renderArchRow(UPPER_LEFT, 'Quadrante 2 — Superior Esquerdo (21 a 28)')}
          </div>

          <div className="border-t border-dashed border-slate-200 my-2" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {renderArchRow(LOWER_RIGHT, 'Quadrante 4 — Inferior Direito (48 a 41)')}
            {renderArchRow(LOWER_LEFT, 'Quadrante 3 — Inferior Esquerdo (31 a 38)')}
          </div>
        </div>

        {/* Tooth Condition Inspector & Form */}
        <div className="lg:col-span-4 bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs">
          <h2 className="text-base font-bold text-[#003366] mb-1">
            Registro do Dente <span className="tabular-nums text-[#00AEEF]">#{selectedTooth}</span>
          </h2>
          <p className="text-xs text-[#64748B] mb-4">
            Clique em qualquer dente ao lado para registrar ou atualizar sua condição clínica.
          </p>

          <form onSubmit={handleSaveTooth} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#003366] mb-1">
                Condição Clínica *
              </label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as ToothCondition)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
              >
                {Object.entries(CONDITION_META).map(([k, meta]) => (
                  <option key={k} value={k}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#003366] mb-1">
                Faces / Superfície Envolvida *
              </label>
              <select
                value={surface}
                onChange={(e) => setSurface(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
              >
                <option value="Oclusal (O)">Oclusal (O) / Incisal</option>
                <option value="Mesio-Oclusal (MO)">Mesio-Oclusal (MO)</option>
                <option value="Disto-Oclusal (DO)">Disto-Oclusal (DO)</option>
                <option value="MOD">Mesio-Ocluso-Distal (MOD)</option>
                <option value="Vestibular (V)">Vestibular (V)</option>
                <option value="Lingual / Palatina">Lingual / Palatina</option>
                <option value="Coroa / Raiz Total">Coroa / Raiz Total</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#003366] mb-1">
                Observações / Conduta no Elemento #{selectedTooth}
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Restauração infiltrada, indicação de acesso endodôntico..."
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-[#F8FAFC]"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 bg-[#00AEEF] hover:bg-[#007BFF] text-white text-xs font-semibold rounded-xl shadow-2xs transition-colors cursor-pointer"
            >
              Salvar Condição do Dente #{selectedTooth}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
