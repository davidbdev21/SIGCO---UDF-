# SIGCO Security Specification (Phase 0 — Payload-First Security TDD)

## 1. Data Invariants

1. **Institutional Domain Gate (`@cs.udf.edu.br`)**: No user can read or write any document unless authenticated with a verified institutional email matching `^[a-zA-Z0-9._%+\-]+@cs\.udf\.edu\.br$` (or the bootstrapped developer admin `davidb.dev21@gmail.com`). Every `User`, `StudentProfile`, and `ProfessorProfile` document in Firestore must strictly store an `@cs.udf.edu.br` email address.
2. **Strict Schema & Key Allowlisting**: Every document write (`create` and `update`) is validated by a dedicated `isValid[Entity](data)` helper enforcing `data.keys().hasAll(...)` and `data.keys().hasOnly(...)`, exact primitive types, `.size()` bounds on every string, and enum constraints.
3. **Creator Identity Integrity (`createdByUid`)**: On `create`, `incoming().createdByUid == request.auth.uid`. On `update`, `incoming().createdByUid == existing().createdByUid` (immutable).
4. **Path Variable Hardening**: Every single-document operation (`get`, `create`, `update`, `delete`) validates `isValidId(docId)` matching `^[a-zA-Z0-9_\-]+$` with length `1..128`.
5. **Query Enforcer on `list`**: Every `allow list` rule enforces `isInstitutionalUser() && resource.data.institutionDomain == 'cs.udf.edu.br'` without executing `get()` or `exists()` lookups.
6. **Clinical Record Isolation (RN03, RN06, RN07)**:
   - Receptionists (`RECEPCAO`) cannot read or write clinical collections (`medical_records`, `anamnesis`, `clinical_evolution`, `odontograms`).
   - Odontology students (`ALUNO`) can only access clinical records for patients assigned to them (`responsibleStudentEmail` / `studentEmail`) or created by them.
7. **Terminal State Locking**: Deleted patients (`status == 'EXCLUIDO'`) and concluded referrals cannot be mutated by non-admin users.
8. **Immutable Audit Trail (RN08)**: `audit_logs` are append-only (`allow update: if false; allow delete: if false;`).

---

## 2. The "Dirty Dozen" Payloads (Designed to Break Identity, Integrity & State)

1. **Payload 1 (Non-Institutional Email Spoof)**: Creating a `users/{uid}` document with `"email": "attacker@gmail.com"`. -> `PERMISSION_DENIED`
2. **Payload 2 (Unverified Email Token)**: Request with `request.auth.token.email == "aluno@cs.udf.edu.br"` but `email_verified == false`. -> `PERMISSION_DENIED`
3. **Payload 3 (Shadow Field Injection)**: Updating `patients/{patientId}` with an undeclared field `"isVIP": true`. -> `PERMISSION_DENIED`
4. **Payload 4 (Creator Spoofing)**: Creating `patients/{patientId}` where `createdByUid != request.auth.uid`. -> `PERMISSION_DENIED`
5. **Payload 5 (Immortal Field Mutation)**: Updating `patients/{patientId}` to change `createdByUid` to another user's UID. -> `PERMISSION_DENIED`
6. **Payload 6 (Denial-of-Wallet String Overflow)**: Creating `screenings/{screeningId}` with `initialAnamnesis` exceeding `2000` characters. -> `PERMISSION_DENIED`
7. **Payload 7 (ID Poisoning)**: Creating a document with an invalid ID containing spaces or special characters (`patient$123!`). -> `PERMISSION_DENIED`
8. **Payload 8 (Invalid Status Enum)**: Updating `appointments/{appointmentId}` with `"status": "HACKED_STATUS"`. -> `PERMISSION_DENIED`
9. **Payload 9 (Cross-Tenant Query Scraping)**: Listing `patients` where `institutionDomain != "cs.udf.edu.br"`. -> `PERMISSION_DENIED`
10. **Payload 10 (Receptionist Clinical Snooping)**: A user with `role == "RECEPCAO"` attempting `get` on `/medical_records/{recordId}`. -> `PERMISSION_DENIED`
11. **Payload 11 (Student Cross-Patient Snooping - RN06)**: Student B (`aluno.b@cs.udf.edu.br`) attempting `get` on `/medical_records/{recordId}` belonging to Student A (`aluno.lucas@cs.udf.edu.br`). -> `PERMISSION_DENIED`
12. **Payload 12 (Audit Log Tampering - RN08)**: Attempting `update` or `delete` on `/audit_logs/{logId}`. -> `PERMISSION_DENIED`
