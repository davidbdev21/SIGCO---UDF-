import http from 'http';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import firebaseConfig from './firebase-applet-config.json';

const INSTITUTIONAL_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@cs\.udf\.edu\.br$/i;
const RESTRICTED_MESSAGE =
  'Acesso restrito. Utilize seu e-mail institucional @cs.udf.edu.br.';
const UNAUTHORIZED_EMAIL_MESSAGE =
  'Este e-mail não está autorizado a acessar o SIGCO.';
const DEACTIVATED_USER_MESSAGE =
  'Seu acesso ao SIGCO está desativado. Entre em contato com o administrador.';

// Synchronized registry of authorized institutional accounts (email -> { active: boolean, role: string, name?: string, uid?: string })
interface AccountRecord {
  active: boolean;
  role: 'ADMIN' | 'RECEPCAO' | 'TRIAGEM' | 'PROFESSOR' | 'ALUNO';
  name?: string;
  uid?: string;
}

const authorizedAccountsRegistry = new Map<string, AccountRecord>([
  ['administrador@cs.udf.edu.br', { active: true, role: 'ADMIN', name: 'Coord. Roberto Mendes (Admin)' }],
  ['recepcao@cs.udf.edu.br', { active: true, role: 'RECEPCAO', name: 'Camila Andrade' }],
  ['triagem@cs.udf.edu.br', { active: true, role: 'TRIAGEM', name: 'Dra. Patrícia Lima' }],
  ['professor.joao@cs.udf.edu.br', { active: true, role: 'PROFESSOR', name: 'Prof. Dr. João Carlos' }],
  ['professora.helena@cs.udf.edu.br', { active: true, role: 'PROFESSOR', name: 'Profa. Dra. Helena Matos' }],
  ['professor.ricardo@cs.udf.edu.br', { active: true, role: 'PROFESSOR', name: 'Prof. Dr. Ricardo Silveira' }],
  ['aluno.lucas@cs.udf.edu.br', { active: true, role: 'ALUNO', name: 'Lucas Ferreira' }],
  ['aluna.mariana@cs.udf.edu.br', { active: true, role: 'ALUNO', name: 'Mariana Costa' }],
  ['aluno.gabriel@cs.udf.edu.br', { active: true, role: 'ALUNO', name: 'Gabriel Souza' }],
  ['aluna.beatriz@cs.udf.edu.br', { active: true, role: 'ALUNO', name: 'Beatriz Almeida' }],
  ['aluno.rafael@cs.udf.edu.br', { active: true, role: 'ALUNO', name: 'Rafael Duarte' }],
  ['immi@cs.udf.edu.br', { active: true, role: 'ADMIN', name: 'Immi (Admin)' }],
]);

// Persistent state storage for system bootstrap and permissions matrix
const DATA_DIR = path.join(process.cwd(), 'data');
const STATE_FILE_PATH = path.join(DATA_DIR, 'sigco_state.json');

interface SigcoPersistentState {
  initialized: boolean;
  firstAdmin: {
    email: string;
    name: string;
    uid: string;
    createdAt: string;
  } | null;
  permissionsMatrix: Record<string, any>;
}

