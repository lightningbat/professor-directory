import type { Db } from './db.js';
import type { FilterOptions, ProfessorPage, ProfessorQuery, ProfessorRecord, Stats } from './types.js';

interface Row {
  id: string;
  name: string;
  profile_url: string | null;
  college: string;
  department: string;
  designation: string;
  email_count: number;
}

// Escape LIKE wildcards so user input is matched literally.
const likeToken = (token: string) => `%${token.replace(/[\\%_]/g, '\\$&')}%`;

export class ProfessorRepository {
  constructor(private readonly db: Db) {}

  search({ q, college, department, designation, page, pageSize }: ProfessorQuery): ProfessorPage<ProfessorRecord> {
    const where: string[] = [];
    const params: Record<string, string | number> = {};

    if (college) { where.push('p.college = @college'); params.college = college; }
    if (department) { where.push('p.department = @department'); params.department = department; }
    if (designation) { where.push('p.designation = @designation'); params.designation = designation; }

    // Every word in the search box must match at least one searchable field.
    const tokens = (q ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 8);
    tokens.forEach((token, i) => {
      const key = `t${i}`;
      params[key] = likeToken(token);
      where.push(
        `(p.name LIKE @${key} ESCAPE '\\' OR p.college LIKE @${key} ESCAPE '\\'
          OR p.department LIKE @${key} ESCAPE '\\' OR p.designation LIKE @${key} ESCAPE '\\'
          OR p.keywords LIKE @${key} ESCAPE '\\')`,
      );
    });

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { total } = this.db
      .prepare(`SELECT COUNT(*) AS total FROM professors p ${clause}`)
      .get(params) as { total: number };

    const rows = this.db
      .prepare(
        `SELECT p.id, p.name, p.profile_url, p.college, p.department, p.designation,
                (SELECT COUNT(*) FROM professor_emails e WHERE e.professor_id = p.id) AS email_count
           FROM professors p
           ${clause}
          ORDER BY p.name COLLATE NOCASE, p.id
          LIMIT @limit OFFSET @offset`,
      )
      .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize }) as Row[];

    return {
      data: rows.map((r) => ({
        id: r.id,
        name: r.name,
        profileUrl: r.profile_url,
        college: r.college,
        department: r.department,
        designation: r.designation,
        emailCount: r.email_count,
      })),
      total,
      page,
      pageSize,
    };
  }

  /** Emails for one professor, or null if the professor doesn't exist. */
  getEmails(id: string): string[] | null {
    const exists = this.db.prepare('SELECT 1 FROM professors WHERE id = ?').get(id);
    if (!exists) return null;
    return (this.db
      .prepare('SELECT email FROM professor_emails WHERE professor_id = ? ORDER BY position')
      .all(id) as { email: string }[]).map((r) => r.email);
  }

  filterOptions(): FilterOptions {
    const distinct = (col: 'college' | 'department' | 'designation') =>
      (this.db
        .prepare(`SELECT DISTINCT ${col} AS v FROM professors ORDER BY v COLLATE NOCASE`)
        .all() as { v: string }[]).map((r) => r.v);

    return {
      colleges: distinct('college'),
      departments: distinct('department'),
      designations: distinct('designation'),
    };
  }

  stats(): Stats {
    return this.db
      .prepare(
        `SELECT COUNT(*) AS professors,
                COUNT(DISTINCT college) AS universities,
                COUNT(DISTINCT department) AS departments
           FROM professors`,
      )
      .get() as Stats;
  }
}
