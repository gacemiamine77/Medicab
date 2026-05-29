import { query, queryOne, execute } from './pg-db.js';

type DbResult<T = any> = { data: T | null; error: any | null; count?: number | null };

export async function pgQuery(sql: string, params: any[] = []): Promise<any[]> {
  return query(sql, params);
}

export async function pgGet(sql: string, params: any[] = []): Promise<any | null> {
  return queryOne(sql, params);
}

export async function pgRun(sql: string, params: any[] = []): Promise<void> {
  await execute(sql, params);
}

export async function pgInsert(table: string, data: Record<string, any>): Promise<any> {
  const keys = Object.keys(data);
  const values = keys.map(k => data[k]);
  const cols = keys.join(', ');
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const result = await query(
    `INSERT INTO ${table} (${cols}) VALUES (${placeholders}) RETURNING *`,
    values
  );
  return result[0];
}

export async function pgUpdate(table: string, id: number, data: Record<string, any>): Promise<any> {
  const keys = Object.keys(data);
  const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = keys.map(k => data[k]);
  const result = await query(
    `UPDATE ${table} SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`,
    [...values, id]
  );
  return result[0];
}

export async function pgCount(table: string, where: string = '1=1', params: any[] = []): Promise<number> {
  const row = await queryOne(`SELECT COUNT(*) as count FROM ${table} WHERE ${where}`, params);
  return parseInt(row?.count || '0', 10);
}

export const db = {
  users: {
    async findByEmail(email: string): Promise<DbResult> {
      const user = await queryOne(`SELECT * FROM users WHERE email = $1`, [email]);
      return { data: user, error: null };
    },
    async findById(id: number): Promise<DbResult> {
      const user = await queryOne(`SELECT * FROM users WHERE id = $1`, [id]);
      return { data: user, error: null };
    },
  },

  doctors: {
    async findAll(excludeId: number): Promise<DbResult> {
      const data = await query(
        `SELECT id, email, full_name, specialty, clinic_name, city FROM users WHERE role = 'doctor' AND id != $1 ORDER BY full_name ASC`,
        [excludeId]
      );
      return { data, error: null };
    },
  },

  patients: {
    async findByDoctor(doctorId: number): Promise<DbResult> {
      const data = await query(
        `SELECT * FROM patients WHERE doctor_id = $1 ORDER BY last_name ASC`,
        [doctorId]
      );
      return { data, error: null };
    },
    async findById(id: number): Promise<DbResult> {
      const data = await queryOne(`SELECT * FROM patients WHERE id = $1`, [id]);
      return { data, error: null };
    },
    async countByDoctor(doctorId: number): Promise<DbResult> {
      const count = await pgCount('patients', 'doctor_id = $1', [doctorId]);
      return { data: null, error: null, count };
    },
  },
};
