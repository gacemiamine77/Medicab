import pkg from 'pg';
const { Pool } = pkg;

let pool: pkg.Pool | null = null;

export function getPool(): pkg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    pool = new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
  }
  return pool;
}

export async function query(sql: string, params: any[] = []): Promise<any[]> {
  const client = getPool();
  const result = await client.query(sql, params);
  return result.rows;
}

export async function queryOne(sql: string, params: any[] = []): Promise<any | null> {
  const rows = await query(sql, params);
  return rows[0] || null;
}

export async function execute(sql: string, params: any[] = []): Promise<pkg.QueryResult> {
  const client = getPool();
  return client.query(sql, params);
}

export async function initTables(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'doctor',
      account_number TEXT UNIQUE,
      national_number TEXT,
      clinic_name TEXT,
      address TEXT,
      city TEXT,
      specialty TEXT,
      register_number TEXT,
      phone TEXT,
      subscription_type TEXT,
      subscription_status TEXT DEFAULT 'active',
      subscription_start_date TEXT,
      subscription_end_date TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS patients (
      id SERIAL PRIMARY KEY,
      doctor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      nin TEXT UNIQUE,
      gender TEXT,
      birth_date TEXT,
      blood_group TEXT,
      photo TEXT,
      phone TEXT,
      phone_secondary TEXT,
      email TEXT,
      address TEXT,
      city TEXT,
      wilaya TEXT,
      profession TEXT,
      nss TEXT,
      insurance TEXT,
      mutuelle TEXT,
      emergency_contact TEXT,
      age INTEGER,
      medical_history JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS consultations (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
      doctor_id INTEGER REFERENCES users(id),
      date TEXT DEFAULT (CURRENT_DATE::TEXT),
      hour TEXT,
      reason TEXT,
      symptoms TEXT,
      diagnosis TEXT,
      temperature REAL,
      bp TEXT,
      weight REAL,
      height REAL,
      imc REAL,
      saturation INTEGER,
      glycemia REAL,
      notes TEXT,
      medications JSONB DEFAULT '[]',
      prescription_code TEXT,
      fee REAL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS prescriptions (
      id SERIAL PRIMARY KEY,
      consultation_id INTEGER REFERENCES consultations(id) ON DELETE SET NULL,
      patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
      doctor_id INTEGER REFERENCES users(id),
      pharmacist_id INTEGER REFERENCES users(id),
      prescription_code TEXT UNIQUE,
      sequential_number INTEGER,
      status TEXT DEFAULT 'pending',
      data JSONB,
      dispensed_data JSONB DEFAULT '[]',
      dispensed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
      doctor_id INTEGER REFERENCES users(id),
      date TEXT,
      hour TEXT,
      reason TEXT,
      duration INTEGER DEFAULT 30,
      status TEXT DEFAULT 'scheduled',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS medical_exams (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
      doctor_id INTEGER REFERENCES users(id),
      type TEXT,
      sub_type TEXT,
      date TEXT,
      provider TEXT,
      indication TEXT,
      result TEXT,
      notes TEXT,
      attachments JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS medical_reports (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
      doctor_id INTEGER REFERENCES users(id),
      type TEXT NOT NULL,
      date TEXT DEFAULT (CURRENT_DATE::TEXT),
      content TEXT,
      data JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS shared_patients (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
      doctor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      shared_by_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      access_type TEXT DEFAULT 'view',
      priority TEXT DEFAULT 'normal',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(patient_id, doctor_id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT,
      data JSONB,
      is_read INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS medications_library (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      dosage TEXT,
      unit TEXT,
      packaging TEXT,
      dci TEXT,
      form TEXT,
      abbreviation TEXT,
      posology TEXT,
      classe TEXT,
      doctor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS dci_interactions (
      id SERIAL PRIMARY KEY,
      dci1 TEXT NOT NULL,
      dci2 TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'moderate',
      description TEXT NOT NULL DEFAULT 'surveillance',
      doctor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_dci_interactions_d1 ON dci_interactions(dci1);
    CREATE INDEX IF NOT EXISTS idx_dci_interactions_d2 ON dci_interactions(dci2);

    CREATE TABLE IF NOT EXISTS prescription_templates (
      id SERIAL PRIMARY KEY,
      doctor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      medications JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE prescription_templates ADD COLUMN IF NOT EXISTS name TEXT;
    ALTER TABLE prescription_templates ADD COLUMN IF NOT EXISTS medications JSONB DEFAULT '[]';
    ALTER TABLE prescription_templates ADD COLUMN IF NOT EXISTS doctor_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

    CREATE TABLE IF NOT EXISTS paraclinical_exams (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'Biologie',
      doctor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS lab_analyses (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      doctor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS consultation_motifs (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      doctor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS diagnoses (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      doctor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS lab_requests (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
      requested_by_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      lab_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      patient_first_name TEXT,
      patient_last_name TEXT,
      patient_age INTEGER,
      requested_analyses JSONB DEFAULT '[]',
      report_pdf TEXT,
      report_text TEXT,
      status TEXT DEFAULT 'requested',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      imaging_center_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      exam_category TEXT DEFAULT 'biologique',
      refusal_reason TEXT,
      reports JSONB DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS medical_collaborations (
      id SERIAL PRIMARY KEY,
      sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      recipient_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS share_permissions (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
      doctor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      shared_by_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      can_view_medical_history INTEGER DEFAULT 1,
      can_view_consultations INTEGER DEFAULT 1,
      can_view_exams INTEGER DEFAULT 1,
      can_view_reports INTEGER DEFAULT 1,
      can_view_documents INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(patient_id, doctor_id)
    );

    CREATE TABLE IF NOT EXISTS transferred_patients (
      id SERIAL PRIMARY KEY,
      original_patient_id INTEGER NOT NULL,
      copied_patient_id INTEGER NOT NULL,
      doctor_id INTEGER NOT NULL,
      transferred_by_id INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS secretary_links (
      id SERIAL PRIMARY KEY,
      secretary_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      doctor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(secretary_id, doctor_id)
    );

    CREATE TABLE IF NOT EXISTS contact_messages (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS user_settings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
      settings JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    `);
  try {
    const colCheck = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'lab_requests' AND column_name = 'reports'");
    if (colCheck.rows.length === 0) await pool.query("ALTER TABLE lab_requests ADD COLUMN reports JSONB DEFAULT '[]'");
  } catch {}
  try {
    const colCheck = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'shared_patients' AND column_name = 'priority'");
    if (colCheck.rows.length === 0) await pool.query("ALTER TABLE shared_patients ADD COLUMN priority TEXT DEFAULT 'normal'");
  } catch {}
  try {
    const colCheck = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'medications_library' AND column_name = 'unit'");
    if (colCheck.rows.length === 0) await pool.query("ALTER TABLE medications_library ADD COLUMN unit TEXT");
  } catch {}
  try {
    const colCheck = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'medications_library' AND column_name = 'packaging'");
    if (colCheck.rows.length === 0) await pool.query("ALTER TABLE medications_library ADD COLUMN packaging TEXT");
  } catch {}
  try {
    const colCheck = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'medications_library' AND column_name = 'dci'");
    if (colCheck.rows.length === 0) await pool.query("ALTER TABLE medications_library ADD COLUMN dci TEXT");
  } catch {}
  try {
    const colCheck = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'medications_library' AND column_name = 'abbreviation'");
    if (colCheck.rows.length === 0) await pool.query("ALTER TABLE medications_library ADD COLUMN abbreviation TEXT");
  } catch {}
  try {
    const colCheck = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'paraclinical_exams' AND column_name = 'type'");
    if (colCheck.rows.length === 0) await pool.query("ALTER TABLE paraclinical_exams ADD COLUMN type TEXT DEFAULT 'Biologie'");
  } catch {}
  try {
    const colCheck = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'medications_library' AND column_name = 'classe'");
    if (colCheck.rows.length === 0) await pool.query("ALTER TABLE medications_library ADD COLUMN classe TEXT");
  } catch {}
  try {
    const colCheck = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'shared_patients' AND column_name = 'share_reason'");
    if (colCheck.rows.length === 0) await pool.query("ALTER TABLE shared_patients ADD COLUMN share_reason TEXT DEFAULT ''");
  } catch {}
  try {
    const colCheck = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'medications_library' AND column_name = 'doctor_id'");
    if (colCheck.rows.length === 0) await pool.query("ALTER TABLE medications_library ADD COLUMN doctor_id INTEGER REFERENCES users(id) ON DELETE CASCADE");
  } catch {}
  try {
    const colCheck = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'medication_interactions' AND column_name = 'doctor_id'");
    if (colCheck.rows.length === 0) await pool.query("ALTER TABLE medication_interactions ADD COLUMN doctor_id INTEGER REFERENCES users(id) ON DELETE CASCADE");
  } catch {}
  try {
    const colCheck = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'paraclinical_exams' AND column_name = 'doctor_id'");
    if (colCheck.rows.length === 0) await pool.query("ALTER TABLE paraclinical_exams ADD COLUMN doctor_id INTEGER REFERENCES users(id) ON DELETE CASCADE");
  } catch {}
  try {
    const colCheck = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'lab_analyses' AND column_name = 'doctor_id'");
    if (colCheck.rows.length === 0) await pool.query("ALTER TABLE lab_analyses ADD COLUMN doctor_id INTEGER REFERENCES users(id) ON DELETE CASCADE");
  } catch {}
  try {
    const colCheck = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'consultation_motifs' AND column_name = 'doctor_id'");
    if (colCheck.rows.length === 0) await pool.query("ALTER TABLE consultation_motifs ADD COLUMN doctor_id INTEGER REFERENCES users(id) ON DELETE CASCADE");
  } catch {}
  try {
    await pool.query("DROP INDEX IF EXISTS paraclinical_exams_name_key");
  } catch {}
  try {
    await pool.query("DROP INDEX IF EXISTS lab_analyses_name_key");
  } catch {}
  try {
    await pool.query("DROP INDEX IF EXISTS consultation_motifs_name_key");
  } catch {}
  try {
    const colCheck = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'lab_requests' AND column_name = 'imaging_center_id'");
    if (colCheck.rows.length === 0) await pool.query("ALTER TABLE lab_requests ADD COLUMN imaging_center_id INTEGER REFERENCES users(id) ON DELETE SET NULL");
  } catch {}
  try {
    const colCheck = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'lab_requests' AND column_name = 'exam_category'");
    if (colCheck.rows.length === 0) await pool.query("ALTER TABLE lab_requests ADD COLUMN exam_category TEXT DEFAULT 'biologique'");
  } catch {}
  try {
    const colCheck = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'patients' AND column_name = 'age'");
    if (colCheck.rows.length === 0) await pool.query("ALTER TABLE patients ADD COLUMN age INTEGER");
  } catch {}
  try {
    const colCheck = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'lab_requests' AND column_name = 'refusal_reason'");
    if (colCheck.rows.length === 0) await pool.query("ALTER TABLE lab_requests ADD COLUMN refusal_reason TEXT");
  } catch {}
  try {
    const colCheck = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'booking_reference'");
    if (colCheck.rows.length === 0) await pool.query("ALTER TABLE appointments ADD COLUMN booking_reference TEXT UNIQUE");
  } catch {}
  try {
    const colCheck = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'patient_name'");
    if (colCheck.rows.length === 0) await pool.query("ALTER TABLE appointments ADD COLUMN patient_name TEXT");
  } catch {}
  try {
    const colCheck = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'patient_phone'");
    if (colCheck.rows.length === 0) await pool.query("ALTER TABLE appointments ADD COLUMN patient_phone TEXT");
  } catch {}
  try {
    const colCheck = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'patient_email'");
    if (colCheck.rows.length === 0) await pool.query("ALTER TABLE appointments ADD COLUMN patient_email TEXT");
  } catch {}
  try {
    const colCheck = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'cancellation_reason'");
    if (colCheck.rows.length === 0) await pool.query("ALTER TABLE appointments ADD COLUMN cancellation_reason TEXT");
  } catch {}
  try {
    const colCheck = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'doctor_notes'");
    if (colCheck.rows.length === 0) await pool.query("ALTER TABLE appointments ADD COLUMN doctor_notes TEXT");
  } catch {}
  try {
    const colCheck = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'rescheduled_to_date'");
    if (colCheck.rows.length === 0) await pool.query("ALTER TABLE appointments ADD COLUMN rescheduled_to_date TEXT");
  } catch {}
  try {
    const colCheck = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'rescheduled_to_hour'");
    if (colCheck.rows.length === 0) await pool.query("ALTER TABLE appointments ADD COLUMN rescheduled_to_hour TEXT");
  } catch {}
  try {
    const colCheck = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'source'");
    if (colCheck.rows.length === 0) await pool.query("ALTER TABLE appointments ADD COLUMN source TEXT DEFAULT 'web'");
  } catch {}
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS doctor_working_hours (
        id SERIAL PRIMARY KEY,
        doctor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        day_of_week INTEGER NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        is_available BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(doctor_id, day_of_week)
      );
    `);
  } catch {}
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
