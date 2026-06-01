import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import multer from "multer";
import { db, pgQuery, pgGet, pgRun, pgInsert, pgUpdate, pgCount } from "./db-provider.js";
import { initTables, query, queryOne, execute } from "./pg-db.js";

dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

async function trySendNotificationEmail(userId: number, subject: string, html: string) {
  try {
    const user = await queryOne('SELECT email, full_name FROM users WHERE id = $1', [userId]);
    if (!user?.email || !process.env.SMTP_USER) return;
    transporter.sendMail({ from: `"MediCabinet" <${process.env.SMTP_USER}>`, to: user.email, subject, html });
  } catch {}
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PATIENT_COLUMNS = ['first_name','last_name','nin','gender','birth_date','age','blood_group','photo','phone','phone_secondary','email','address','city','wilaya','profession','nss','insurance','mutuelle','emergency_contact','medical_history'];
const CONSULTATION_COLUMNS = ['date','hour','reason','symptoms','diagnosis','temperature','bp','weight','height','imc','saturation','glycemia','notes','medications','prescription_code','fee'];
const MEDICAL_EXAM_COLUMNS = ['type','sub_type','date','provider','indication','result','notes','attachments'];
const MEDICAL_ROLES = ['doctor'];
const ADMINISTRATIVE_ROLES = ['doctor', 'secretary'];

function isDoctor(user: any) { return user?.role === 'doctor'; }
function isSecretary(user: any) { return user?.role === 'secretary'; }
function canManagePatients(user: any) { return ADMINISTRATIVE_ROLES.includes(user?.role); }
function canUseMedicalFeatures(user: any) { return MEDICAL_ROLES.includes(user?.role); }

async function checkAccess(patientId: number, userId: number): Promise<boolean> {
  const patient = await queryOne('SELECT id FROM patients WHERE id = $1 AND doctor_id = $2', [patientId, userId]);
  if (patient) return true;
  const shared = await queryOne('SELECT id FROM shared_patients WHERE patient_id = $1 AND doctor_id = $2', [patientId, userId]);
  return !!shared;
}

function serializeJsonFields(obj: any): any {
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && typeof value === 'object') {
      result[key] = JSON.stringify(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

async function copySharedPatientBeforeDelete(patientId: number, sharedDoctorIds: number[]): Promise<Record<number, number>> {
  const patient = await queryOne('SELECT * FROM patients WHERE id = $1', [patientId]);
  const result: Record<number, number> = {};
  if (!patient) return result;
  for (const doctorId of sharedDoctorIds) {
    const { id, doctor_id, created_at, ...patientCopy } = patient;
    delete patientCopy.nin;
    const newPatient = await pgInsert('patients', { ...serializeJsonFields(patientCopy), doctor_id: doctorId });
    result[doctorId] = newPatient.id;
    const consultations = await pgQuery('SELECT * FROM consultations WHERE patient_id = $1 ORDER BY created_at ASC', [patientId]);
    for (const c of consultations) {
      const { id: cid, patient_id: _pid, created_at: _ca, ...copy } = c;
      await pgInsert('consultations', { ...serializeJsonFields(copy), patient_id: newPatient.id });
    }
    const exams = await pgQuery('SELECT * FROM medical_exams WHERE patient_id = $1 ORDER BY created_at ASC', [patientId]);
    for (const e of exams) {
      const { id: eid, patient_id: _pid, created_at: _ca, ...copy } = e;
      await pgInsert('medical_exams', { ...serializeJsonFields(copy), patient_id: newPatient.id });
    }
    const reports = await pgQuery('SELECT * FROM medical_reports WHERE patient_id = $1 ORDER BY created_at ASC', [patientId]);
    for (const r of reports) {
      const { id: rid, patient_id: _pid, created_at: _ca, ...copy } = r;
      await pgInsert('medical_reports', { ...serializeJsonFields(copy), patient_id: newPatient.id });
    }
    await pgInsert('notifications', { user_id: doctorId, type: 'patient_copy_retained', title: 'Dossier conservé', message: `Le dossier partagé de ${patient.first_name} ${patient.last_name} a été conservé dans votre compte après suppression par le propriétaire.`, data: JSON.stringify({ old_patient_id: patientId, patient_id: newPatient.id }) });
  }
  return result;
}

async function getNextPrescriptionSeq(doctorId: number): Promise<number> {
  const row = await queryOne('SELECT sequential_number FROM prescriptions WHERE doctor_id = $1 ORDER BY sequential_number DESC LIMIT 1', [doctorId]);
  return (row?.sequential_number || 0) + 1;
}

async function generatePrescriptionCode(doctorId: number, patientNin: string) {
  const nextSeq = await getNextPrescriptionSeq(doctorId);
  const code = `MED-${doctorId}-${(patientNin || 'NO-NIN').slice(-6)}-${String(nextSeq).padStart(4, '0')}`;
  return { code, nextSeq };
}

async function enrichWithDoctorName(rows: any[]): Promise<any[]> {
  if (!rows || rows.length === 0) return rows;
  const doctorIds = [...new Set(rows.map((r: any) => r.doctor_id).filter(Boolean))];
  if (doctorIds.length === 0) return rows;
  const doctorNames: Record<number, string> = {};
  for (const docId of doctorIds) {
    const user = await queryOne('SELECT full_name FROM users WHERE id = $1', [docId]);
    doctorNames[docId as number] = user?.full_name || 'Dr. Inconnu';
  }
  return rows.map((r: any) => ({ ...r, doctor_name: doctorNames[r.doctor_id] || 'Dr. Inconnu' }));
}

async function generateBookingReference(): Promise<string> {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 20; attempt++) {
    let ref = '';
    for (let i = 0; i < 6; i++) ref += chars[Math.floor(Math.random() * chars.length)];
    const existing = await queryOne('SELECT id FROM appointments WHERE booking_reference = $1', [ref]);
    if (!existing) return ref;
  }
  return 'REF' + Date.now().toString(36).toUpperCase();
}

async function sendAppointmentEmail(to: string, subject: string, html: string) {
  try {
    if (!to || !process.env.SMTP_USER) return;
    transporter.sendMail({ from: `"MediCabinet" <${process.env.SMTP_USER}>`, to, subject, html });
  } catch (err) {
    console.error("Email send error:", err);
  }
}

async function startServer() {
  try {
    await initTables();
    console.log("✅ Base PostgreSQL initialisée");
    const userCountRow = await queryOne('SELECT COUNT(*) as cnt FROM users');
    if (parseInt(userCountRow?.cnt || '0', 10) === 0) {
      const hash = await bcrypt.hash('admin123', 10);
      await execute(`INSERT INTO users (email, password_hash, full_name, role, clinic_name, subscription_status) VALUES ($1, $2, $3, $4, $5, $6)`,
        ['admin@medicab.dz', hash, 'Administrateur', 'admin', 'MediCabinet', 'active']);
      console.log("✅ Utilisateur admin créé");
    }
    await execute(`DELETE FROM share_permissions WHERE doctor_id NOT IN (SELECT id FROM users WHERE role = 'doctor')`);
    await execute(`DELETE FROM shared_patients WHERE doctor_id IN (SELECT id FROM users WHERE email IN ('amine@medicab.dz', 'doctor2@medicab.dz'))`);
    await execute(`DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE email IN ('amine@medicab.dz', 'doctor2@medicab.dz'))`);
    await execute(`DELETE FROM users WHERE email IN ('amine@medicab.dz', 'doctor2@medicab.dz')`);
  } catch (e) {
    console.error("❌ Erreur initialisation base:", (e as Error).message);
    process.exit(1);
  }

  const app = express();
  const PORT: number = parseInt(process.env.PORT || '3000', 10);
  const JWT_SECRET = process.env.JWT_SECRET || 'medicab-secret-key-2024';

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`)
  });
  const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });
  app.use('/uploads', express.static(uploadsDir));

  const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;
    if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });
    jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
      if (err) return res.status(403).json({ error: 'Invalid or expired token.' });
      req.user = decoded;
      next();
    });
  };

  const checkSubscription = async (req: any, res: any, next: any) => {
    if (req.user.role === 'admin') return next();
    try {
      const user = await queryOne('SELECT subscription_status, subscription_end_date FROM users WHERE id = $1', [req.user.id]);
      if (!user) return next();
      if (user.subscription_end_date && new Date(user.subscription_end_date) < new Date()) {
        return res.status(403).json({ error: 'ABONNEMENT_EXPIRE', message: 'Votre abonnement a expiré.', contact: { nom: 'Gacemi Mohamed El Amine', email: 'gacemiamine@gmail.com', tel: '0658531833' } });
      }
      if (user.subscription_status && user.subscription_status !== 'active') {
        return res.status(403).json({ error: 'ABONNEMENT_SUSPENDU', message: 'Votre abonnement est suspendu.', contact: { nom: 'Gacemi Mohamed El Amine', email: 'gacemiamine@gmail.com', tel: '0658531833' } });
      }
      next();
    } catch { next(); }
  };

  app.use("/api", (req: any, res: any, next: any) => {
    const publicPaths = ['/api/auth/login', '/api/auth/register', '/api/admin', '/api/contact', '/api/public'];
    if (publicPaths.some(p => (req.originalUrl || req.url).startsWith(p))) return next();
    if (req.user) return checkSubscription(req, res, next);
    next();
  });

  app.get("/api/contact", async (req, res) => res.json({ nom: 'Gacemi Mohamed El Amine', email: 'gacemiamine@gmail.com', tel: '0658531833', role: 'Concepteur' }));

  app.post("/api/contact/send", async (req: any, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Message requis" });
    const userId = req.user?.id || null;
    try {
      await execute(`INSERT INTO contact_messages (user_id, message) VALUES ($1, $2)`, [userId, message.trim()]).catch(() => {});
      const userRow = userId ? await queryOne('SELECT full_name, email FROM users WHERE id = $1', [userId]) : null;
      const senderInfo = userRow ? `${userRow.full_name} (${userRow.email || 'no email'})` : 'Anonyme';
      try {
        if (process.env.SMTP_USER) {
          await transporter.sendMail({ from: `"Formulaire Contact MediCabinet" <${process.env.SMTP_USER}>`, to: 'gacemiamine@gmail.com', subject: `Nouveau message de ${senderInfo}`, text: message });
        }
      } catch {}
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Erreur lors de l'envoi" }); }
  });

  app.get("/api/admin/users", async (req, res) => {
    try {
      const users = await pgQuery("SELECT id, email, full_name, role, specialty, subscription_type, subscription_status, subscription_start_date, subscription_end_date, created_at, clinic_name, city, phone FROM users WHERE role != 'admin' ORDER BY created_at DESC");
      res.json(users);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.post("/api/admin/create-user", async (req, res) => {
    const { email, password, full_name, role, specialty, account_number, national_number, clinic_name, address, city, register_number, phone, subscription_type, subscription_start_date, subscription_end_date } = req.body;
    try {
      const existing = await pgGet('SELECT id FROM users WHERE email = $1', [email]);
      if (existing) return res.status(400).json({ error: "Email already registered" });
      const password_hash = await bcrypt.hash(password, 10);
      const result = await pgInsert('users', { email, password_hash, full_name, role: role || 'doctor', specialty, account_number, national_number, clinic_name, address, city, register_number, phone, subscription_type, subscription_start_date: subscription_start_date || new Date().toISOString(), subscription_end_date: subscription_end_date || new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString(), subscription_status: 'active' });
      res.status(201).json({ user: result, message: "Utilisateur créé avec succès" });
    } catch (err) { res.status(500).json({ error: "Erreur serveur lors de la création de l'utilisateur." }); }
  });

  app.put("/api/admin/users/:id", async (req, res) => {
    const userId = parseInt(req.params.id);
    const { full_name, email, phone, specialty, clinic_name, city, subscription_type, subscription_status, subscription_end_date, subscription_start_date } = req.body;
    try {
      const updateData: any = {};
      if (full_name !== undefined) updateData.full_name = full_name;
      if (email !== undefined) updateData.email = email;
      if (phone !== undefined) updateData.phone = phone;
      if (specialty !== undefined) updateData.specialty = specialty;
      if (clinic_name !== undefined) updateData.clinic_name = clinic_name;
      if (city !== undefined) updateData.city = city;
      if (subscription_type !== undefined) updateData.subscription_type = subscription_type;
      if (subscription_status !== undefined) updateData.subscription_status = subscription_status;
      if (subscription_end_date !== undefined) updateData.subscription_end_date = subscription_end_date;
      if (subscription_start_date !== undefined) updateData.subscription_start_date = subscription_start_date;
      if (Object.keys(updateData).length === 0) return res.status(400).json({ error: "No fields to update" });
      const updated = await pgUpdate('users', userId, updateData);
      res.json({ user: updated, message: "Utilisateur mis à jour avec succès" });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.post("/api/upload", authenticateToken, upload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      res.json({ url: `/uploads/${req.file.filename}`, filename: req.file.filename, size: req.file.size });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.post("/api/upload/multiple", authenticateToken, upload.array('files', 10), async (req: any, res) => {
    try {
      if (!req.files || req.files.length === 0) return res.status(400).json({ error: "No files uploaded" });
      const files = (req.files as any[]).map(f => ({ url: `/uploads/${f.filename}`, filename: f.filename, size: f.size }));
      res.json({ files });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    try {
      const { data: user, error } = await db.users.findByEmail(email);
      if (error) throw error;
      if (!user) return res.status(400).json({ error: "User not found" });
      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) return res.status(400).json({ error: "Invalid password" });
      const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
      const { password_hash, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword, token });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.get("/api/auth/me", authenticateToken, async (req: any, res) => {
    try {
      const { data, error } = await db.users.findById(req.user.id);
      if (error) throw error;
      if (!data) return res.status(404).json({ error: "User not found" });
      res.json(data);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.get("/api/medications", authenticateToken, async (req: any, res) => {
    try { res.json(await pgQuery('SELECT * FROM medications_library ORDER BY name ASC') || []); }
    catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.post("/api/medications", authenticateToken, async (req: any, res) => {
    const { name, dosage, unit, packaging, dci, form, abbreviation, posology, classe } = req.body;
    try {
      res.status(201).json(await pgInsert('medications_library', { name: name?.trim().normalize('NFC') || name, dosage, unit, packaging, dci, form, abbreviation, posology, classe }));
    }
    catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.put("/api/medications/:id", authenticateToken, async (req: any, res) => {
    const { name, dosage, unit, packaging, dci, form, abbreviation, posology, classe } = req.body;
    try {
      await pgRun('UPDATE medications_library SET name=$1,dosage=$2,unit=$3,packaging=$4,dci=$5,form=$6,abbreviation=$7,posology=$8,classe=$9 WHERE id=$10',
        [name?.trim().normalize('NFC') || name, dosage, unit, packaging, dci, form, abbreviation, posology, classe, req.params.id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.post("/api/medications/bulk", authenticateToken, async (req: any, res) => {
    const medications = req.body;
    if (!Array.isArray(medications)) return res.status(400).json({ error: "Expected an array" });
    try {
      for (const med of medications) await pgInsert('medications_library', { name: med.name, dosage: med.dosage, unit: med.unit, packaging: med.packaging, dci: med.dci, form: med.form, abbreviation: med.abbreviation, posology: med.posology, classe: med.classe });
      res.json({ message: `${medications.length} medications imported successfully` });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.delete("/api/medications/reset", authenticateToken, async (req: any, res) => {
    try {
      await pgRun('DELETE FROM medications_library');
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });
  app.delete("/api/medications/:id", authenticateToken, async (req: any, res) => {
    try { await pgRun('DELETE FROM medications_library WHERE id = $1', [req.params.id]); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.post("/api/medications", authenticateToken, async (req: any, res) => {
    const { name, dosage, unit, packaging, dci, form, abbreviation, posology, classe } = req.body;
    try {
      res.status(201).json(await pgInsert('medications_library', { name, dosage, unit, packaging, dci, form, abbreviation, posology, classe, doctor_id: req.user.id }));
    }
    catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.put("/api/medications/:id", authenticateToken, async (req: any, res) => {
    const { name, dosage, unit, packaging, dci, form, abbreviation, posology, classe } = req.body;
    try {
      await pgRun('UPDATE medications_library SET name=$1,dosage=$2,unit=$3,packaging=$4,dci=$5,form=$6,abbreviation=$7,posology=$8,classe=$9 WHERE id=$10 AND doctor_id=$11',
        [name, dosage, unit, packaging, dci, form, abbreviation, posology, classe, req.params.id, req.user.id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.post("/api/medications/bulk", authenticateToken, async (req: any, res) => {
    const medications = req.body;
    if (!Array.isArray(medications)) return res.status(400).json({ error: "Expected an array" });
    try {
      for (const med of medications) await pgInsert('medications_library', { name: med.name, dosage: med.dosage, unit: med.unit, packaging: med.packaging, dci: med.dci, form: med.form, abbreviation: med.abbreviation, posology: med.posology, classe: med.classe, doctor_id: req.user.id });
      res.json({ message: `${medications.length} medications imported successfully` });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // DCI interactions
  app.get("/api/dci-interactions", authenticateToken, async (_req: any, res) => {
    try {
      const rows = await pgQuery('SELECT * FROM dci_interactions ORDER BY dci1 ASC') || [];
      res.json(rows);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });
  app.post("/api/dci-interactions", authenticateToken, async (req: any, res) => {
    const { dci1, dci2, severity, description } = req.body;
    if (!dci1?.trim() || !dci2?.trim()) return res.status(400).json({ error: "dci1 and dci2 are required" });
    try {
      res.status(201).json(await pgInsert('dci_interactions', { dci1: dci1.trim(), dci2: dci2.trim(), severity, description, doctor_id: req.user.id }));
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });
  app.delete("/api/dci-interactions/:id", authenticateToken, async (req: any, res) => {
    try { await pgRun('DELETE FROM dci_interactions WHERE id = $1', [req.params.id]); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });
  app.post("/api/dci-interactions/check", authenticateToken, async (req: any, res) => {
    const { dcis } = req.body;
    if (!Array.isArray(dcis) || dcis.length < 2) return res.json([]);
    try {
      const uniqueDcis = [...new Set(dcis.map((d: string) => d.trim().toLowerCase()).filter(Boolean))];
      if (uniqueDcis.length < 2) return res.json([]);
      const placeholders = uniqueDcis.map((_, i) => `$${i + 1}`).join(',');
      const rows = await pgQuery(`
        SELECT DISTINCT ON (dci1, dci2) * FROM dci_interactions
        WHERE (LOWER(dci1) IN (${placeholders}) AND LOWER(dci2) IN (${placeholders}))
           OR (LOWER(dci2) IN (${placeholders}) AND LOWER(dci1) IN (${placeholders}))
      `, [...uniqueDcis, ...uniqueDcis]) || [];
      res.json(rows);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // User settings
  app.get("/api/user-settings", authenticateToken, async (req: any, res) => {
    try {
      let row = await queryOne('SELECT settings FROM user_settings WHERE user_id = $1', [req.user.id]);
      if (!row) {
        await pgInsert('user_settings', { user_id: req.user.id, settings: JSON.stringify({}) }).catch(() => {});
        row = { settings: '{}' };
      }
      let settings = typeof row.settings === 'string' ? JSON.parse(row.settings) : (row.settings || {});
      if (typeof settings !== 'object' || settings === null) settings = {};
      res.json(settings);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.put("/api/user-settings", authenticateToken, async (req: any, res) => {
    try {
      let settings = req.body;
      if (typeof settings === 'string') { settings = {}; }
      const existing = await queryOne('SELECT id FROM user_settings WHERE user_id = $1', [req.user.id]);
      if (existing) {
        await pgUpdate('user_settings', existing.id, { settings: JSON.stringify(settings), updated_at: new Date().toISOString() });
      } else {
        await pgInsert('user_settings', { user_id: req.user.id, settings: JSON.stringify(settings) });
      }
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // Prescription templates
  app.get("/api/prescription-templates", authenticateToken, async (req: any, res) => {
    try {
      const rows = await pgQuery('SELECT * FROM prescription_templates WHERE doctor_id = $1 ORDER BY name ASC', [req.user.id]) || [];
      res.json(rows);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });
  app.post("/api/prescription-templates", authenticateToken, async (req: any, res) => {
    const { name, medications } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name is required" });
    try {
      res.status(201).json(await pgInsert('prescription_templates', { doctor_id: req.user.id, name: name.trim(), medications: JSON.stringify(medications || []) }));
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });
  app.delete("/api/prescription-templates/:id", authenticateToken, async (req: any, res) => {
    try {
      await pgRun('DELETE FROM prescription_templates WHERE id = $1 AND doctor_id = $2', [req.params.id, req.user.id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // Custom lists (per-doctor)
  function listEndpoints(table: string, path: string, hasDoctorId: boolean) {
    app.get(`/api/${path}`, authenticateToken, async (req: any, res) => {
      try { res.json(await pgQuery(`SELECT * FROM ${table} WHERE doctor_id IS NULL OR doctor_id = $1 ORDER BY name ASC`, [req.user.id]) || []); }
      catch (err) { res.status(500).json({ error: (err as Error).message }); }
    });
    app.post(`/api/${path}`, authenticateToken, async (req: any, res) => {
      const { name, type } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: "Name is required" });
      const insertData: any = { name: name.trim().normalize('NFC'), doctor_id: req.user.id };
      if (type !== undefined && hasDoctorId) insertData.type = type;
      try {
        const result = await pgInsert(table, insertData);
        if (!result) return res.status(500).json({ error: "Insert returned no data" });
        res.status(201).json(result);
      } catch (err) { res.status(500).json({ error: (err as Error).message }); }
    });
    app.delete(`/api/${path}/reset`, authenticateToken, async (req: any, res) => {
      try { await pgRun(`DELETE FROM ${table} WHERE doctor_id = $1`, [req.user.id]); res.json({ success: true }); }
      catch (err) { res.status(500).json({ error: (err as Error).message }); }
    });
    app.delete(`/api/${path}/:id`, authenticateToken, async (req: any, res) => {
      try { await pgRun(`DELETE FROM ${table} WHERE id = $1 AND doctor_id = $2`, [req.params.id, req.user.id]); res.json({ success: true }); }
      catch (err) { res.status(500).json({ error: (err as Error).message }); }
    });
  }
  listEndpoints('lab_analyses', 'lab-analyses', false);
  listEndpoints('consultation_motifs', 'consultation-motifs', false);
  listEndpoints('diagnoses', 'diagnoses', false);

  app.get("/api/paraclinical-exams", authenticateToken, async (req: any, res) => {
    try { res.json(await pgQuery('SELECT * FROM paraclinical_exams WHERE doctor_id IS NULL OR doctor_id = $1 ORDER BY name ASC', [req.user.id]) || []); }
    catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });
  app.post("/api/paraclinical-exams", authenticateToken, async (req: any, res) => {
    const { name, type } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name is required" });
    try {
      // Ensure type column exists (works even if server wasn't restarted after schema change)
      const colCheck = await query("SELECT column_name FROM information_schema.columns WHERE table_name = 'paraclinical_exams' AND column_name = 'type'");
      if (colCheck.length === 0) await execute("ALTER TABLE paraclinical_exams ADD COLUMN type TEXT DEFAULT 'Biologie'");
      const result = await pgInsert('paraclinical_exams', { name: name.trim(), type: type?.trim() || 'Biologie', doctor_id: req.user.id });
      if (!result) return res.status(500).json({ error: "Insert returned no data" });
      res.status(201).json(result);
    } catch (err) {
      console.error("Paraclinical exam insert error:", err);
      res.status(500).json({ error: (err as Error).message });
    }
  });
  app.put("/api/paraclinical-exams/:id", authenticateToken, async (req: any, res) => {
    const { name, type } = req.body;
    try {
      await pgRun('UPDATE paraclinical_exams SET name=$1,type=$2 WHERE id=$3 AND doctor_id=$4', [name, type, req.params.id, req.user.id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });
  app.delete("/api/medications/reset", authenticateToken, async (req: any, res) => {
    try {
      await pgRun('DELETE FROM medications_library WHERE doctor_id = $1', [req.user.id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });
  app.delete("/api/medications/:id", authenticateToken, async (req: any, res) => {
    try { await pgRun('DELETE FROM medications_library WHERE id = $1 AND doctor_id = $2', [req.params.id, req.user.id]); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });
  app.delete("/api/paraclinical-exams/reset", authenticateToken, async (req: any, res) => {
    try { await pgRun('DELETE FROM paraclinical_exams WHERE doctor_id = $1', [req.user.id]); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });
  app.delete("/api/paraclinical-exams/:id", authenticateToken, async (req: any, res) => {
    try { await pgRun('DELETE FROM paraclinical_exams WHERE id = $1 AND doctor_id = $2', [req.params.id, req.user.id]); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.get("/api/doctors", authenticateToken, async (req: any, res) => {
    try {
      const { data, error } = await db.doctors.findAll(req.user.id);
      if (error) throw error;
      res.json(data || []);
    } catch (err) { res.status(500).json({ error: "Erreur lors de la récupération des médecins." }); }
  });

  app.get("/api/doctors/directory", authenticateToken, async (req: any, res) => {
    try {
      const { q, wilaya, city, specialty, role } = req.query;
      const params: any[] = [];
      const conditions: string[] = [];
      let roleFilter = "role IN ('doctor','laboratory')";
      if (role && ['doctor','laboratory','dentist','radiologist','imaging_center','pharmacist','nurse'].includes(role as string)) {
        roleFilter = `role = $${params.length + 1}`;
        params.push(role as string);
      }
      let sql = `SELECT id, full_name, role, specialty, clinic_name, address, city, phone, email FROM users WHERE ${roleFilter}`;
      if (q) { conditions.push(`(LOWER(full_name) LIKE LOWER($${params.length + 1}) OR LOWER(specialty) LIKE LOWER($${params.length + 1}) OR LOWER(city) LIKE LOWER($${params.length + 1}))`); params.push(`%${q}%`); }
      if (wilaya) { conditions.push(`LOWER(city) LIKE LOWER($${params.length + 1})`); params.push(`%${wilaya}%`); }
      if (city) { conditions.push(`LOWER(address) LIKE LOWER($${params.length + 1}) OR LOWER(city) LIKE LOWER($${params.length + 1})`); params.push(`%${city}%`); }
      if (specialty) { conditions.push(`LOWER(specialty) LIKE LOWER($${params.length + 1})`); params.push(`%${specialty}%`); }
      if (conditions.length > 0) sql += " AND " + conditions.join(" AND ");
      sql += " ORDER BY full_name ASC";
      res.json(await pgQuery(sql, params));
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.get("/api/specialties", authenticateToken, async (_req: any, res) => {
    try {
      const rows = await pgQuery("SELECT DISTINCT specialty FROM users WHERE specialty IS NOT NULL AND specialty != '' ORDER BY specialty ASC");
      res.json(rows.map((r: any) => r.specialty));
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.get("/api/secretary-links", authenticateToken, async (req: any, res) => {
    try {
      if (req.user.role !== 'secretary') return res.json([]);
      const rows = await pgQuery(`SELECT sl.doctor_id, u.full_name, u.specialty, u.clinic_name FROM secretary_links sl JOIN users u ON sl.doctor_id = u.id WHERE sl.secretary_id = $1`, [req.user.id]);
      res.json(rows);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.get("/api/admin/secretary-links/:secretaryId", async (req: any, res) => {
    try {
      const rows = await pgQuery(`SELECT sl.id, sl.doctor_id, u.full_name, u.specialty FROM secretary_links sl JOIN users u ON sl.doctor_id = u.id WHERE sl.secretary_id = $1`, [req.params.secretaryId]);
      res.json(rows);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.post("/api/admin/secretary-links/:secretaryId", async (req: any, res) => {
    const { doctor_id } = req.body;
    try {
      const target = await queryOne('SELECT id FROM users WHERE id = $1 AND role = \'doctor\'', [doctor_id]);
      if (!target) return res.status(400).json({ error: "Médecin introuvable" });
      await execute('INSERT INTO secretary_links (secretary_id, doctor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.params.secretaryId, doctor_id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.delete("/api/admin/secretary-links/:secretaryId/:doctorId", async (req: any, res) => {
    try {
      await execute('DELETE FROM secretary_links WHERE secretary_id = $1 AND doctor_id = $2', [req.params.secretaryId, req.params.doctorId]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.post("/api/patients/:id/share", authenticateToken, async (req: any, res) => {
    const patientId = parseInt(req.params.id);
    const { doctor_id, permissions, priority, reason } = req.body;
    const perms = permissions || {};
    const prio = priority || 'normal';
    const shareReason = reason?.trim() || '';
    try {
      if (!isDoctor(req.user)) return res.status(403).json({ error: "Médecins uniquement" });
      const targetDoctor = await queryOne("SELECT id FROM users WHERE id = $1 AND role = 'doctor'", [doctor_id]);
      if (!targetDoctor) return res.status(400).json({ error: "Le partage médical est réservé aux médecins." });
      const patientRow = await queryOne('SELECT doctor_id, first_name, last_name, id FROM patients WHERE id = $1', [patientId]);
      if (!patientRow) return res.status(404).json({ error: "Patient introuvable" });
      if (patientRow.doctor_id !== req.user.id) return res.status(403).json({ error: "Only the owner can share this record" });
      await execute('DELETE FROM share_permissions WHERE patient_id = $1 AND doctor_id = $2', [patientId, doctor_id]);
      await pgInsert('share_permissions', { patient_id: patientId, doctor_id, shared_by_id: req.user.id, can_view_medical_history: perms.can_view_medical_history !== false ? 1 : 0, can_view_consultations: perms.can_view_consultations !== false ? 1 : 0, can_view_exams: perms.can_view_exams !== false ? 1 : 0, can_view_reports: perms.can_view_reports !== false ? 1 : 0, can_view_documents: perms.can_view_documents !== false ? 1 : 0 });
      await execute(`INSERT INTO shared_patients (patient_id, doctor_id, shared_by_id, priority, share_reason) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (patient_id, doctor_id) DO UPDATE SET priority = $4, share_reason = $5`, [patientId, doctor_id, req.user.id, prio, shareReason]);
      const senderRow = await queryOne('SELECT full_name FROM users WHERE id = $1', [req.user.id]);
      const priorityLabel = prio === 'urgent' ? '🔴 Urgent' : prio === 'very_urgent' ? '⛔ Très urgent' : '📋 Normal';
      const reasonSuffix = shareReason ? `\nMotif : ${shareReason}` : '';
      await pgInsert('notifications', { user_id: doctor_id, type: 'patient_shared', title: `Dossier partagé ${priorityLabel}`, message: `${senderRow?.full_name || "Un confrère"} a partagé le dossier de ${patientRow.first_name} ${patientRow.last_name} avec vous.${reasonSuffix}`, data: JSON.stringify({ patient_id: patientId, sender_id: req.user.id, permissions: perms, priority: prio, reason: shareReason }) });
      res.json({ success: true, message: "Record shared successfully" });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.delete("/api/patients/:id/share/:doctorId", authenticateToken, async (req: any, res) => {
    try {
      const patient = await queryOne('SELECT doctor_id FROM patients WHERE id = $1', [req.params.id]);
      if (!patient) return res.status(404).json({ error: "Patient introuvable" });
      if (patient.doctor_id !== req.user.id) return res.status(403).json({ error: "Seul le propriétaire peut retirer un partage" });
      await execute('DELETE FROM shared_patients WHERE patient_id = $1 AND doctor_id = $2', [req.params.id, req.params.doctorId]);
      await execute('DELETE FROM share_permissions WHERE patient_id = $1 AND doctor_id = $2', [req.params.id, req.params.doctorId]);
      res.json({ success: true, message: "Partage retiré" });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.post("/api/patients/:id/transfer/:doctorId", authenticateToken, async (req: any, res) => {
    try {
      const patientId = parseInt(req.params.id);
      const doctorId = parseInt(req.params.doctorId);
      const force = req.body?.force === true;
      const patient = await queryOne('SELECT doctor_id, first_name, last_name FROM patients WHERE id = $1', [patientId]);
      if (!patient) return res.status(404).json({ error: "Patient introuvable" });
      if (patient.doctor_id !== req.user.id) return res.status(403).json({ error: "Seul le propriétaire peut transférer le dossier" });
      const existingTransfer = await queryOne('SELECT id, copied_patient_id FROM transferred_patients WHERE original_patient_id = $1 AND doctor_id = $2', [patientId, doctorId]);
      if (existingTransfer && !force) {
        return res.json({ hasBeenTransferred: true, copied_patient_id: existingTransfer.copied_patient_id, message: `Le dossier a déjà été transféré à ce médecin. Voulez-vous le retransférer (une nouvelle copie sera créée) ?` });
      }
      const copies = await copySharedPatientBeforeDelete(patientId, [doctorId]);
      const copiedPatientId = copies[doctorId];
      await execute('DELETE FROM shared_patients WHERE patient_id = $1 AND doctor_id = $2', [patientId, doctorId]);
      await execute('DELETE FROM share_permissions WHERE patient_id = $1 AND doctor_id = $2', [patientId, doctorId]);
      if (existingTransfer) {
        await execute('UPDATE transferred_patients SET copied_patient_id = $1 WHERE id = $2', [copiedPatientId, existingTransfer.id]);
      } else {
        await pgInsert('transferred_patients', { original_patient_id: patientId, copied_patient_id: copiedPatientId, doctor_id: doctorId, transferred_by_id: req.user.id });
      }
      await pgInsert('notifications', { user_id: doctorId, type: 'patient_transferred', title: 'Dossier transféré', message: `Le dossier de ${patient.first_name} ${patient.last_name} vous a été transféré définitivement par ${req.user.full_name || "le propriétaire"}.`, data: JSON.stringify({ old_patient_id: patientId, patient_id: copiedPatientId }) });
      res.json({ success: true, message: "Dossier transféré définitivement" });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.get("/api/notifications", authenticateToken, async (req: any, res) => {
    try { res.json(await pgQuery('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [req.user.id])); }
    catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.post("/api/notifications/:id/read", authenticateToken, async (req: any, res) => {
    try { await pgRun('UPDATE notifications SET is_read = 1 WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.post("/api/notifications/read-all", authenticateToken, async (req: any, res) => {
    try { await pgRun('UPDATE notifications SET is_read = 1 WHERE user_id = $1', [req.user.id]); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.get("/api/patients/:id/shared-with", authenticateToken, async (req: any, res) => {
    try {
      const rows = await pgQuery(`SELECT sp.doctor_id, sp.share_reason, u.id, u.full_name, u.specialty, u.clinic_name FROM shared_patients sp JOIN users u ON sp.doctor_id = u.id WHERE sp.patient_id = $1 AND u.role = 'doctor'`, [req.params.id]);
      res.json(rows);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.get("/api/patients/:id/transferred", authenticateToken, async (req: any, res) => {
    try {
      const rows = await pgQuery(`SELECT tp.doctor_id, u.id, u.full_name, u.specialty, u.clinic_name, tp.copied_patient_id FROM transferred_patients tp JOIN users u ON tp.doctor_id = u.id WHERE tp.original_patient_id = $1 AND u.role = 'doctor'`, [req.params.id]);
      res.json(rows);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.get("/api/patients", authenticateToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const owned = await pgQuery('SELECT * FROM patients WHERE doctor_id = $1 ORDER BY last_name ASC', [userId]);
      const sharedLinkRows = isSecretary(req.user) ? [] : await pgQuery('SELECT patient_id, share_reason, priority, shared_by_id FROM shared_patients WHERE doctor_id = $1', [userId]);
      const ownedIds = new Set(owned.map((p: any) => p.id));
      const sharedMap = new Map(sharedLinkRows.map((s: any) => [s.patient_id, { share_reason: s.share_reason, priority: s.priority, shared_by_id: s.shared_by_id }]));
      const sharedIds = sharedLinkRows.map((s: any) => s.patient_id).filter((id: any) => id && !ownedIds.has(id));
      let shared: any[] = [];
      if (sharedIds.length > 0) {
        const placeholders = sharedIds.map((_: any, i: number) => `$${i + 1}`).join(',');
        shared = await pgQuery(`SELECT * FROM patients WHERE id IN (${placeholders}) ORDER BY last_name ASC`, sharedIds);
      }
      res.json([...owned.map((p: any) => ({ ...p, access_role: 'owner' })), ...shared.map((p: any) => ({ ...p, access_role: 'shared', share_reason: sharedMap.get(p.id)?.share_reason || null, share_priority: sharedMap.get(p.id)?.priority || 'normal', shared_by_id: sharedMap.get(p.id)?.shared_by_id || null }))]);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.get("/api/patients/search-by-phone", authenticateToken, async (req: any, res) => {
    try {
      const { phone } = req.query;
      if (!phone) return res.status(400).json({ error: "Phone requis" });
      const owned = await pgQuery('SELECT * FROM patients WHERE doctor_id = $1 AND phone = $2 LIMIT 1', [req.user.id, phone]);
      if (owned.length > 0) return res.json(owned[0]);
      const sharedIds = (await pgQuery('SELECT patient_id FROM shared_patients WHERE doctor_id = $1', [req.user.id])).map((r: any) => r.patient_id).filter(Boolean);
      if (sharedIds.length > 0) {
        const shared = await pgQuery(`SELECT * FROM patients WHERE id IN (${sharedIds.map((_: any, i: number) => `$${i + 1}`).join(',')}) AND phone = $${sharedIds.length + 1} LIMIT 1`, [...sharedIds, phone]);
        if (shared.length > 0) return res.json(shared[0]);
      }
      res.json(null);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.post("/api/patients", authenticateToken, async (req: any, res) => {
    const { first_name, last_name, nin, gender, birth_date, blood_group, photo, phone, phone_secondary, email, address, city, wilaya, profession, nss, insurance, mutuelle, emergency_contact, medical_history, doctor_id } = req.body;
    try {
      if (!canManagePatients(req.user)) return res.status(403).json({ error: "Accès administratif uniquement" });
      const userRow = await pgGet('SELECT subscription_type FROM users WHERE id = $1', [req.user.id]);
      if (userRow?.subscription_type === 'trial') {
        const cnt = await pgCount('patients', 'doctor_id = $1', [req.user.id]);
        if (cnt >= 10) return res.status(403).json({ error: "LIMITE_TRIAL", message: "Vous avez atteint la limite de 10 patients pour un compte Trial." });
      }
      const data = await pgInsert('patients', { doctor_id: req.user.id, first_name, last_name, nin, gender, birth_date, blood_group, photo, phone, phone_secondary, email, address, city, wilaya, profession, nss, insurance, mutuelle, emergency_contact, medical_history: medical_history ? JSON.stringify(medical_history) : '{}' });
      if (isSecretary(req.user) && doctor_id) {
        const targetDoctor = await queryOne("SELECT id FROM users WHERE id = $1 AND role = 'doctor'", [doctor_id]);
        if (targetDoctor) {
          await execute(`INSERT INTO shared_patients (patient_id, doctor_id, shared_by_id) VALUES ($1, $2, $3) ON CONFLICT (patient_id, doctor_id) DO NOTHING`, [data.id, doctor_id, req.user.id]);
          await execute('DELETE FROM share_permissions WHERE patient_id = $1 AND doctor_id = $2', [data.id, doctor_id]);
          await pgInsert('share_permissions', { patient_id: data.id, doctor_id, shared_by_id: req.user.id, can_view_medical_history: 1, can_view_consultations: 1, can_view_exams: 1, can_view_reports: 1, can_view_documents: 1 });
        }
      }
      res.status(201).json(data);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.put("/api/patients/:id", authenticateToken, async (req: any, res) => {
    const patientId = parseInt(req.params.id);
    if (Object.keys(req.body).length === 0) return res.status(400).json({ error: "No fields provided" });
    try {
      const existing = await pgGet('SELECT doctor_id FROM patients WHERE id = $1', [patientId]);
      if (!existing) return res.status(404).json({ error: "Patient not found" });
      if (existing.doctor_id !== req.user.id) return res.status(403).json({ error: "Forbidden" });
      if (!canManagePatients(req.user)) return res.status(403).json({ error: "Accès administratif uniquement" });
      const updateData: any = {};
      for (const [key, value] of Object.entries(req.body)) {
        if (!PATIENT_COLUMNS.includes(key)) continue;
        if ((key === 'first_name' || key === 'last_name') && (value === null || value === undefined)) continue;
        updateData[key] = value;
      }
      if (Object.keys(updateData).length === 0) return res.status(400).json({ error: "No valid fields" });
      res.json(await pgUpdate('patients', patientId, updateData));
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.get("/api/patients/:id", authenticateToken, async (req: any, res) => {
    try {
      const patient = await queryOne('SELECT * FROM patients WHERE id = $1', [req.params.id]);
      if (!patient) return res.status(404).json({ error: "Patient not found" });
      const isOwner = patient.doctor_id === req.user.id;
      if (isSecretary(req.user) && !isOwner) return res.status(403).json({ error: "Forbidden" });
      if (req.user.role === 'doctor' && !isOwner) {
        const shared = await queryOne('SELECT id FROM shared_patients WHERE patient_id = $1 AND doctor_id = $2', [req.params.id, req.user.id]);
        if (!shared) return res.status(403).json({ error: "Forbidden" });
      }
      let permissions: any = null;
      if (!isOwner) permissions = await queryOne('SELECT * FROM share_permissions WHERE patient_id = $1 AND doctor_id = $2', [req.params.id, req.user.id]);
      let consultations = await pgQuery('SELECT * FROM consultations WHERE patient_id = $1 ORDER BY date DESC, created_at DESC', [req.params.id]);
      let appointments = await pgQuery('SELECT * FROM appointments WHERE patient_id = $1 ORDER BY date DESC', [req.params.id]);
      let exams = await pgQuery('SELECT * FROM medical_exams WHERE patient_id = $1 ORDER BY date DESC', [req.params.id]);
      let reports = await pgQuery('SELECT * FROM medical_reports WHERE patient_id = $1 ORDER BY date DESC', [req.params.id]);
      if (isSecretary(req.user)) {
        patient.medical_history = {};
        consultations = [];
        exams = [];
        reports = [];
      } else if (!isOwner && permissions) {
        if (!permissions.can_view_medical_history) patient.medical_history = {};
        if (!permissions.can_view_consultations) consultations = [];
        if (!permissions.can_view_exams) exams = [];
        if (!permissions.can_view_reports && !permissions.can_view_documents) reports = [];
        consultations = consultations.map((c: any) => { const { fee, ...rest } = c; return rest; });
      } else if (!isOwner) {
        patient.medical_history = {};
        consultations = consultations.map((c: any) => { const { fee, ...rest } = c; return rest; });
      }
      consultations = await enrichWithDoctorName(consultations);
      exams = await enrichWithDoctorName(exams);
      reports = await enrichWithDoctorName(reports);
      res.json({ ...patient, access_role: isOwner ? 'owner' : 'shared', share_permissions: permissions, consultations, appointments, exams, reports });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.post("/api/consultations", authenticateToken, async (req: any, res) => {
    const { patient_id, date, hour, reason, symptoms, diagnosis, temperature, bp, weight, height, imc, saturation, glycemia, notes, medications, fee } = req.body;
    try {
      if (!canUseMedicalFeatures(req.user)) return res.status(403).json({ error: "Fonctions médicales réservées aux médecins" });
      if (!await checkAccess(patient_id, req.user.id)) return res.status(403).json({ error: "No access" });
      const isOwner = !!(await queryOne('SELECT id FROM patients WHERE id = $1 AND doctor_id = $2', [patient_id, req.user.id]));
      const consultation = await pgInsert('consultations', { patient_id, doctor_id: req.user.id, date: date || new Date().toISOString().split('T')[0], hour, reason: typeof reason === 'string' ? reason : JSON.stringify(reason), symptoms, diagnosis: typeof diagnosis === 'string' ? diagnosis : JSON.stringify(diagnosis), temperature, bp, weight, height, imc, saturation, glycemia, notes, medications: medications ? JSON.stringify(medications) : '[]', fee: isOwner ? (fee || 0) : 0 });
      if (medications && Array.isArray(medications) && medications.length > 0) {
        const patientData = await queryOne('SELECT nin FROM patients WHERE id = $1', [patient_id]);
        const { code: prescriptionCode, nextSeq } = await generatePrescriptionCode(req.user.id, patientData?.nin || "NO-NIN");
        await pgInsert('prescriptions', { consultation_id: consultation.id, patient_id, doctor_id: req.user.id, prescription_code: prescriptionCode, sequential_number: nextSeq, data: JSON.stringify(medications) });
        await pgRun('UPDATE consultations SET prescription_code = $1 WHERE id = $2', [prescriptionCode, consultation.id]);
        consultation.prescription_code = prescriptionCode;
      }
      res.status(201).json(consultation);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.put("/api/consultations/:id", authenticateToken, async (req: any, res) => {
    const consultationId = parseInt(req.params.id);
    if (Object.keys(req.body).length === 0) return res.status(400).json({ error: "No fields" });
    try {
      if (!canUseMedicalFeatures(req.user)) return res.status(403).json({ error: "Fonctions médicales réservées aux médecins" });
      const updateData: any = {};
      for (const [key, value] of Object.entries(req.body)) { if (CONSULTATION_COLUMNS.includes(key)) updateData[key] = value; }
      if (Object.keys(updateData).length === 0) return res.status(400).json({ error: "No valid fields" });
      const consultCheck = await queryOne('SELECT patient_id FROM consultations WHERE id = $1', [consultationId]);
      if (!consultCheck) return res.status(404).json({ error: "Not found" });
      if (!await queryOne('SELECT id FROM patients WHERE id = $1 AND doctor_id = $2', [consultCheck.patient_id, req.user.id])) delete updateData.fee;
      if (Object.keys(updateData).length === 0) return res.status(400).json({ error: "No valid fields" });
      if (updateData.medications && Array.isArray(updateData.medications)) updateData.medications = JSON.stringify(updateData.medications);
      if (updateData.reason && Array.isArray(updateData.reason)) updateData.reason = JSON.stringify(updateData.reason);
      if (updateData.diagnosis && Array.isArray(updateData.diagnosis)) updateData.diagnosis = JSON.stringify(updateData.diagnosis);
      const data = await pgUpdate('consultations', consultationId, updateData);
      if (!data) return res.status(404).json({ error: "Not found" });
      res.json(data);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.delete("/api/consultations/:id", authenticateToken, async (req: any, res) => {
    try {
      if (!canUseMedicalFeatures(req.user)) return res.status(403).json({ error: "Fonctions médicales réservées aux médecins" });
      const c = await queryOne('SELECT patient_id FROM consultations WHERE id = $1', [req.params.id]);
      if (!c) return res.status(404).json({ error: "Not found" });
      if (!await queryOne('SELECT id FROM patients WHERE id = $1 AND doctor_id = $2', [c.patient_id, req.user.id])) return res.status(403).json({ error: "Forbidden" });
      await pgRun('DELETE FROM consultations WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.get("/api/patients/:id/share-permissions", authenticateToken, async (req: any, res) => {
    try {
      if (!isDoctor(req.user)) return res.status(403).json({ error: "Médecins uniquement" });
      const rows = await pgQuery(`SELECT sp.*, sp2.share_reason, u.full_name as doctor_full_name, u.specialty, u.clinic_name FROM share_permissions sp JOIN users u ON sp.doctor_id = u.id LEFT JOIN shared_patients sp2 ON sp.patient_id = sp2.patient_id AND sp.doctor_id = sp2.doctor_id WHERE sp.patient_id = $1 AND u.role = 'doctor'`, [req.params.id]);
      res.json(rows);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.put("/api/patients/:id/share-permissions", authenticateToken, async (req: any, res) => {
    const { doctor_id, permissions } = req.body;
    try {
      if (!isDoctor(req.user)) return res.status(403).json({ error: "Médecins uniquement" });
      await pgRun(`UPDATE share_permissions SET can_view_medical_history=$1, can_view_consultations=$2, can_view_exams=$3, can_view_reports=$4, can_view_documents=$5 WHERE patient_id=$6 AND doctor_id=$7`,
        [permissions.can_view_medical_history !== false ? 1 : 0, permissions.can_view_consultations !== false ? 1 : 0, permissions.can_view_exams !== false ? 1 : 0, permissions.can_view_reports !== false ? 1 : 0, permissions.can_view_documents !== false ? 1 : 0, req.params.id, doctor_id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.post("/api/medical_exams", authenticateToken, async (req: any, res) => {
    const { patient_id, type, sub_type, date, provider, indication, result: examResult, notes } = req.body;
    try {
      if (!canUseMedicalFeatures(req.user)) return res.status(403).json({ error: "Fonctions médicales réservées aux médecins" });
      if (!await checkAccess(patient_id, req.user.id)) return res.status(403).json({ error: "No access" });
      const data = await pgInsert('medical_exams', { patient_id, doctor_id: req.user.id, type, sub_type, date, provider, indication, result: examResult, notes });
      try {
        const patientRow = await queryOne('SELECT doctor_id, first_name, last_name FROM patients WHERE id = $1', [patient_id]);
        if (patientRow && patientRow.doctor_id !== req.user.id) {
          const senderRow = await queryOne('SELECT full_name FROM users WHERE id = $1', [req.user.id]);
          await pgInsert('notifications', { user_id: patientRow.doctor_id, type: 'exam_added', title: 'Examen ajouté', message: `${senderRow?.full_name || "Un confrère"} a ajouté un examen (${sub_type}) au dossier de ${patientRow.first_name} ${patientRow.last_name}.`, data: JSON.stringify({ patient_id, exam_id: data.id }) });
        }
      } catch {}
      res.status(201).json(data);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.put("/api/medical_exams/:id", authenticateToken, async (req: any, res) => {
    const examId = parseInt(req.params.id);
    if (Object.keys(req.body).length === 0) return res.status(400).json({ error: "No fields" });
    try {
      const exam = await queryOne('SELECT patient_id, doctor_id FROM medical_exams WHERE id = $1', [examId]);
      if (!exam) return res.status(404).json({ error: "Not found" });
      if (!await checkAccess(exam.patient_id, req.user.id)) return res.status(403).json({ error: "Accès refusé" });
      const updateData: any = {};
      for (const [key, value] of Object.entries(req.body)) { if (!['id','created_at','patient_id'].includes(key) && MEDICAL_EXAM_COLUMNS.includes(key)) updateData[key] = value; }
      if (Object.keys(updateData).length === 0) return res.status(400).json({ error: "No valid fields" });
      const data = await pgUpdate('medical_exams', examId, updateData);
      if (!data) return res.status(404).json({ error: "Not found" });
      res.json(data);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.delete("/api/medical_exams/:id", authenticateToken, async (req: any, res) => {
    try {
      const exam = await queryOne('SELECT patient_id FROM medical_exams WHERE id = $1', [req.params.id]);
      if (!exam) return res.status(404).json({ error: "Examen introuvable" });
      if (!await checkAccess(exam.patient_id, req.user.id)) return res.status(403).json({ error: "Accès refusé" });
      await pgRun('DELETE FROM medical_exams WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.post("/api/medical_reports", authenticateToken, async (req: any, res) => {
    const { patient_id, type, date, content, data: reportData } = req.body;
    try {
      if (!canUseMedicalFeatures(req.user)) return res.status(403).json({ error: "Fonctions médicales réservées aux médecins" });
      if (!await checkAccess(patient_id, req.user.id)) return res.status(403).json({ error: "No access" });
      const result = await pgInsert('medical_reports', { patient_id, doctor_id: req.user.id, type, date: date || new Date().toISOString().split('T')[0], content, data: reportData ? JSON.stringify(reportData) : '{}' });
      try {
        const patientRow = await queryOne('SELECT doctor_id, first_name, last_name FROM patients WHERE id = $1', [patient_id]);
        if (patientRow && patientRow.doctor_id !== req.user.id) {
          const senderRow = await queryOne('SELECT full_name FROM users WHERE id = $1', [req.user.id]);
          const typeLabel = type === 'certificate' ? 'certificat' : type === 'sick_leave' ? "arrêt de travail" : type === 'orientation' ? "lettre d'orientation" : 'document';
          await pgInsert('notifications', { user_id: patientRow.doctor_id, type: 'report_added', title: 'Document ajouté', message: `${senderRow?.full_name || "Un confrère"} a ajouté un ${typeLabel} au dossier de ${patientRow.first_name} ${patientRow.last_name}.`, data: JSON.stringify({ patient_id, report_id: result.id }) });
        }
      } catch {}
      res.status(201).json(result);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.get("/api/medical_reports", authenticateToken, async (req: any, res) => {
    try {
      const rows = await pgQuery('SELECT mr.*, p.first_name, p.last_name FROM medical_reports mr LEFT JOIN patients p ON mr.patient_id = p.id WHERE mr.doctor_id = $1 ORDER BY mr.date DESC', [req.user.id]) || [];
      res.json(rows);
    }
    catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.get("/api/appointments", authenticateToken, async (req: any, res) => {
    try {
      const rows = await pgQuery(`SELECT a.*, p.first_name, p.last_name FROM appointments a LEFT JOIN patients p ON a.patient_id = p.id WHERE a.doctor_id = $1 OR p.doctor_id = $1 ORDER BY a.date ASC, a.hour ASC`, [req.user.id]);
      res.json(rows);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.post("/api/appointments", authenticateToken, async (req: any, res) => {
    const { patient_id, doctor_id, date, hour, reason, duration } = req.body;
    try {
      if (!canManagePatients(req.user)) return res.status(403).json({ error: "Accès administratif uniquement" });
      const appointmentDoctorId = isSecretary(req.user) ? doctor_id : req.user.id;
      if (!appointmentDoctorId) return res.status(400).json({ error: "Médecin requis pour le rendez-vous" });
      const data = await pgInsert('appointments', { patient_id, doctor_id: appointmentDoctorId, date, hour, reason, duration: duration || 30 });
      try {
        const patientRow = await queryOne('SELECT first_name, last_name FROM patients WHERE id = $1', [patient_id]);
        if (patientRow) await pgInsert('notifications', { user_id: req.user.id, type: 'appointment_created', title: 'Nouveau rendez-vous', message: `Rendez-vous programmé pour ${patientRow.first_name} ${patientRow.last_name} le ${date} à ${hour}.`, data: JSON.stringify({ patient_id, appointment_id: data.id, date, hour }) });
      } catch {}
      res.status(201).json(data);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.put("/api/appointments/:id", authenticateToken, async (req: any, res) => {
    const { date, hour, reason, duration, status, patient_name, patient_phone, patient_email, patient_age, patient_sex, patient_commune, patient_wilaya, cancellation_reason, doctor_notes, rescheduled_to_date, rescheduled_to_hour } = req.body;
    try {
      const appt = await queryOne('SELECT a.doctor_id, p.doctor_id as patient_doctor_id FROM appointments a LEFT JOIN patients p ON a.patient_id = p.id WHERE a.id = $1', [req.params.id]);
      if (!appt) return res.status(404).json({ error: "Not found" });
      if (appt.doctor_id !== req.user.id && appt.patient_doctor_id !== req.user.id) return res.status(403).json({ error: "Accès refusé" });
      const updateData: any = {};
      if (date !== undefined) updateData.date = date;
      if (hour !== undefined) updateData.hour = hour;
      if (reason !== undefined) updateData.reason = reason;
      if (duration !== undefined) updateData.duration = duration;
      if (status !== undefined) updateData.status = status;
      if (patient_name !== undefined) updateData.patient_name = patient_name;
      if (patient_phone !== undefined) updateData.patient_phone = patient_phone;
      if (patient_email !== undefined) updateData.patient_email = patient_email;
      if (patient_age !== undefined) updateData.patient_age = patient_age;
      if (patient_sex !== undefined) updateData.patient_sex = patient_sex;
      if (patient_commune !== undefined) updateData.patient_commune = patient_commune;
      if (patient_wilaya !== undefined) updateData.patient_wilaya = patient_wilaya;
      if (cancellation_reason !== undefined) updateData.cancellation_reason = cancellation_reason;
      if (doctor_notes !== undefined) updateData.doctor_notes = doctor_notes;
      if (rescheduled_to_date !== undefined) updateData.rescheduled_to_date = rescheduled_to_date;
      if (rescheduled_to_hour !== undefined) updateData.rescheduled_to_hour = rescheduled_to_hour;
      if (Object.keys(updateData).length === 0) return res.status(400).json({ error: "No fields" });
      const data = await pgUpdate('appointments', parseInt(req.params.id), updateData);
      if (!data) return res.status(404).json({ error: "Not found" });
      res.json(data);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.delete("/api/appointments/:id", authenticateToken, async (req: any, res) => {
    try {
      if (!await queryOne('SELECT a.id FROM appointments a LEFT JOIN patients p ON a.patient_id = p.id WHERE a.id = $1 AND (a.doctor_id = $2 OR p.doctor_id = $2)', [req.params.id, req.user.id])) return res.status(404).json({ error: "Not found" });
      await pgRun('DELETE FROM appointments WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // ── Doctor Confirm / Refuse / Reschedule Appointment ─────────
  app.put("/api/appointments/:id/confirm", authenticateToken, async (req: any, res) => {
    try {
      const appt = await queryOne('SELECT a.*, u.full_name as doctor_name, u.clinic_name, u.address, u.city, u.phone FROM appointments a LEFT JOIN users u ON a.doctor_id = u.id WHERE a.id = $1 AND a.doctor_id = $2', [req.params.id, req.user.id]);
      if (!appt) return res.status(404).json({ error: "Rendez-vous introuvable" });
      if (appt.status !== 'pending') return res.status(400).json({ error: "Seuls les rendez-vous en attente peuvent être confirmés" });
      await pgUpdate('appointments', parseInt(req.params.id), { status: 'confirmed' });
      // Notify patient by email if provided
      if (appt.patient_email) {
        const dateStr = new Date(appt.date).toLocaleDateString('fr-FR');
        await sendAppointmentEmail(appt.patient_email, 'Rendez-vous confirmé - MediCabinet',
          `<div style="font-family:sans-serif;max-width:500px;margin:auto;padding:20px">
            <h2 style="color:#2563eb">Rendez-vous confirmé ✓</h2>
            <p>Bonjour <strong>${appt.patient_name || 'Patient'}</strong>,</p>
            <p>Votre rendez-vous avec <strong>${appt.doctor_name}</strong> a été confirmé.</p>
            <div style="background:#f8fafc;padding:16px;border-radius:12px;margin:16px 0">
              <p><strong>Date :</strong> ${dateStr} à ${appt.hour}</p>
              <p><strong>Cabinet :</strong> ${appt.clinic_name || ''}</p>
              <p><strong>Adresse :</strong> ${[appt.address, appt.city].filter(Boolean).join(', ')}</p>
              <p><strong>Référence :</strong> ${appt.booking_reference || 'N/A'}</p>
            </div>
            <p style="color:#64748b;font-size:12px">Pour annuler, utilisez la référence ci-dessus dans l'application MediAlert.</p>
          </div>`);
      }
      res.json({ success: true, message: "Rendez-vous confirmé" });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.put("/api/appointments/:id/refuse", authenticateToken, async (req: any, res) => {
    const { reason } = req.body;
    try {
      const appt = await queryOne('SELECT a.*, u.full_name as doctor_name FROM appointments a LEFT JOIN users u ON a.doctor_id = u.id WHERE a.id = $1 AND a.doctor_id = $2', [req.params.id, req.user.id]);
      if (!appt) return res.status(404).json({ error: "Rendez-vous introuvable" });
      if (appt.status !== 'pending') return res.status(400).json({ error: "Seuls les rendez-vous en attente peuvent être refusés" });
      await pgUpdate('appointments', parseInt(req.params.id), { status: 'refused', doctor_notes: reason || 'Non disponible' });
      if (appt.patient_email) {
        await sendAppointmentEmail(appt.patient_email, 'Rendez-vous refusé - MediCabinet',
          `<div style="font-family:sans-serif;max-width:500px;margin:auto;padding:20px">
            <h2 style="color:#dc2626">Rendez-vous refusé ✗</h2>
            <p>Bonjour <strong>${appt.patient_name || 'Patient'}</strong>,</p>
            <p>Votre rendez-vous avec <strong>${appt.doctor_name}</strong> du ${appt.date} à ${appt.hour} a été refusé.</p>
            ${reason ? `<p><strong>Motif :</strong> ${reason}</p>` : ''}
            <p style="color:#64748b;font-size:12px">Veuillez prendre un nouveau rendez-vous via l'application MediAlert.</p>
          </div>`);
      }
      res.json({ success: true, message: "Rendez-vous refusé" });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.put("/api/appointments/:id/reschedule", authenticateToken, async (req: any, res) => {
    const { new_date, new_hour, reason } = req.body;
    if (!new_date || !new_hour) return res.status(400).json({ error: "Nouvelle date et heure requises" });
    try {
      const appt = await queryOne('SELECT a.*, u.full_name as doctor_name FROM appointments a LEFT JOIN users u ON a.doctor_id = u.id WHERE a.id = $1 AND a.doctor_id = $2', [req.params.id, req.user.id]);
      if (!appt) return res.status(404).json({ error: "Rendez-vous introuvable" });
      if (appt.status !== 'pending') return res.status(400).json({ error: "Seuls les rendez-vous en attente peuvent être reportés" });
      await pgUpdate('appointments', parseInt(req.params.id), {
        status: 'rescheduled',
        rescheduled_to_date: new_date,
        rescheduled_to_hour: new_hour,
        doctor_notes: reason || ''
      });
      if (appt.patient_email) {
        const oldDate = `${appt.date} à ${appt.hour}`;
        const newDateStr = `${new_date} à ${new_hour}`;
        await sendAppointmentEmail(appt.patient_email, 'Rendez-vous reporté - MediCabinet',
          `<div style="font-family:sans-serif;max-width:500px;margin:auto;padding:20px">
            <h2 style="color:#f59e0b">Rendez-vous reporté ↻</h2>
            <p>Bonjour <strong>${appt.patient_name || 'Patient'}</strong>,</p>
            <p>Votre rendez-vous avec <strong>${appt.doctor_name}</strong> a été reporté.</p>
            <div style="background:#f8fafc;padding:16px;border-radius:12px;margin:16px 0">
              <p><strong>Ancienne date :</strong> ${oldDate}</p>
              <p><strong>Nouvelle date :</strong> ${newDateStr}</p>
              ${reason ? `<p><strong>Motif :</strong> ${reason}</p>` : ''}
            </div>
          </div>`);
      }
      res.json({ success: true, message: "Rendez-vous reporté" });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // ── Working Hours ──────────────────────────────────
  app.get("/api/working-hours", authenticateToken, async (req: any, res) => {
    try {
      const rows = await pgQuery('SELECT * FROM doctor_working_hours WHERE doctor_id = $1 ORDER BY day_of_week', [req.user.id]);
      res.json(rows);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.put("/api/working-hours", authenticateToken, async (req: any, res) => {
    const { hours }: { hours: { day_of_week: number; start_time: string; end_time: string; is_available: boolean }[] } = req.body;
    if (!Array.isArray(hours)) return res.status(400).json({ error: "hours must be an array" });
    try {
      await pgRun('DELETE FROM doctor_working_hours WHERE doctor_id = $1', [req.user.id]);
      for (const h of hours) {
        await pgInsert('doctor_working_hours', {
          doctor_id: req.user.id,
          day_of_week: h.day_of_week,
          start_time: h.start_time,
          end_time: h.end_time,
          is_available: h.is_available
        });
      }
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // ── Public Endpoints (no auth) ─────────────────────
  app.get("/api/public/doctors", async (req, res) => {
    try {
      const { city, specialty } = req.query;
      let sql = `SELECT id, full_name, specialty, clinic_name, address, city, phone, email FROM users WHERE role = 'doctor' AND subscription_status = 'active'`;
      const params: any[] = [];
      if (city) { params.push(`%${city}%`); sql += ` AND LOWER(city) LIKE LOWER($${params.length})`; }
      if (specialty) { params.push(`%${specialty}%`); sql += ` AND LOWER(specialty) LIKE LOWER($${params.length})`; }
      sql += ' ORDER BY full_name ASC';
      const doctors = await pgQuery(sql, params);
      res.json(doctors);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.get("/api/public/doctors/:id/working-hours", async (req, res) => {
    try {
      const rows = await pgQuery('SELECT day_of_week, start_time, end_time, is_available FROM doctor_working_hours WHERE doctor_id = $1 ORDER BY day_of_week', [req.params.id]);
      if (rows.length === 0) {
        // Default working hours: Mon-Fri 8:00-17:00
        const defaults = [];
        for (let d = 1; d <= 5; d++) defaults.push({ day_of_week: d, start_time: '08:00', end_time: '17:00', is_available: true });
        res.json(defaults);
      } else {
        res.json(rows);
      }
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.get("/api/public/appointments/available", async (req, res) => {
    try {
      const { doctor_id, date } = req.query;
      if (!doctor_id || !date) return res.status(400).json({ error: "doctor_id and date required" });
      const dayOfWeek = new Date(date as string).getDay();
      let hours = await pgQuery('SELECT start_time, end_time FROM doctor_working_hours WHERE doctor_id = $1 AND day_of_week = $2 AND is_available = true', [doctor_id, dayOfWeek]);
      if (hours.length === 0) {
        if (dayOfWeek >= 1 && dayOfWeek <= 5) {
          hours = [{ start_time: '08:00', end_time: '17:00' }];
        } else {
          return res.json([]);
        }
      }
      const { start_time, end_time } = hours[0];
      // Generate 30-min slots
      const slots: string[] = [];
      const [startH, startM] = start_time.split(':').map(Number);
      const [endH, endM] = end_time.split(':').map(Number);
      let current = startH * 60 + startM;
      const end = endH * 60 + endM;
      while (current + 30 <= end) {
        const h = Math.floor(current / 60);
        const m = current % 60;
        slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        current += 30;
      }
      // Remove booked slots
      const booked = await pgQuery('SELECT hour FROM appointments WHERE doctor_id = $1 AND date = $2 AND status NOT IN (\'cancelled\', \'refused\')', [doctor_id, date]);
      const bookedHours = new Set(booked.map((b: any) => b.hour));
      const available = slots.filter(s => !bookedHours.has(s));
      res.json(available);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.post("/api/public/appointments/book", async (req, res) => {
    const { doctor_id, patient_name, patient_phone, patient_email, date, hour, reason } = req.body;
    if (!doctor_id || !patient_name || !patient_phone || !date || !hour) {
      return res.status(400).json({ error: "doctor_id, patient_name, patient_phone, date, hour requis" });
    }
    try {
      // Check slot still available
      const conflict = await queryOne('SELECT id FROM appointments WHERE doctor_id = $1 AND date = $2 AND hour = $3 AND status NOT IN (\'cancelled\', \'refused\')', [doctor_id, date, hour]);
      if (conflict) return res.status(409).json({ error: "Ce créneau est déjà réservé" });
      const ref = await generateBookingReference();
      const data = await pgInsert('appointments', {
        doctor_id: parseInt(doctor_id),
        patient_name,
        patient_phone,
        patient_email: patient_email || null,
        date,
        hour,
        reason: reason || '',
        booking_reference: ref,
        source: 'mobile',
        status: 'pending'
      });
      // Notify doctor
      try {
        const doctor = await queryOne('SELECT email, full_name FROM users WHERE id = $1', [doctor_id]);
        if (doctor?.email) {
          await sendAppointmentEmail(doctor.email, 'Nouvelle demande de rendez-vous - MediCabinet',
            `<div style="font-family:sans-serif;max-width:500px;margin:auto;padding:20px">
              <h2 style="color:#2563eb">Nouvelle demande de rendez-vous</h2>
              <p><strong>Patient :</strong> ${patient_name}</p>
              <p><strong>Téléphone :</strong> ${patient_phone}</p>
              <p><strong>Date :</strong> ${date} à ${hour}</p>
              ${reason ? `<p><strong>Motif :</strong> ${reason}</p>` : ''}
              <p><strong>Référence :</strong> ${ref}</p>
              <p style="color:#64748b;font-size:12px">Connectez-vous à MediCabinet pour confirmer ou refuser.</p>
            </div>`);
        }
      } catch {}
      res.status(201).json({ success: true, booking_reference: ref, message: "Demande de rendez-vous envoyée au médecin" });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.get("/api/public/appointments/lookup", async (req, res) => {
    try {
      const { phone } = req.query;
      if (!phone) return res.status(400).json({ error: "phone required" });
      const rows = await pgQuery(`
        SELECT a.id, a.booking_reference, a.patient_name, a.patient_phone, a.patient_email, a.patient_age, a.patient_sex, a.patient_commune, a.patient_wilaya,
               a.date, a.hour, a.reason, a.status, a.source,
               a.cancellation_reason, a.doctor_notes, a.rescheduled_to_date, a.rescheduled_to_hour,
               u.full_name as doctor_name, u.clinic_name, u.address, u.city, u.phone as doctor_phone, u.specialty
        FROM appointments a
        LEFT JOIN users u ON a.doctor_id = u.id
        WHERE a.patient_phone = $1 AND a.source = 'mobile'
        ORDER BY a.date DESC, a.hour DESC
      `, [phone]);
      res.json(rows);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.put("/api/public/appointments/:ref/patient-info", async (req, res) => {
    const { patient_name, patient_age, patient_sex, patient_commune, patient_wilaya } = req.body;
    if (!patient_name && !patient_age && !patient_sex && !patient_commune && !patient_wilaya) {
      return res.status(400).json({ error: "Au moins un champ requis" });
    }
    try {
      const appt = await queryOne('SELECT * FROM appointments WHERE booking_reference = $1', [req.params.ref]);
      if (!appt) return res.status(404).json({ error: "Rendez-vous introuvable" });
      if (appt.status !== 'confirmed') return res.status(400).json({ error: "Le rendez-vous doit être confirmé pour ajouter vos informations" });
      const updateData: any = {};
      if (patient_name !== undefined) updateData.patient_name = patient_name;
      if (patient_age !== undefined) updateData.patient_age = patient_age;
      if (patient_sex !== undefined) updateData.patient_sex = patient_sex;
      if (patient_commune !== undefined) updateData.patient_commune = patient_commune;
      if (patient_wilaya !== undefined) updateData.patient_wilaya = patient_wilaya;
      await pgUpdate('appointments', appt.id, updateData);
      res.json({ success: true, message: "Informations mises à jour" });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.put("/api/public/appointments/:ref/cancel", async (req, res) => {
    const { reason } = req.body;
    try {
      const appt = await queryOne('SELECT * FROM appointments WHERE booking_reference = $1', [req.params.ref]);
      if (!appt) return res.status(404).json({ error: "Rendez-vous introuvable" });
      if (appt.status === 'cancelled') return res.status(400).json({ error: "Déjà annulé" });
      if (appt.status === 'completed') return res.status(400).json({ error: "Rendez-vous déjà passé" });
      await pgUpdate('appointments', appt.id, { status: 'cancelled', cancellation_reason: reason || '' });
      // Notify doctor
      try {
        const doctor = await queryOne('SELECT email FROM users WHERE id = $1', [appt.doctor_id]);
        if (doctor?.email) {
          await sendAppointmentEmail(doctor.email, 'Rendez-vous annulé - MediCabinet',
            `<p>Le rendez-vous du ${appt.date} à ${appt.hour} avec ${appt.patient_name} a été annulé.</p>`);
        }
      } catch {}
      res.json({ success: true, message: "Rendez-vous annulé" });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.get("/api/public/prescriptions/:code", async (req, res) => {
    try {
      const row = await queryOne(`SELECT pr.*, p.first_name, p.last_name, u.full_name as doctor_name, u.clinic_name, u.address, u.city FROM prescriptions pr LEFT JOIN patients p ON pr.patient_id = p.id LEFT JOIN users u ON pr.doctor_id = u.id WHERE pr.prescription_code = $1`, [req.params.code]);
      if (!row) return res.status(404).json({ error: "Ordonnance non trouvée." });
      let medications: any[] = [];
      if (typeof row.data === 'string') {
        try {
          const parsed = JSON.parse(row.data);
          if (Array.isArray(parsed)) medications = parsed.map((m: any) => typeof m === 'object' && m !== null && !Array.isArray(m) ? m : typeof m === 'string' ? { name: m, dosage: '', frequency: '', duration: '', instructions: '', form: '' } : { name: String(m), dosage: '', frequency: '', duration: '', instructions: '', form: '' });
        } catch { medications = []; }
      } else if (Array.isArray(row.data)) {
        medications = row.data.map((m: any) => typeof m === 'object' && m !== null && !Array.isArray(m) ? m : typeof m === 'string' ? { name: m, dosage: '', frequency: '', duration: '', instructions: '', form: '' } : { name: String(m), dosage: '', frequency: '', duration: '', instructions: '', form: '' });
      }
      res.json({
        id: row.id,
        prescription_code: row.prescription_code,
        patient_id: row.patient_id,
        doctor_id: row.doctor_id,
        doctor_name: row.doctor_name || '',
        clinic_name: row.clinic_name || '',
        address: row.address || '',
        city: row.city || '',
        patient_first_name: row.first_name || '',
        patient_last_name: row.last_name || '',
        date_prescription: row.created_at ? row.created_at.toString().split('T')[0] : '',
        status: row.status || 'pending',
        medications
      });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.delete("/api/patients/:id", authenticateToken, async (req: any, res) => {
    try {
      const existing = await queryOne('SELECT doctor_id FROM patients WHERE id = $1', [req.params.id]);
      if (!existing) return res.status(404).json({ error: "Not found" });
      if (existing.doctor_id !== req.user.id) return res.status(403).json({ error: "Forbidden" });
      const sharedRows = await pgQuery('SELECT doctor_id FROM shared_patients WHERE patient_id = $1', [req.params.id]);
      const sharedDoctorIds = sharedRows.map((r: any) => r.doctor_id).filter(Boolean);
      if (sharedDoctorIds.length > 0) await copySharedPatientBeforeDelete(parseInt(req.params.id), sharedDoctorIds);
      await pgRun('DELETE FROM patients WHERE id = $1', [req.params.id]);
      res.json({ success: true, retained_for_shared_doctors: sharedDoctorIds.length });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.post("/api/patients/import", authenticateToken, async (req: any, res) => {
    const patients = req.body;
    if (!Array.isArray(patients)) return res.status(400).json({ error: "Expected array" });
    try {
      for (const p of patients) await pgInsert('patients', { doctor_id: req.user.id, first_name: p.first_name, last_name: p.last_name, nin: p.nin, gender: p.gender, birth_date: p.birth_date, blood_group: p.blood_group, phone: p.phone, email: p.email, address: p.address, city: p.city, wilaya: p.wilaya, profession: p.profession, nss: p.nss, insurance: p.insurance, emergency_contact: p.emergency_contact, medical_history: p.medical_history ? JSON.stringify(p.medical_history) : '{}' });
      res.json({ message: `${patients.length} patients importés avec succès.` });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.get("/api/patients/export", authenticateToken, async (req: any, res) => {
    try { res.json(await pgQuery('SELECT id, first_name, last_name, gender, birth_date, blood_group, phone, email, address, city, wilaya, profession, nss, insurance, nin, emergency_contact, created_at FROM patients WHERE doctor_id = $1 ORDER BY created_at DESC', [req.user.id])); }
    catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.post("/api/auth/forgot-password", async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email requis" });
    try {
      const { data: user } = await db.users.findByEmail(email);
      if (!user) return res.json({ success: true });
      const resetToken = jwt.sign({ id: user.id, email: user.email, purpose: 'reset' }, JWT_SECRET, { expiresIn: '1h' });
      try { await pgInsert('notifications', { user_id: user.id, type: 'password_reset', title: 'Réinitialisation', message: `Code: ${resetToken}`, data: JSON.stringify({ reset_token: resetToken }) }); } catch {}
      try { await transporter.sendMail({ from: `"MediCabinet" <${process.env.SMTP_USER}>`, to: email, subject: "Réinitialisation de mot de passe - MediCabinet", html: `<p>Vous avez demandé une réinitialisation de mot de passe.</p><p>Voici votre code de réinitialisation (valable 1 heure):</p><pre style="background:#f4f4f4;padding:12px;font-size:14px;word-break:break-all;">${resetToken}</pre><p>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>` }); } catch {}
      try { await transporter.sendMail({ from: `"MediCabinet" <${process.env.SMTP_USER}>`, to: 'gacemiamine@gmail.com', subject: `Demande de réinitialisation - ${user.full_name || email}`, text: `L'utilisateur ${user.full_name || email} (ID: ${user.id}) a demandé une réinitialisation de mot de passe.` }); } catch {}
      res.json({ success: true, message: "Si cet email existe, un lien a été envoyé." });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: "Token et mot de passe requis" });
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      if (decoded.purpose !== 'reset') return res.status(400).json({ error: "Token invalide" });
      await pgRun('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(password, 10), decoded.id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Token invalide ou expiré" }); }
  });

  app.put("/api/auth/update-profile", authenticateToken, async (req: any, res) => {
    const { full_name, clinic_name, current_password, new_password } = req.body;
    try {
      if (new_password) {
        if (!current_password) return res.status(400).json({ error: "Mot de passe actuel requis" });
        const userRow = await queryOne('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
        if (!userRow) return res.status(404).json({ error: "Utilisateur non trouvé" });
        const valid = await bcrypt.compare(current_password, userRow.password_hash);
        if (!valid) return res.status(400).json({ error: "Mot de passe actuel incorrect" });
        await pgRun('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(new_password, 10), req.user.id]);
      }
      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;
      if (full_name !== undefined) { updates.push(`full_name = $${idx++}`); values.push(full_name); }
      if (clinic_name !== undefined) { updates.push(`clinic_name = $${idx++}`); values.push(clinic_name); }
      if (updates.length > 0) {
        values.push(req.user.id);
        await pgRun(`UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`, values);
      }
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.get("/api/laboratories", authenticateToken, async (req: any, res) => {
    try { res.json(await pgQuery("SELECT id, email, full_name, clinic_name, city FROM users WHERE role = 'laboratory' ORDER BY full_name ASC")); }
    catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.get("/api/imaging-centers", authenticateToken, async (req: any, res) => {
    try { res.json(await pgQuery("SELECT id, email, full_name, clinic_name, city FROM users WHERE role = 'imaging_center' ORDER BY full_name ASC")); }
    catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.get("/api/lab-requests", authenticateToken, async (req: any, res) => {
    try {
      if (req.user.role === 'laboratory') {
        res.json(await pgQuery('SELECT lr.*, u.full_name as doctor_name, ic.clinic_name as imaging_center_name FROM lab_requests lr LEFT JOIN users u ON lr.requested_by_id = u.id LEFT JOIN users ic ON lr.imaging_center_id = ic.id WHERE lr.lab_id = $1 OR lr.lab_id IS NULL ORDER BY lr.created_at DESC', [req.user.id]));
      } else if (req.user.role === 'imaging_center') {
        res.json(await pgQuery('SELECT lr.*, u.full_name as doctor_name FROM lab_requests lr LEFT JOIN users u ON lr.requested_by_id = u.id WHERE lr.imaging_center_id = $1 OR lr.imaging_center_id IS NULL ORDER BY lr.created_at DESC', [req.user.id]));
      } else if (isDoctor(req.user)) {
        res.json(await pgQuery('SELECT lr.*, u.clinic_name as lab_name, ic.clinic_name as imaging_center_name FROM lab_requests lr LEFT JOIN users u ON lr.lab_id = u.id LEFT JOIN users ic ON lr.imaging_center_id = ic.id WHERE lr.requested_by_id = $1 ORDER BY lr.created_at DESC', [req.user.id]));
      } else {
        res.status(403).json({ error: "Accès laboratoire/médecin uniquement" });
      }
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.post("/api/lab-requests", authenticateToken, async (req: any, res) => {
    const { patient_id, lab_id, imaging_center_id, requested_analyses, exam_category } = req.body;
    try {
      if (!isDoctor(req.user)) return res.status(403).json({ error: "Médecins uniquement" });
      if (!await checkAccess(patient_id, req.user.id)) return res.status(403).json({ error: "No access" });
      const patient = await queryOne('SELECT first_name, last_name, birth_date, age FROM patients WHERE id = $1', [patient_id]);
      if (!patient) return res.status(404).json({ error: "Patient introuvable" });
      const patAge = patient.age || (patient.birth_date ? new Date().getFullYear() - new Date(patient.birth_date).getFullYear() : null);
      const category = exam_category || (imaging_center_id ? 'radiologique' : 'biologique');
      const data = await pgInsert('lab_requests', { patient_id, requested_by_id: req.user.id, lab_id, imaging_center_id, patient_first_name: patient.first_name, patient_last_name: patient.last_name, patient_age: patAge, requested_analyses: JSON.stringify(requested_analyses || []), exam_category: category });
      if (lab_id) await pgInsert('notifications', { user_id: lab_id, type: 'lab_request', title: 'Nouvelle demande d\'analyse', message: `${patient.first_name} ${patient.last_name} - analyses demandées.`, data: JSON.stringify({ lab_request_id: data.id }) });
      if (imaging_center_id) await pgInsert('notifications', { user_id: imaging_center_id, type: 'lab_request', title: 'Nouvelle demande d\'imagerie', message: `${patient.first_name} ${patient.last_name} - examens d\'imagerie demandés.`, data: JSON.stringify({ lab_request_id: data.id }) });
      res.status(201).json(data);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.put("/api/lab-requests/:id/refuse", authenticateToken, async (req: any, res) => {
    const { reason } = req.body;
    try {
      if (req.user.role !== 'laboratory' && req.user.role !== 'imaging_center') return res.status(403).json({ error: "Laboratoire/imagerie uniquement" });
      const request = await queryOne(`SELECT requested_by_id, exam_category, patient_first_name, patient_last_name FROM lab_requests WHERE id = $1 AND status = 'requested' AND (lab_id = $2 OR imaging_center_id = $2 OR lab_id IS NULL)`, [req.params.id, req.user.id]);
      if (!request) return res.status(404).json({ error: "Demande introuvable" });
      const data = await pgUpdate('lab_requests', parseInt(req.params.id), { status: 'refused', refusal_reason: reason || 'Non spécifié' });
      const isImaging = request.exam_category === 'radiologique';
      await pgInsert('notifications', { user_id: request.requested_by_id, type: 'lab_result', title: isImaging ? "Demande d'imagerie refusée" : "Demande d'analyse refusée", message: `Votre demande pour ${request.patient_first_name || ''} ${request.patient_last_name || ''} a été refusée : ${reason || 'Non spécifié'}`, data: JSON.stringify({ lab_request_id: data.id }) });
      res.json(data);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.put("/api/lab-requests/:id/complete", authenticateToken, async (req: any, res) => {
    const { report_pdf, report_text } = req.body;
    try {
      if (req.user.role !== 'laboratory' && req.user.role !== 'imaging_center') return res.status(403).json({ error: "Laboratoire/imagerie uniquement" });
      const request = await queryOne('SELECT requested_by_id, reports, exam_category FROM lab_requests WHERE id = $1 AND (lab_id = $2 OR imaging_center_id = $2)', [req.params.id, req.user.id]);
      if (!request) return res.status(404).json({ error: "Demande introuvable" });
      const newReport = { text: report_text || '', pdf: report_pdf || '', created_at: new Date().toISOString(), author: req.user.role };
      const existingReports = typeof request.reports === 'string' ? (JSON.parse(request.reports) || []) : (request.reports || []);
      existingReports.push(newReport);
      const data = await pgUpdate('lab_requests', parseInt(req.params.id), { report_pdf, report_text, reports: JSON.stringify(existingReports), status: 'completed', completed_at: new Date().toISOString() });
      const isImaging = request.exam_category === 'radiologique';
      await pgInsert('notifications', { user_id: request.requested_by_id, type: 'lab_result', title: isImaging ? 'Résultat imagerie disponible' : 'Résultat laboratoire disponible', message: isImaging ? 'Un centre d\'imagerie a répondu à votre demande.' : 'Un laboratoire a répondu à votre demande d\'analyse.', data: JSON.stringify({ lab_request_id: data.id }) });
      res.json(data);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.put("/api/lab-requests/:id/report", authenticateToken, async (req: any, res) => {
    const { report_pdf, report_text, indication, provider, result, notes } = req.body;
    try {
      if (req.user.role === 'laboratory' || req.user.role === 'imaging_center') {
        const request = await queryOne('SELECT requested_by_id, reports, exam_category FROM lab_requests WHERE id = $1 AND (lab_id = $2 OR imaging_center_id = $2)', [req.params.id, req.user.id]);
        if (!request) return res.status(404).json({ error: "Demande introuvable" });
        const newReport = { text: report_text || '', pdf: report_pdf || '', created_at: new Date().toISOString(), author: req.user.role };
        const existingReports = typeof request.reports === 'string' ? (JSON.parse(request.reports) || []) : (request.reports || []);
        existingReports.push(newReport);
        const updated = await pgUpdate('lab_requests', parseInt(req.params.id), { reports: JSON.stringify(existingReports) });
        const isImaging = request.exam_category === 'radiologique';
        await pgInsert('notifications', { user_id: request.requested_by_id, type: 'lab_result', title: isImaging ? 'Nouveau rapport imagerie' : 'Nouveau rapport laboratoire', message: isImaging ? 'Un centre d\'imagerie a ajouté un rapport.' : 'Un laboratoire a ajouté un rapport.', data: JSON.stringify({ lab_request_id: updated.id }) });
        res.json(updated);
      } else if (isDoctor(req.user)) {
        const request = await queryOne('SELECT requested_by_id, reports FROM lab_requests WHERE id = $1 AND requested_by_id = $2', [req.params.id, req.user.id]);
        if (!request) return res.status(404).json({ error: "Demande introuvable" });
        const newReport = { text: result || report_text || '', pdf: report_pdf || '', indication: indication || '', provider: provider || '', result: result || '', notes: notes || '', created_at: new Date().toISOString(), author: 'doctor' };
        const existingReports = typeof request.reports === 'string' ? (JSON.parse(request.reports) || []) : (request.reports || []);
        existingReports.push(newReport);
        const updated = await pgUpdate('lab_requests', parseInt(req.params.id), { reports: JSON.stringify(existingReports) });
        res.json(updated);
      } else {
        res.status(403).json({ error: "Accès refusé" });
      }
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.delete("/api/lab-requests/:id/report/:index", authenticateToken, async (req: any, res) => {
    try {
      const request = await queryOne('SELECT requested_by_id, reports FROM lab_requests WHERE id = $1', [req.params.id]);
      if (!request) return res.status(404).json({ error: "Demande introuvable" });
      if (!isDoctor(req.user) || request.requested_by_id !== req.user.id) return res.status(403).json({ error: "Accès refusé" });
      const existingReports = typeof request.reports === 'string' ? (JSON.parse(request.reports) || []) : (request.reports || []);
      const idx = parseInt(req.params.index);
      if (idx < 0 || idx >= existingReports.length) return res.status(404).json({ error: "Rapport introuvable" });
      existingReports.splice(idx, 1);
      await pgUpdate('lab_requests', parseInt(req.params.id), { reports: JSON.stringify(existingReports) });
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.delete("/api/lab-requests/:id", authenticateToken, async (req: any, res) => {
    try {
      const request = await queryOne('SELECT patient_id, requested_by_id FROM lab_requests WHERE id = $1', [req.params.id]);
      if (!request) return res.status(404).json({ error: "Demande introuvable" });
      if (!isDoctor(req.user) || request.requested_by_id !== req.user.id) return res.status(403).json({ error: "Accès refusé" });
      await pgRun('DELETE FROM lab_requests WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.get("/api/lab-requests/:id/report/:index", authenticateToken, async (req: any, res) => {
    try {
      const request = await queryOne('SELECT reports, report_pdf FROM lab_requests WHERE id = $1', [req.params.id]);
      if (!request) return res.status(404).json({ error: "Demande introuvable" });
      if (req.user.role !== 'laboratory' && req.user.role !== 'imaging_center' && !isDoctor(req.user)) return res.status(403).json({ error: "Accès refusé" });
      const reports = typeof request.reports === 'string' ? (JSON.parse(request.reports) || []) : (request.reports || []);
      const idx = parseInt(req.params.index);
      if (idx >= 0 && idx < reports.length && reports[idx].pdf) {
        const matches = reports[idx].pdf.match(/^data:(.+);base64,(.+)$/);
        if (matches) {
          const buffer = Buffer.from(matches[2], 'base64');
          res.setHeader('Content-Type', matches[1]);
          res.setHeader('Content-Disposition', `inline; filename="rapport-${req.params.id}-${idx}.pdf"`);
          return res.send(buffer);
        }
      }
      if (idx === 0 && request.report_pdf) {
        const matches = request.report_pdf.match(/^data:(.+);base64,(.+)$/);
        if (matches) {
          const buffer = Buffer.from(matches[2], 'base64');
          res.setHeader('Content-Type', matches[1]);
          res.setHeader('Content-Disposition', `inline; filename="rapport-${req.params.id}.pdf"`);
          return res.send(buffer);
        }
      }
      res.status(404).json({ error: "Rapport introuvable" });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.get("/api/medical-messages", authenticateToken, async (req: any, res) => {
    try {
      res.json(await pgQuery(`SELECT mc.*, s.full_name as sender_name, r.full_name as recipient_name FROM medical_collaborations mc JOIN users s ON mc.sender_id = s.id JOIN users r ON mc.recipient_id = r.id WHERE mc.sender_id = $1 OR mc.recipient_id = $1 ORDER BY mc.created_at DESC`, [req.user.id]));
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.post("/api/medical-messages", authenticateToken, async (req: any, res) => {
    const { recipient_id, patient_id, subject, message } = req.body;
    try {
      if (!isDoctor(req.user)) return res.status(403).json({ error: "Communication médicale réservée aux médecins" });
      const recipient = await queryOne("SELECT id FROM users WHERE id = $1 AND role IN ('doctor','laboratory')", [recipient_id]);
      if (!recipient) return res.status(400).json({ error: "Destinataire médical introuvable" });
      const data = await pgInsert('medical_collaborations', { sender_id: req.user.id, recipient_id, patient_id, subject, message });
      await pgInsert('notifications', { user_id: recipient_id, type: 'medical_message', title: subject || 'Message médical', message, data: JSON.stringify({ message_id: data.id, patient_id }) });
      res.status(201).json(data);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.get("/api/patients/:id/messages", authenticateToken, async (req: any, res) => {
    try {
      if (!isDoctor(req.user)) return res.status(403).json({ error: "Médecins uniquement" });
      const messages = await pgQuery(`SELECT mc.*, s.full_name as sender_name, r.full_name as recipient_name FROM medical_collaborations mc JOIN users s ON mc.sender_id = s.id JOIN users r ON mc.recipient_id = r.id WHERE mc.patient_id = $1 AND (mc.sender_id = $2 OR mc.recipient_id = $2) ORDER BY mc.created_at ASC`, [req.params.id, req.user.id]);
      res.json(messages);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.put("/api/medical-messages/:id/read", authenticateToken, async (req: any, res) => {
    try {
      await pgRun('UPDATE medical_collaborations SET is_read = 1 WHERE id = $1 AND recipient_id = $2', [req.params.id, req.user.id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.get("/api/prescriptions/pharmacist", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'pharmacist') return res.status(403).json({ error: "Pharmacists only" });
    try {
      const rows = await pgQuery(`SELECT pr.*, p.first_name, p.last_name, u.full_name as doctor_name FROM prescriptions pr LEFT JOIN patients p ON pr.patient_id = p.id LEFT JOIN users u ON pr.doctor_id = u.id ORDER BY pr.created_at DESC`);
      res.json(rows);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.post("/api/prescriptions", authenticateToken, async (req: any, res) => {
    const { consultation_id, patient_id, data: prescriptionData } = req.body;
    try {
      if (!canUseMedicalFeatures(req.user)) return res.status(403).json({ error: "Fonctions médicales réservées aux médecins" });
      const patientData = await queryOne('SELECT nin FROM patients WHERE id = $1', [patient_id]);
      const { code: prescriptionCode, nextSeq } = await generatePrescriptionCode(req.user.id, patientData?.nin || "NO-NIN");
      const data = await pgInsert('prescriptions', { consultation_id, patient_id, doctor_id: req.user.id, prescription_code: prescriptionCode, sequential_number: nextSeq, data: prescriptionData ? JSON.stringify(prescriptionData) : '[]' });
      res.status(201).json(data);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.get("/api/prescriptions/search/:code", authenticateToken, async (req: any, res) => {
    try {
      const row = await queryOne(`SELECT pr.*, p.first_name, p.last_name, u.full_name as doctor_name FROM prescriptions pr LEFT JOIN patients p ON pr.patient_id = p.id LEFT JOIN users u ON pr.doctor_id = u.id WHERE pr.prescription_code = $1`, [req.params.code]);
      if (!row) return res.status(404).json({ error: "Ordonnance non trouvée." });
      res.json(row);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.put("/api/prescriptions/:id/dispense", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'pharmacist') return res.status(403).json({ error: "Pharmacists only" });
    const { dispensed_items } = req.body;
    try {
      const existing = await queryOne('SELECT dispensed_data, doctor_id, patient_id, prescription_code FROM prescriptions WHERE id = $1', [req.params.id]);
      if (!existing) return res.status(404).json({ error: "Not found" });
      const oldDispensed = Array.isArray(existing.dispensed_data) ? existing.dispensed_data : [];
      const merged = [...oldDispensed];
      (dispensed_items || []).forEach((newItem: any) => { const idx = merged.findIndex((m: any) => m.name === newItem.name && m.dosage === newItem.dosage); if (idx > -1) merged[idx] = newItem; else merged.push(newItem); });
      const data = await pgUpdate('prescriptions', parseInt(req.params.id), { status: 'dispensed', pharmacist_id: req.user.id, dispensed_data: JSON.stringify(merged), dispensed_at: new Date().toISOString() });
      try {
        const pharmacistRow = await queryOne('SELECT full_name FROM users WHERE id = $1', [req.user.id]);
        const patientRow = await queryOne('SELECT first_name, last_name FROM patients WHERE id = $1', [existing.patient_id]);
        if (existing.doctor_id && pharmacistRow) await pgInsert('notifications', { user_id: existing.doctor_id, type: 'prescription_dispensed', title: 'Ordonnance délivrée', message: `${pharmacistRow.full_name} a délivré l'ordonnance ${existing.prescription_code || ''}.`, data: JSON.stringify({ prescription_id: data.id }) });
      } catch {}
      res.json(data);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.get("/api/prescriptions/patient/:patientId", authenticateToken, async (req: any, res) => {
    try {
      const rows = await pgQuery(`SELECT pr.*, u.full_name as doctor_name FROM prescriptions pr LEFT JOIN users u ON pr.doctor_id = u.id WHERE pr.patient_id = $1 ORDER BY pr.created_at DESC`, [req.params.patientId]);
      res.json(rows);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.get("/api/dashboard/stats", authenticateToken, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const today = new Date().toISOString().split('T')[0];
      const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
      res.json({
        totalPatients: await pgCount('patients', 'doctor_id = $1', [userId]),
        appointmentsToday: await pgCount('appointments', 'doctor_id = $1 AND date = $2', [userId, today]),
        consultationsThisMonth: await pgCount('consultations', 'doctor_id = $1 AND date >= $2', [userId, firstOfMonth]),
      });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => console.log(`Server running on http://localhost:${PORT}`));
}

startServer();
