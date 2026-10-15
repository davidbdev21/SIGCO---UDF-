import http from 'http';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';

const INSTITUTIONAL_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@cs\.udf\.edu\.br$/i;
const RESTRICTED_MESSAGE =
  'Acesso restrito. Utilize seu e-mail institucional @cs.udf.edu.br.';
const UNAUTHORIZED_EMAIL_MESSAGE =
  'Este e-mail não está autorizado a acessar o SIGCO.';
const DEACTIVATED_USER_MESSAGE =
  'Seu acesso ao SIGCO está desativado. Entre em contato com o administrador.';

// Synchronized registry of authorized institutional accounts (email -> { active: boolean })
const authorizedAccountsRegistry = new Map<string, { active: boolean }>([
  ['administrador@cs.udf.edu.br', { active: true }],
  ['recepcao@cs.udf.edu.br', { active: true }],
  ['triagem@cs.udf.edu.br', { active: true }],
  ['professor.joao@cs.udf.edu.br', { active: true }],
  ['professora.helena@cs.udf.edu.br', { active: true }],
  ['professor.ricardo@cs.udf.edu.br', { active: true }],
  ['aluno.lucas@cs.udf.edu.br', { active: true }],
  ['aluna.mariana@cs.udf.edu.br', { active: true }],
  ['aluno.gabriel@cs.udf.edu.br', { active: true }],
  ['aluna.beatriz@cs.udf.edu.br', { active: true }],
  ['aluno.rafael@cs.udf.edu.br', { active: true }],
  ['immi@cs.udf.edu.br', { active: true }],
]);

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const PORT = 3000;

  app.use(express.json());

  // 1. Institutional Email Validation Endpoint (Backend Enforcement)
  app.post('/api/auth/validate-domain', (req, res) => {
    const { email } = req.body || {};
    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        valid: false,
        message: RESTRICTED_MESSAGE
      });
    }

    const trimmed = email.trim().toLowerCase();
    const isInstitutional = INSTITUTIONAL_EMAIL_REGEX.test(trimmed);

    if (!isInstitutional) {
      return res.status(403).json({
        valid: false,
        domain: trimmed.split('@')[1] || '',
        message: RESTRICTED_MESSAGE
      });
    }

    return res.status(200).json({
      valid: true,
      email: trimmed,
      domain: 'cs.udf.edu.br',
      message: 'Acesso institucional validado com sucesso.'
    });
  });

  // 1b. Pre-login Authorization Verification (Section 2 & 3 — does not leak sensitive profile info)
  app.post('/api/auth/check-authorized-user', (req, res) => {
    const { email } = req.body || {};
    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        validDomain: false,
        authorized: false,
        active: false,
        message: RESTRICTED_MESSAGE,
      });
    }

    const trimmed = email.trim().toLowerCase();
    const isValidDomain = INSTITUTIONAL_EMAIL_REGEX.test(trimmed);

    if (!isValidDomain) {
      return res.status(403).json({
        validDomain: false,
        authorized: false,
        active: false,
        message: RESTRICTED_MESSAGE,
      });
    }

    const record = authorizedAccountsRegistry.get(trimmed);
    if (!record) {
      return res.status(403).json({
        validDomain: true,
        authorized: false,
        active: false,
        message: UNAUTHORIZED_EMAIL_MESSAGE,
      });
    }

    if (!record.active) {
      return res.status(403).json({
        validDomain: true,
        authorized: true,
        active: false,
        message: DEACTIVATED_USER_MESSAGE,
      });
    }

    return res.status(200).json({
      validDomain: true,
      authorized: true,
      active: true,
      message: 'E-mail autorizado. Informe sua senha exclusiva do SIGCO.',
    });
  });

  // 1c. Sync Authorized Users Directory from Firestore (called when Admin manages users)
  app.post('/api/auth/sync-authorized-users', (req, res) => {
    const { users, deletedEmail } = req.body || {};
    if (typeof deletedEmail === 'string' && deletedEmail.trim()) {
      authorizedAccountsRegistry.delete(deletedEmail.trim().toLowerCase());
    }
    if (Array.isArray(users)) {
      for (const u of users) {
        if (u && typeof u.email === 'string' && INSTITUTIONAL_EMAIL_REGEX.test(u.email.trim())) {
          authorizedAccountsRegistry.set(u.email.trim().toLowerCase(), {
            active: u.active !== false,
          });
        }
      }
    }
    return res.status(200).json({ synced: true, count: authorizedAccountsRegistry.size });
  });

  // 2. RN01 Mandatory Backend Rule — 2 Unjustified Absences Automatic Program Removal
  app.post('/api/attendance/evaluate-absence-rule', (req, res) => {
    const {
      patientId,
      patientName,
      currentStatus,
      currentUnjustifiedAbsences,
      attendanceType,
      currentUsedSlots,
      recordedByEmail,
      recordedByName,
      recordedByRole
    } = req.body || {};

    if (!patientId || !attendanceType) {
      return res.status(400).json({
        error: 'Dados insuficientes para processar presença/falta.'
      });
    }

    const prevAbsences = Number(currentUnjustifiedAbsences || 0);
    const prevSlots = Number(currentUsedSlots || 0);

    let newUnjustifiedAbsences = prevAbsences;
    let newPatientStatus = currentStatus || 'EM_TRATAMENTO';
    let newAppointmentStatus = 'ATENDIDA';
    let triggeredProgramRemoval = false;
    let releasedSlot = false;
    let newUsedSlots = prevSlots;
    let alertMessage: string | null = null;

    if (attendanceType === 'PRESENCA') {
      newAppointmentStatus = 'ATENDIDA';
    } else if (attendanceType === 'FALTA_JUSTIFICADA') {
      newAppointmentStatus = 'FALTOU';
    } else if (attendanceType === 'CANCELAMENTO') {
      newAppointmentStatus = 'CANCELADA';
      releasedSlot = true;
      newUsedSlots = Math.max(0, prevSlots - 1);
    } else if (attendanceType === 'REMARCACAO') {
      newAppointmentStatus = 'REMARCADA';
    } else if (attendanceType === 'FALTA_NAO_JUSTIFICADA') {
      newAppointmentStatus = 'FALTOU';
      newUnjustifiedAbsences = prevAbsences + 1;

      // RN01: Accumulating 2 unjustified absences automatically removes patient from treatment program
      if (newUnjustifiedAbsences >= 2) {
        triggeredProgramRemoval = true;
        newPatientStatus = 'CANCELADO';
        releasedSlot = true;
        newUsedSlots = Math.max(0, prevSlots - 1);
        alertMessage = `RN01 APLICADA: O paciente ${patientName} acumulou ${newUnjustifiedAbsences} faltas não justificadas. Status alterado automaticamente para CANCELADO (retirado do programa de atendimento) e vaga clínica liberada.`;
      } else {
        alertMessage = `Atenção: O paciente ${patientName} registrou 1ª falta não justificada. Na 2ª falta não justificada será desligado automaticamente do programa (RN01).`;
      }
    }

    const auditSummary = triggeredProgramRemoval
      ? `${recordedByRole || 'Profissional'} ${recordedByName || recordedByEmail} registrou a ${newUnjustifiedAbsences}ª falta não justificada de ${patientName}. RN01 executada: paciente retirado automaticamente do programa e vaga liberada.`
      : `${recordedByRole || 'Profissional'} ${recordedByName || recordedByEmail} registrou ${attendanceType} para o paciente ${patientName}.`;

    return res.status(200).json({
      patientId,
      newUnjustifiedAbsences,
      newPatientStatus,
      newAppointmentStatus,
      triggeredProgramRemoval,
      releasedSlot,
      newUsedSlots,
      alertMessage,
      auditSummary
    });
  });

  // 3. RN02, RN04, RN05 Backend Validation for Scheduling & Conflicts
  app.post('/api/appointments/validate-schedule', (req, res) => {
    const {
      patient,
      availability,
      date,
      startTime,
      endTime,
      studentEmail,
      existingAppointments,
      excludeAppointmentId
    } = req.body || {};

    if (!patient) {
      return res.status(400).json({ valid: false, message: 'Paciente não informado.' });
    }

    // RN02: Patient must pass initial screening before treatment scheduling
    if (!patient.triaged || patient.status === 'LISTA_ESPERA' || patient.status === 'AGUARDANDO_TRIAGEM') {
      return res.status(422).json({
        valid: false,
        code: 'RN02_TRIAGEM_OBRIGATORIA',
        message: 'RN02: O paciente precisa passar pela triagem odontológica inicial antes de ser agendado para tratamento.'
      });
    }

    if (patient.status === 'CANCELADO' || patient.status === 'EXCLUIDO') {
      return res.status(422).json({
        valid: false,
        code: 'RN01_PACIENTE_INATIVO',
        message: 'Este paciente encontra-se desligado/cancelado do programa de atendimento e não pode ser agendado.'
      });
    }

    // RN04: Respect professor availability and clinic slot limits
    if (!availability || availability.status !== 'ATIVA') {
      return res.status(422).json({
        valid: false,
        code: 'RN04_DISPONIBILIDADE_INATIVA',
        message: 'RN04: A disponibilidade selecionada do professor não está ativa.'
      });
    }

    if (!excludeAppointmentId && Number(availability.usedSlots) >= Number(availability.totalSlots)) {
      return res.status(422).json({
        valid: false,
        code: 'RN04_LIMITE_VAGAS',
        message: 'RN04: Limite de vagas da clínica/professor atingido para este horário.'
      });
    }

    // RN05: Prevent time conflicts for patient, student, or professor
    const activeStatuses = ['AGENDADA', 'CONFIRMADA', 'EM_ATENDIMENTO'];
    const conflicts = (Array.isArray(existingAppointments) ? existingAppointments : []).filter((apt: any) => {
      if (excludeAppointmentId && apt.id === excludeAppointmentId) return false;
      if (!activeStatuses.includes(apt.status)) return false;
      if (apt.date !== date) return false;

      const overlaps = startTime < apt.endTime && endTime > apt.startTime;
      if (!overlaps) return false;

      const samePatient = apt.patientId === patient.id;
      const sameStudent = apt.studentEmail === studentEmail;
      return samePatient || sameStudent;
    });

    if (conflicts.length > 0) {
      const conflict = conflicts[0];
      return res.status(409).json({
        valid: false,
        code: 'RN05_CONFLITO_HORARIO',
        message: `RN05: Conflito de horário detectado em ${date} (${conflict.startTime}–${conflict.endTime}) envolvendo o paciente ou o aluno responsável.`
      });
    }

    return res.status(200).json({
      valid: true,
      message: 'Validação de agendamento concluída sem conflitos.'
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const isHmrDisabled = process.env.DISABLE_HMR === 'true';
    const isHttps = process.env.APP_URL?.startsWith('https://') || Boolean(process.env.K_SERVICE);
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: isHmrDisabled
          ? false
          : {
              server: httpServer,
              clientPort: isHttps ? 443 : undefined,
            },
        watch: isHmrDisabled ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`SIGCO Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