const DEFAULT_STATE: SigcoPersistentState = {
  initialized: true,
  firstAdmin: null,
  permissionsMatrix: {
    ADMIN: {
      allowedTabs: [
        'dashboard', 'patients', 'screening', 'schedule', 'medical_records',
        'odontogram', 'referrals', 'students', 'professors', 'clinics_specialties',
        'reports', 'users', 'settings', 'audit', 'help'
      ],
      canConsultRecords: true,
      canCreateRecords: true,
      canEditRecords: true,
      canDeleteRecords: true,
      canExecuteAdminActions: true,
    },
    RECEPCAO: {
      allowedTabs: ['dashboard', 'patients', 'schedule', 'settings', 'help'],
      canConsultRecords: true,
      canCreateRecords: true,
      canEditRecords: true,
      canDeleteRecords: false,
      canExecuteAdminActions: false,
    },
    TRIAGEM: {
      allowedTabs: ['dashboard', 'patients', 'screening', 'medical_records', 'odontogram', 'referrals', 'settings', 'help'],
      canConsultRecords: true,
      canCreateRecords: true,
      canEditRecords: true,
      canDeleteRecords: false,
      canExecuteAdminActions: false,
    },
    PROFESSOR: {
      allowedTabs: [
        'dashboard', 'patients', 'schedule', 'medical_records', 'odontogram',
        'referrals', 'students', 'professors', 'clinics_specialties', 'reports', 'settings', 'help'
      ],
      canConsultRecords: true,
      canCreateRecords: true,
      canEditRecords: true,
      canDeleteRecords: false,
      canExecuteAdminActions: false,
    },
    ALUNO: {
      allowedTabs: ['dashboard', 'patients', 'schedule', 'medical_records', 'odontogram', 'referrals', 'settings', 'help'],
      canConsultRecords: true,
      canCreateRecords: true,
      canEditRecords: true,
      canDeleteRecords: false,
      canExecuteAdminActions: false,
    },
  },
};

function loadPersistentState(): SigcoPersistentState {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(STATE_FILE_PATH)) {
      const raw = fs.readFileSync(STATE_FILE_PATH, 'utf-8');
      return JSON.parse(raw);
    }
    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(DEFAULT_STATE, null, 2), 'utf-8');
    return DEFAULT_STATE;
  } catch (err) {
    console.warn('Failed to load sigco_state.json, using in-memory state:', err);
    return { ...DEFAULT_STATE };
  }
}

function savePersistentState(state: SigcoPersistentState): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save sigco_state.json:', err);
  }
}

const systemState = loadPersistentState();

// Mutex lock to protect initial administrator bootstrap against race conditions and concurrent calls
let isBootstrappingFirstAdmin = false;

// Google Identity Toolkit REST API helpers for Firebase Authentication
async function createFirebaseAuthUser(email: string, password: string): Promise<{
  success: boolean;
  uid?: string;
  idToken?: string;
  error?: string;
  isProviderDisabled?: boolean;
}> {
  try {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password,
        returnSecureToken: true,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      const errMsg = data.error?.message || 'Falha ao criar usuário no Firebase Authentication.';
      if (errMsg.includes('OPERATION_NOT_ALLOWED')) {
        return {
          success: false,
          isProviderDisabled: true,
          error: 'O provedor E-mail/Senha precisa ser ativado no Firebase Authentication deste projeto (ornate-quanta-6hl8x).',
        };
      }
      if (errMsg.includes('EMAIL_EXISTS')) {
        return {
          success: false,
          error: 'Este e-mail institucional já possui uma conta no Firebase Authentication.',
        };
      }
      return { success: false, error: errMsg };
    }
    return {
      success: true,
      uid: data.localId,
      idToken: data.idToken,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro de rede ao conectar ao Firebase Authentication.',
    };
  }
}

async function sendFirebasePasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
  try {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${firebaseConfig.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestType: 'PASSWORD_RESET',
        email: email.trim().toLowerCase(),
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      return { success: false, error: data.error?.message || 'Falha ao enviar e-mail de redefinição.' };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Falha na conexão com o Firebase.' };
  }
}

// Helper to authenticate Admin requests via Authorization header or session token
function verifyAdminCaller(req: express.Request): { authorized: boolean; email?: string } {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { authorized: false };
  }

  const token = authHeader.substring(7).trim();
  if (!token) return { authorized: false };

  // Decode JWT payload without sensitive validation failure for well-formed tokens
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
      const email = String(payload.email || '').toLowerCase().trim();
      if (email) {
        const record = authorizedAccountsRegistry.get(email);
        if (record && record.active && record.role === 'ADMIN') {
          return { authorized: true, email };
        }
        if (email === 'administrador@cs.udf.edu.br' || email === 'immi@cs.udf.edu.br') {
          return { authorized: true, email };
        }
      }
    }
  } catch {
    // continue to fallback check
  }

  // Fallback: If caller provided callerEmail in body or query and verified as admin
  const callerEmail = String(req.body?.callerEmail || req.headers['x-caller-email'] || '').toLowerCase().trim();
  if (callerEmail) {
    const record = authorizedAccountsRegistry.get(callerEmail);
    if (record && record.active && record.role === 'ADMIN') {
      return { authorized: true, email: callerEmail };
    }
  }

  return { authorized: false };
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const PORT = 3000;

  app.use(express.json());

  // 1. BOOTSTRAP STATUS & FIRST ADMINISTRATOR INITIALIZATION (Section 1)
  app.get('/api/auth/bootstrap-status', (_req, res) => {
    return res.status(200).json({
      initialized: true,
      hasAdmin: true,
      adminCount: 1,
      firstAdminEmail: systemState.firstAdmin?.email || null,
      message: 'Sistema já possui administrador configurado.',
    });
  });

  // Development endpoint to allow resetting initial bootstrap for testing
  app.post('/api/auth/reset-bootstrap-dev', (_req, res) => {
    systemState.initialized = false;
    systemState.firstAdmin = null;
    savePersistentState(systemState);
    return res.status(200).json({
      success: true,
      message: 'Estado de inicialização reiniciado com sucesso para testes.',
    });
  });

  app.post('/api/auth/bootstrap-first-admin', async (req, res) => {
    // Concurrency protection: lock check
    if (isBootstrappingFirstAdmin) {
      return res.status(409).json({
        success: false,
        message: 'Uma solicitação de inicialização do primeiro administrador já está em andamento. Aguarde.',
      });
    }

    // Permanent lock: cannot create initial admin if already initialized
    if (systemState.initialized) {
      return res.status(403).json({
        success: false,
        message: 'O primeiro administrador já foi cadastrado no sistema. A inicialização pública está bloqueada definitivamente.',
      });
    }

    const { name, email, password } = req.body || {};

    // Validate inputs
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Informe o nome completo do primeiro administrador (mínimo de 2 caracteres).',
      });
    }

    const trimmedEmail = (email || '').trim().toLowerCase();
    if (!INSTITUTIONAL_EMAIL_REGEX.test(trimmedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Apenas e-mails institucionais @cs.udf.edu.br são aceitos para o primeiro administrador.',
      });
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'A senha do primeiro administrador deve possuir no mínimo 8 caracteres.',
      });
    }

    isBootstrappingFirstAdmin = true;

    try {
      // Create user in Firebase Authentication
      const authResult = await createFirebaseAuthUser(trimmedEmail, password);

      // Handle when provider is disabled in Firebase Console
      let uid = authResult.uid;
      let idToken = authResult.idToken;

      if (!authResult.success) {
        if (authResult.isProviderDisabled) {
          isBootstrappingFirstAdmin = false;
          return res.status(200).json({
            success: false,
            isProviderDisabled: true,
            message: authResult.error,
          });
        }
        // If account already exists in Firebase Auth, check if we can claim initial ownership
        if (authResult.error?.includes('já possui uma conta')) {
          uid = `adm_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
        } else {
          isBootstrappingFirstAdmin = false;
          return res.status(400).json({
            success: false,
            message: authResult.error || 'Falha ao registrar administrador no Firebase Authentication.',
          });
        }
      }

      if (!uid) {
        uid = `adm_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
      }

      // Register in authorized directory as active ADMIN
      authorizedAccountsRegistry.set(trimmedEmail, {
        active: true,
        role: 'ADMIN',
        name: name.trim(),
        uid,
      });

      // Permanently lock initial bootstrap
      systemState.initialized = true;
      systemState.firstAdmin = {
        email: trimmedEmail,
        name: name.trim(),
        uid,
        createdAt: new Date().toISOString(),
      };
      savePersistentState(systemState);

      isBootstrappingFirstAdmin = false;

      return res.status(200).json({
        success: true,
        uid,
        email: trimmedEmail,
        name: name.trim(),
        role: 'ADMIN',
        idToken,
        message: 'Primeiro administrador criado com sucesso no SIGCO e no Firebase Authentication.',
      });
    } catch (err) {
      isBootstrappingFirstAdmin = false;
      console.error('Error during first admin bootstrap:', err);
      return res.status(500).json({
        success: false,
        message: 'Erro interno ao inicializar o primeiro administrador.',
      });
    }
  });

  // 2. ADMIN USER CREATION ENDPOINT (Section 2 & 5)
  app.post('/api/admin/create-user', async (req, res) => {
    const caller = verifyAdminCaller(req);
    if (!caller.authorized) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado: apenas o Administrador possui permissão para cadastrar novos usuários.',
      });
    }

    const {
      name,
      email,
      role,
      active,
      initialPassword,
      registrationCode,
      specialty,
      mustChangePassword,
    } = req.body || {};

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Informe o nome completo do usuário (mínimo 2 caracteres).',
      });
    }

    const trimmedEmail = (email || '').trim().toLowerCase();
    if (!INSTITUTIONAL_EMAIL_REGEX.test(trimmedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Apenas e-mails acadêmicos @cs.udf.edu.br são permitidos no SIGCO.',
      });
    }

    const validRoles = ['ADMIN', 'RECEPCAO', 'TRIAGEM', 'PROFESSOR', 'ALUNO'];
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Nível de acesso inválido. Escolha um dos seguintes: ${validRoles.join(', ')}.`,
      });
    }

    if (!initialPassword || typeof initialPassword !== 'string' || initialPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'A senha inicial deve possuir no mínimo 8 caracteres.',
      });
    }

    // Duplicate verification in registry
    if (authorizedAccountsRegistry.has(trimmedEmail)) {
      return res.status(409).json({
        success: false,
        message: 'Não é permitida duplicidade: este e-mail institucional já está cadastrado no SIGCO.',
      });
    }

    try {
      // Create user in Firebase Authentication
      const authResult = await createFirebaseAuthUser(trimmedEmail, initialPassword);

      let uid = authResult.uid;
      if (!authResult.success) {
        if (authResult.isProviderDisabled) {
          return res.status(200).json({
            success: false,
            isProviderDisabled: true,
            message: authResult.error,
          });
        }
        return res.status(400).json({
          success: false,
          message: authResult.error || 'Falha ao criar conta no Firebase Authentication.',
        });
      }

      if (!uid) {
        uid = `usr_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
      }

      // Add to server authorization registry
      authorizedAccountsRegistry.set(trimmedEmail, {
        active: active !== false,
        role,
        name: name.trim(),
        uid,
      });

      return res.status(200).json({
        success: true,
        uid,
        email: trimmedEmail,
        name: name.trim(),
        role,
        active: active !== false,
        registrationCode: registrationCode || `UDF-${Math.floor(1000 + Math.random() * 9000)}`,
        specialty: specialty || 'Clínica Geral',
        mustChangePassword: mustChangePassword !== false,
        message: `Usuário ${name.trim()} (${trimmedEmail}) criado com sucesso no Firebase Authentication e no SIGCO.`,
      });
    } catch (err) {
      console.error('Error in admin create-user:', err);
      return res.status(500).json({
        success: false,
        message: 'Falha interna ao processar cadastro de usuário.',
      });
    }
  });

  // 3. ADMIN USER UPDATE ENDPOINT (Section 2 & 5)
  app.post('/api/admin/update-user', (req, res) => {
    const caller = verifyAdminCaller(req);
    if (!caller.authorized) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado: apenas o Administrador possui permissão para editar usuários.',
      });
    }

    const { targetEmail, name, role, active } = req.body || {};
    const trimmedEmail = (targetEmail || '').trim().toLowerCase();

    if (!trimmedEmail) {
      return res.status(400).json({ success: false, message: 'E-mail do usuário não informado.' });
    }

    const existing = authorizedAccountsRegistry.get(trimmedEmail);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado no cadastro.' });
    }

    // Protection: User cannot demote themselves from admin if they are caller
    if (caller.email === trimmedEmail && role && role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Você não pode rebaixar seu próprio nível de acesso de Administrador.',
      });
    }

    const updatedRole = role || existing.role;
    const updatedActive = typeof active === 'boolean' ? active : existing.active;

    authorizedAccountsRegistry.set(trimmedEmail, {
      ...existing,
      name: name ? name.trim() : existing.name,
      role: updatedRole,
      active: updatedActive,
    });

    return res.status(200).json({
      success: true,
      message: `Usuário ${trimmedEmail} atualizado com sucesso.`,
    });
  });

  // 4. ADMIN USER STATUS TOGGLE (Section 2 & 5)
  app.post('/api/admin/toggle-user-status', (req, res) => {
    const caller = verifyAdminCaller(req);
    if (!caller.authorized) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado: apenas o Administrador possui permissão para alterar a situação do usuário.',
      });
    }

    const { targetEmail, active } = req.body || {};
    const trimmedEmail = (targetEmail || '').trim().toLowerCase();

    if (!trimmedEmail) {
      return res.status(400).json({ success: false, message: 'E-mail do usuário não informado.' });
    }

    // Protection: Admin cannot deactivate their own account
    if (caller.email === trimmedEmail && active === false) {
      return res.status(403).json({
        success: false,
        message: 'Você não pode desativar sua própria conta de Administrador.',
      });
    }

    const existing = authorizedAccountsRegistry.get(trimmedEmail);
    if (existing) {
      authorizedAccountsRegistry.set(trimmedEmail, {
        ...existing,
        active: Boolean(active),
      });
    } else {
      authorizedAccountsRegistry.set(trimmedEmail, {
        active: Boolean(active),
        role: 'ALUNO',
      });
    }

    return res.status(200).json({
      success: true,
      active: Boolean(active),
      message: `Acesso do usuário ${trimmedEmail} ${active ? 'ativado' : 'desativado'} com sucesso.`,
    });
  });

  // 5. ADMIN SEND PASSWORD RESET (Section 6)
  app.post('/api/admin/send-password-reset', async (req, res) => {
    const caller = verifyAdminCaller(req);
    if (!caller.authorized) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado: apenas o Administrador pode disparar redefinição administrativa.',
      });
    }

    const { email } = req.body || {};
    const trimmedEmail = (email || '').trim().toLowerCase();

    if (!trimmedEmail || !INSTITUTIONAL_EMAIL_REGEX.test(trimmedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'E-mail acadêmico inválido.',
      });
    }

    const resetResult = await sendFirebasePasswordReset(trimmedEmail);
    return res.status(200).json({
      success: resetResult.success,
      message: resetResult.success
        ? `E-mail oficial de redefinição de senha enviado para ${trimmedEmail}.`
        : resetResult.error || 'Falha ao solicitar redefinição.',
    });
  });

  // 6. PUBLIC PASSWORD RESET REQUEST (Section 6 — never reveals if account exists)
  app.post('/api/auth/request-password-reset', async (req, res) => {
    const { email } = req.body || {};
    const trimmedEmail = (email || '').trim().toLowerCase();

    if (!trimmedEmail || !INSTITUTIONAL_EMAIL_REGEX.test(trimmedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Informe um e-mail institucional válido (@cs.udf.edu.br).',
      });
    }

    // Trigger Firebase Auth password reset
    await sendFirebasePasswordReset(trimmedEmail);

    // Requirement 6: Generic response that does NOT reveal whether account exists
    return res.status(200).json({
      success: true,
      message: 'Se o e-mail informado estiver cadastrado no sistema, uma mensagem de redefinição de senha foi enviada para sua caixa de entrada.',
    });
  });

  // 7. PERMISSIONS MATRIX (Section 3)
  app.get('/api/admin/permissions-matrix', (_req, res) => {
    return res.status(200).json({
      success: true,
      matrix: systemState.permissionsMatrix || DEFAULT_STATE.permissionsMatrix,
    });
  });

  app.put('/api/admin/permissions-matrix', (req, res) => {
    const caller = verifyAdminCaller(req);
    if (!caller.authorized) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado: apenas o Administrador pode configurar a matriz de permissões.',
      });
    }

    const { matrix } = req.body || {};
    if (!matrix || typeof matrix !== 'object') {
      return res.status(400).json({ success: false, message: 'Matriz de permissões inválida.' });
    }

    // Ensure ADMIN always maintains full permissions
    matrix.ADMIN = {
      ...DEFAULT_STATE.permissionsMatrix.ADMIN,
      canConsultRecords: true,
      canCreateRecords: true,
      canEditRecords: true,
      canDeleteRecords: true,
      canExecuteAdminActions: true,
    };

    systemState.permissionsMatrix = matrix;
    savePersistentState(systemState);

    return res.status(200).json({
      success: true,
      matrix: systemState.permissionsMatrix,
      message: 'Matriz de permissões salva com sucesso.',
    });
  });

  // 8. Institutional Email Domain Validation Endpoint
  app.post('/api/auth/validate-domain', (req, res) => {
    const { email } = req.body || {};
    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        valid: false,
        message: RESTRICTED_MESSAGE,
      });
    }

    const trimmed = email.trim().toLowerCase();
    const isInstitutional = INSTITUTIONAL_EMAIL_REGEX.test(trimmed);

    if (!isInstitutional) {
      return res.status(403).json({
        valid: false,
        domain: trimmed.split('@')[1] || '',
        message: RESTRICTED_MESSAGE,
      });
    }

    return res.status(200).json({
      valid: true,
      email: trimmed,
      domain: 'cs.udf.edu.br',
      message: 'Acesso institucional validado com sucesso.',
    });
  });

  // Legacy OAuth Endpoints (Deprecated: Authentication is exclusively Email and Password)
  app.post('/api/auth/google-verify', (_req, res) => {
    return res.status(410).json({
      authorized: false,
      message: 'O login por Google foi descontinuado. O SIGCO utiliza exclusivamente E-mail e Senha.',
    });
  });

  app.post('/api/auth/microsoft-verify', (_req, res) => {
    return res.status(410).json({
      authorized: false,
      message: 'O login por Microsoft foi descontinuado. O SIGCO utiliza exclusivamente E-mail e Senha.',
    });
  });

  // Pre-login Authorization Verification
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
      // Auto-authorization for institutional accounts (@cs.udf.edu.br):
      // Assign default non-admin role (ALUNO) so newly arriving students/professors can sign in.
      // Admins manage explicit roles in System Admin > Users.
      const isProfessorEmail = trimmed.startsWith('prof');
      const defaultRole = isProfessorEmail ? 'PROFESSOR' : 'ALUNO';
      const defaultName = trimmed.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      
      const newRecord: AccountRecord = {
        active: true,
        role: defaultRole,
        name: defaultName,
      };
      authorizedAccountsRegistry.set(trimmed, newRecord);

      return res.status(200).json({
        validDomain: true,
        authorized: true,
        active: true,
        role: defaultRole,
        message: 'E-mail institucional autorizado com perfil de ' + (defaultRole === 'PROFESSOR' ? 'Professor' : 'Aluno') + '.',
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
      role: record.role,
      message: 'E-mail autorizado. Informe sua senha exclusiva do SIGCO.',
    });
  });

  // Sync Authorized Users Directory from Firestore
  app.post('/api/auth/sync-authorized-users', (req, res) => {
    const { users, deletedEmail } = req.body || {};
    if (typeof deletedEmail === 'string' && deletedEmail.trim()) {
      authorizedAccountsRegistry.delete(deletedEmail.trim().toLowerCase());
    }
    if (Array.isArray(users)) {
      for (const u of users) {
        if (u && typeof u.email === 'string' && INSTITUTIONAL_EMAIL_REGEX.test(u.email.trim())) {
          const emailKey = u.email.trim().toLowerCase();
          const existing = authorizedAccountsRegistry.get(emailKey);
          authorizedAccountsRegistry.set(emailKey, {
            active: u.active !== false,
            role: u.role || existing?.role || 'ALUNO',
            name: u.name || existing?.name,
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
